import type { NextRequest } from "next/server";
import { verifyIdToken, getFirestoreDoc } from "@/lib/firebaseServer";
import { putObject, getVideoUrl } from "@/lib/r2";

// GET /api/voiceover?videoId=xxx
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const idToken = authHeader.slice(7);
    await verifyIdToken(idToken);

    const videoId = request.nextUrl.searchParams.get("videoId");
    if (!videoId) return Response.json({ error: "videoId required" }, { status: 400 });

    const voiceover = await getFirestoreDoc(`videos/${videoId}/voiceover`, "main", idToken);
    if (!voiceover) {
      return Response.json({ error: "No voiceover found" }, { status: 404 });
    }

    const audioUrl = await getVideoUrl(voiceover.fileName as string);
    return Response.json({ ...voiceover, audioUrl });
  } catch (err: unknown) {
    console.error("[api/voiceover GET]", err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

// POST /api/voiceover?videoId=xxx&startTime=0&duration=12.3
// Authorization: Bearer <token>
// Content-Type: audio/webm
// Body: raw audio bytes
export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const idToken = authHeader.slice(7);
    const { uid } = await verifyIdToken(idToken);

    const videoId = request.nextUrl.searchParams.get("videoId");
    if (!videoId) return Response.json({ error: "videoId required" }, { status: 400 });

    const video = await getFirestoreDoc("videos", videoId, idToken);
    if (!video || video.coachId !== uid) {
      return Response.json({ error: "Not found or forbidden" }, { status: 404 });
    }

    if (!request.body) {
      return Response.json({ error: "No audio body" }, { status: 400 });
    }

    const mimeType = request.headers.get("content-type") || "audio/webm";
    const ext = mimeType.includes("mp4") ? "mp4" : "webm";
    const fileName = `voiceovers/${videoId}-${Date.now()}.${ext}`;

    const contentLength = request.headers.get("content-length");
    await putObject(fileName, mimeType, request.body, contentLength ? parseInt(contentLength) : undefined);

    return Response.json({ fileName });
  } catch (err: unknown) {
    console.error("[api/voiceover POST]", err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
