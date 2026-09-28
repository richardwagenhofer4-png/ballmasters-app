import type { NextRequest } from "next/server";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import { getAdminAuth, getAdminFirestore, getAdminMessaging } from "@/lib/firebaseAdmin";
import { isPaywallEnabledServer } from "@/lib/paywall.server";
import { canMessage, effectivePlan } from "@/lib/entitlements";

// POST /api/notifications/message { threadId } — push "new message" to the
// other person in a thread. Called by lib/messaging.ts sendMessage().
//
// Only reaches the iPhone app (1.1+): recipients whose stored token came from
// the app (fcmTokenSource "ios"). Web-push tokens get nothing new from this,
// so nothing changes for anyone who hasn't installed 1.1. Respects
// notificationsEnabled === false, and — with the paywall on — skips athletes
// whose plan doesn't include messaging (they couldn't open it).
//
// The push shows the caller's own newest message in the thread (sent in the
// last two minutes), once: the message is stamped pushedAt, so this can't be
// used to push arbitrary text or to repeat a push.

const FRESH_MS = 2 * 60 * 1000;
const DEAD_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return Response.json({ error: "Missing authorization token" }, { status: 401 });

    let callerUid: string;
    try {
      callerUid = (await getAdminAuth().verifyIdToken(token)).uid;
    } catch {
      return Response.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const body = (await req.json().catch(() => ({}))) as { threadId?: unknown };
    const threadId = typeof body.threadId === "string" && /^[A-Za-z0-9_-]{1,300}$/.test(body.threadId) ? body.threadId : null;
    if (!threadId) return Response.json({ error: "threadId is required" }, { status: 400 });

    const db = getAdminFirestore();
    const threadRef = db.collection("threads").doc(threadId);
    const thread = (await threadRef.get()).data();
    if (!thread || (thread.coachId !== callerUid && thread.athleteId !== callerUid)) {
      return Response.json({ error: "Not a member of this thread" }, { status: 403 });
    }
    const recipientId = (thread.coachId === callerUid ? thread.athleteId : thread.coachId) as string;

    // Claim the caller's newest message for a push, exactly once.
    const latest = await db.runTransaction(async tx => {
      const snap = await tx.get(threadRef.collection("messages").orderBy("createdAt", "desc").limit(1));
      const doc = snap.docs[0];
      if (!doc) return null;
      const m = doc.data();
      const createdAt = m.createdAt instanceof Timestamp ? m.createdAt.toMillis() : 0;
      if (m.senderId !== callerUid || m.pushedAt || Date.now() - createdAt > FRESH_MS) return null;
      tx.update(doc.ref, { pushedAt: FieldValue.serverTimestamp() });
      return m;
    });
    if (!latest) return Response.json({ sent: 0, reason: "nothing_to_push" });

    const [recipientSnap, senderSnap] = await Promise.all([
      db.collection("users").doc(recipientId).get(),
      db.collection("users").doc(callerUid).get(),
    ]);
    const recipient = recipientSnap.data();
    if (!recipient || recipient.fcmTokenSource !== "ios" || typeof recipient.fcmToken !== "string" || !recipient.fcmToken) {
      return Response.json({ sent: 0, reason: "no_app_token" });
    }
    if (recipient.notificationsEnabled === false) return Response.json({ sent: 0, reason: "opted_out" });
    const recipientIsStaff = recipient.role === "coach" || recipient.role === "admin";
    if (!recipientIsStaff && (await isPaywallEnabledServer()) && !canMessage(effectivePlan(recipient))) {
      return Response.json({ sent: 0, reason: "plan" });
    }

    const sender = senderSnap.data();
    const senderName = (sender?.fullName as string | undefined) || (sender?.name as string | undefined) || "your coach";
    const text = typeof latest.text === "string" ? latest.text.trim() : "";
    const bodyText = text
      ? text.length > 140 ? `${text.slice(0, 137)}…` : text
      : latest.videoTitle
      ? `Shared video: ${latest.videoTitle}`
      : "New message";
    const url = recipientIsStaff ? "/coach/messages" : "/student/messages";

    try {
      await getAdminMessaging().send({
        token: recipient.fcmToken,
        notification: { title: `Message from ${senderName}`, body: bodyText },
        data: { url, threadId },
        apns: { payload: { aps: { sound: "default" } } },
      });
    } catch (err) {
      const code = (err as { code?: string }).code ?? "";
      if (DEAD_TOKEN_CODES.has(code)) {
        await db.collection("users").doc(recipientId).update({ fcmToken: FieldValue.delete() }).catch(() => {});
        return Response.json({ sent: 0, reason: "dead_token" });
      }
      throw err;
    }
    return Response.json({ sent: 1 });
  } catch (err) {
    console.error("[api/notifications/message]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
