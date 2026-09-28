// RevenueCat REST API (server only): the current entitlement state for one
// app user, straight from RevenueCat. /api/billing/refresh uses it so a
// purchase, restore or offer-code redemption unlocks the app immediately,
// without waiting for the webhook.
//
// Needs REVENUECAT_SECRET_API_KEY (a v1 secret key, "sk_…"). Without it —
// or if RevenueCat can't be reached — callers fall back to what the webhook
// has already stored.

import { Timestamp } from "firebase-admin/firestore";
import { ENTITLEMENT_IDS, type EntitlementId, type RcEntitlementState } from "@/lib/planStore.server";

interface RestEntitlement {
  expires_date?: string | null;
  grace_period_expires_date?: string | null;
  product_identifier?: string | null;
}

interface RestSubscription {
  period_type?: string | null;
  unsubscribe_detected_at?: string | null;
  billing_issues_detected_at?: string | null;
  refunded_at?: string | null;
}

interface RestSubscriber {
  entitlements?: Record<string, RestEntitlement>;
  subscriptions?: Record<string, RestSubscription>;
}

function ms(v: string | null | undefined): number | null {
  if (!v) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

/**
 * RevenueCat's view of the user's access/coached entitlements, as the same
 * RcEntitlementState the webhook stores, stamped with the fetch time.
 * Returns null when not configured or on any failure.
 */
export async function fetchRevenueCatEntitlements(
  appUserId: string
): Promise<Partial<Record<EntitlementId, RcEntitlementState>> | null> {
  const key = process.env.REVENUECAT_SECRET_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch(`https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`, {
      headers: { Authorization: `Bearer ${key}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("[revenuecat api] subscriber fetch failed", res.status);
      return null;
    }
    const body = (await res.json()) as { subscriber?: RestSubscriber };
    const subscriber = body.subscriber ?? {};
    const now = Date.now();
    const out: Partial<Record<EntitlementId, RcEntitlementState>> = {};
    for (const id of ENTITLEMENT_IDS) {
      const ent = subscriber.entitlements?.[id];
      if (!ent) continue;
      const productId = ent.product_identifier ?? null;
      const sub = productId ? subscriber.subscriptions?.[productId] : undefined;
      const expires = ms(ent.expires_date);
      const grace = ms(ent.grace_period_expires_date);
      const end = expires === null ? null : Math.max(expires, grace ?? 0);
      const refunded = !!sub?.refunded_at;
      out[id] = {
        active: !refunded && (end === null || end > now),
        expiresAt: end === null ? null : Timestamp.fromMillis(end),
        productId,
        // The webhook reports TRIAL / INTRO / NORMAL; REST uses lower case.
        periodType: sub?.period_type ? sub.period_type.toUpperCase() : null,
        willRenew: sub ? !sub.unsubscribe_detected_at && !sub.billing_issues_detected_at : null,
        eventAtMs: now,
        eventId: `rest:${now}`,
      };
    }
    return out;
  } catch (err) {
    console.error("[revenuecat api] subscriber fetch error", err);
    return null;
  }
}
