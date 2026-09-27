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
  hasActivePlanSource,
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
  /** Plan fields expired but another source is still active: ask the server to re-resolve. */
  stale: boolean;
  /** Unique per evaluation, so each stale state triggers at most one refresh. */
  version: number;
}

let loadVersion = 0;

function evaluate(uid: string, data: PlanFields | null): Loaded {
  const plan = effectivePlan(data);
  return {
    uid,
    data,
    plan,
    stale: plan === "none" && hasActivePlanSource(data as Record<string, unknown> | null),
    version: ++loadVersion,
  };
}

const LISTENER_RETRIES = 3;
const LISTENER_RETRY_MS = 5_000;

export function EntitlementsProvider({ children }: { children: React.ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const config = useAppConfig();
  const paywallEnabled = config?.paywallEnabled === true;
  const uid = user?.uid ?? null;
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [retry, setRetry] = useState(0);
  const [refreshedVersion, setRefreshedVersion] = useState(0);

  // Live, so a purchase confirmed by the webhook unlocks the app immediately.
  // A failed listener is retried (the last known plan stays in effect
  // meanwhile) rather than treating the viewer as having no plan, which
  // would send even a coach to the paywall; after a few failures it gives up
  // and fails closed — the rules decide access either way.
  useEffect(() => {
    if (!paywallEnabled || !uid) return;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const unsub = onSnapshot(
      doc(db, "users", uid),
      snap => setLoaded(evaluate(uid, (snap.data() as PlanFields | undefined) ?? null)),
      err => {
        console.error("[entitlements]", err);
        if (retry < LISTENER_RETRIES) {
          retryTimer = setTimeout(() => setRetry(r => r + 1), LISTENER_RETRY_MS);
        } else {
          setLoaded(prev => (prev && prev.uid === uid ? prev : evaluate(uid, null)));
        }
      }
    );
    return () => {
      unsub();
      if (retryTimer) clearTimeout(retryTimer);
    };
  }, [paywallEnabled, uid, retry]);

  const current = loaded && loaded.uid === uid ? loaded : null;

  // A dated plan (e.g. an admin grant) can run out while the app is open.
  const expiresMs = current ? toDate(current.data?.planExpiresAt)?.getTime() ?? null : null;
  useEffect(() => {
    if (expiresMs === null) return;
    const delay = expiresMs - Date.now();
    // setTimeout overflows past ~24.8 days; the next launch re-evaluates anyway.
    if (delay <= 0 || delay > 2_000_000_000) return;
    const t = setTimeout(() => {
      setLoaded(prev => (prev ? evaluate(prev.uid, prev.data) : prev));
    }, delay + 500);
    return () => clearTimeout(t);
  }, [expiresMs]);

  // The stored plan ran out but another source (a staff grant, or an App
  // Store subscription it had outranked) is still active: have the server
  // re-resolve the plan. The rewrite arrives through the listener above.
  // One attempt per evaluation; the gate holds its spinner meanwhile.
  const staleVersion = current?.stale ? current.version : null;
  useEffect(() => {
    if (!paywallEnabled || !user || staleVersion === null) return;
    let cancelled = false;
    user
      .getIdToken()
      .then(token => fetch("/api/billing/refresh", { method: "POST", headers: { Authorization: `Bearer ${token}` } }))
      .catch(err => console.error("[entitlements] plan refresh failed", err))
      .finally(() => {
        if (!cancelled) setRefreshedVersion(staleVersion);
      });
    return () => {
      cancelled = true;
    };
  }, [paywallEnabled, user, staleVersion]);

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
      ready: !current.stale || refreshedVersion === current.version,
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
  }, [paywallEnabled, uid, authLoading, current, refreshedVersion]);

  return <EntitlementsContext.Provider value={value}>{children}</EntitlementsContext.Provider>;
}

/** Outside a provider (any non-student route) this is always UNLOCKED. */
export function useEntitlements(): Entitlements {
  return useContext(EntitlementsContext);
}

/** Where every locked "upgrade" affordance points. */
export const UPGRADE_HREF = "/student/subscribe?mode=upgrade";
export const SUBSCRIBE_HREF = "/student/subscribe";
