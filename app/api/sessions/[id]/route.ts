import type { NextRequest } from "next/server";
import { verifyIdToken } from "@/lib/firebaseServer";

export async function PATCH(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const idToken = authHeader.slice(7);
    await verifyIdToken(idToken);
    const body = await request.json();
    return Response.json({ message: "Session update handled client-side", body });
  } catch (err: unknown) {
    console.error("[api/sessions/[id] PATCH]", err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const idToken = authHeader.slice(7);
    await verifyIdToken(idToken);
    console.log("[api/sessions/[id] DELETE] Session cancellation - push notifications would be sent here");
    return Response.json({ message: "Session cancellation handled client-side" });
  } catch (err: unknown) {
    console.error("[api/sessions/[id] DELETE]", err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
