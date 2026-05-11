import type { NextRequest } from "next/server";
import { verifyIdToken, getFirestoreDoc } from "@/lib/firebaseServer";
import { getVideoUrl } from "@/lib/r2";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const idToken = authHeader.slice(7);

    await verifyIdToken(idToken);

    // Fetch via the user's own token — Firestore rules enforce access
    const video = await getFirestoreDoc("videos", id, idToken);
    if (!video) {
      return Response.json({ error: "Video not found or access denied" }, { status: 404 });
    }

    const videoUrl = await getVideoUrl(video.fileName as string);
    return Response.json({ ...video, videoUrl });
  } catch (err: unknown) {
    console.error("[api/videos/[id] GET]", err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
