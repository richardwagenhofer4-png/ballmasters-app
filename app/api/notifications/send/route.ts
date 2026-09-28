import type { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { verifyIdToken, getFirestoreDoc } from "@/lib/firebaseServer";
import { getAdminFirestore, getAdminMessaging } from "@/lib/firebaseAdmin";

// POST /api/notifications/send — a coach/admin pushes a notification.
// Body: { recipientIds: string[], title, body, url }
//   The server looks up each recipient's FCM token (web push or the iPhone
//   app) and skips anyone who turned notifications off
//   (users/{uid}.notificationsEnabled === false). A coach may notify only
//   their own athletes — the same people whose docs (and so tokens) the
//   client could read before; an admin anyone.
// Legacy body { tokens: string[], ... } (clients from before this change) is
//   still accepted and sent as-is.
// Tokens FCM reports as dead are removed from the user doc.

const DEAD_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token",
]);

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const idToken = authHeader.slice(7);

    const { uid } = await verifyIdToken(idToken);
    const profile = await getFirestoreDoc("users", uid, idToken);
    if (profile?.role !== "coach" && profile?.role !== "admin") {
      return Response.json({ error: "Only coaches can send notifications" }, { status: 403 });
    }

    const body = await request.json();
    const { recipientIds, tokens: legacyTokens, title, body: msgBody, url } = body as {
      recipientIds?: string[];
      tokens?: string[];
      title: string;
      body: string;
      url: string;
    };

    if (!title || !msgBody) {
      return Response.json({ error: "title and body are required" }, { status: 400 });
    }

    // token -> uid (null for legacy tokens with no known owner)
    const targets = new Map<string, string | null>();
    if (Array.isArray(recipientIds) && recipientIds.length > 0) {
      const db = getAdminFirestore();
      const ids = [...new Set(recipientIds.filter(id => typeof id === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(id)))];
      const snaps = ids.length ? await db.getAll(...ids.map(id => db.collection("users").doc(id))) : [];
      for (const snap of snaps) {
        const u = snap.data();
        if (!u) continue;
        if (profile.role !== "admin" && u.coachId !== uid) continue;
        if (u.notificationsEnabled === false) continue;
        if (typeof u.fcmToken === "string" && u.fcmToken) targets.set(u.fcmToken, snap.id);
      }
    } else if (Array.isArray(legacyTokens) && legacyTokens.length > 0) {
      for (const t of legacyTokens) if (typeof t === "string" && t) targets.set(t, null);
    } else {
      return Response.json({ error: "recipientIds array is required" }, { status: 400 });
    }

    if (targets.size === 0) return Response.json({ sent: 0, total: 0 });

    const tokens = [...targets.keys()];
    const link = typeof url === "string" && url.startsWith("/") ? url : "/";
    const result = await getAdminMessaging().sendEachForMulticast({
      tokens,
      notification: { title, body: msgBody },
      // Read by the iPhone app when the notification is tapped (lib/push.ts).
      data: { url: link },
      apns: { payload: { aps: { sound: "default" } } },
      webpush: {
        notification: { title, body: msgBody, icon: "/icon-192.png" },
        fcmOptions: { link },
      },
    });

    // Forget tokens FCM says are gone (app deleted, token rotated).
    const db = getAdminFirestore();
    await Promise.all(
      result.responses.map(async (r, i) => {
        const owner = targets.get(tokens[i]);
        if (r.success || !owner || !DEAD_TOKEN_CODES.has(r.error?.code ?? "")) return;
        await db.collection("users").doc(owner).update({ fcmToken: FieldValue.delete() }).catch(() => {});
      })
    );

    const successCount = result.responses.filter((r) => r.success).length;
    return Response.json({ sent: successCount, total: tokens.length });
  } catch (err: unknown) {
    console.error("[api/notifications/send]", err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
