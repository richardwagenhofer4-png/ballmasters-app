import type { NextRequest } from "next/server";
import { getAdminFirestore, getAdminMessaging } from "@/lib/firebaseAdmin";

function getTomorrowEastern(): string {
  const now = new Date();
  const eastern = new Date(now.toLocaleString("en-US", { timeZone: "America/New_York" }));
  eastern.setDate(eastern.getDate() + 1);
  const y = eastern.getFullYear();
  const m = String(eastern.getMonth() + 1).padStart(2, "0");
  const d = String(eastern.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatTime(t: string): string {
  const [hourStr, minStr] = t.split(":");
  let hour = parseInt(hourStr, 10);
  const ampm = hour >= 12 ? "PM" : "AM";
  if (hour > 12) hour -= 12;
  if (hour === 0) hour = 12;
  return `${hour}:${minStr} ${ampm}`;
}

export async function GET(request: NextRequest) {
  const secret = request.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = getAdminFirestore();
    const messaging = getAdminMessaging();
    const tomorrow = getTomorrowEastern();

    const sessionsSnap = await db.collection("sessions").where("date", "==", tomorrow).get();

    if (sessionsSnap.empty) {
      return Response.json({ message: "No sessions tomorrow", date: tomorrow, sent: 0 });
    }

    const sessionIds = sessionsSnap.docs.map((d) => d.id);
    const sessionMap = new Map(
      sessionsSnap.docs.map((d) => [d.id, { id: d.id, ...d.data() } as { id: string; title: string; startTime: string }])
    );

    let sent = 0;
    let total = 0;

    // Firestore "in" supports up to 30 values
    const chunkSize = 30;
    for (let i = 0; i < sessionIds.length; i += chunkSize) {
      const chunk = sessionIds.slice(i, i + chunkSize);
      const bookingsSnap = await db
        .collection("bookings")
        .where("sessionId", "in", chunk)
        .where("status", "==", "confirmed")
        .get();

      for (const bookingDoc of bookingsSnap.docs) {
        const booking = bookingDoc.data() as { sessionId: string; studentId: string };
        const session = sessionMap.get(booking.sessionId);
        if (!session) continue;

        const userSnap = await db.collection("users").doc(booking.studentId).get();
        const fcmToken = userSnap.data()?.fcmToken as string | undefined;
        if (!fcmToken) continue;

        total++;
        const timeStr = formatTime(session.startTime);
        try {
          await messaging.send({
            token: fcmToken,
            notification: {
              title: "Session tomorrow 🏃",
              body: `You have ${session.title} at ${timeStr} tomorrow. Don't forget!`,
            },
            webpush: {
              notification: {
                title: "Session tomorrow 🏃",
                body: `You have ${session.title} at ${timeStr} tomorrow. Don't forget!`,
                icon: "/icon-192.png",
              },
            },
          });
          sent++;
        } catch (err) {
          console.error("[session-reminders] Failed to send to student", booking.studentId, err);
        }
      }
    }

    console.log(`[session-reminders] date=${tomorrow} sent=${sent}/${total}`);
    return Response.json({ date: tomorrow, sent, total });
  } catch (err: unknown) {
    console.error("[api/session-reminders]", err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
