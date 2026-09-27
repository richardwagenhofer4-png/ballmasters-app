"use client";

// What the signed-in viewer may see on student screens. Mounted by
// app/student/layout.tsx, so one listener serves every student page.
//
// While the paywall switch is off (or not yet known) this is a constant
// "everything unlocked" value and no Firestore listener is opened — student
// screens behave exactly as they did before the paywall existed.

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { useAppConfig } from "@/lib/paywall";
import {
  canMessage,
  canSeeBreakdowns,
  canSeeVideos,
  effectivePlan,
  toDate,
  type Plan,
  type PlanFields,
  type PlanSource,
} from "@/lib/entitlements";

export interface Entitlements {
  /** False only while the switch is on and the viewer's plan is still loading. */
  ready: boolean;
  paywallEnabled: boolean;
  /** Effective plan; null while the paywall is off or the plan is loading. */
  plan: Plan | null;
  planSource: PlanSource | null;
  planExpiresAt: Date | null;
  planWillRenew: boolean | null;
  canSeeVideos: boolean;
  canSeeBreakdowns: boolean;
  canMessage: boolean;
  /** Coach or admin viewing a student screen — never gated. Only known while the switch is on. */
  isStaff: boolean;
}

export const UNLOCKED: Entitlements = {
  ready: true,
  paywallEnabled: false,
  plan: null,
  planSource: null,
  planExpiresAt: null,
  planWillRenew: null,
  canSeeVideos: true,
  canSeeBreakdowns: true,
  canMessage: true,
  isStaff: false,
};

/** Exported for tests/previews that need a fixed value; app code uses EntitlementsProvider. */
export const EntitlementsContext = createContext<Entitlements>(UNLOCKED);

interface Loaded {
  uid: string;
  data: PlanFields | null;
  plan: Plan;
}

export function EntitlementsProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const config = useAppConfig();
  const paywallEnabled = config?.paywallEnabled === true;
  const uid = user?.uid ?? null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);

  // Live, so a purchase confirmed by the webhook unlocks the app immediately.
  useEffect(() => {
    if (!paywallEnabled || !uid) return;
    return onSnapshot(
      doc(db, "users", uid),
      snap => {
        const data = (snap.data() as PlanFields | undefined) ?? null;
        setLoaded({ uid, data, plan: effectivePlan(data) });
      },
      err => {
        console.error("[entitlements]", err);
        setLoaded({ uid, data: null, plan: "none" });
      }
    );
  }, [paywallEnabled, uid]);

  const current = loaded && loaded.uid === uid ? loaded : null;

  // A dated plan (e.g. an admin grant) can run out while the app is open.
  const expiresMs = current ? toDate(current.data?.planExpiresAt)?.getTime() ?? null : null;
  useEffect(() => {
    if (expiresMs === null) return;
    const delay = expiresMs - Date.now();
    // setTimeout overflows past ~24.8 days; the next launch re-evaluates anyway.
    if (delay <= 0 || delay > 2_000_000_000) return;
    const t = setTimeout(() => {
      setLoaded(prev => (prev ? { ...prev, plan: effectivePlan(prev.data) } : prev));
    }, delay + 500);
    return () => clearTimeout(t);
  }, [expiresMs]);

  const value = useMemo<Entitlements>(() => {
    if (!paywallEnabled) return UNLOCKED;
    if (!uid) {
      // Signed out: the pages' own auth handling sends people to /login, so
      // don't gate. Still loading auth: hold until we know who this is.
      return authLoading ? { ...UNLOCKED, paywallEnabled: true, ready: false } : { ...UNLOCKED, paywallEnabled: true };
    }
    if (!current) {
      return {
        ready: false,
        paywallEnabled: true,
        plan: null,
        planSource: null,
        planExpiresAt: null,
        planWillRenew: null,
        canSeeVideos: false,
        canSeeBreakdowns: false,
        canMessage: false,
        isStaff: false,
      };
    }
    const d = current.data;
    return {
      ready: true,
      paywallEnabled: true,
      plan: current.plan,
      planSource: d?.planSource === "revenuecat" || d?.planSource === "admin" ? d.planSource : null,
      planExpiresAt: toDate(d?.planExpiresAt),
      planWillRenew: typeof d?.planWillRenew === "boolean" ? d.planWillRenew : null,
      canSeeVideos: canSeeVideos(current.plan),
      canSeeBreakdowns: canSeeBreakdowns(current.plan),
      canMessage: canMessage(current.plan),
      isStaff: d?.role === "coach" || d?.role === "admin",
    };
  }, [paywallEnabled, uid, authLoading, current]);

  return <EntitlementsContext.Provider value={value}>{children}</EntitlementsContext.Provider>;
}

/** Outside a provider (any non-student route) this is always UNLOCKED. */
export function useEntitlements(): Entitlements {
  return useContext(EntitlementsContext);
}

/** Where every locked "upgrade" affordance points. */
export const UPGRADE_HREF = "/student/subscribe?mode=upgrade";
export const SUBSCRIBE_HREF = "/student/subscribe";
