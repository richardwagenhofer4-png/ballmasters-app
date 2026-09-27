// Server-side plan bookkeeping shared by the RevenueCat webhook and the admin
// grant route. A user's plan can come from two sources, each stored in full
// on users/{uid} so the effective plan can always be re-resolved:
//
//   adminGrant                         written by /api/admin/plan
//   revenuecat.entitlements.{id}       written by /api/billing/revenuecat
//
// The top-level plan / planSource / planExpiresAt fields (the ones
// firestore.rules and the app read) are always the winner of
// pickWinningPlan() over those sources.

import { Timestamp } from "firebase-admin/firestore";
import {
  isPaidPlan,
  pickWinningPlan,
  toDate,
  type PlanCandidate,
  type PlanSource,
} from "@/lib/entitlements";

export const ENTITLEMENT_IDS = ["access", "coached"] as const;
export type EntitlementId = (typeof ENTITLEMENT_IDS)[number];

/** Stored at users/{uid}.revenuecat.entitlements.{access|coached}. */
export interface RcEntitlementState {
  active: boolean;
  expiresAt: Timestamp | null;
  productId: string | null;
  periodType: string | null;
  willRenew: boolean | null;
  /** RevenueCat event_timestamp_ms of the event that last set this — guards against out-of-order delivery. */
  eventAtMs: number;
  eventId: string;
}

/** Stored at users/{uid}.adminGrant. */
export interface AdminGrant {
  plan: "access" | "coached";
  expiresAt: Timestamp | null;
  grantedBy: string;
  grantedAt: Timestamp;
}

type UserData = Record<string, unknown> | undefined;

export function rcEntitlements(user: UserData): Partial<Record<EntitlementId, RcEntitlementState>> {
  const rc = user?.revenuecat as { entitlements?: Record<string, RcEntitlementState> } | undefined;
  const out: Partial<Record<EntitlementId, RcEntitlementState>> = {};
  for (const id of ENTITLEMENT_IDS) {
    const s = rc?.entitlements?.[id];
    if (s && typeof s === "object") out[id] = s;
  }
  return out;
}

export function rcCandidates(entitlements: Partial<Record<EntitlementId, RcEntitlementState>>): PlanCandidate[] {
  const out: PlanCandidate[] = [];
  for (const id of ENTITLEMENT_IDS) {
    const s = entitlements[id];
    if (!s || !s.active) continue;
    out.push({
      plan: id,
      source: "revenuecat",
      expiresAt: toDate(s.expiresAt),
      productId: s.productId ?? null,
      isTrial: s.periodType === "TRIAL",
      willRenew: typeof s.willRenew === "boolean" ? s.willRenew : null,
    });
  }
  return out;
}

/**
 * The admin grant as a candidate. Falls back to the top-level fields when
 * planSource is "admin" but no adminGrant map exists (e.g. a plan typed in by
 * hand in the Firebase console), so such a grant is never silently dropped.
 */
export function adminCandidate(user: UserData): PlanCandidate | null {
  const g = user?.adminGrant as Partial<AdminGrant> | null | undefined;
  if (g && isPaidPlan(g.plan)) {
    return { plan: g.plan, source: "admin", expiresAt: toDate(g.expiresAt) };
  }
  if (g === undefined && user?.planSource === "admin" && isPaidPlan(user.plan)) {
    return { plan: user.plan, source: "admin", expiresAt: toDate(user.planExpiresAt) };
  }
  return null;
}

export interface PlanFieldValues {
  plan: "none" | "access" | "coached";
  planSource: PlanSource;
  planExpiresAt: Timestamp | null;
  planProductId: string | null;
  planIsTrial: boolean;
  planWillRenew: boolean | null;
}

/**
 * Resolves the top-level plan fields. With no active source the plan is
 * "none", attributed to `sourceIfNone` (whichever writer made the call).
 */
export function resolvePlanFields(
  candidates: Array<PlanCandidate | null>,
  sourceIfNone: PlanSource,
  now: Date = new Date()
): { fields: PlanFieldValues; winner: PlanCandidate | null } {
  const winner = pickWinningPlan(candidates.filter((c): c is PlanCandidate => c !== null), now);
  if (!winner) {
    return {
      winner: null,
      fields: {
        plan: "none",
        planSource: sourceIfNone,
        planExpiresAt: null,
        planProductId: null,
        planIsTrial: false,
        planWillRenew: null,
      },
    };
  }
  const isRc = winner.source === "revenuecat";
  return {
    winner,
    fields: {
      plan: winner.plan,
      planSource: winner.source,
      planExpiresAt: winner.expiresAt ? Timestamp.fromDate(winner.expiresAt) : null,
      planProductId: isRc ? winner.productId ?? null : null,
      planIsTrial: isRc ? winner.isTrial === true : false,
      planWillRenew: isRc ? winner.willRenew ?? null : null,
    },
  };
}

/** The plan currently written on a user doc, for audit before/after records. */
export function storedPlan(user: UserData): string {
  return isPaidPlan(user?.plan) ? user.plan : "none";
}
