import type { NextRequest } from "next/server";
import { verifyIdToken, getFirestoreDoc } from "@/lib/firebaseServer";
import { getVideoUrl, deleteObject } from "@/lib/r2";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebaseAdmin";
import { deleteAllDocs } from "@/lib/adminFirestoreHelpers";

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

    // 1. R2 object(s) backing the video itself.
    if (video.type === "drill_comparison" || (video.coachVideoKey && video.studentVideoKey)) {
      await Promise.all([
        deleteObject(video.coachVideoKey as string),
        deleteObject(video.studentVideoKey as string),
      ]);
    } else if (video.fileName) {
      await deleteObject(video.fileName as string);
    }

    // 2. Voiceover — capture its R2 key before the subcollection wipe removes the doc.
    const voiceoverSnap = await videoRef.collection("voiceover").get();
    for (const d of voiceoverSnap.docs) {
      const fileName = d.data().fileName as string | undefined;
      if (fileName) await deleteObject(fileName);
    }
    await deleteAllDocs(voiceoverSnap);

    // 3. Remaining subcollections Firestore does not cascade-delete.
    for (const sub of ["annotations", "comments", "reactions"]) {
      const snap = await videoRef.collection(sub).get();
      await deleteAllDocs(snap);
    }

    // 4. Notifications referencing this video.
    const notifSnap = await db.collection("notifications").where("meta.videoId", "==", id).get();
    await deleteAllDocs(notifSnap);

    // 5. The video document last — a failure above leaves the record visible
    //    rather than orphaning R2/subcollection state invisibly.
    await videoRef.delete();

    return Response.json({ success: true });
  } catch (err: unknown) {
    console.error("[api/videos/[id] DELETE]", err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
