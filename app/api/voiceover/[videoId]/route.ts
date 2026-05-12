import type { NextRequest } from "next/server";
import { verifyIdToken, getFirestoreDoc } from "@/lib/firebaseServer";
import { getVideoUrl } from "@/lib/r2";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ videoId: string }> }
) {
  try {
    const { videoId } = await params;

    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const idToken = authHeader.slice(7);
    await verifyIdToken(idToken);

    const voiceover = await getFirestoreDoc(`videos/${videoId}/voiceover`, "main", idToken);
    if (!voiceover) {
      return Response.json({ error: "No voiceover found" }, { status: 404 });
    }

    const audioUrl = await getVideoUrl(voiceover.fileName as string);
    return Response.json({ ...voiceover, audioUrl });
  } catch (err: unknown) {
    console.error("[api/voiceover/[videoId] GET]", err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
