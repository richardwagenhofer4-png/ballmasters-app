import type { NextRequest } from "next/server";
import { verifyIdToken } from "@/lib/firebaseServer";

export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const idToken = authHeader.slice(7);
    await verifyIdToken(idToken);
    return Response.json({ message: "Use client-side Firestore for reads" });
  } catch (err: unknown) {
    console.error("[api/sessions GET]", err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const idToken = authHeader.slice(7);
    await verifyIdToken(idToken);
    const body = await request.json();
    return Response.json({ message: "Session creation handled client-side", body });
  } catch (err: unknown) {
    console.error("[api/sessions POST]", err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
