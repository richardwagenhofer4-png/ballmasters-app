"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDocFromServer, updateDoc, serverTimestamp } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { getUserProfile } from "@/lib/firestore";
import { setAuthCookies } from "@/lib/cookies";
import { isSocialSignInCancel, nativeSocialSignIn, useNativeSocialSignIn, type SocialProvider } from "@/lib/socialSignIn";
import SocialSignInButtons from "@/components/SocialSignInButtons";
import { loginTrace } from "@/lib/loginDiagnostics";

// Bug 2 evidence only. When a signed-in person's profile reads as "missing",
// look once more, straight from the server, shortly afterwards, and put the
// answer in the login trace. It tells a profile that really isn't there from
// a read that came back wrong. It changes nothing about where the person goes.
function recheckMissingProfile(uid: string) {
  const waitMs = 1500;
  setTimeout(async () => {
    try {
      const snap = await getDocFromServer(doc(db, "users", uid));
      loginTrace.step("profile_recheck_from_server", { afterMs: waitMs, exists: snap.exists() }, snap.exists() ? "error" : "warning");
    } catch (err) {
      loginTrace.fail("profile_recheck_from_server_failed", err, { afterMs: waitMs });
    }
  }, waitMs);
}

function markLastActive(uid: string) {
  updateDoc(doc(db, "users", uid), { lastActiveAt: serverTimestamp() }).catch(console.error);
}

const FIREBASE_ERROR_MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "Invalid email or password.",
  "auth/user-not-found": "No account found with this email.",
  "auth/wrong-password": "Incorrect password.",
  "auth/invalid-email": "Please enter a valid email address.",
  "auth/user-disabled": "This account has been disabled.",
  "auth/too-many-requests": "Too many failed attempts. Please try again later.",
  "auth/account-exists-with-different-credential": "This email already has an account with a different sign-in method. Sign in the way you did before.",
};

function getErrorMessage(code: string): string {
  return FIREBASE_ERROR_MESSAGES[code] ?? "An unexpected error occurred. Please try again.";
}

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

  async function afterLogin(uid: string) {
    const cachedRole = localStorage.getItem("ballmasters_role");
    loginTrace.step("after_login", { cachedRole: cachedRole ?? "none" });
    if (cachedRole === "coach" || cachedRole === "admin" || cachedRole === "student") {
      setAuthCookies(cachedRole);
      markLastActive(uid);
      loginTrace.step("route", { to: "/dashboard", role: cachedRole, via: "cached_role" });
      router.push("/dashboard");
      return;
    }
    const profile = await loginTrace.track(
      "login_profile_read",
      getUserProfile(uid, meta => loginTrace.step("login_profile_snapshot", meta))
    );
    if (!profile) {
      loginTrace.step("profile_missing_going_to_incomplete_profile", {}, "error");
      recheckMissingProfile(uid);
      router.push("/incomplete-profile");
      return;
    }
    localStorage.setItem("ballmasters_role", profile.role);
    setAuthCookies(profile.role);
    markLastActive(uid);
    loginTrace.step("route", { to: "/dashboard", role: profile.role, via: "profile" });
    router.push("/dashboard");
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
          await afterLogin(user.uid);
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
    try {
      loginTrace.begin("email");
      const credential = await loginTrace.track("signin", signInWithEmailAndPassword(auth, email, password));
      loginTrace.setUser(credential.user.uid);
      await afterLogin(credential.user.uid);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? "";
      // A rejected email/password is the person's answer, not a stall. Anything
      // else (e.g. the profile read failing) stays open and is reported.
      if (code.startsWith("auth/")) loginTrace.abandon("signin_rejected", { code });
      setError(getErrorMessage(code));
    } finally {
      setLoading(false);
    }
  }

  async function handleSocialLogin(provider: SocialProvider) {
    setError("");
    setSocialBusy(provider);
    socialInFlight.current = true;
    try {
      loginTrace.begin(provider);
      const credential = await loginTrace.track("social_signin", nativeSocialSignIn(provider), undefined, { provider });
      loginTrace.setUser(credential.user.uid);
      // An Apple ID / Google account with no Ball Masters profile yet: say so,
      // rather than landing on "Account setup required". Accounts are created
      // from the coach's invite link (register), which can use the same
      // Apple / Google sign-in.
      const profile = await loginTrace.track("social_profile_read", getUserProfile(credential.user.uid));
      if (!profile) {
        loginTrace.abandon("social_no_account_signed_out");
        await signOut(auth);
        setError(
          `There's no Ball Masters account for this ${provider === "apple" ? "Apple ID" : "Google account"} yet. ` +
            "Use the invite link from your coach to create one."
        );
        return;
      }
      localStorage.setItem("ballmasters_role", profile.role);
      await afterLogin(credential.user.uid);
    } catch (err: unknown) {
      if (!isSocialSignInCancel(err)) {
        const code = (err as { code?: string }).code ?? "";
        setError(getErrorMessage(code));
      }
      // Closing Apple's / Google's sheet, or a rejected credential, is the
      // person's choice, not a stall.
      const failedCode = (err as { code?: string }).code ?? "";
      if (isSocialSignInCancel(err) || failedCode.startsWith("auth/")) loginTrace.abandon("social_signin_ended", { code: failedCode });
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
