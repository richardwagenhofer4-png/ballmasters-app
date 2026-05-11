"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  updateProfile,
  signInWithPopup,
  GoogleAuthProvider,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

const googleProvider = new GoogleAuthProvider();

const FIREBASE_ERROR_MESSAGES: Record<string, string> = {
  "auth/email-already-in-use": "An account with this email already exists.",
  "auth/invalid-email": "Please enter a valid email address.",
  "auth/weak-password": "Password must be at least 6 characters.",
  "auth/popup-closed-by-user": "Sign-up popup was closed. Please try again.",
  "auth/cancelled-popup-request": "Sign-up was cancelled.",
  "auth/too-many-requests": "Too many attempts. Please try again later.",
};

function getErrorMessage(code: string): string {
  return FIREBASE_ERROR_MESSAGES[code] ?? "An unexpected error occurred. Please try again.";
}

type Role = "student" | "coach" | "";

export default function RegisterPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [age, setAge] = useState("");
  const [parentEmail, setParentEmail] = useState("");
  const [role, setRole] = useState<Role>("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  const isMinor = age !== "" && parseInt(age, 10) < 13;

  function validate(): string {
    if (!fullName.trim()) return "Please enter your full name.";
    if (!email.trim()) return "Please enter your email address.";
    if (!password) return "Please enter a password.";
    if (password.length < 6) return "Password must be at least 6 characters.";
    if (password !== confirmPassword) return "Passwords do not match.";
    if (!age || parseInt(age, 10) < 1 || parseInt(age, 10) > 120)
      return "Please enter a valid age.";
    if (isMinor && !parentEmail.trim())
      return "A parent or guardian email is required for users under 13.";
    if (!role) return "Please select a role.";
    return "";
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }
    setError("");
    setLoading(true);
    try {
      const credential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(credential.user, { displayName: fullName.trim() });
      router.push("/dashboard");
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? "";
      setError(getErrorMessage(code));
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogleSignUp() {
    if (!role) {
      setError("Please select a role before continuing with Google.");
      return;
    }
    setError("");
    setGoogleLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      router.push("/dashboard");
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? "";
      setError(getErrorMessage(code));
    } finally {
      setGoogleLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4"
            style={{ backgroundColor: "#1A6B45" }}
          >
            <span className="text-3xl">⚽</span>
          </div>
          <h1
            className="text-4xl font-extrabold tracking-tight"
            style={{ color: "#1A6B45" }}
          >
            Ballmasters
          </h1>
          <p className="mt-2 text-gray-500 text-sm">Create your account</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-lg p-8">
          {/* Error banner */}
          {error && (
            <div className="mb-5 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              <svg
                className="mt-0.5 h-4 w-4 shrink-0"
                viewBox="0 0 20 20"
                fill="currentColor"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-11.25a.75.75 0 011.5 0v4.5a.75.75 0 01-1.5 0v-4.5zm.75 7.5a.75.75 0 100-1.5.75.75 0 000 1.5z"
                  clipRule="evenodd"
                />
              </svg>
              {error}
            </div>
          )}

          <form onSubmit={handleRegister} className="space-y-4">
            {/* Full name */}
            <div>
              <label
                htmlFor="fullName"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Full name
              </label>
              <input
                id="fullName"
                type="text"
                autoComplete="name"
                required
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Jane Smith"
                className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none transition"
                onFocus={(e) => (e.target.style.boxShadow = "0 0 0 2px #1A6B45")}
                onBlur={(e) => (e.target.style.boxShadow = "")}
              />
            </div>

            {/* Email */}
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
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
                onFocus={(e) => (e.target.style.boxShadow = "0 0 0 2px #1A6B45")}
                onBlur={(e) => (e.target.style.boxShadow = "")}
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none transition"
                onFocus={(e) => (e.target.style.boxShadow = "0 0 0 2px #1A6B45")}
                onBlur={(e) => (e.target.style.boxShadow = "")}
              />
            </div>

            {/* Confirm password */}
            <div>
              <label
                htmlFor="confirmPassword"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Confirm password
              </label>
              <input
                id="confirmPassword"
                type="password"
                autoComplete="new-password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none transition"
                onFocus={(e) => (e.target.style.boxShadow = "0 0 0 2px #1A6B45")}
                onBlur={(e) => (e.target.style.boxShadow = "")}
              />
            </div>

            {/* Age */}
            <div>
              <label
                htmlFor="age"
                className="block text-sm font-medium text-gray-700 mb-1"
              >
                Age
              </label>
              <input
                id="age"
                type="number"
                min={1}
                max={120}
                required
                value={age}
                onChange={(e) => setAge(e.target.value)}
                placeholder="Your age"
                className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none transition"
                onFocus={(e) => (e.target.style.boxShadow = "0 0 0 2px #1A6B45")}
                onBlur={(e) => (e.target.style.boxShadow = "")}
              />
            </div>

            {/* Parent email — COPPA */}
            {isMinor && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 space-y-3">
                <p className="text-xs text-amber-800 font-medium">
                  Because you are under 13, a parent or guardian must provide consent (COPPA).
                </p>
                <div>
                  <label
                    htmlFor="parentEmail"
                    className="block text-sm font-medium text-gray-700 mb-1"
                  >
                    Parent / Guardian email
                  </label>
                  <input
                    id="parentEmail"
                    type="email"
                    autoComplete="off"
                    required={isMinor}
                    value={parentEmail}
                    onChange={(e) => setParentEmail(e.target.value)}
                    placeholder="parent@example.com"
                    className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none transition bg-white"
                    onFocus={(e) => (e.target.style.boxShadow = "0 0 0 2px #1A6B45")}
                    onBlur={(e) => (e.target.style.boxShadow = "")}
                  />
                </div>
              </div>
            )}

            {/* Role selection */}
            <div>
              <span className="block text-sm font-medium text-gray-700 mb-2">
                I am a…
              </span>
              <div className="grid grid-cols-2 gap-3">
                {(["student", "coach"] as Role[]).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className="flex flex-col items-center gap-1.5 rounded-xl border-2 py-4 text-sm font-semibold transition"
                    style={{
                      borderColor: role === r ? "#1A6B45" : "#e5e7eb",
                      backgroundColor: role === r ? "#f0faf5" : "white",
                      color: role === r ? "#1A6B45" : "#6b7280",
                    }}
                  >
                    <span className="text-2xl">{r === "student" ? "🎓" : "📋"}</span>
                    {r.charAt(0).toUpperCase() + r.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg py-2.5 text-sm font-semibold text-white transition hover:opacity-90 active:opacity-80 disabled:opacity-60 disabled:cursor-not-allowed mt-2"
              style={{ backgroundColor: "#1A6B45" }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8v8H4z"
                    />
                  </svg>
                  Creating account…
                </span>
              ) : (
                "Create account"
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-gray-200" />
            <span className="text-xs text-gray-400 font-medium">or sign up with</span>
            <div className="h-px flex-1 bg-gray-200" />
          </div>

          {/* Google sign-up */}
          <button
            type="button"
            onClick={handleGoogleSignUp}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {googleLoading ? (
              <svg
                className="h-4 w-4 animate-spin text-gray-500"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8H4z"
                />
              </svg>
            ) : (
              <svg className="h-4 w-4" viewBox="0 0 24 24">
                <path
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                  fill="#4285F4"
                />
                <path
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                  fill="#34A853"
                />
                <path
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                  fill="#FBBC05"
                />
                <path
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                  fill="#EA4335"
                />
              </svg>
            )}
            Continue with Google
          </button>

          {/* Login link */}
          <p className="mt-6 text-center text-sm text-gray-500">
            Already have an account?{" "}
            <Link
              href="/login"
              className="font-semibold hover:underline"
              style={{ color: "#1A6B45" }}
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </main>
  );
}
