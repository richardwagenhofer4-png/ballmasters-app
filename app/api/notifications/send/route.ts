import type { NextRequest } from "next/server";
import { verifyIdToken, getFirestoreDoc } from "@/lib/firebaseServer";
import { getAdminMessaging } from "@/lib/firebaseAdmin";

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
    const { tokens, title, body: msgBody, url } = body as {
      tokens: string[];
      title: string;
      body: string;
      url: string;
    };

    if (!Array.isArray(tokens) || tokens.length === 0) {
      return Response.json({ error: "tokens array is required" }, { status: 400 });
    }
    if (!title || !msgBody) {
      return Response.json({ error: "title and body are required" }, { status: 400 });
    }

    const messaging = getAdminMessaging();

    const result = await messaging.sendEachForMulticast({
      tokens,
      notification: { title, body: msgBody },
      webpush: {
        notification: { title, body: msgBody, icon: "/icon-192.png" },
        fcmOptions: { link: url },
      },
    });

    const successCount = result.responses.filter((r) => r.success).length;
    return Response.json({ sent: successCount, total: tokens.length });
  } catch (err: unknown) {
    console.error("[api/notifications/send]", err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
