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
      title,
      fileName,
      studentIds = [],
      folderId = null,
      downloadAllowed = false,
      status = "published",
    } = body as {
      title: string;
      fileName: string;
      studentIds?: string[];
      folderId?: string | null;
      downloadAllowed?: boolean;
      status?: "draft" | "published";
    };

    if (!title?.trim() || !fileName) {
      return Response.json({ error: "title and fileName are required" }, { status: 400 });
    }

    const videoData: Record<string, unknown> = {
      title: title.trim(),
      coachId: uid,
      coachName: (profile.fullName as string) ?? "",
      studentIds,
      fileName,
      folderId,
      downloadAllowed,
      status,
      viewedBy: [],
      createdAt: new Date().toISOString(),
    };

    const docId = await createFirestoreDoc("videos", videoData, idToken);

    return Response.json({ id: docId, ...videoData }, { status: 201 });
  } catch (err: unknown) {
    console.error("[api/videos POST]", err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// GET /api/videos — list videos for the current user
//   Coaches see all their own videos.
//   Students see only videos where their uid is in studentIds.
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
      videos = await queryFirestore(
        "videos",
        [{ field: "coachId", op: "EQUAL", value: uid }],
        idToken
      );
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
