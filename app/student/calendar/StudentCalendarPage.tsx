"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  updateDoc,
  where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import type { Session, Booking } from "@/lib/sessionTypes";

// ---------------------------------------------------------------------------
// Nav Icons
// ---------------------------------------------------------------------------

function HomeIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M11.47 3.841a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.061l-1.97-1.97V6a.75.75 0 00-.75-.75h-1.5a.75.75 0 00-.75.75v1.78L13.5 5.409a3 3 0 00-3 0L2.19 11.47a.75.75 0 001.061 1.06l8.219-8.69z" /><path d="M12 5.432l8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H5.625a1.875 1.875 0 01-1.875-1.875v-6.198a2.29 2.29 0 00.091-.086L12 5.432z" /></svg>;
}
function VideoIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M4.5 4.5a3 3 0 00-3 3v9a3 3 0 003 3h8.25a3 3 0 003-3v-9a3 3 0 00-3-3H4.5zM19.94 18.75l-2.69-2.69V7.94l2.69-2.69c.944-.945 2.56-.276 2.56 1.06v11.38c0 1.336-1.616 2.005-2.56 1.06z" /></svg>;
}
function CalendarIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zm13.5 9a1.5 1.5 0 00-1.5-1.5H5.25a1.5 1.5 0 00-1.5 1.5v7.5a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5v-7.5z" clipRule="evenodd" /></svg>;
}
function ProfileIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" /></svg>;
}

const NAV_ITEMS = [
  { href: "/student/dashboard", label: "Home", Icon: HomeIcon },
  { href: "/student/videos", label: "My Videos", Icon: VideoIcon },
  { href: "/student/calendar", label: "Calendar", Icon: CalendarIcon },
  { href: "/student/profile", label: "Profile", Icon: ProfileIcon },
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDisplayDate(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", year: "numeric",
  });
}

function formatTime(t: string): string {
  const [hStr, mStr] = t.split(":");
  const h = parseInt(hStr, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour = h % 12 || 12;
  return `${hour}:${mStr} ${ampm}`;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function StudentCalendarPage() {
  const router = useRouter();
  const pathname = usePathname();

  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState("");
  const [studentName, setStudentName] = useState("");
  const [studentEmail, setStudentEmail] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push("/login"); return; }
      setUid(user.uid);
      setStudentEmail(user.email ?? "");

      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

      // Load sessions independently so a bookings error can't blank the session list
      try {
        const [profileSnap, sessionsSnap] = await Promise.all([
          getDoc(doc(db, "users", user.uid)),
          getDocs(collection(db, "sessions")),
        ]);

        const profileData = profileSnap.data();
        setStudentName(profileData?.fullName ?? profileData?.name ?? user.displayName ?? "Athlete");

        // Normalize missing arrays so session cards never throw on .length
        const sessionList: Session[] = sessionsSnap.docs
          .map(d => {
            const data = d.data();
            return {
              id: d.id,
              ...(data as Omit<Session, "id">),
              bookedBy: data.bookedBy ?? [],
              waitlist: data.waitlist ?? [],
            };
          })
          .filter(s => s.status !== "cancelled" && s.date >= todayStr)
          .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));

        setSessions(sessionList);
      } catch (err) {
        console.error("[student/calendar] sessions load failed:", err);
      }

      // Load the student's own bookings separately
      try {
        const bookingsSnap = await getDocs(
          query(collection(db, "bookings"), where("studentId", "==", user.uid))
        );
        const bookingList: Booking[] = bookingsSnap.docs
          .map(d => ({ id: d.id, ...(d.data() as Omit<Booking, "id">) }))
          .filter(b => b.status !== "cancelled");
        setBookings(bookingList);
      } catch (err) {
        console.error("[student/calendar] bookings load failed:", err);
      }

      setLoading(false);
    });
    return unsub;
  }, [router]);

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
  const monthName = new Date(viewYear, viewMonth, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // Every upcoming non-cancelled session gets a dot; sessions are already filtered to non-cancelled + future
  const availableDates = new Set(sessions.map(s => s.date));

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  function makeDayStr(day: number): string {
    return `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function getStudentBooking(sessionId: string): Booking | undefined {
    return bookings.find(b => b.sessionId === sessionId);
  }

  function getWaitlistPosition(session: Session): number {
    return session.waitlist.findIndex(w => w.uid === uid) + 1;
  }

  async function handleBook(session: Session) {
    setActionLoading(session.id);
    try {
      const now = new Date().toISOString();
      const sessionStart = new Date(`${session.date}T${session.startTime}:00`);
      const isLastMinute = (sessionStart.getTime() - Date.now()) < 24 * 60 * 60 * 1000;
      let bookingStatus: "confirmed" | "waitlisted" | "pending_approval" = "confirmed";

      await runTransaction(db, async (tx) => {
        const sessionRef = doc(db, "sessions", session.id);
        const snap = await tx.get(sessionRef);
        if (!snap.exists()) throw new Error("Session not found");
        const data = snap.data() as Omit<Session, "id">;

        if (data.bookedBy.some(b => b.uid === uid)) throw new Error("Already booked");
        if (data.waitlist.some(w => w.uid === uid)) throw new Error("Already on waitlist");

        if (isLastMinute) {
          if (data.bookedBy.length >= data.maxCapacity) throw new Error("Session full");
          // Last-minute: hold the spot but mark as pending_approval
          const newBookedBy = [...data.bookedBy, { uid, name: studentName, email: studentEmail, bookedAt: now }];
          const newStatus = newBookedBy.length >= data.maxCapacity ? "full" : "available";
          tx.update(sessionRef, { bookedBy: newBookedBy, status: newStatus });
          bookingStatus = "pending_approval";
        } else if (data.bookedBy.length < data.maxCapacity) {
          const newBookedBy = [...data.bookedBy, { uid, name: studentName, email: studentEmail, bookedAt: now }];
          const newStatus = newBookedBy.length >= data.maxCapacity ? "full" : "available";
          tx.update(sessionRef, { bookedBy: newBookedBy, status: newStatus });
          bookingStatus = "confirmed";
        } else {
          const newWaitlist = [...data.waitlist, { uid, name: studentName, email: studentEmail, joinedAt: now }];
          tx.update(sessionRef, { waitlist: newWaitlist });
          bookingStatus = "waitlisted";
        }
      });

      const bookingRef = await addDoc(collection(db, "bookings"), {
        sessionId: session.id,
        studentId: uid,
        studentName,
        studentEmail,
        coachId: session.coachId,
        date: session.date,
        startTime: session.startTime,
        title: session.title,
        status: bookingStatus,
        createdAt: now,
        reminderSent: false,
      });

      const newBooking: Booking = {
        id: bookingRef.id,
        sessionId: session.id,
        studentId: uid,
        studentName,
        studentEmail,
        coachId: session.coachId,
        date: session.date,
        startTime: session.startTime,
        title: session.title,
        status: bookingStatus,
        createdAt: now,
        reminderSent: false,
      };

      setBookings(prev => [...prev, newBooking]);

      setSessions(prev => prev.map(s => {
        if (s.id !== session.id) return s;
        if (bookingStatus === "confirmed" || bookingStatus === "pending_approval") {
          const newBookedBy = [...s.bookedBy, { uid, name: studentName, email: studentEmail, bookedAt: now }];
          return { ...s, bookedBy: newBookedBy, status: newBookedBy.length >= s.maxCapacity ? "full" : "available" };
        } else {
          return { ...s, waitlist: [...s.waitlist, { uid, name: studentName, email: studentEmail, joinedAt: now }] };
        }
      }));
    } catch (err) {
      console.error("[book session]", err);
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCancel(session: Session, booking: Booking) {
    setActionLoading(session.id);
    try {
      const now = new Date().toISOString();
      const wasBooked = booking.status === "confirmed";
      let promotedUid: string | null = null;

      await runTransaction(db, async (tx) => {
        const sessionRef = doc(db, "sessions", session.id);
        const snap = await tx.get(sessionRef);
        if (!snap.exists()) throw new Error("Session not found");
        const data = snap.data() as Omit<Session, "id">;

        if (wasBooked) {
          const newBookedBy = data.bookedBy.filter(b => b.uid !== uid);
          let newWaitlist = [...data.waitlist];

          if (newWaitlist.length > 0) {
            const promoted = newWaitlist[0];
            promotedUid = promoted.uid;
            newWaitlist = newWaitlist.slice(1);
            const promotedBookedBy = [...newBookedBy, {
              uid: promoted.uid, name: promoted.name, email: promoted.email, bookedAt: now,
            }];
            tx.update(sessionRef, {
              bookedBy: promotedBookedBy,
              waitlist: newWaitlist,
              status: promotedBookedBy.length >= data.maxCapacity ? "full" : "available",
            });
          } else {
            tx.update(sessionRef, {
              bookedBy: newBookedBy,
              status: "available",
            });
          }
        } else {
          const newWaitlist = data.waitlist.filter(w => w.uid !== uid);
          tx.update(sessionRef, { waitlist: newWaitlist });
        }

        tx.update(doc(db, "bookings", booking.id), { status: "cancelled" });
      });

      // Update the promoted student's booking doc outside the transaction
      if (promotedUid) {
        const promotedQ = query(
          collection(db, "bookings"),
          where("sessionId", "==", session.id),
          where("studentId", "==", promotedUid),
          where("status", "==", "waitlisted")
        );
        const promotedSnap = await getDocs(promotedQ);
        if (!promotedSnap.empty) {
          await updateDoc(doc(db, "bookings", promotedSnap.docs[0].id), { status: "confirmed" });
        }
      }

      setBookings(prev => prev.filter(b => b.id !== booking.id));
      setSessions(prev => prev.map(s => {
        if (s.id !== session.id) return s;
        if (wasBooked) {
          const newBookedBy = s.bookedBy.filter(b => b.uid !== uid);
          if (s.waitlist.length > 0) {
            const promoted = s.waitlist[0];
            return {
              ...s,
              bookedBy: [...newBookedBy, { uid: promoted.uid, name: promoted.name, email: promoted.email, bookedAt: now }],
              waitlist: s.waitlist.slice(1),
              status: (newBookedBy.length + 1) >= s.maxCapacity ? "full" : "available",
            };
          }
          return { ...s, bookedBy: newBookedBy, status: newBookedBy.length >= s.maxCapacity ? "full" : "available" };
        } else {
          return { ...s, waitlist: s.waitlist.filter(w => w.uid !== uid) };
        }
      }));
    } catch (err) {
      console.error("[cancel booking]", err);
    } finally {
      setActionLoading(null);
    }
  }

  const displayedSessions = selectedDate
    ? sessions.filter(s => s.date === selectedDate)
    : sessions;

  const confirmedBookings = bookings.filter(b => b.status === "confirmed");
  const waitlistedBookings = bookings.filter(b => b.status === "waitlisted");
  const pendingBookings = bookings.filter(b => b.status === "pending_approval");

  if (loading) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <svg className="h-10 w-10 animate-spin text-white opacity-40" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-20">
      {/* Header */}
      <div style={{ backgroundColor: "#001c48" }} className="pt-12 pb-5 px-4">
        <div className="flex items-center justify-between mb-3">
          <img src="/logo-light.png" alt="Ball Masters Florida" style={{ width: 80, height: "auto" }} />
        </div>
        <h1 className="text-2xl font-extrabold text-white leading-tight">Calendar</h1>
        <p className="text-xs mt-0.5" style={{ color: "#01fff9" }}>Book your training sessions</p>
      </div>

      {/* Calendar */}
      <div className="bg-white border-b border-gray-200">
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={prevMonth} className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition px-2 py-1">
            ← Prev
          </button>
          <span className="text-sm font-bold text-gray-900">{monthName}</span>
          <button onClick={nextMonth} className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition px-2 py-1">
            Next →
          </button>
        </div>

        <div className="grid grid-cols-7 px-2" style={{ backgroundColor: "#001c48" }}>
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(d => (
            <div key={d} className="text-center text-xs font-semibold text-white py-1.5">{d}</div>
          ))}
        </div>

        <div className="grid grid-cols-7 px-2 pb-2">
          {Array.from({ length: firstDay }).map((_, i) => <div key={`empty-${i}`} />)}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dayStr = makeDayStr(day);
            const hasSession = availableDates.has(dayStr);
            const isToday = dayStr === todayStr;
            const isSelected = dayStr === selectedDate;
            const isPast = dayStr < todayStr;

            return (
              <button
                key={day}
                onClick={() => { if (!isPast) setSelectedDate(isSelected ? null : dayStr); }}
                disabled={isPast}
                className="flex flex-col items-center py-1.5 rounded-lg transition"
                style={{
                  backgroundColor: isSelected ? "#001c48" : isToday ? "rgba(1,255,249,0.1)" : undefined,
                  cursor: isPast ? "default" : undefined,
                }}
              >
                <span
                  className="text-sm font-medium leading-none"
                  style={{
                    color: isPast ? "#d1d5db"
                      : isSelected ? "white"
                      : isToday ? "#001c48"
                      : "#111827",
                  }}
                >
                  {day}
                </span>
                {hasSession && !isPast && (
                  <span
                    className="mt-1 h-1.5 w-1.5 rounded-full"
                    style={{ backgroundColor: isSelected ? "white" : "#01fff9" }}
                  />
                )}
              </button>
            );
          })}
        </div>

        {selectedDate && (
          <div className="px-4 pb-3">
            <button onClick={() => setSelectedDate(null)} className="text-xs font-semibold" style={{ color: "#001c48" }}>
              Show all sessions ×
            </button>
          </div>
        )}
      </div>

      {/* Session list */}
      <div className="px-4 py-4 space-y-3">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          {selectedDate ? formatDisplayDate(selectedDate) : "Available Sessions"}
        </h2>

        {displayedSessions.length === 0 ? (
          <div className="bg-white rounded-xl border border-gray-200 py-10 text-center px-4">
            <CalendarIcon className="h-10 w-10 text-gray-200 mx-auto mb-3" />
            <p className="text-sm text-gray-400">
              {selectedDate ? "No sessions on this date." : "No upcoming sessions available."}
            </p>
          </div>
        ) : (
          displayedSessions.map(session => {
            const booking = getStudentBooking(session.id);
            const spotsLeft = session.maxCapacity - session.bookedBy.length;
            const isFull = spotsLeft <= 0;
            const isBooked = booking?.status === "confirmed";
            const isWaitlisted = booking?.status === "waitlisted";
            const isPendingApproval = booking?.status === "pending_approval";
            const waitlistPos = isWaitlisted ? getWaitlistPosition(session) : 0;
            const busy = actionLoading === session.id;

            return (
              <div key={session.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-gray-900 truncate">{session.title}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{session.coachName}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatDisplayDate(session.date)} · {formatTime(session.startTime)} – {formatTime(session.endTime)}
                    </p>
                    {session.location && <p className="text-xs text-gray-400">{session.location}</p>}
                  </div>
                  <span
                    className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full"
                    style={{ backgroundColor: "#001c48", color: "#01fff9" }}
                  >
                    {session.type === "individual" ? "1-on-1" : "Group"}
                  </span>
                </div>

                <div className="mb-3">
                  {isPendingApproval ? (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: "#fef3c7", color: "#92400e" }}>
                      Pending Approval
                    </span>
                  ) : isBooked ? (
                    <span className="text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                      Booked
                    </span>
                  ) : isWaitlisted ? (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: "#fef3c7", color: "#92400e" }}>
                      Waitlist #{waitlistPos}
                    </span>
                  ) : isFull ? (
                    <span className="text-xs text-gray-500">
                      Full — {session.waitlist.length} on waitlist
                    </span>
                  ) : (
                    <span className="text-xs text-gray-500">
                      {spotsLeft} spot{spotsLeft !== 1 ? "s" : ""} remaining
                    </span>
                  )}
                </div>

                {isPendingApproval ? (
                  <p className="w-full py-2 text-xs font-semibold text-center rounded-lg" style={{ backgroundColor: "#fef3c7", color: "#92400e" }}>
                    Awaiting coach approval
                  </p>
                ) : (isBooked || isWaitlisted) && booking ? (
                  <button
                    onClick={() => handleCancel(session, booking)}
                    disabled={busy}
                    className="w-full py-2 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
                  >
                    {busy ? "…" : isWaitlisted ? "Leave Waitlist" : "Cancel Booking"}
                  </button>
                ) : !isFull ? (
                  <button
                    onClick={() => handleBook(session)}
                    disabled={busy}
                    className="w-full py-2 text-xs font-semibold rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
                    style={{ backgroundColor: "#001c48" }}
                  >
                    {busy ? "…" : "Book"}
                  </button>
                ) : (
                  <button
                    onClick={() => handleBook(session)}
                    disabled={busy}
                    className="w-full py-2 text-xs font-semibold rounded-lg text-white transition hover:opacity-90 disabled:opacity-50"
                    style={{ backgroundColor: "#f59e0b" }}
                  >
                    {busy ? "…" : "Join Waitlist"}
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* My Bookings */}
      {confirmedBookings.length > 0 && (
        <div className="px-4 pb-4 space-y-3">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">My Bookings</h2>
          {confirmedBookings.map(b => {
            const session = sessions.find(s => s.id === b.sessionId);
            return (
              <div key={b.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900 truncate">{b.title}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatDisplayDate(b.date)} · {formatTime(b.startTime)}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold text-green-700 bg-green-50 px-2 py-0.5 rounded-full">
                    Confirmed
                  </span>
                </div>
                {session && (
                  <button
                    onClick={() => handleCancel(session, b)}
                    disabled={actionLoading === session.id}
                    className="mt-3 w-full py-2 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
                  >
                    {actionLoading === session.id ? "…" : "Cancel"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pending Approvals */}
      {pendingBookings.length > 0 && (
        <div className="px-4 pb-4 space-y-3">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Pending Approval</h2>
          {pendingBookings.map(b => (
            <div key={b.id} className="bg-white rounded-xl border border-amber-200 p-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-gray-900 truncate">{b.title}</h3>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {formatDisplayDate(b.date)} · {formatTime(b.startTime)}
                  </p>
                </div>
                <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: "#fef3c7", color: "#92400e" }}>
                  Pending
                </span>
              </div>
              <p className="text-xs text-gray-400 mt-2">Awaiting coach approval</p>
            </div>
          ))}
        </div>
      )}

      {/* My Waitlist */}
      {waitlistedBookings.length > 0 && (
        <div className="px-4 pb-4 space-y-3">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">My Waitlist</h2>
          {waitlistedBookings.map(b => {
            const session = sessions.find(s => s.id === b.sessionId);
            const pos = session ? getWaitlistPosition(session) : 0;
            return (
              <div key={b.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-semibold text-gray-900 truncate">{b.title}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatDisplayDate(b.date)} · {formatTime(b.startTime)}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: "#fef3c7", color: "#92400e" }}>
                    #{pos} on waitlist
                  </span>
                </div>
                {session && (
                  <button
                    onClick={() => handleCancel(session, b)}
                    disabled={actionLoading === session.id}
                    className="mt-3 w-full py-2 text-xs font-semibold rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
                  >
                    {actionLoading === session.id ? "…" : "Leave Waitlist"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Bottom Nav */}
      <nav className="fixed bottom-0 inset-x-0 bg-gray-900 border-t border-gray-800 flex" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {NAV_ITEMS.map(item => {
          const isActive = pathname === item.href;
          return (
            <Link key={item.href} href={item.href} className="flex-1 flex flex-col items-center py-2.5 gap-0.5 transition" style={isActive ? { color: "#01fff9" } : undefined}>
              <item.Icon className={`h-5 w-5 ${isActive ? "" : "text-gray-500"}`} />
              <span className={`text-xs ${isActive ? "font-semibold" : "text-gray-500"}`}>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </main>
  );
}
