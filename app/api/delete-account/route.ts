import type { NextRequest } from "next/server";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";

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

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

    // 1. Remove targetUid from video studentIds arrays
    const videosSnap = await db.collection("videos").where("studentIds", "array-contains", targetUid).get();
    for (const vDoc of videosSnap.docs) {
      await vDoc.ref.update({ studentIds: FieldValue.arrayRemove(targetUid) });
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
      await Promise.all(messagesSnap.docs.map(m => m.ref.delete()));
      await tDoc.ref.delete();
    }

    // 4. Coach-specific cleanup
    if (targetRole === "coach" || targetRole === "admin") {
      const settingsSnap = await db.collection("settings").doc("general").get();
      const headCoachId = (settingsSnap.data()?.headCoachId as string | undefined) ?? null;

      // Reassign athletes to head coach or clear coachId
      const athletesSnap = await db.collection("users").where("coachId", "==", targetUid).get();
      await Promise.all(athletesSnap.docs.map(aDoc =>
        aDoc.ref.update({ coachId: headCoachId ?? FieldValue.delete() })
      ));

      // Cancel future sessions and their bookings
      const sessionsSnap = await db.collection("sessions").where("coachId", "==", targetUid).get();
      const futureSessions = sessionsSnap.docs.filter(d => (d.data().date as string) >= todayStr);
      for (const sDoc of futureSessions) {
        const sessionBookingsSnap = await db.collection("bookings").where("sessionId", "==", sDoc.id).get();
        await Promise.all(sessionBookingsSnap.docs.map(b => b.ref.delete()));
        await sDoc.ref.delete();
      }
    }

    // 5. Delete user document
    await db.collection("users").doc(targetUid).delete();

    // 6. Delete Firebase Auth account
    await adminAuth.deleteUser(targetUid);

    console.log(`[delete-account] Successfully deleted uid=${targetUid} by caller=${callerUid}`);
    return Response.json({ success: true });
  } catch (err) {
    console.error("[delete-account] Unhandled error:", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
