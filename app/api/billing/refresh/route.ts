// POST /api/billing/refresh — re-resolve the caller's own plan from its
// sources: the staff grant (adminGrant) and the App Store subscription
// (revenuecat.entitlements). When REVENUECAT_SECRET_API_KEY is set, the
// subscription part is first re-read from RevenueCat's API, so the iPhone app
// can call this right after a purchase, restore or offer-code redemption and
// unlock without waiting for the webhook (lib/billing.ts). Without the key it
// uses what the webhook has stored.
//
// Also used for the stale-plan case:
// firestore.rules only read the top-level plan fields, which hold the single
// winning source. If that winner is a dated staff grant that outranked an App
// Store subscription and the grant runs out first, the fields say "expired"
// although the subscription is still active — and nothing else rewrites them
// until RevenueCat's next event for that user (up to a year away). The student
// app calls this when it sees exactly that (lib/EntitlementsContext.tsx).
//
// Uses only server-side sources (Firestore data the server wrote, and
// RevenueCat's API) and only for the caller, so it can never grant anything
// that isn't already paid for or granted. Writes nothing when neither the
// plan nor RevenueCat's answer changed.

import type { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebaseAdmin";
import { toDate } from "@/lib/entitlements";
import {
  ENTITLEMENT_IDS,
  adminCandidate,
  rcCandidates,
  rcEntitlements,
  resolvePlanFields,
  storedPlan,
} from "@/lib/planStore.server";
import { fetchRevenueCatEntitlements } from "@/lib/revenuecatApi.server";

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return Response.json({ error: "Missing authorization token" }, { status: 401 });

    let uid: string;
    try {
      uid = (await getAdminAuth().verifyIdToken(token)).uid;
    } catch {
      return Response.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const db = getAdminFirestore();
    const userRef = db.collection("users").doc(uid);
    // Coaches and admins are never gated; don't spend a RevenueCat call on them.
    const pre = await userRef.get();
    const preRole = pre.data()?.role;
    if (preRole === "coach" || preRole === "admin") {
      return Response.json({ ok: true, changed: false, plan: storedPlan(pre.data()) });
    }
    // Network call outside the transaction (transactions can retry).
    const fromRevenueCat = await fetchRevenueCatEntitlements(uid);

    const result = await db.runTransaction(async tx => {
      const snap = await tx.get(userRef);
      if (!snap.exists) return { status: 404 as const };
      const user = snap.data()!;
      if (user.role === "coach" || user.role === "admin") {
        return { status: 200 as const, changed: false, plan: storedPlan(user) };
      }

      // RevenueCat's current answer replaces the stored entitlement states;
      // one it no longer reports at all is no longer active.
      const entitlements = rcEntitlements(user);
      const rcUpdates: Record<string, unknown> = {};
      if (fromRevenueCat) {
        const now = Date.now();
        for (const id of ENTITLEMENT_IDS) {
          const stored = entitlements[id];
          const next =
            fromRevenueCat[id] ??
            (stored?.active ? { ...stored, active: false, eventAtMs: now, eventId: `rest:${now}` } : undefined);
          if (!next) continue;
          entitlements[id] = next;
          rcUpdates[`revenuecat.entitlements.${id}`] = next;
        }
        if (Object.keys(rcUpdates).length > 0) rcUpdates.rcAppUserId = uid;
      }

      const { fields } = resolvePlanFields(
        [adminCandidate(user), ...rcCandidates(entitlements)],
        user.planSource === "admin" ? "admin" : "revenuecat"
      );

      const unchanged =
        storedPlan(user) === fields.plan &&
        (user.plan === undefined ? fields.plan === "none" : user.planSource === fields.planSource) &&
        toDate(user.planExpiresAt)?.getTime() === toDate(fields.planExpiresAt)?.getTime() &&
        (user.planProductId ?? null) === fields.planProductId &&
        (user.planIsTrial ?? false) === fields.planIsTrial &&
        (user.planWillRenew ?? null) === fields.planWillRenew;
      if (unchanged && Object.keys(rcUpdates).length === 0) {
        return { status: 200 as const, changed: false, plan: fields.plan };
      }

      tx.update(userRef, unchanged ? rcUpdates : { ...rcUpdates, ...fields });
      if (unchanged) return { status: 200 as const, changed: false, plan: fields.plan };
      tx.set(db.collection("billingEvents").doc(`refresh_${uid}_${Date.now()}`), {
        source: "refresh",
        type: "PLAN_REFRESH",
        targetUid: uid,
        planBefore: storedPlan(user),
        planAfter: fields.plan,
        planSourceAfter: fields.planSource,
        fromRevenueCatApi: fromRevenueCat !== null,
        receivedAt: FieldValue.serverTimestamp(),
        outcome: "applied",
      });
      return { status: 200 as const, changed: true, plan: fields.plan };
    });

    if (result.status === 404) return Response.json({ error: "Profile not found" }, { status: 404 });
    return Response.json({ ok: true, changed: result.changed, plan: result.plan });
  } catch (err) {
    console.error("[api/billing/refresh]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
