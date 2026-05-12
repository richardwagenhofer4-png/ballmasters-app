import type { NextRequest } from "next/server";
import { verifyIdToken, getFirestoreDoc } from "@/lib/firebaseServer";
import { getUploadUrl } from "@/lib/r2";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const idToken = authHeader.slice(7);
    const { uid } = await verifyIdToken(idToken);

    const { videoId, mimeType } = (await request.json()) as { videoId: string; mimeType: string };
    if (!videoId) return Response.json({ error: "videoId required" }, { status: 400 });

    const video = await getFirestoreDoc("videos", videoId, idToken);
    if (!video || video.coachId !== uid) {
      return Response.json({ error: "Not found or forbidden" }, { status: 404 });
    }

    const ext = mimeType?.includes("mp4") ? "mp4" : "webm";
    const fileName = `voiceovers/${videoId}-${Date.now()}.${ext}`;
    const uploadUrl = await getUploadUrl(fileName, mimeType ?? "audio/webm");

    return Response.json({ uploadUrl, fileName });
  } catch (err: unknown) {
    console.error("[api/voiceover POST]", err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
