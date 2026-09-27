// POST /api/admin/plan — grant, change or revoke a student's plan by hand.
// Body: { uid: string, plan: "none" | "access" | "coached", expiresAt: string | null }
//   expiresAt is an ISO date-time; null means no end date. Ignored for "none".
//
// Caller must be a coach or admin (ID token verified, role read from
// Firestore). Admins may set any student's plan; a coach only their own
// athletes' (users.coachId == coach), plus unassigned athletes when they are
// the head coach — the same athletes the coach can open in the app.
//
// Writes users/{uid}.adminGrant and re-resolves the effective plan with
// planSource "admin". An active App Store subscription on a higher plan (or
// the same plan) stays in effect; the grant is kept and takes over if that
// subscription lapses. Each call is logged to billingEvents.

import type { NextRequest } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebaseAdmin";
import {
  adminCandidate,
  rcCandidates,
  rcEntitlements,
  resolvePlanFields,
  storedPlan,
  type AdminGrant,
} from "@/lib/planStore.server";

const PLANS = new Set(["none", "access", "coached"]);

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return Response.json({ error: "Missing authorization token" }, { status: 401 });
    }

    let callerUid: string;
    try {
      callerUid = (await getAdminAuth().verifyIdToken(token)).uid;
    } catch {
      return Response.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    let body: { uid?: unknown; plan?: unknown; expiresAt?: unknown };
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    const targetUid = typeof body.uid === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(body.uid) ? body.uid : null;
    const plan = typeof body.plan === "string" && PLANS.has(body.plan) ? (body.plan as "none" | "access" | "coached") : null;
    if (!targetUid) return Response.json({ error: "uid is required" }, { status: 400 });
    if (!plan) return Response.json({ error: "plan must be none, access or coached" }, { status: 400 });

    let expiresAt: Date | null = null;
    if (plan !== "none" && body.expiresAt != null) {
      if (typeof body.expiresAt !== "string") {
        return Response.json({ error: "expiresAt must be an ISO date string or null" }, { status: 400 });
      }
      expiresAt = new Date(body.expiresAt);
      if (isNaN(expiresAt.getTime())) {
        return Response.json({ error: "expiresAt is not a valid date" }, { status: 400 });
      }
      if (expiresAt.getTime() <= Date.now()) {
        return Response.json({ error: "Expiry date must be in the future" }, { status: 400 });
      }
    }

    const db = getAdminFirestore();
    const [callerSnap, settingsSnap] = await Promise.all([
      db.collection("users").doc(callerUid).get(),
      db.collection("settings").doc("general").get(),
    ]);
    const callerRole = callerSnap.data()?.role as string | undefined;
    if (callerRole !== "coach" && callerRole !== "admin") {
      return Response.json({ error: "Only coaches and admins can change plans" }, { status: 403 });
    }
    const headCoachId = (settingsSnap.data()?.headCoachId as string | undefined) ?? null;

    const userRef = db.collection("users").doc(targetUid);
    const auditRef = db.collection("billingEvents").doc(`admin_${targetUid}_${Date.now()}`);

    const result = await db.runTransaction(async tx => {
      const snap = await tx.get(userRef);
      if (!snap.exists) return { status: 404 as const, error: "Athlete not found" };
      const user = snap.data()!;

      const targetRole = user.role as string | undefined;
      if (targetRole === "coach" || targetRole === "admin") {
        return { status: 400 as const, error: "Coaches and admins always have full access" };
      }
      if (callerRole === "coach") {
        const coachId = (user.coachId as string | undefined) ?? null;
        const isTheirs = coachId === callerUid || (coachId === null && headCoachId === callerUid);
        if (!isTheirs) return { status: 403 as const, error: "You can only change plans for your own athletes" };
      }

      const grant: AdminGrant | null =
        plan === "none"
          ? null
          : {
              plan,
              expiresAt: expiresAt ? Timestamp.fromDate(expiresAt) : null,
              grantedBy: callerUid,
              grantedAt: Timestamp.now(),
            };

      const { fields, winner } = resolvePlanFields(
        [adminCandidate({ ...user, adminGrant: grant }), ...rcCandidates(rcEntitlements(user))],
        "admin"
      );

      tx.update(userRef, { adminGrant: grant, ...fields });
      tx.set(auditRef, {
        source: "admin",
        type: "ADMIN_GRANT",
        targetUid,
        callerUid,
        callerRole,
        requestedPlan: plan,
        requestedExpiresAt: expiresAt ? Timestamp.fromDate(expiresAt) : null,
        planBefore: storedPlan(user),
        planAfter: fields.plan,
        planSourceAfter: fields.planSource,
        receivedAt: FieldValue.serverTimestamp(),
        outcome: "applied",
      });

      return {
        status: 200 as const,
        fields,
        grant,
        supersededBySubscription: grant !== null && winner?.source === "revenuecat",
      };
    });

    if (result.status !== 200) {
      return Response.json({ error: result.error }, { status: result.status });
    }

    const { fields, grant, supersededBySubscription } = result;
    return Response.json({
      ok: true,
      plan: fields.plan,
      planSource: fields.planSource,
      planExpiresAt: fields.planExpiresAt ? fields.planExpiresAt.toDate().toISOString() : null,
      planProductId: fields.planProductId,
      planIsTrial: fields.planIsTrial,
      planWillRenew: fields.planWillRenew,
      adminGrant: grant
        ? { plan: grant.plan, expiresAt: grant.expiresAt ? grant.expiresAt.toDate().toISOString() : null }
        : null,
      supersededBySubscription,
    });
  } catch (err) {
    console.error("[api/admin/plan]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
