// Plan / entitlement rules shared by the client, the API routes and (in
// spirit) firestore.rules. Pure functions only — no Firebase imports — so the
// same logic runs in the browser, in route handlers and in scripts.
//
// Data model on users/{uid} (all written server-side only; see firestore.rules):
//   plan           "none" | "access" | "coached"   (absent = "none")
//   planSource     "revenuecat" | "admin" | null
//   planExpiresAt  Timestamp | null                 (null = no end date)
//   rcAppUserId    string | null                    (RevenueCat app user id)
// Supporting fields kept so plan changes can be re-resolved without data loss:
//   adminGrant     { plan, expiresAt, grantedBy, grantedAt } | null
//   revenuecat     { entitlements: { access?, coached? }, lastEventId, lastEventAt }
//   planProductId / planIsTrial / planWillRenew — details of the winning
//                  RevenueCat subscription, for badges and "renews on" copy.

import { productById } from "@/lib/plans";

export type Plan = "none" | "access" | "coached";
export type PlanSource = "revenuecat" | "admin";

/**
 * Every users/{uid} field the client must never write. firestore.rules keeps
 * its own copy of this list (planFields()); keep the two in sync.
 */
export const PLAN_FIELDS = [
  "plan",
  "planSource",
  "planExpiresAt",
  "planProductId",
  "planIsTrial",
  "planWillRenew",
  "rcAppUserId",
  "revenuecat",
  "adminGrant",
] as const;

export interface PlanFields {
  role?: unknown;
  plan?: unknown;
  planSource?: unknown;
  planExpiresAt?: unknown;
  planProductId?: unknown;
  planIsTrial?: unknown;
  planWillRenew?: unknown;
}

const RANK: Record<Plan, number> = { none: 0, access: 1, coached: 2 };

export function planRank(plan: Plan): number {
  return RANK[plan];
}

export function isPaidPlan(value: unknown): value is "access" | "coached" {
  return value === "access" || value === "coached";
}

/**
 * Normalises the timestamp shapes this codebase meets: Firestore Timestamps
 * (client or admin SDK — both expose toDate()), {seconds} objects, Dates,
 * ISO strings and epoch milliseconds. Returns null for anything else.
 */
export function toDate(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === "object") {
    const v = value as { toDate?: () => Date; seconds?: number; _seconds?: number };
    if (typeof v.toDate === "function") return v.toDate();
    const seconds = typeof v.seconds === "number" ? v.seconds : v._seconds;
    if (typeof seconds === "number") return new Date(seconds * 1000);
    return null;
  }
  if (typeof value === "string" || typeof value === "number") {
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/**
 * The plan a user actually has right now. Coaches and admins always count as
 * Coached (they are never gated). An expired plan is "none". Mirrors the
 * callerHasPlan() check in firestore.rules: a present-but-unreadable expiry
 * is treated as expired, because the rules would deny it too.
 */
export function effectivePlan(user: PlanFields | null | undefined, now: Date = new Date()): Plan {
  if (!user) return "none";
  if (user.role === "coach" || user.role === "admin") return "coached";
  if (!isPaidPlan(user.plan)) return "none";
  if (user.planExpiresAt == null) return user.plan;
  const expires = toDate(user.planExpiresAt);
  if (!expires || expires.getTime() <= now.getTime()) return "none";
  return user.plan;
}

export function canSeeVideos(plan: Plan): boolean {
  return plan === "access" || plan === "coached";
}

export function canSeeBreakdowns(plan: Plan): boolean {
  return plan === "coached";
}

export function canMessage(plan: Plan): boolean {
  return plan === "coached";
}

/** Same test the app already uses to route drill comparison videos. */
export function isDrillComparison(video: { type?: unknown; coachVideoKey?: unknown; studentVideoKey?: unknown }): boolean {
  return video.type === "drill_comparison" || (!!video.coachVideoKey && !!video.studentVideoKey);
}

// ---------------------------------------------------------------------------
// Resolving a user's plan from its sources (admin grant + App Store).
// ---------------------------------------------------------------------------

export interface PlanCandidate {
  plan: "access" | "coached";
  source: PlanSource;
  expiresAt: Date | null;
  /** RevenueCat details when source === "revenuecat". */
  productId?: string | null;
  isTrial?: boolean;
  willRenew?: boolean | null;
}

function isActive(c: PlanCandidate, now: Date): boolean {
  return c.expiresAt === null || c.expiresAt.getTime() > now.getTime();
}

/**
 * Picks the plan that should be in effect: the highest-ranked active
 * candidate. On a tie the App Store subscription wins over an admin grant —
 * the grant is kept in users/{uid}.adminGrant and comes back into effect if
 * the subscription lapses first, so nothing is lost. An admin grant is
 * therefore never displaced by anything lower than itself.
 */
export function pickWinningPlan(candidates: PlanCandidate[], now: Date = new Date()): PlanCandidate | null {
  const active = candidates.filter(c => isActive(c, now));
  if (active.length === 0) return null;
  active.sort((a, b) => {
    const byRank = planRank(b.plan) - planRank(a.plan);
    if (byRank !== 0) return byRank;
    if (a.source !== b.source) return a.source === "revenuecat" ? -1 : 1;
    const ae = a.expiresAt?.getTime() ?? Infinity;
    const be = b.expiresAt?.getTime() ?? Infinity;
    return be - ae;
  });
  return active[0];
}

// ---------------------------------------------------------------------------
// Coach-facing badge
// ---------------------------------------------------------------------------

/** The plan fields off a users/{uid} doc a screen has already loaded. */
export function pickPlanFields(data: Record<string, unknown> | undefined | null): PlanFields {
  return {
    plan: data?.plan,
    planSource: data?.planSource,
    planExpiresAt: data?.planExpiresAt,
    planProductId: data?.planProductId,
    planIsTrial: data?.planIsTrial,
    planWillRenew: data?.planWillRenew,
  };
}

/**
 * Short label for coach screens: "None", "Access", "Access · trial",
 * "Coached", "Coached · annual", … Derived only from the stored plan fields.
 */
export function planBadgeLabel(user: PlanFields | null | undefined, now: Date = new Date()): string {
  const plan = effectivePlan(user ? { ...user, role: undefined } : user, now);
  if (plan === "none") return "None";
  const name = plan === "access" ? "Access" : "Coached";
  if (user?.planSource === "revenuecat") {
    if (user.planIsTrial === true) return `${name} · trial`;
    if (productById(typeof user.planProductId === "string" ? user.planProductId : null)?.period === "annual") {
      return `${name} · annual`;
    }
  }
  return name;
}
