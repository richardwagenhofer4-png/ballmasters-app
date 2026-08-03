import type { NextRequest } from "next/server";
import { verifyIdToken, getFirestoreDoc } from "@/lib/firebaseServer";
import { getVideoUrl } from "@/lib/r2";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebaseAdmin";
import { deleteVideoCompletely } from "@/lib/adminFirestoreHelpers";

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

    if (video.type === "drill_comparison" || (video.coachVideoKey && video.studentVideoKey)) {
      const [coachVideoUrl, studentVideoUrl] = await Promise.all([
        getVideoUrl(video.coachVideoKey as string),
        getVideoUrl(video.studentVideoKey as string),
      ]);
      return Response.json({ ...video, type: "drill_comparison", coachVideoUrl, studentVideoUrl });
    }

    const videoUrl = await getVideoUrl(video.fileName as string);
    return Response.json({ ...video, videoUrl });
  } catch (err: unknown) {
    console.error("[api/videos/[id] GET]", err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}

// ---------------------------------------------------------------------------
// DELETE /api/videos/[id] — full teardown: R2 objects, subcollections,
// referencing notifications, then the video document itself.
//
// Uses the Admin SDK (bypasses firestore.rules) because comments, reactions,
// and notifications have no client-reachable delete permission at all — this
// route's own coach-or-admin check below is the only authorization gate, so
// it must run before any deletion, and errors below must NOT be swallowed:
// a thrown error here is the only signal that a deletion left something
// behind, since the Admin SDK doesn't get a rules-based 403 as a backstop.
// ---------------------------------------------------------------------------
export async function DELETE(
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

    const adminAuth = getAdminAuth();
    const db = getAdminFirestore();

    let uid: string;
    try {
      const decoded = await adminAuth.verifyIdToken(idToken);
      uid = decoded.uid;
    } catch {
      return Response.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const videoRef = db.collection("videos").doc(id);
    const videoSnap = await videoRef.get();

    if (!videoSnap.exists) {
      // Already gone — a repeat call must not error.
      return Response.json({ success: true, alreadyDeleted: true });
    }

    const video = videoSnap.data()!;

    const callerSnap = await db.collection("users").doc(uid).get();
    const callerRole = callerSnap.data()?.role as string | undefined;

    if (video.coachId !== uid && callerRole !== "admin") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    // Full teardown (R2 objects, subcollections, notifications, doc last) lives
    // in the shared helper so this route and account deletion stay in lockstep.
    await deleteVideoCompletely(db, id);

    return Response.json({ success: true });
  } catch (err: unknown) {
    console.error("[api/videos/[id] DELETE]", err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
