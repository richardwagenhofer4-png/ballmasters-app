import type { NextRequest } from "next/server";
import { verifyIdToken, getFirestoreDoc } from "@/lib/firebaseServer";
import { getUploadUrl } from "@/lib/r2";

const MAX_BYTES = 500 * 1024 * 1024; // 500 MB

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const idToken = authHeader.slice(7);

    const { uid } = await verifyIdToken(idToken);
    const profile = await getFirestoreDoc("users", uid, idToken);

    if (profile?.role !== "coach") {
      return Response.json({ error: "Only coaches can upload videos" }, { status: 403 });
    }

    const body = await request.json();
    const { fileName, fileType, fileSize } = body as {
      fileName: string;
      fileType: string;
      fileSize?: number;
    };

    if (!fileName || !fileType) {
      return Response.json({ error: "fileName and fileType are required" }, { status: 400 });
    }
    if (fileSize && fileSize > MAX_BYTES) {
      return Response.json({ error: "File exceeds the 500 MB limit" }, { status: 400 });
    }

    // Sanitise filename and namespace by coach uid + timestamp
    const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
    const key = `${uid}/${Date.now()}-${safe}`;

    const uploadUrl = await getUploadUrl(key, fileType);

    return Response.json({ uploadUrl, key });
  } catch (err: unknown) {
    const message = (err as Error).message ?? "Internal server error";
    console.error("[api/upload]", err);
    const status = message.startsWith("auth/") ? 401 : 500;
    return Response.json({ error: message }, { status });
  }
}
