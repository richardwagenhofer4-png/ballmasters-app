import type { NextRequest } from "next/server";
import { verifyIdToken, getFirestoreDoc, deleteFirestoreDoc } from "@/lib/firebaseServer";
import { getUploadUrl, getVideoUrl, deleteObject } from "@/lib/r2";

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

// POST /api/voiceover — returns a presigned PUT URL for the audio blob
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
    const uploadUrl = await getUploadUrl(fileName);

    return Response.json({ uploadUrl, fileName });
  } catch (err: unknown) {
    console.error("[api/voiceover POST]", err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

// DELETE /api/voiceover?videoId=xxx — removes the R2 audio object, then the subdoc
export async function DELETE(request: NextRequest) {
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

    const voiceover = await getFirestoreDoc(`videos/${videoId}/voiceover`, "main", idToken);
    if (voiceover?.fileName) {
      await deleteObject(voiceover.fileName as string);
    }
    await deleteFirestoreDoc(`videos/${videoId}/voiceover`, "main", idToken);

    return Response.json({ success: true });
  } catch (err: unknown) {
    console.error("[api/voiceover DELETE]", err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
