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

    const video = await getFirestoreDoc("videos", id, idToken);
    if (!video) {
      return Response.json({ error: "Video not found or access denied" }, { status: 404 });
    }

    if (video.type === "drill_comparison") {
      console.log("[api/videos/[id]] drill_comparison keys:", {
        coachVideoKey: video.coachVideoKey,
        studentVideoKey: video.studentVideoKey,
      });
      const [coachVideoUrl, studentVideoUrl] = await Promise.all([
        getVideoUrl(video.coachVideoKey as string),
        getVideoUrl(video.studentVideoKey as string),
      ]);
      console.log("[api/videos/[id]] drill URLs generated:", {
        coachVideoUrl: coachVideoUrl?.slice(0, 120),
        studentVideoUrl: studentVideoUrl?.slice(0, 120),
      });
      return Response.json({ ...video, coachVideoUrl, studentVideoUrl });
    }

    console.log("[api/videos/[id]] single video key:", { fileName: video.fileName });
    const videoUrl = await getVideoUrl(video.fileName as string);
    console.log("[api/videos/[id]] videoUrl generated:", videoUrl?.slice(0, 120));
    return Response.json({ ...video, videoUrl });
  } catch (err: unknown) {
    console.error("[api/videos/[id] GET]", err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
