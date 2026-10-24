"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import { isProfileUnreachable, readOwnUserDoc } from "@/lib/ownProfile";
import { loginTrace } from "@/lib/loginDiagnostics";
import { isValidRole } from "@/lib/roles";
import ProfileUnreachable from "@/components/ProfileUnreachable";

export default function CoachLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [allowed, setAllowed] = useState(false);
  const [checking, setChecking] = useState(true);
  // The profile could not be read at all: offer a retry instead of guessing a role.
  const [unreachable, setUnreachable] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    // Wait for auth to resolve before deciding anything.
    if (loading) return;

    // No signed-in user -> send to login.
    if (!user) {
      loginTrace.step("coach_layout_no_user", {}, "warning");
      router.replace("/login");
      return;
    }

    let cancelled = false;
    setChecking(true);
    setUnreachable(false);

    (async () => {
      try {
        const snap = await loginTrace.track("coach_layout_profile", readOwnUserDoc(user.uid), "profile");
        const role = snap.data()?.role;
        if (cancelled) return;
        loginTrace.step("coach_layout_role", { role: typeof role === "string" ? role : "none", profileExists: snap.exists() });
        if (isValidRole(role) && role !== "student") {
          setAllowed(true);
          setChecking(false);
        } else {
          // Missing profile, no valid role, or a student -> fail closed to the
          // student home. Reported to Sentry: a coach or admin sent here after
          // login is the "wrong screens" report, and this says why.
          loginTrace.flag("coach_layout_redirect_student", { role: typeof role === "string" ? role : "none", profileExists: snap.exists() }, user.uid, "warning");
          router.replace("/student/dashboard");
        }
      } catch (err) {
        if (cancelled) return;
        // Could not be reached at all: never a verdict on who this is.
        if (isProfileUnreachable(err)) {
          setUnreachable(true);
          setChecking(false);
          return;
        }
        // Any other failed read -> fail closed (reported, see above).
        loginTrace.flag("coach_layout_redirect_student_after_error", { code: String((err as { code?: unknown })?.code ?? "none") }, user.uid, "warning");
        router.replace("/student/dashboard");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, loading, router, attempt]);

  if (unreachable) return <ProfileUnreachable onRetry={() => setAttempt(a => a + 1)} />;

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
