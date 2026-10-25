"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getUserProfile, type UserProfile } from "@/lib/firestore";
import { isProfileUnreachable } from "@/lib/ownProfile";
import { homeFor, isValidRole } from "@/lib/roles";
import { classifyLoginError, loginErrorMessage } from "@/lib/loginErrors";
import { signOutUser } from "@/lib/signOut";
import { UNREACHABLE_HELP, UNREACHABLE_TITLE } from "@/components/ProfileUnreachable";
import { setAuthCookies } from "@/lib/cookies";
import { isSocialSignInCancel, nativeSocialSignIn, useNativeSocialSignIn, type SocialProvider } from "@/lib/socialSignIn";
import SocialSignInButtons from "@/components/SocialSignInButtons";
import { loginTrace } from "@/lib/loginDiagnostics";
import { lastActive } from "@/lib/lastActive";

function getCookieValue(name: string): string {
  const match = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : "";
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Sign in with Apple / Google: iPhone app 1.1+ only (never on the web).
  const socialAvailable = useNativeSocialSignIn();
  const [socialBusy, setSocialBusy] = useState<SocialProvider | null>(null);
  const socialInFlight = useRef(false);
  const [accountDeleted, setAccountDeleted] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);
  // Set when the profile could not be read at all (see showUnreachable).
  const [unreachable, setUnreachable] = useState<{ uid: string; provider: SocialProvider | null } | null>(null);

  // One afterLogin per person at a time. The auth listener and the submit
  // handler both call it for the same sign-in; two profile reads started
  // together on a connection that had died while the phone sat idle were the
  // login that hung for 8 minutes (Sentry JAVASCRIPT-NEXTJS-4). The second call
  // joins the first and gets the same outcome.
  const afterLoginFlights = useRef(new Map<string, Promise<void>>());
  function afterLogin(uid: string, provider: SocialProvider | null = null): Promise<void> {
    const running = afterLoginFlights.current.get(uid);
    if (running) {
      loginTrace.step("after_login_joined_in_flight");
      return running;
    }
    const run = runAfterLogin(uid, provider).finally(() => { afterLoginFlights.current.delete(uid); });
    afterLoginFlights.current.set(uid, run);
    return run;
  }

  // The profile could not be reached at all: say so and offer a retry. Never a
  // redirect, never "no account", never an endless spinner.
  function showUnreachable(uid: string, provider: SocialProvider | null) {
    loginTrace.abandon("profile_unreachable_showing_retry");
    setCheckingAuth(false);
    setUnreachable({ uid, provider });
  }

  async function runAfterLogin(uid: string, provider: SocialProvider | null): Promise<void> {
    // Always read the profile: nobody's destination is decided by a role cached
    // on this phone (it could belong to the person who used it before; an admin
    // once landed on the student screens that way). Apple/Google also need it to
    // find out whether this account exists at all.
    loginTrace.step("after_login");
    let profile: UserProfile | null;
    try {
      profile = await loginTrace.track(
        provider ? "social_profile_read" : "login_profile_read",
        getUserProfile(uid, meta => loginTrace.step("login_profile_snapshot", meta))
      );
    } catch (err) {
      if (isProfileUnreachable(err)) { showUnreachable(uid, provider); return; }
      throw err;
    }
    // A users/{uid} document without a valid role is not a profile. (A push
    // token write once made such documents for Apple sign-ins.)
    const role = profile?.role;
    if (!isValidRole(role)) {
      if (provider) {
        // An Apple ID / Google account with no Ball Masters profile yet: say
        // so, rather than landing on "Account setup required". Accounts are
        // created from the coach's invite link (register), which can use the
        // same Apple / Google sign-in.
        loginTrace.abandon("social_no_account_signed_out", { hadProfileDoc: profile !== null });
        await signOut(auth);
        setError(
          `There's no Ball Masters account for this ${provider === "apple" ? "Apple ID" : "Google account"} yet. ` +
            "Use the invite link from your coach to create one."
        );
        return;
      }
      loginTrace.step("profile_missing_going_to_incomplete_profile", { hadProfileDoc: profile !== null }, "error");
      router.push("/incomplete-profile");
      return;
    }
    // (The cached role is only written for diagnostics now; nothing reads it to route.)
    localStorage.setItem("ballmasters_role", role);
    setAuthCookies(role);
    lastActive.request(uid, { force: true });
    // Straight to this role's screens, using the role just read. NOT through the
    // /dashboard redirect: the client router remembers redirects, and after an
    // account switch it replayed the previous account's.
    const home = homeFor(role);
    loginTrace.step("route", { to: home, role, via: "profile" });
    router.push(home);
  }

  async function retryAfterUnreachable() {
    const pending = unreachable;
    if (!pending) return;
    setUnreachable(null);
    setError("");
    setLoading(true);
    try {
      if (!loginTrace.active()) loginTrace.begin("restored", pending.uid);
      await afterLogin(pending.uid, pending.provider);
    } catch (err: unknown) {
      setError(loginErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function signOutFromUnreachable() {
    setUnreachable(null);
    await signOutUser();
  }

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      // A social sign-in in progress routes itself (it must first check the
      // account has a Ball Masters profile).
      if (socialInFlight.current) return;
      if (user) {
        // Bug 2 evidence: a sign-in started on this page is already being
        // traced; being sent here while signed in is a login of its own.
        if (loginTrace.active()) loginTrace.setUser(user.uid);
        else loginTrace.begin("restored", user.uid);
        // Fast path: role cookie already set — skip Firestore read
        const role = getCookieValue("ballmasters_role");
        loginTrace.step("login_page_signed_in", { roleCookie: role || "none" });
        if (role === "coach" || role === "admin") {
          loginTrace.step("route", { to: "/coach/dashboard", role, via: "cookie" });
          router.push("/coach/dashboard");
        } else if (role === "student") {
          loginTrace.step("route", { to: "/student/dashboard", role, via: "cookie" });
          router.push("/student/dashboard");
        } else {
          // No role cookie — must read Firestore to get role
          try {
            await afterLogin(user.uid);
          } catch (err: unknown) {
            setCheckingAuth(false);
            setError(loginErrorMessage(err));
          }
        }
      } else {
        setCheckingAuth(false);
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    setAccountDeleted(new URLSearchParams(window.location.search).has("deleted"));
  }, []);

  async function handleEmailLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const startedAt = Date.now();
    try {
      loginTrace.begin("email");
      const credential = await loginTrace.track("signin", signInWithEmailAndPassword(auth, email, password));
      loginTrace.setUser(credential.user.uid);
      await afterLogin(credential.user.uid);
    } catch (err: unknown) {
      reportFailedSignIn("signin_failed", err, startedAt, "email");
      setError(loginErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  // A failed sign-in. Only a credential ANSWER (wrong password, no such account,
  // and so on) is the person's own answer and is left alone. Anything else (the
  // network failed, a timeout, an internal or unknown error) is a fault: it goes
  // to Sentry with its code, how long it took, and whether the phone thought it
  // was online. Evidence only: nothing is retried or changed because of it.
  function reportFailedSignIn(name: string, err: unknown, startedAt: number, source: string) {
    const { kind, code } = classifyLoginError(err);
    if (kind === "credential") {
      loginTrace.abandon("signin_rejected", { code });
      return;
    }
    loginTrace.flag(name, { code, kind, source, elapsedMs: Date.now() - startedAt, online: navigator.onLine }, undefined, "warning");
    loginTrace.abandon("signin_failed_reported", { code });
  }

  async function handleSocialLogin(provider: SocialProvider) {
    setError("");
    setSocialBusy(provider);
    socialInFlight.current = true;
    const startedAt = Date.now();
    try {
      // No login trace yet: the person can spend any amount of time on Apple's
      // or Google's sheet, and the 10-second "login stalled" timer must not run
      // while they do. It starts once the sheet has handed back an account.
      const credential = await nativeSocialSignIn(provider);
      loginTrace.begin(provider, credential.user.uid);
      loginTrace.step("social_signin_ok", { provider, sheetMs: Date.now() - startedAt });
      // Checks the profile (no account / no valid role: message + sign-out),
      // then routes. See runAfterLogin.
      await afterLogin(credential.user.uid, provider);
    } catch (err: unknown) {
      // Closing Apple's / Google's sheet is the person's choice: nothing shown.
      if (isSocialSignInCancel(err)) {
        loginTrace.abandon("social_signin_cancelled");
      } else {
        reportFailedSignIn("social_signin_failed", err, startedAt, provider);
        setError(loginErrorMessage(err));
      }
    } finally {
      socialInFlight.current = false;
      setSocialBusy(null);
    }
  }

  if (checkingAuth) {
    return (
      <div style={{ minHeight: "100vh", backgroundColor: "#001c48", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 24 }}>
        <img src="/logo-light.png" alt="Ball Masters Florida" style={{ width: 140, height: "auto" }} />
        <svg style={{ width: 28, height: 28, color: "#01fff9" }} className="animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      </div>
    );
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <img
            src="/logo-dark.png"
            alt="Ball Masters Florida"
            style={{ width: 120, height: "auto", margin: "0 auto 8px" }}
          />
          <p className="mt-2 text-gray-500 text-sm">Sign in to your account</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-lg p-8">
          {/* Account deleted banner */}
          {accountDeleted && (
            <div
              className="mb-5 flex items-start gap-2 rounded-lg px-4 py-3 text-sm"
              style={{ backgroundColor: "rgba(1,255,249,0.08)", border: "1px solid rgba(1,255,249,0.3)", color: "#001c48" }}
            >
              <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
              </svg>
              Your account has been deleted.
            </div>
          )}

          {/* The profile couldn't be reached: offer a retry, never redirect or spin forever */}
          {unreachable && (
            <div
              className="mb-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
              role="alert"
              data-testid="profile-unreachable"
            >
              <p className="font-semibold">{UNREACHABLE_TITLE}</p>
              <p className="mt-0.5">{UNREACHABLE_HELP}</p>
              <div className="mt-3 flex items-center gap-4">
                <button
                  type="button"
                  onClick={retryAfterUnreachable}
                  className="inline-flex min-h-11 items-center justify-center rounded-lg px-5 text-sm font-semibold text-white"
                  style={{ backgroundColor: "#001c48" }}
                >
                  Try again
                </button>
                <button type="button" onClick={signOutFromUnreachable} className="text-sm underline">
                  Use a different account
                </button>
              </div>
            </div>
          )}

          {/* Error banner */}
          {error && (
            <div className="mb-5 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-11.25a.75.75 0 011.5 0v4.5a.75.75 0 01-1.5 0v-4.5zm.75 7.5a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}

          {/* Email / Password form */}
          <form onSubmit={handleEmailLogin} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                Email address
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none transition"
                onFocus={(e) => (e.target.style.boxShadow = "0 0 0 2px #001c48")}
                onBlur={(e) => (e.target.style.boxShadow = "")}
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-xs font-medium hover:underline"
                  style={{ color: "#001c48" }}
                >
                  Forgot password?
                </Link>
              </div>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none transition"
                onFocus={(e) => (e.target.style.boxShadow = "0 0 0 2px #001c48")}
                onBlur={(e) => (e.target.style.boxShadow = "")}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg py-2.5 text-sm font-semibold text-white transition hover:opacity-90 active:opacity-80 disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ backgroundColor: "#001c48" }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                  </svg>
                  Signing in…
                </span>
              ) : (
                "Sign in"
              )}
            </button>
          </form>

          {/* Sign in with Apple / Google — iPhone app 1.1+ only */}
          {socialAvailable && (
            <>
              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-gray-200" />
                <span className="text-xs text-gray-400 font-medium">or</span>
                <div className="h-px flex-1 bg-gray-200" />
              </div>
              <SocialSignInButtons mode="sign-in" busy={socialBusy} disabled={loading} onSelect={handleSocialLogin} />
            </>
          )}

          {/* Register link */}
          <p className="mt-6 text-center text-sm text-gray-500">
            Don&apos;t have an account?{" "}
            <Link
              href="/register"
              className="font-semibold hover:underline"
              style={{ color: "#001c48" }}
            >
              Create one
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
