import type { NextRequest } from "next/server";
import {
  verifyIdToken,
  getFirestoreDoc,
  createFirestoreDoc,
  queryFirestore,
} from "@/lib/firebaseServer";
import { getVideoUrl } from "@/lib/r2";

// ---------------------------------------------------------------------------
// POST /api/videos — save video metadata after a successful R2 upload
// ---------------------------------------------------------------------------
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
      return Response.json({ error: "Only coaches can save videos" }, { status: 403 });
    }

    const body = await request.json();
    const {
      type = "standard",
      title,
      fileName,
      coachVideoKey,
      studentVideoKey,
      studentIds = [],
      folderId = null,
      downloadAllowed = false,
      status = "published",
      layout = "side_by_side",
      syncPlayback = true,
    } = body as {
      type?: string;
      title: string;
      fileName?: string;
      coachVideoKey?: string;
      studentVideoKey?: string;
      studentIds?: string[];
      folderId?: string | null;
      downloadAllowed?: boolean;
      status?: "draft" | "published";
      layout?: string;
      syncPlayback?: boolean;
    };

    if (!title?.trim()) {
      return Response.json({ error: "title is required" }, { status: 400 });
    }

    if (type === "drill_comparison") {
      if (!coachVideoKey || !studentVideoKey) {
        return Response.json(
          { error: "coachVideoKey and studentVideoKey are required for drill comparison" },
          { status: 400 }
        );
      }
    } else {
      if (!fileName) {
        return Response.json({ error: "title and fileName are required" }, { status: 400 });
      }
    }

    const videoData: Record<string, unknown> = {
      type,
      title: title.trim(),
      coachId: uid,
      coachName: (profile.fullName as string) ?? "",
      studentIds,
      folderId,
      downloadAllowed,
      status,
      viewedBy: [],
      createdAt: new Date().toISOString(),
    };

    if (type === "drill_comparison") {
      videoData.coachVideoKey = coachVideoKey;
      videoData.studentVideoKey = studentVideoKey;
      videoData.layout = layout;
      videoData.syncPlayback = syncPlayback;
    } else {
      videoData.fileName = fileName;
    }

    const docId = await createFirestoreDoc("videos", videoData, idToken);

    return Response.json({ id: docId, ...videoData }, { status: 201 });
  } catch (err: unknown) {
    console.error("[api/videos POST]", err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// GET /api/videos — list videos for the current user
// ---------------------------------------------------------------------------
export async function GET(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const idToken = authHeader.slice(7);

    const { uid } = await verifyIdToken(idToken);
    const profile = await getFirestoreDoc("users", uid, idToken);
    const role = profile?.role as string | undefined;

    let videos: Array<Record<string, unknown>>;
    if (role === "coach") {
      videos = await queryFirestore("videos", [], idToken);
    } else {
      videos = await queryFirestore(
        "videos",
        [{ field: "studentIds", op: "ARRAY_CONTAINS", value: uid }],
        idToken
      );
    }

    // Attach fresh presigned read URLs (valid 24 h)
    const withUrls = await Promise.all(
      videos.map(async (v) => {
        if (v.type === "drill_comparison" || (v.coachVideoKey && v.studentVideoKey)) {
          return { ...v, type: "drill_comparison", videoUrl: null };
        }
        const key = v.fileName as string | undefined;
        const videoUrl = key ? await getVideoUrl(key) : null;
        return { ...v, videoUrl };
      })
    );

    return Response.json(withUrls);
  } catch (err: unknown) {
    console.error("[api/videos GET]", err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
