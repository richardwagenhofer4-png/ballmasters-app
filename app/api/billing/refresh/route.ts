// POST /api/billing/refresh — re-resolve the caller's own plan from what is
// already stored on their user doc (adminGrant + revenuecat.entitlements).
//
// firestore.rules only read the top-level plan fields, which hold the single
// winning source. If that winner is a dated staff grant that outranked an App
// Store subscription and the grant runs out first, the fields say "expired"
// although the subscription is still active — and nothing else rewrites them
// until RevenueCat's next event for that user (up to a year away). The student
// app calls this when it sees exactly that (lib/EntitlementsContext.tsx).
//
// Uses only server-written data and only for the caller, so it can never grant
// anything that isn't already paid for or granted. Writes nothing when the
// resolved plan matches what is stored.

import type { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebaseAdmin";
import { toDate } from "@/lib/entitlements";
import {
  adminCandidate,
  rcCandidates,
  rcEntitlements,
  resolvePlanFields,
  storedPlan,
} from "@/lib/planStore.server";

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

    const result = await db.runTransaction(async tx => {
      const snap = await tx.get(userRef);
      if (!snap.exists) return { status: 404 as const };
      const user = snap.data()!;
      if (user.role === "coach" || user.role === "admin") {
        return { status: 200 as const, changed: false, plan: storedPlan(user) };
      }

      const { fields } = resolvePlanFields(
        [adminCandidate(user), ...rcCandidates(rcEntitlements(user))],
        user.planSource === "admin" ? "admin" : "revenuecat"
      );

      const unchanged =
        storedPlan(user) === fields.plan &&
        (user.plan === undefined ? fields.plan === "none" : user.planSource === fields.planSource) &&
        toDate(user.planExpiresAt)?.getTime() === toDate(fields.planExpiresAt)?.getTime() &&
        (user.planProductId ?? null) === fields.planProductId &&
        (user.planIsTrial ?? false) === fields.planIsTrial &&
        (user.planWillRenew ?? null) === fields.planWillRenew;
      if (unchanged) return { status: 200 as const, changed: false, plan: fields.plan };

      tx.update(userRef, { ...fields });
      tx.set(db.collection("billingEvents").doc(`refresh_${uid}_${Date.now()}`), {
        source: "refresh",
        type: "PLAN_REFRESH",
        targetUid: uid,
        planBefore: storedPlan(user),
        planAfter: fields.plan,
        planSourceAfter: fields.planSource,
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
