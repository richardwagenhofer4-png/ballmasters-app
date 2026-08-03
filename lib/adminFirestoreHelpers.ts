import type { Firestore, QuerySnapshot } from "firebase-admin/firestore";
import { deleteObject } from "@/lib/r2";

// Deletes every document in a query snapshot in parallel. Shared between the
// video teardown route and account deletion — both bulk-delete matched
// Firestore docs (subcollections, notifications, bookings, ...) the same way.
export async function deleteAllDocs(snap: QuerySnapshot): Promise<void> {
  await Promise.all(snap.docs.map((d) => d.ref.delete()));
}

// Full teardown for a single video: its R2 object(s), voiceover audio, the
// subcollections Firestore does not cascade-delete, the notifications that
// reference it, then the video document last. Idempotent — a no-op if the
// video is already gone, and deleteObject() already tolerates a missing R2 key.
//
// This is the single source of truth for "delete a video completely." Both the
// DELETE /api/videos/[id] route and the account-deletion path (sole-athlete
// videos) call it, so the teardown logic lives in exactly one place. It does
// NOT authorize the caller — that gate is the caller's responsibility.
export async function deleteVideoCompletely(db: Firestore, videoId: string): Promise<void> {
  const videoRef = db.collection("videos").doc(videoId);
  const videoSnap = await videoRef.get();
  if (!videoSnap.exists) return;

  const video = videoSnap.data()!;

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
  const notifSnap = await db.collection("notifications").where("meta.videoId", "==", videoId).get();
  await deleteAllDocs(notifSnap);

  // 5. The video document last — a failure above leaves the record visible
  //    rather than orphaning R2/subcollection state invisibly.
  await videoRef.delete();
}
