"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { getUserProfile } from "@/lib/firestore";

export default function NotFound() {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {}, 0);
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setTimeout(async () => {
          const profile = await getUserProfile(user.uid);
          const role = profile?.role ?? "student";
          router.push(role === "coach" || role === "admin" ? "/coach/dashboard" : "/student/dashboard");
        }, 3000);
      }
    });
    return () => { unsub(); clearTimeout(timer); };
  }, [router]);

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md text-center">
        <img
          src="/logo-dark.png"
          alt="Ball Masters Florida"
          style={{ width: 100, height: "auto", margin: "0 auto 24px" }}
        />

        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div
            className="text-6xl font-black mb-2 tabular-nums"
            style={{ color: "#001c48" }}
          >
            404
          </div>
          <p className="text-gray-700 font-semibold text-lg mb-1">Page not found</p>
          <p className="text-sm text-gray-400 mb-8">
            The page you&apos;re looking for doesn&apos;t exist or has been moved.
          </p>

          <div className="flex flex-col gap-3">
            <Link
              href="/student/dashboard"
              className="w-full rounded-lg py-2.5 text-sm font-semibold text-white text-center transition hover:opacity-90"
              style={{ backgroundColor: "#001c48" }}
            >
              Go to Home
            </Link>
            <Link
              href="/login"
              className="w-full rounded-lg py-2.5 text-sm font-semibold text-center border border-gray-200 text-gray-600 hover:bg-gray-50 transition"
            >
              Go to Login
            </Link>
          </div>

          <p className="mt-6 text-xs text-gray-400">
            If you&apos;re signed in, you&apos;ll be redirected automatically in a few seconds.
          </p>
        </div>
      </div>
    </main>
  );
}
