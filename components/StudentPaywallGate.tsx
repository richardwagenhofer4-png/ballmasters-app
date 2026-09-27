"use client";

// Sends students without a plan to the paywall once the switch is on. Only
// the account screens stay reachable: /student/profile (sign out, delete
// account) and the paywall itself. Support, Terms and Privacy live outside
// /student and are never gated.
//
// Switch off (or not yet known): renders children untouched — no hold, no
// redirect. Coaches and admins opening /student/* count as Coached.

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { SUBSCRIBE_HREF, useEntitlements } from "@/lib/EntitlementsContext";

const OPEN_ROUTES = ["/student/subscribe", "/student/profile"];

export default function StudentPaywallGate({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const ent = useEntitlements();

  const open = OPEN_ROUTES.some(r => pathname === r || pathname.startsWith(`${r}/`));
  const gated = ent.paywallEnabled && !open;
  const redirect = gated && ent.ready && !ent.canSeeVideos;
  const hold = gated && (!ent.ready || !ent.canSeeVideos);

  useEffect(() => {
    if (redirect) router.replace(SUBSCRIBE_HREF);
  }, [redirect, router]);

  if (hold) {
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
