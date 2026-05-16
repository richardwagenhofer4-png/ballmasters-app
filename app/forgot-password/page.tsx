"use client";

import { useState } from "react";
import Link from "next/link";
import { sendPasswordResetEmail } from "firebase/auth";
import { auth } from "@/lib/firebase";

const FIREBASE_ERROR_MESSAGES: Record<string, string> = {
  "auth/invalid-email": "Please enter a valid email address.",
  "auth/user-not-found": "No account found with this email.",
  "auth/too-many-requests": "Too many requests. Please try again later.",
  "auth/missing-email": "Please enter your email address.",
};

function getErrorMessage(code: string): string {
  return FIREBASE_ERROR_MESSAGES[code] ?? "Something went wrong. Please try again.";
}

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email);
      setSent(true);
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? "";
      setError(getErrorMessage(code));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <img
            src="/logo-dark.png"
            alt="Ball Masters Florida"
            style={{ width: 120, height: "auto", margin: "0 auto 8px" }}
          />
          <p className="mt-2 text-gray-500 text-sm">Reset your password</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8">
          {sent ? (
            <div className="text-center space-y-4">
              <div
                className="flex items-start gap-2 rounded-lg px-4 py-3 text-sm"
                style={{ backgroundColor: "rgba(1,255,249,0.08)", border: "1px solid rgba(1,255,249,0.3)", color: "#001c48" }}
              >
                <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                </svg>
                <span>Check your email for a reset link.</span>
              </div>
              <p className="text-sm text-gray-500">
                Sent to <span className="font-medium text-gray-700">{email}</span>. Check your spam folder if you don&apos;t see it.
              </p>
              <Link
                href="/login"
                className="block mt-2 text-sm font-semibold hover:underline"
                style={{ color: "#001c48" }}
              >
                ← Back to Login
              </Link>
            </div>
          ) : (
            <>
              <p className="text-sm text-gray-500 mb-5">
                Enter your email address and we&apos;ll send you a link to reset your password.
              </p>

              {error && (
                <div className="mb-5 flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-11.25a.75.75 0 011.5 0v4.5a.75.75 0 01-1.5 0v-4.5zm.75 7.5a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
                  </svg>
                  {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-4">
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
                      Sending…
                    </span>
                  ) : (
                    "Send Reset Link"
                  )}
                </button>
              </form>

              <p className="mt-6 text-center text-sm text-gray-500">
                <Link
                  href="/login"
                  className="font-semibold hover:underline"
                  style={{ color: "#001c48" }}
                >
                  ← Back to Login
                </Link>
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
