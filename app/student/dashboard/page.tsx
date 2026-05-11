"use client";

import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { clearAuthCookies } from "@/lib/cookies";

export default function StudentDashboardPage() {
  const router = useRouter();

  async function handleLogout() {
    await signOut(auth);
    clearAuthCookies();
    router.push("/login");
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <span className="text-5xl">🎓</span>
        <h1 className="mt-4 text-2xl font-bold text-gray-800">Student Dashboard</h1>
        <p className="mt-1 text-gray-500">Coming soon</p>
        <button
          onClick={handleLogout}
          className="mt-6 rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 active:opacity-80"
          style={{ backgroundColor: "#1A6B45" }}
        >
          Sign out
        </button>
      </div>
    </main>
  );
}
