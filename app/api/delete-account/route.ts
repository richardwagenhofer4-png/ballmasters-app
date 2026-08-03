import type { NextRequest } from "next/server";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { deleteAllDocs, deleteVideoCompletely } from "@/lib/adminFirestoreHelpers";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { targetUid?: string };
    const { targetUid } = body;
    if (!targetUid) {
      return Response.json({ error: "targetUid is required" }, { status: 400 });
    }

    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return Response.json({ error: "Missing authorization token" }, { status: 401 });
    }

    const adminAuth = getAdminAuth();
    const db = getAdminFirestore();

    let callerUid: string;
    try {
      const decoded = await adminAuth.verifyIdToken(token);
      callerUid = decoded.uid;
    } catch {
      return Response.json({ error: "Invalid or expired token" }, { status: 401 });
    }

    const callerSnap = await db.collection("users").doc(callerUid).get();
    const callerRole = callerSnap.data()?.role as string | undefined;

    if (callerUid !== targetUid && callerRole !== "admin") {
      return Response.json({ error: "Forbidden" }, { status: 403 });
    }

    const targetSnap = await db.collection("users").doc(targetUid).get();
    const targetData = targetSnap.data();
    const targetRole = targetData?.role as string | undefined;

    // Prevent deleting the last admin
    if (targetRole === "admin") {
      const adminsSnap = await db.collection("users").where("role", "==", "admin").get();
      const otherAdmins = adminsSnap.docs.filter(d => d.id !== targetUid);
      if (otherAdmins.length === 0) {
        return Response.json({ error: "Cannot delete the last admin account" }, { status: 400 });
      }
    }

    // Prevent deleting the head coach — their coach-owned videos and athletes
    // need a reassignment target, and videos are never orphaned or destroyed
    // by account deletion. Mirrors the last-admin guard above: refuse outright
    // rather than picking a fallback. An admin must set a different head coach
    // in settings first.
    let headCoachId: string | null = null;
    if (targetRole === "coach" || targetRole === "admin") {
      const settingsSnap = await db.collection("settings").doc("general").get();
      headCoachId = (settingsSnap.data()?.headCoachId as string | undefined) ?? null;

      if (targetUid === headCoachId) {
        return Response.json(
          { error: "Cannot delete the head coach. Set a different head coach in settings first." },
          { status: 400 }
        );
      }
      if (!headCoachId) {
        return Response.json(
          { error: "No head coach is configured in settings. Set one before deleting a coach account, so their athletes and videos have somewhere to go." },
          { status: 400 }
        );
      }
    }

    // 1. Videos this user is tagged in as an athlete. If they were the ONLY
    // athlete, the video is entirely their personal data — delete it in full
    // (R2 objects, subcollections, notifications, doc) via the shared helper.
    // Otherwise just untag them, leaving the video for the remaining athletes.
    // Coaches are never in studentIds, so this never matches a coach deletion;
    // the coach path's own video handling (reassignment) is separate below.
    const videosSnap = await db.collection("videos").where("studentIds", "array-contains", targetUid).get();
    for (const vDoc of videosSnap.docs) {
      const studentIds = (vDoc.data().studentIds as string[]) ?? [];
      const isSoleAthlete = studentIds.length === 1 && studentIds[0] === targetUid;
      if (isSoleAthlete) {
        await deleteVideoCompletely(db, vDoc.id);
      } else {
        await vDoc.ref.update({ studentIds: FieldValue.arrayRemove(targetUid) });
      }
    }

    // 2. Remove from sessions bookedBy/waitlist and delete booking docs
    const bookingsSnap = await db.collection("bookings").where("studentId", "==", targetUid).get();
    for (const bDoc of bookingsSnap.docs) {
      const booking = bDoc.data();
      const sessionRef = db.collection("sessions").doc(booking.sessionId as string);
      try {
        const sessionSnap = await sessionRef.get();
        if (sessionSnap.exists) {
          const sd = sessionSnap.data()!;
          const newBookedBy = ((sd.bookedBy as Array<{ uid: string }>) ?? []).filter(b => b.uid !== targetUid);
          const newWaitlist = ((sd.waitlist as Array<{ uid: string }>) ?? []).filter(w => w.uid !== targetUid);
          await sessionRef.update({
            bookedBy: newBookedBy,
            waitlist: newWaitlist,
            status: newBookedBy.length >= (sd.maxCapacity as number) ? "full" : "available",
          });
        }
      } catch (err) {
        console.error("[delete-account] session update error for session", booking.sessionId, err);
      }
      await bDoc.ref.delete();
    }

    // 3. Delete threads (as coach or athlete) including messages subcollection
    const [threadsByCoach, threadsByAthlete] = await Promise.all([
      db.collection("threads").where("coachId", "==", targetUid).get(),
      db.collection("threads").where("athleteId", "==", targetUid).get(),
    ]);
    const seenThreadIds = new Set<string>();
    for (const tDoc of [...threadsByCoach.docs, ...threadsByAthlete.docs]) {
      if (seenThreadIds.has(tDoc.id)) continue;
      seenThreadIds.add(tDoc.id);
      const messagesSnap = await tDoc.ref.collection("messages").get();
      await deleteAllDocs(messagesSnap);
      await tDoc.ref.delete();
    }

    // 4. Notifications for or about the user (their own inbox)
    const notifSnap = await db.collection("notifications").where("recipientId", "==", targetUid).get();
    await deleteAllDocs(notifSnap);

    // 5. Comments and reactions the user authored on ANY video. Videos themselves
    // are never touched here — per product policy, account deletion never
    // destroys a video, only the deleted user's own traces on it.
    const allVideosSnap = await db.collection("videos").get();
    for (const vDoc of allVideosSnap.docs) {
      const commentsSnap = await vDoc.ref.collection("comments").where("authorId", "==", targetUid).get();
      await deleteAllDocs(commentsSnap);
      // Reaction doc IDs are the user's uid itself (see firestore.rules) — a
      // direct delete-by-id needs no query/index and no-ops if none exists.
      await vDoc.ref.collection("reactions").doc(targetUid).delete();
    }

    // 6. Invite codes / coach invites created or used by the user.
    // inviteCodes are multi-use and shared (maxUses, usedBy is an array of many
    // students) — a code this user only USED is scrubbed, not deleted, so it
    // stays valid for whoever else used it. A code this user CREATED is theirs
    // alone, safe to remove entirely. coachInvites are single-use per coach
    // (usedBy is a single uid, not an array), so both directions delete cleanly.
    const [codesCreated, codesUsed, invitesCreated, invitesUsed] = await Promise.all([
      db.collection("inviteCodes").where("createdBy", "==", targetUid).get(),
      db.collection("inviteCodes").where("usedBy", "array-contains", targetUid).get(),
      db.collection("coachInvites").where("createdBy", "==", targetUid).get(),
      db.collection("coachInvites").where("usedBy", "==", targetUid).get(),
    ]);
    await deleteAllDocs(codesCreated);
    await Promise.all(codesUsed.docs.map(d => d.ref.update({ usedBy: FieldValue.arrayRemove(targetUid) })));
    await deleteAllDocs(invitesCreated);
    await deleteAllDocs(invitesUsed);

    // 7. Coach-specific cleanup. headCoachId was already resolved and validated
    // (non-null, not the target) by the guard above. Nothing that belongs to
    // the program or a family is deleted here — only reassigned.
    if (targetRole === "coach" || targetRole === "admin") {
      // Non-null: the guard above already refused the request if headCoachId
      // were unset when targetRole is "coach" or "admin".
      const headCoachSnap = await db.collection("users").doc(headCoachId!).get();
      const headCoachName = (headCoachSnap.data()?.fullName as string | undefined) ?? "";

      // Reassign athletes to the head coach.
      const athletesSnap = await db.collection("users").where("coachId", "==", targetUid).get();
      await Promise.all(athletesSnap.docs.map(aDoc => aDoc.ref.update({ coachId: headCoachId })));

      // Reassign this coach's own videos to the head coach — videos are the
      // program's asset, never destroyed or orphaned by account deletion.
      // coachName is denormalized onto the video doc and displayed directly
      // (video lists, dashboards, drill view), so it's updated along with
      // coachId rather than left stale.
      const ownVideosSnap = await db.collection("videos").where("coachId", "==", targetUid).get();
      await Promise.all(ownVideosSnap.docs.map(vDoc =>
        vDoc.ref.update({ coachId: headCoachId, coachName: headCoachName })
      ));

      // Reassign ALL of this coach's sessions (past and future) to the head
      // coach — a coach leaving is a staffing change, not a deletion event.
      // Past sessions are attendance history for families who paid; future
      // sessions are bookings families are currently holding. Bookings,
      // bookedBy, and waitlist are left completely untouched — only coachId/
      // coachName (also denormalized and displayed) are updated.
      const sessionsSnap = await db.collection("sessions").where("coachId", "==", targetUid).get();
      await Promise.all(sessionsSnap.docs.map(sDoc =>
        sDoc.ref.update({ coachId: headCoachId, coachName: headCoachName })
      ));
    }

    // 8. Delete user document
    await db.collection("users").doc(targetUid).delete();

    // 9. Delete Firebase Auth account
    await adminAuth.deleteUser(targetUid);

    console.log(`[delete-account] Successfully deleted uid=${targetUid} by caller=${callerUid}`);
    return Response.json({ success: true });
  } catch (err) {
    console.error("[delete-account] Unhandled error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
