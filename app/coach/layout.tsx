"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { useAuth } from "@/lib/AuthContext";
import { db } from "@/lib/firebase";

export default function CoachLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Wait for auth to resolve before deciding anything.
    if (loading) return;

    // No signed-in user -> send to login.
    if (!user) {
      router.replace("/login");
      return;
    }

    let cancelled = false;
    setChecking(true);

    (async () => {
      try {
        const snap = await getDoc(doc(db, "users", user.uid));
        const role = snap.data()?.role;
        if (cancelled) return;
        if (role === "coach" || role === "admin") {
          setAllowed(true);
          setChecking(false);
        } else {
          // Missing profile or non-coach role -> fail closed to the student home.
          router.replace("/student/dashboard");
        }
      } catch {
        if (cancelled) return;
        // Failed read -> fail closed.
        router.replace("/student/dashboard");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, loading, router]);

  // While auth is loading, while the role lookup is in flight, or before access is
  // granted, never render the coach UI — it must not flash before a redirect.
  if (loading || checking || !allowed) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <svg className="h-10 w-10 animate-spin text-white opacity-40" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      </main>
    );
  }

  return <>{children}</>;
}
