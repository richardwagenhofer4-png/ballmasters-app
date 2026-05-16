"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { clearAuthCookies } from "@/lib/cookies";

export default function IncompleteProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleSignOut() {
    setLoading(true);
    try {
      clearAuthCookies();
      await signOut(auth);
      router.push("/login");
    } catch {
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
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8 text-center">
          <div
            className="h-14 w-14 rounded-full flex items-center justify-center mx-auto mb-4"
            style={{ backgroundColor: "rgba(1,255,249,0.1)" }}
          >
            <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="#001c48" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>

          <h1 className="text-lg font-bold mb-2" style={{ color: "#001c48" }}>
            Account Setup Required
          </h1>

          <p className="text-sm text-gray-500 mb-6 leading-relaxed">
            Your account needs to be set up by an admin. Please contact{" "}
            <span className="font-semibold text-gray-700">Ball Masters Florida</span>{" "}
            to get access.
          </p>

          <button
            onClick={handleSignOut}
            disabled={loading}
            className="w-full rounded-lg py-2.5 text-sm font-semibold text-white transition hover:opacity-90 active:opacity-80 disabled:opacity-60 disabled:cursor-not-allowed"
            style={{ backgroundColor: "#001c48" }}
          >
            {loading ? "Signing out…" : "Sign Out"}
          </button>
        </div>
      </div>
    </main>
  );
}
