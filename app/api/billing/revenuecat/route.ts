// POST /api/billing/revenuecat — RevenueCat webhook.
//
// Configure in RevenueCat → Integrations → Webhooks:
//   URL:                  https://<host>/api/billing/revenuecat
//   Authorization header: Bearer <REVENUECAT_WEBHOOK_SECRET>
//
// Each event updates users/{app_user_id} (the native layer must call
// Purchases.logIn(firebaseUid) so app_user_id is the Firebase uid):
//   - revenuecat.entitlements.{access|coached} record what RevenueCat says
//     about each entitlement;
//   - plan / planSource / planExpiresAt are re-resolved from those plus any
//     admin grant (lib/planStore.server.ts). Entitlement "coached" → Coached,
//     "access" → Access, nothing active → none. An unexpired admin grant is
//     never downgraded.
// Every authenticated event is written to billingEvents/{event.id}. A repeat
// delivery of the same id is acknowledged and changes nothing (idempotent);
// events older than the last one applied to an entitlement are ignored for
// that entitlement (out-of-order delivery).

import type { NextRequest } from "next/server";
import { createHash, timingSafeEqual } from "crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebaseAdmin";
import { isPaywallEnabledServer } from "@/lib/paywall.server";
import {
  ENTITLEMENT_IDS,
  adminCandidate,
  rcCandidates,
  rcEntitlements,
  resolvePlanFields,
  storedPlan,
  type EntitlementId,
  type RcEntitlementState,
} from "@/lib/planStore.server";

// Events that (re)state an entitlement as purchased for a period.
const GRANT_EVENTS = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "UNCANCELLATION",
  "NON_RENEWING_PURCHASE",
  "SUBSCRIPTION_EXTENDED",
  "TEMPORARY_ENTITLEMENT_GRANT",
  "REFUND_REVERSED",
]);
// Auto-renew turned off (or a refund, which RevenueCat reports with an
// expiration at the refund time). Access continues until expiration_at_ms.
const CANCEL_EVENTS = new Set(["CANCELLATION"]);
// Payment failing; Apple keeps retrying and access runs to expiration_at_ms.
const BILLING_ISSUE_EVENTS = new Set(["BILLING_ISSUE"]);
const EXPIRATION_EVENTS = new Set(["EXPIRATION"]);
// Everything else (TEST, PRODUCT_CHANGE, TRANSFER, SUBSCRIPTION_PAUSED, ...)
// is logged only. PRODUCT_CHANGE is followed by a RENEWAL/INITIAL_PURCHASE
// carrying the new product, which is what moves the plan.

const SAFE_ID = /^[A-Za-z0-9_\-:.]{1,200}$/;

interface RcEvent {
  id?: unknown;
  type?: unknown;
  app_user_id?: unknown;
  entitlement_ids?: unknown;
  entitlement_id?: unknown;
  expiration_at_ms?: unknown;
  event_timestamp_ms?: unknown;
  product_id?: unknown;
  period_type?: unknown;
  environment?: unknown;
  store?: unknown;
}

function bearerMatches(header: string | null, secret: string): boolean {
  // Hash both sides so the comparison is constant-time regardless of length.
  const a = createHash("sha256").update(header ?? "").digest();
  const b = createHash("sha256").update(`Bearer ${secret}`).digest();
  return timingSafeEqual(a, b);
}

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function entitlementIdsOf(event: RcEvent): { known: EntitlementId[]; all: string[] } {
  const raw = Array.isArray(event.entitlement_ids)
    ? event.entitlement_ids
    : typeof event.entitlement_id === "string"
    ? [event.entitlement_id]
    : [];
  const all = raw.filter((x): x is string => typeof x === "string");
  const known = all.filter((x): x is EntitlementId => (ENTITLEMENT_IDS as readonly string[]).includes(x));
  return { known, all };
}

export async function POST(request: NextRequest) {
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[billing/revenuecat] REVENUECAT_WEBHOOK_SECRET is not set — rejecting webhook");
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (!bearerMatches(request.headers.get("authorization"), secret)) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let event: RcEvent;
  try {
    const body = (await request.json()) as { event?: RcEvent };
    if (!body?.event || typeof body.event !== "object") throw new Error("missing event");
    event = body.event;
  } catch {
    return Response.json({ error: "Invalid payload" }, { status: 400 });
  }

  const eventId = str(event.id);
  const type = str(event.type);
  if (!eventId || !SAFE_ID.test(eventId) || eventId === "." || eventId === ".." || !type) {
    return Response.json({ error: "Invalid event" }, { status: 400 });
  }

  const appUserId = str(event.app_user_id);
  const productId = str(event.product_id);
  const periodType = str(event.period_type);
  const expMs = num(event.expiration_at_ms);
  const nowMs = Date.now();
  const eventAtMs = num(event.event_timestamp_ms) ?? nowMs;
  const { known: entIds, all: allEntIds } = entitlementIdsOf(event);

  // Only real Firebase uids map to a user doc; RevenueCat anonymous ids
  // ($RCAnonymousID:...) mean the app never logged the user in.
  const uid = appUserId && !appUserId.startsWith("$RCAnonymousID") && SAFE_ID.test(appUserId) ? appUserId : null;

  try {
    const db = getAdminFirestore();
    const eventRef = db.collection("billingEvents").doc(eventId);
    const paywallEnabled = await isPaywallEnabledServer();

    const outcome = await db.runTransaction(async tx => {
      const existing = await tx.get(eventRef);
      if (existing.exists) return "duplicate";

      const userRef = uid ? db.collection("users").doc(uid) : null;
      const userSnap = userRef ? await tx.get(userRef) : null;
      const user = userSnap?.exists ? userSnap.data() : undefined;

      const audit: Record<string, unknown> = {
        source: "revenuecat",
        eventId,
        type,
        appUserId,
        productId,
        periodType,
        entitlementIds: allEntIds,
        expirationAtMs: expMs,
        eventTimestampMs: num(event.event_timestamp_ms),
        environment: str(event.environment),
        store: str(event.store),
        paywallEnabled,
        planBefore: user ? storedPlan(user) : null,
        receivedAt: FieldValue.serverTimestamp(),
        rawJson: JSON.stringify(event),
      };

      let result: string;
      if (type === "TEST") {
        result = "test";
      } else if (!userRef || !user) {
        result = uid ? "unknown_user" : "no_user_id";
      } else {
        const isGrant = GRANT_EVENTS.has(type);
        const isCancel = CANCEL_EVENTS.has(type);
        const isBillingIssue = BILLING_ISSUE_EVENTS.has(type);
        const isExpiration = EXPIRATION_EVENTS.has(type);

        if (!(isGrant || isCancel || isBillingIssue || isExpiration) || entIds.length === 0) {
          result = "logged_only";
        } else {
          const entitlements = rcEntitlements(user);
          const updates: Record<string, unknown> = {};
          let applied = 0;
          for (const id of entIds) {
            const prev = entitlements[id];
            if (prev && typeof prev.eventAtMs === "number" && prev.eventAtMs > eventAtMs) continue; // stale
            const stillRunning = expMs === null || expMs > nowMs;
            const next: RcEntitlementState = {
              active: isExpiration ? false : stillRunning,
              expiresAt: expMs === null ? null : Timestamp.fromMillis(expMs),
              productId,
              periodType,
              willRenew: isExpiration || isCancel
                ? false
                : isBillingIssue
                ? prev?.willRenew ?? null
                : type !== "NON_RENEWING_PURCHASE",
              eventAtMs,
              eventId,
            };
            entitlements[id] = next;
            updates[`revenuecat.entitlements.${id}`] = next;
            applied++;
          }

          if (applied === 0) {
            result = "stale";
          } else {
            const { fields } = resolvePlanFields(
              [adminCandidate(user), ...rcCandidates(entitlements)],
              "revenuecat"
            );
            Object.assign(updates, fields, {
              rcAppUserId: appUserId,
              "revenuecat.lastEventId": eventId,
              "revenuecat.lastEventAt": Timestamp.fromMillis(eventAtMs),
            });
            tx.update(userRef, updates);
            audit.planAfter = fields.plan;
            audit.planSourceAfter = fields.planSource;
            result = "applied";
          }
        }
      }

      audit.outcome = result;
      tx.set(eventRef, audit);
      return result;
    });

    return Response.json({ ok: true, outcome });
  } catch (err) {
    // Non-2xx makes RevenueCat retry later; nothing was written.
    console.error("[billing/revenuecat] failed to process event", eventId, err);
    return Response.json({ error: "Processing failed" }, { status: 500 });
  }
}
