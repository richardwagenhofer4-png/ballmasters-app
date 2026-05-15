import type { NextRequest } from "next/server";
import { verifyIdToken } from "@/lib/firebaseServer";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const idToken = authHeader.slice(7);
    await verifyIdToken(idToken);
    const body = await request.json();
    console.log("[api/bookings POST] Booking handled client-side - push notification to coach would be sent here");
    return Response.json({ message: "Booking handled client-side", body });
  } catch (err: unknown) {
    console.error("[api/bookings POST]", err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
