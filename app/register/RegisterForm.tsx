"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  updateProfile,
  signInWithPopup,
  GoogleAuthProvider,
} from "firebase/auth";
import { auth, db } from "@/lib/firebase";
import { doc, getDoc, serverTimestamp } from "firebase/firestore";
import { saveUserProfile } from "@/lib/firestore";
import { setAuthCookies } from "@/lib/cookies";
import { validateInviteCode, recordCodeUsage } from "@/lib/inviteCodes";
import { validateCoachInvite, useCoachInvite } from "@/lib/coachInvites";
import { getAge } from "@/lib/age";

const googleProvider = new GoogleAuthProvider();

const FIREBASE_ERROR_MESSAGES: Record<string, string> = {
  "auth/email-already-in-use": "An account with this email already exists.",
  "auth/invalid-email": "Please enter a valid email address.",
  "auth/weak-password": "Password must be at least 6 characters.",
  "auth/popup-closed-by-user": "Sign-up popup was closed. Please try again.",
  "auth/cancelled-popup-request": "Sign-up was cancelled.",
  "auth/too-many-requests": "Too many attempts. Please try again later.",
};

function getAuthError(code: string): string {
  return FIREBASE_ERROR_MESSAGES[code] ?? "An unexpected error occurred. Please try again.";
}

type Role = "student" | "coach" | "";

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24">
      <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
      <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
      <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05" />
      <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
    </svg>
  );
}

function inputFocus(e: React.FocusEvent<HTMLInputElement>) {
  e.target.style.boxShadow = "0 0 0 2px #001c48";
}
function inputBlur(e: React.FocusEvent<HTMLInputElement>) {
  e.target.style.boxShadow = "";
}

export default function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const codeFromUrl = (searchParams.get("code") ?? "").toUpperCase();
  const codeIsLocked = codeFromUrl.length === 8;
  const coachInviteToken = searchParams.get("coachInvite") ?? "";

  // Shared fields
  const [fullName, setFullName] = useState("");       // athlete name for all cases
  const [email, setEmail] = useState("");             // athlete email (13+) or guardian email (under-13)
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<Role>(coachInviteToken ? "coach" : "");
  const [inviteCode, setInviteCode] = useState(codeFromUrl);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Student-path-only fields
  const [dateOfBirth, setDateOfBirth] = useState("");
  const [guardianName, setGuardianName] = useState("");
  const [guardianConsentChecked, setGuardianConsentChecked] = useState(false);

  // Coach-path-only fields
  const [age, setAge] = useState("");

  const isStudentPath = !coachInviteToken;
  const todayStr = new Date().toISOString().slice(0, 10);
  const athleteAge = dateOfBirth ? getAge(dateOfBirth) : null;
  const isMinor = isStudentPath && athleteAge !== null && athleteAge < 13;

  function validate(): string {
    // ── Coach path ──
    if (!isStudentPath) {
      if (!fullName.trim()) return "Please enter your full name.";
      if (!email.trim()) return "Please enter your email address.";
      if (!password) return "Please enter a password.";
      if (password.length < 6) return "Password must be at least 6 characters.";
      if (password !== confirmPassword) return "Passwords do not match.";
      if (!age || parseInt(age, 10) < 1 || parseInt(age, 10) > 120) return "Please enter a valid age.";
      if (!role) return "Please select a role.";
      if (!coachInviteToken && !inviteCode.trim()) return "An invite code is required to register.";
      return "";
    }

    // ── Student path ──
    if (!dateOfBirth) return "Please enter the athlete's date of birth.";
    if (athleteAge === null || athleteAge < 3 || athleteAge > 100)
      return "Please enter a valid date of birth (athlete must be between 3 and 100 years old).";

    if (isMinor) {
      if (!fullName.trim()) return "Please enter the athlete's full name.";
      if (!guardianName.trim()) return "Please enter the parent or guardian's full name.";
      if (!email.trim()) return "Please enter the parent or guardian's email address.";
      if (!password) return "Please enter a password.";
      if (password.length < 6) return "Password must be at least 6 characters.";
      if (password !== confirmPassword) return "Passwords do not match.";
      if (!guardianConsentChecked)
        return "You must check the consent box to create an account for an athlete under 13.";
    } else {
      if (!fullName.trim()) return "Please enter your full name.";
      if (!email.trim()) return "Please enter your email address.";
      if (!password) return "Please enter a password.";
      if (password.length < 6) return "Password must be at least 6 characters.";
      if (password !== confirmPassword) return "Passwords do not match.";
    }

    if (!role) return "Please select a role.";
    if (!coachInviteToken && !inviteCode.trim()) return "An invite code is required to register.";
    return "";
  }

  async function checkInviteCode(): Promise<boolean> {
    if (!coachInviteToken && !inviteCode.trim()) {
      setError("An invite code is required to register. Please use the link your coach gave you.");
      return false;
    }
    if (!inviteCode.trim()) return true;
    const result = await validateInviteCode(inviteCode.trim());
    if (!result.valid) {
      setError(result.error ?? "That invite code is invalid. Please check the code or use the link your coach gave you.");
      return false;
    }
    return true;
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) { setError(validationError); return; }
    setError("");
    setLoading(true);
    try {
      const ageNum = isStudentPath ? (athleteAge ?? 0) : parseInt(age, 10);
      const code = inviteCode.trim().toUpperCase();

      if (coachInviteToken) {
        const result = await validateCoachInvite(coachInviteToken);
        if (!result.valid) { setError(result.error ?? "Invalid coach invite link."); return; }
      } else {
        const valid = await checkInviteCode();
        if (!valid) return;
      }

      // For under-13: email is guardian's email (account login belongs to guardian).
      // For 13+: email is athlete's own email.
      const loginEmail = email;
      console.log("[register] creating Firebase Auth account for:", loginEmail);
      const credential = await createUserWithEmailAndPassword(auth, loginEmail, password);
      console.log("[register] Auth account created, uid:", credential.user.uid);

      // displayName is always the athlete's name
      await updateProfile(credential.user, { displayName: fullName.trim() });

      let coachId: string | undefined;
      if (role === "student" && code) {
        try {
          const codeSnap = await getDoc(doc(db, "inviteCodes", code));
          if (codeSnap.exists()) {
            coachId = codeSnap.data().createdBy as string | undefined;
          }
        } catch (err) {
          console.warn("[register] could not look up coachId from invite code:", err);
        }
      }

      await saveUserProfile({
        uid: credential.user.uid,
        email: credential.user.email ?? loginEmail,
        fullName: fullName.trim(),
        role: role as "student" | "coach",
        age: ageNum,
        ...(isStudentPath ? { dateOfBirth } : {}),
        ...(isMinor ? {
          guardianManaged: true,
          guardianName: guardianName.trim(),
          guardianEmail: loginEmail,
          guardianConsentAt: serverTimestamp(),
          guardianConsentVersion: "v1",
        } : {}),
        ...(coachId ? { coachId } : {}),
      });

      if (coachInviteToken) {
        await useCoachInvite(coachInviteToken, credential.user.uid);
      }
      if (code) {
        await recordCodeUsage(code, credential.user.uid);
      }

      setAuthCookies(role);
      console.log("[register] complete — redirecting to /dashboard");
      router.push("/dashboard");
    } catch (err: unknown) {
      const fe = err as { code?: string; message?: string };
      console.error("[register] error:", fe.code, fe.message, err);
      if (fe.code?.startsWith("auth/")) setError(getAuthError(fe.code));
      else if (fe.code === "permission-denied") setError("Unable to save your profile. Firestore permissions are not configured.");
      else setError(`Registration error: ${fe.message ?? "Unknown error"}`);
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignUp() {
    if (!role) { setError("Please select a role before continuing with Google."); return; }
    if (isStudentPath) {
      if (!dateOfBirth) {
        setError("Please enter the athlete's date of birth before continuing with Google.");
        return;
      }
      if (athleteAge === null || athleteAge < 3 || athleteAge > 100) {
        setError("Please enter a valid date of birth (athlete must be between 3 and 100 years old).");
        return;
      }
    }
    setError("");
    setGoogleLoading(true);
    try {
      const code = inviteCode.trim().toUpperCase();

      if (coachInviteToken) {
        const result = await validateCoachInvite(coachInviteToken);
        if (!result.valid) { setError(result.error ?? "Invalid coach invite link."); return; }
      } else {
        const valid = await checkInviteCode();
        if (!valid) return;
      }

      console.log("[register/google] opening Google sign-in popup");
      const credential = await signInWithPopup(auth, googleProvider);
      console.log("[register/google] signed in, uid:", credential.user.uid);

      let coachIdGoogle: string | undefined;
      if (role === "student" && code) {
        try {
          const codeSnap = await getDoc(doc(db, "inviteCodes", code));
          if (codeSnap.exists()) {
            coachIdGoogle = codeSnap.data().createdBy as string | undefined;
          }
        } catch (err) {
          console.warn("[register/google] could not look up coachId from invite code:", err);
        }
      }

      await saveUserProfile({
        uid: credential.user.uid,
        email: credential.user.email ?? "",
        fullName: credential.user.displayName ?? "",
        role: role as "student" | "coach",
        age: isStudentPath ? (athleteAge ?? null) : null,
        ...(isStudentPath && dateOfBirth ? { dateOfBirth } : {}),
        ...(coachIdGoogle ? { coachId: coachIdGoogle } : {}),
      });

      if (coachInviteToken) {
        await useCoachInvite(coachInviteToken, credential.user.uid);
      }
      if (code) {
        await recordCodeUsage(code, credential.user.uid);
      }

      setAuthCookies(role);
      console.log("[register/google] complete — redirecting to /dashboard");
      router.push("/dashboard");
    } catch (err: unknown) {
      const fe = err as { code?: string; message?: string };
      console.error("[register/google] error:", fe.code, fe.message, err);
      if (fe.code?.startsWith("auth/")) setError(getAuthError(fe.code));
      else if (fe.code === "permission-denied") setError("Unable to save your profile. Firestore permissions are not configured.");
      else setError(`Registration error: ${fe.message ?? "Unknown error"}`);
    } finally {
      setGoogleLoading(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none transition";

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <img
            src="/logo-dark.png"
            alt="Ball Masters Florida"
            style={{ width: 120, height: "auto", margin: "0 auto 8px" }}
          />
          <p className="mt-2 text-gray-500 text-sm">Create your account</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-lg p-8">
          {error && (
            <div className="mb-5 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-11.25a.75.75 0 011.5 0v4.5a.75.75 0 01-1.5 0v-4.5zm.75 7.5a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}

          {/* Coach invite banner */}
          {coachInviteToken && (
            <div
              className="mb-5 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium"
              style={{ backgroundColor: "#ede9fe", color: "#6d28d9" }}
            >
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 2a5 5 0 00-5 5v2H4a2 2 0 00-2 2v5a2 2 0 002 2h12a2 2 0 002-2v-5a2 2 0 00-2-2h-1V7a5 5 0 00-5-5zm0 2a3 3 0 013 3v2H7V7a3 3 0 013-3zm0 8a1 1 0 110 2 1 1 0 010-2z" clipRule="evenodd" />
              </svg>
              You&rsquo;re registering as a <strong>Coach</strong> via invite link
            </div>
          )}

          {/* Invite code banner */}
          {codeIsLocked && (
            <div
              className="mb-5 flex items-center gap-2 rounded-lg px-4 py-3 text-sm font-medium"
              style={{ backgroundColor: "rgba(1,255,249,0.08)", color: "#001c48" }}
            >
              <svg className="h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 2a5 5 0 00-5 5v2H4a2 2 0 00-2 2v5a2 2 0 002 2h12a2 2 0 002-2v-5a2 2 0 00-2-2h-1V7a5 5 0 00-5-5zm0 2a3 3 0 013 3v2H7V7a3 3 0 013-3zm0 8a1 1 0 110 2 1 1 0 010-2z" clipRule="evenodd" />
              </svg>
              Invite code <span className="font-mono font-bold ml-1">{codeFromUrl}</span> applied
            </div>
          )}

          <form onSubmit={handleRegister} className="space-y-4">

            {isStudentPath ? (
              <>
                {/* ── Student path ─────────────────────────────────────── */}

                {/* DOB comes first — drives the guardian vs. self-registration split */}
                <div>
                  <label htmlFor="dateOfBirth" className="block text-sm font-medium text-gray-700 mb-1">
                    Athlete&rsquo;s date of birth
                  </label>
                  <input
                    id="dateOfBirth"
                    type="date"
                    required
                    max={todayStr}
                    value={dateOfBirth}
                    onChange={(e) => setDateOfBirth(e.target.value)}
                    className={inputClass}
                    onFocus={inputFocus}
                    onBlur={inputBlur}
                  />
                </div>

                {isMinor ? (
                  /* ── Under-13: guardian-created account mode ─────────── */
                  <>
                    <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3.5">
                      <div className="flex items-start gap-2.5">
                        <svg className="h-5 w-5 shrink-0 mt-0.5 text-amber-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                        </svg>
                        <div>
                          <p className="text-sm font-semibold text-amber-900">Guardian-managed account required</p>
                          <p className="text-xs text-amber-800 mt-0.5 leading-relaxed">
                            Because this athlete is under 13, a parent or guardian must create and manage this account (COPPA). The guardian&rsquo;s email becomes the account login.
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Athlete full name */}
                    <div>
                      <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">
                        Athlete&rsquo;s full name
                      </label>
                      <input id="fullName" type="text" autoComplete="off" required value={fullName}
                        onChange={(e) => setFullName(e.target.value)} placeholder="Athlete's name"
                        className={inputClass} onFocus={inputFocus} onBlur={inputBlur} />
                    </div>

                    {/* Guardian full name */}
                    <div>
                      <label htmlFor="guardianName" className="block text-sm font-medium text-gray-700 mb-1">
                        Parent / Guardian full name
                      </label>
                      <input id="guardianName" type="text" autoComplete="name" required value={guardianName}
                        onChange={(e) => setGuardianName(e.target.value)} placeholder="Guardian's name"
                        className={inputClass} onFocus={inputFocus} onBlur={inputBlur} />
                    </div>

                    {/* Guardian email — this IS the account login email */}
                    <div>
                      <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">
                        Parent / Guardian email
                      </label>
                      <p className="text-xs text-gray-400 mb-1.5">This will be the account login email.</p>
                      <input id="email" type="email" autoComplete="email" required value={email}
                        onChange={(e) => setEmail(e.target.value)} placeholder="guardian@example.com"
                        className={inputClass} onFocus={inputFocus} onBlur={inputBlur} />
                    </div>

                    {/* Password */}
                    <div>
                      <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                      <input id="password" type="password" autoComplete="new-password" required value={password}
                        onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters"
                        className={inputClass} onFocus={inputFocus} onBlur={inputBlur} />
                    </div>

                    {/* Confirm password */}
                    <div>
                      <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
                      <input id="confirmPassword" type="password" autoComplete="new-password" required value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••"
                        className={inputClass} onFocus={inputFocus} onBlur={inputBlur} />
                    </div>

                    {/* Mandatory consent checkbox */}
                    <div className="rounded-lg border border-gray-200 bg-gray-50 px-4 py-3.5">
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={guardianConsentChecked}
                          onChange={(e) => setGuardianConsentChecked(e.target.checked)}
                          className="mt-0.5 h-4 w-4 shrink-0 rounded border-gray-300"
                          style={{ accentColor: "#001c48" }}
                        />
                        <span className="text-xs text-gray-700 leading-relaxed">
                          I am the parent or legal guardian of this athlete, and I consent to the{" "}
                          <Link href="/terms" className="underline font-medium" style={{ color: "#001c48" }}>
                            Terms of Service
                          </Link>
                          ,{" "}
                          <Link href="/privacy" className="underline font-medium" style={{ color: "#001c48" }}>
                            Privacy Policy
                          </Link>
                          , and the AI analysis described in the{" "}
                          <Link href="/privacy#ai-disclosure" className="underline font-medium" style={{ color: "#001c48" }}>
                            AI Disclosure
                          </Link>
                          , on behalf of my child.
                        </span>
                      </label>
                    </div>
                  </>
                ) : (
                  /* ── 13+: self-registration ──────────────────────────── */
                  <>
                    <div>
                      <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
                      <input id="fullName" type="text" autoComplete="name" required value={fullName}
                        onChange={(e) => setFullName(e.target.value)} placeholder="Jane Smith"
                        className={inputClass} onFocus={inputFocus} onBlur={inputBlur} />
                    </div>

                    <div>
                      <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
                      <input id="email" type="email" autoComplete="email" required value={email}
                        onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
                        className={inputClass} onFocus={inputFocus} onBlur={inputBlur} />
                    </div>

                    <div>
                      <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                      <input id="password" type="password" autoComplete="new-password" required value={password}
                        onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters"
                        className={inputClass} onFocus={inputFocus} onBlur={inputBlur} />
                    </div>

                    <div>
                      <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
                      <input id="confirmPassword" type="password" autoComplete="new-password" required value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••"
                        className={inputClass} onFocus={inputFocus} onBlur={inputBlur} />
                    </div>
                  </>
                )}

                {/* Role selection */}
                <div>
                  <span className="block text-sm font-medium text-gray-700 mb-2">I am a…</span>
                  <div className="grid grid-cols-1 gap-3">
                    <button type="button" onClick={() => setRole("student")}
                      className="flex items-center gap-3 rounded-xl border-2 px-4 py-3.5 text-sm font-semibold transition"
                      style={{
                        borderColor: role === "student" ? "#001c48" : "#e5e7eb",
                        backgroundColor: role === "student" ? "rgba(1,255,249,0.08)" : "white",
                        color: role === "student" ? "#001c48" : "#6b7280",
                      }}>
                      <span className="text-2xl">🎓</span>
                      <span>Student</span>
                    </button>
                  </div>
                </div>

                {/* Invite code */}
                <div>
                  <label htmlFor="inviteCode" className="block text-sm font-medium text-gray-700 mb-1">
                    Invite code{!codeIsLocked && <span className="text-red-500 ml-1 font-normal">*</span>}
                  </label>
                  <input
                    id="inviteCode"
                    type="text"
                    value={inviteCode}
                    onChange={(e) => !codeIsLocked && setInviteCode(e.target.value.toUpperCase())}
                    readOnly={codeIsLocked}
                    placeholder="e.g. AB12CD34"
                    maxLength={8}
                    className={`${inputClass} font-mono tracking-widest uppercase ${codeIsLocked ? "bg-gray-50 text-gray-500 cursor-not-allowed" : ""}`}
                    onFocus={codeIsLocked ? undefined : inputFocus}
                    onBlur={codeIsLocked ? undefined : inputBlur}
                  />
                  {codeIsLocked && (
                    <p className="mt-1 text-xs text-gray-400">Code applied from your invite link</p>
                  )}
                </div>
              </>
            ) : (
              <>
                {/* ── Coach path (unchanged) ────────────────────────────── */}

                <div>
                  <label htmlFor="fullName" className="block text-sm font-medium text-gray-700 mb-1">Full name</label>
                  <input id="fullName" type="text" autoComplete="name" required value={fullName}
                    onChange={(e) => setFullName(e.target.value)} placeholder="Jane Smith"
                    className={inputClass} onFocus={inputFocus} onBlur={inputBlur} />
                </div>

                <div>
                  <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-1">Email address</label>
                  <input id="email" type="email" autoComplete="email" required value={email}
                    onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
                    className={inputClass} onFocus={inputFocus} onBlur={inputBlur} />
                </div>

                <div>
                  <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-1">Password</label>
                  <input id="password" type="password" autoComplete="new-password" required value={password}
                    onChange={(e) => setPassword(e.target.value)} placeholder="At least 6 characters"
                    className={inputClass} onFocus={inputFocus} onBlur={inputBlur} />
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-1">Confirm password</label>
                  <input id="confirmPassword" type="password" autoComplete="new-password" required value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)} placeholder="••••••••"
                    className={inputClass} onFocus={inputFocus} onBlur={inputBlur} />
                </div>

                <div>
                  <label htmlFor="age" className="block text-sm font-medium text-gray-700 mb-1">Age</label>
                  <input id="age" type="number" min={1} max={120} required value={age}
                    onChange={(e) => setAge(e.target.value)} placeholder="Your age"
                    className={inputClass} onFocus={inputFocus} onBlur={inputBlur} />
                </div>

                {/* Invite code */}
                <div>
                  <label htmlFor="inviteCode" className="block text-sm font-medium text-gray-700 mb-1">
                    Invite code
                  </label>
                  <input
                    id="inviteCode"
                    type="text"
                    value={inviteCode}
                    onChange={(e) => !codeIsLocked && setInviteCode(e.target.value.toUpperCase())}
                    readOnly={codeIsLocked}
                    placeholder="e.g. AB12CD34"
                    maxLength={8}
                    className={`${inputClass} font-mono tracking-widest uppercase ${codeIsLocked ? "bg-gray-50 text-gray-500 cursor-not-allowed" : ""}`}
                    onFocus={codeIsLocked ? undefined : inputFocus}
                    onBlur={codeIsLocked ? undefined : inputBlur}
                  />
                  {codeIsLocked && (
                    <p className="mt-1 text-xs text-gray-400">Code applied from your invite link</p>
                  )}
                </div>
              </>
            )}

            {/* Submit */}
            <button type="submit" disabled={loading}
              className="w-full rounded-lg py-2.5 text-sm font-semibold text-white transition hover:opacity-90 active:opacity-80 disabled:opacity-60 disabled:cursor-not-allowed mt-2"
              style={{ backgroundColor: "#001c48" }}>
              {loading
                ? <span className="flex items-center justify-center gap-2"><Spinner />Creating account…</span>
                : isMinor ? "Create account for athlete" : "Create account"}
            </button>
          </form>

          {/* Google sign-up — not available for under-13 guardian accounts */}
          {!isMinor && (
            <>
              <div className="my-5 flex items-center gap-3">
                <div className="h-px flex-1 bg-gray-200" />
                <span className="text-xs text-gray-400 font-medium">or sign up with</span>
                <div className="h-px flex-1 bg-gray-200" />
              </div>

              <button type="button" onClick={handleGoogleSignUp} disabled={googleLoading}
                className="w-full flex items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition disabled:opacity-60 disabled:cursor-not-allowed">
                {googleLoading ? <Spinner /> : <GoogleIcon />}
                Continue with Google
              </button>
            </>
          )}

          {/* Login link */}
          <p className="mt-6 text-center text-sm text-gray-500">
            Already have an account?{" "}
            <Link href="/login" className="font-semibold hover:underline" style={{ color: "#001c48" }}>
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
