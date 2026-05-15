import type { NextRequest } from "next/server";
import { verifyIdToken } from "@/lib/firebaseServer";

export async function DELETE(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const idToken = authHeader.slice(7);
    await verifyIdToken(idToken);
    console.log("[api/bookings/[id] DELETE] Cancellation handled client-side - waitlist promotion push notification would be sent here");
    return Response.json({ message: "Booking cancellation handled client-side" });
  } catch (err: unknown) {
    console.error("[api/bookings/[id] DELETE]", err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
