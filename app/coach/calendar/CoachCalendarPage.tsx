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
import type { Session, Booking, BookedEntry, WaitlistEntry } from "@/lib/sessionTypes";

// ---------------------------------------------------------------------------
// Nav Icons
// ---------------------------------------------------------------------------

function HomeIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M11.47 3.841a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.061l-1.97-1.97V6a.75.75 0 00-.75-.75h-1.5a.75.75 0 00-.75.75v1.78L13.5 5.409a3 3 0 00-3 0L2.19 11.47a.75.75 0 001.061 1.06l8.219-8.69z" /><path d="M12 5.432l8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H5.625a1.875 1.875 0 01-1.875-1.875v-6.198a2.29 2.29 0 00.091-.086L12 5.432z" /></svg>;
}
function VideoIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M4.5 4.5a3 3 0 00-3 3v9a3 3 0 003 3h8.25a3 3 0 003-3v-9a3 3 0 00-3-3H4.5zM19.94 18.75l-2.69-2.69V7.94l2.69-2.69c.944-.945 2.56-.276 2.56 1.06v11.38c0 1.336-1.616 2.005-2.56 1.06z" /></svg>;
}
function StudentsIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M4.5 6.375a4.125 4.125 0 118.25 0 4.125 4.125 0 01-8.25 0zM14.25 8.625a3.375 3.375 0 116.75 0 3.375 3.375 0 01-6.75 0zM1.5 19.125a7.125 7.125 0 0114.25 0v.003l-.001.119a.75.75 0 01-.363.63 13.067 13.067 0 01-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 01-.364-.63l-.001-.122zM17.25 19.128l-.001.144a2.25 2.25 0 01-.233.96 10.088 10.088 0 005.06-1.01.75.75 0 00.42-.643 4.875 4.875 0 00-6.957-4.611 8.586 8.586 0 011.71 5.157v.003z" /></svg>;
}
function CalendarIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zm13.5 9a1.5 1.5 0 00-1.5-1.5H5.25a1.5 1.5 0 00-1.5 1.5v7.5a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5v-7.5z" clipRule="evenodd" /></svg>;
}
function InviteIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M19.902 4.098a3.75 3.75 0 00-5.304 0l-4.5 4.5a3.75 3.75 0 001.035 6.037.75.75 0 01-.646 1.353 5.25 5.25 0 01-1.449-8.45l4.5-4.5a5.25 5.25 0 117.424 7.424l-1.757 1.757a.75.75 0 11-1.06-1.06l1.757-1.757a3.75 3.75 0 000-5.304zm-7.389 4.267a.75.75 0 011-.353 5.25 5.25 0 011.449 8.45l-4.5 4.5a5.25 5.25 0 11-7.424-7.424l1.757-1.757a.75.75 0 111.06 1.06l-1.757 1.757a3.75 3.75 0 105.304 5.304l4.5-4.5a3.75 3.75 0 00-1.035-6.037.75.75 0 01-.354-1z" clipRule="evenodd" /></svg>;
}

const NAV_ITEMS = [
  { href: "/coach/dashboard", label: "Home", Icon: HomeIcon },
  { href: "/coach/videos", label: "Videos", Icon: VideoIcon },
  { href: "/coach/students", label: "Students", Icon: StudentsIcon },
  { href: "/coach/calendar", label: "Calendar", Icon: CalendarIcon },
  { href: "/coach/invite", label: "Invite", Icon: InviteIcon },
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

// confirmedBooked excludes pending_approval entries so capacity reflects only approved bookings
function confirmedBookedCount(session: Session, bookings: Booking[]): number {
  const pending = bookings.filter(b => b.sessionId === session.id && b.status === "pending_approval").length;
  return Math.max(0, session.bookedBy.length - pending);
}

function sessionStatusColor(s: Session, confirmedBooked: number): string {
  if (s.waitlist.length > 0) return "#a855f7";
  if (confirmedBooked >= s.maxCapacity) return "#ef4444";
  if (confirmedBooked / s.maxCapacity >= 0.75) return "#f59e0b";
  return "#22c55e";
}

function sessionStatusLabel(s: Session, confirmedBooked: number): string {
  if (s.waitlist.length > 0) return "Waitlist";
  if (confirmedBooked >= s.maxCapacity) return "Full";
  if (confirmedBooked / s.maxCapacity >= 0.75) return "Nearly Full";
  return "Available";
}

// ---------------------------------------------------------------------------
// Create Session Modal
// ---------------------------------------------------------------------------

const TIME_OPTIONS: { value: string; label: string }[] = (() => {
  const opts: { value: string; label: string }[] = [];
  for (let h = 6; h <= 22; h++) {
    for (let m = 0; m < 60; m += 15) {
      if (h === 22 && m > 0) break;
      const value = `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
      const hour12 = h % 12 || 12;
      const ampm = h >= 12 ? "PM" : "AM";
      const label = `${hour12}:${String(m).padStart(2, "0")} ${ampm}`;
      opts.push({ value, label });
    }
  }
  return opts;
})();

function nextQuarterHour(): string {
  const now = new Date();
  const mins = now.getHours() * 60 + now.getMinutes();
  const next = Math.ceil((mins + 1) / 15) * 15;
  const h = Math.floor(next / 60);
  const m = next % 60;
  if (h < 6) return "06:00";
  if (h >= 22) return "06:00";
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function addOneHour(timeStr: string): string {
  const [h, m] = timeStr.split(":").map(Number);
  const total = h * 60 + m + 60;
  const endH = Math.min(Math.floor(total / 60), 22);
  const endM = endH === 22 ? 0 : total % 60;
  return `${String(endH).padStart(2, "0")}:${String(endM).padStart(2, "0")}`;
}

function todayDateStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface CreateSessionModalProps {
  onClose: () => void;
  onCreated: (s: Session) => void;
  coachId: string;
  coachName: string;
  isAdmin: boolean;
  coaches: { uid: string; name: string }[];
}

function CreateSessionModal({ onClose, onCreated, coachId, coachName, isAdmin, coaches }: CreateSessionModalProps) {
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState(() => nextQuarterHour());
  const [endTime, setEndTime] = useState(() => addOneHour(nextQuarterHour()));
  const [type, setType] = useState<"individual" | "group">("individual");
  const [capacity, setCapacity] = useState(5);
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [selectedCoachId, setSelectedCoachId] = useState("");
  const [selectedCoachName, setSelectedCoachName] = useState("");

  async function handleSubmit() {
    if (!title.trim() || !date || !startTime || !endTime) {
      setError("Session name, date, start time and end time are required.");
      return;
    }
    if (date < todayDateStr()) {
      setError("Please select a future date.");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const maxCap = type === "individual" ? 1 : capacity;
      const now = new Date().toISOString();
      const effectiveCoachId = (isAdmin && selectedCoachId) ? selectedCoachId : coachId;
      const effectiveCoachName = (isAdmin && selectedCoachName) ? selectedCoachName : coachName;
      const data = {
        title: title.trim(),
        coachId: effectiveCoachId,
        coachName: effectiveCoachName,
        type,
        maxCapacity: maxCap,
        date,
        startTime,
        endTime,
        location: location.trim(),
        notes: notes.trim(),
        bookedBy: [],
        waitlist: [],
        status: "available" as const,
        createdAt: now,
        school: "",
      };
      const ref = await addDoc(collection(db, "sessions"), data);
      onCreated({ id: ref.id, ...data });
      onClose();
    } catch (err) {
      console.error("[create session]", err);
      setError("Failed to create session. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={() => !saving && onClose()} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md flex flex-col" style={{ maxHeight: "90vh" }}>
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">Create Session</h2>
          <button onClick={() => !saving && onClose()} className="text-gray-400 hover:text-gray-600">
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Session Name *</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Morning Training, 1-on-1 with Coach Lukas, Group Beginners"
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none"
              onFocus={e => (e.target.style.borderColor = "#001c48")}
              onBlur={e => (e.target.style.borderColor = "#e5e7eb")}
            />
          </div>

          {isAdmin && coaches.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Coach</label>
              <select
                value={selectedCoachId}
                onChange={e => {
                  const coach = coaches.find(c => c.uid === e.target.value);
                  setSelectedCoachId(e.target.value);
                  setSelectedCoachName(coach?.name ?? "");
                }}
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none"
                onFocus={e => (e.target.style.borderColor = "#001c48")}
                onBlur={e => (e.target.style.borderColor = "#e5e7eb")}
              >
                <option value="">Select a coach…</option>
                {coaches.map(c => (
                  <option key={c.uid} value={c.uid}>{c.name}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date *</label>
            <input
              type="date"
              value={date}
              min={todayDateStr()}
              onChange={e => setDate(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none"
              onFocus={e => (e.target.style.borderColor = "#001c48")}
              onBlur={e => (e.target.style.borderColor = "#e5e7eb")}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Time *</label>
              <select
                value={startTime}
                onChange={e => {
                  setStartTime(e.target.value);
                  setEndTime(addOneHour(e.target.value));
                }}
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none bg-white"
                onFocus={e => (e.target.style.borderColor = "#001c48")}
                onBlur={e => (e.target.style.borderColor = "#e5e7eb")}
              >
                {TIME_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Time *</label>
              <select
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none bg-white"
                onFocus={e => (e.target.style.borderColor = "#001c48")}
                onBlur={e => (e.target.style.borderColor = "#e5e7eb")}
              >
                {TIME_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Session Type</label>
            <div className="flex gap-2">
              <button
                onClick={() => setType("individual")}
                className="flex-1 py-2 text-sm font-semibold rounded-lg transition"
                style={{
                  backgroundColor: type === "individual" ? "#001c48" : "#f3f4f6",
                  color: type === "individual" ? "white" : "#374151",
                }}
              >
                Individual
              </button>
              <button
                onClick={() => setType("group")}
                className="flex-1 py-2 text-sm font-semibold rounded-lg transition"
                style={{
                  backgroundColor: type === "group" ? "#001c48" : "#f3f4f6",
                  color: type === "group" ? "white" : "#374151",
                }}
              >
                Group
              </button>
            </div>
          </div>

          {type === "group" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Capacity</label>
              <input
                type="number"
                min={2}
                max={100}
                value={capacity}
                onChange={e => setCapacity(Math.max(2, parseInt(e.target.value, 10) || 2))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none"
                onFocus={e => (e.target.style.borderColor = "#001c48")}
                onBlur={e => (e.target.style.borderColor = "#e5e7eb")}
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
            <input
              type="text"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="e.g. Court 1, Main Gym"
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none"
              onFocus={e => (e.target.style.borderColor = "#001c48")}
              onBlur={e => (e.target.style.borderColor = "#e5e7eb")}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Any details for students…"
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none resize-none"
              onFocus={e => (e.target.style.borderColor = "#001c48")}
              onBlur={e => (e.target.style.borderColor = "#e5e7eb")}
            />
          </div>
        </div>

        <div className="px-6 pb-6 pt-3 flex gap-3 border-t border-gray-100">
          <button
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="flex-1 rounded-lg py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: "#001c48" }}
          >
            {saving ? "Creating…" : "Create Session"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Session Detail Modal
// ---------------------------------------------------------------------------

interface SessionDetailModalProps {
  session: Session;
  onClose: () => void;
  onCancelled: (id: string) => void;
  onUpdated: (s: Session) => void;
  bookings: Booking[];
  onApproveBooking: (booking: Booking) => Promise<void>;
  onDeclineBooking: (booking: Booking) => Promise<void>;
}

function SessionDetailModal({ session, onClose, onCancelled, onUpdated, bookings, onApproveBooking, onDeclineBooking }: SessionDetailModalProps) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [promoting, setPromoting] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);

  const pendingBookings = bookings.filter(b => b.sessionId === session.id && b.status === "pending_approval");
  const confirmedBooked = Math.max(0, session.bookedBy.length - pendingBookings.length);

  async function handleCancelSession() {
    setCancelling(true);
    try {
      await updateDoc(doc(db, "sessions", session.id), { status: "cancelled" });
      console.log("[cancel session] Push notifications would be sent to:", [
        ...session.bookedBy.map(b => b.uid),
        ...session.waitlist.map(w => w.uid),
      ]);
      onCancelled(session.id);
      onClose();
    } catch (err) {
      console.error("[cancel session]", err);
    } finally {
      setCancelling(false);
    }
  }

  async function handlePromote(entry: WaitlistEntry) {
    setPromoting(entry.uid);
    try {
      await runTransaction(db, async (tx) => {
        const sessionRef = doc(db, "sessions", session.id);
        const snap = await tx.get(sessionRef);
        if (!snap.exists()) throw new Error("Session not found");
        const data = snap.data() as Omit<Session, "id">;
        const newWaitlist = data.waitlist.filter(w => w.uid !== entry.uid);
        const newBookedBy: BookedEntry[] = [...data.bookedBy, {
          uid: entry.uid,
          name: entry.name,
          email: entry.email,
          bookedAt: new Date().toISOString(),
        }];
        const newStatus = newBookedBy.length >= data.maxCapacity ? "full" : "available";
        tx.update(sessionRef, { bookedBy: newBookedBy, waitlist: newWaitlist, status: newStatus });
      });

      const updated: Session = {
        ...session,
        bookedBy: [...session.bookedBy, {
          uid: entry.uid, name: entry.name, email: entry.email,
          bookedAt: new Date().toISOString(),
        }],
        waitlist: session.waitlist.filter(w => w.uid !== entry.uid),
        status: (session.bookedBy.length + 1) >= session.maxCapacity ? "full" : "available",
      };
      onUpdated(updated);
    } catch (err) {
      console.error("[promote waitlist]", err);
    } finally {
      setPromoting(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md flex flex-col" style={{ maxHeight: "90vh" }}>
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900 truncate flex-1 mr-2">{session.title}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 shrink-0">
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg>
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
          <div className="space-y-2 text-sm text-gray-700">
            <p><span className="font-medium text-gray-500">Date:</span> {formatDisplayDate(session.date)}</p>
            <p><span className="font-medium text-gray-500">Time:</span> {formatTime(session.startTime)} – {formatTime(session.endTime)}</p>
            <p><span className="font-medium text-gray-500">Type:</span> {session.type === "individual" ? "Individual" : "Group"}</p>
            <p><span className="font-medium text-gray-500">Capacity:</span> {confirmedBooked} / {session.maxCapacity}{pendingBookings.length > 0 ? ` (${pendingBookings.length} pending approval)` : ""}</p>
            {session.location && <p><span className="font-medium text-gray-500">Location:</span> {session.location}</p>}
            {session.notes && <p><span className="font-medium text-gray-500">Notes:</span> {session.notes}</p>}
          </div>

          {pendingBookings.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-800 mb-2">Pending Approval ({pendingBookings.length})</h3>
              <div className="space-y-2">
                {pendingBookings.map(b => (
                  <div key={b.id} className="flex items-center gap-3 rounded-lg px-3 py-2.5" style={{ backgroundColor: "#fef3c7" }}>
                    <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ backgroundColor: "#fde68a", color: "#92400e" }}>
                      {b.studentName.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{b.studentName}</p>
                      <p className="text-xs text-gray-500 truncate">{b.studentEmail}</p>
                      <p className="text-xs text-gray-400">{new Date(b.createdAt).toLocaleString()}</p>
                    </div>
                    <div className="flex flex-col gap-1 shrink-0">
                      <button
                        onClick={async () => { setApprovingId(b.id); await onApproveBooking(b); setApprovingId(null); }}
                        disabled={approvingId === b.id || decliningId === b.id}
                        className="text-xs font-semibold px-2.5 py-1.5 rounded-lg text-white transition disabled:opacity-50"
                        style={{ backgroundColor: "#22c55e" }}
                      >
                        {approvingId === b.id ? "…" : "Approve"}
                      </button>
                      <button
                        onClick={async () => { setDecliningId(b.id); await onDeclineBooking(b); setDecliningId(null); }}
                        disabled={approvingId === b.id || decliningId === b.id}
                        className="text-xs font-semibold px-2.5 py-1.5 rounded-lg text-white transition disabled:opacity-50 bg-red-500"
                      >
                        {decliningId === b.id ? "…" : "Decline"}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold text-gray-800 mb-2">Booked ({session.bookedBy.length})</h3>
            {session.bookedBy.length === 0 ? (
              <p className="text-sm text-gray-400">No one booked yet.</p>
            ) : (
              <div className="space-y-2">
                {session.bookedBy.map(b => (
                  <div key={b.uid} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2.5">
                    <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ backgroundColor: "#dbeafe", color: "#001c48" }}>
                      {b.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{b.name}</p>
                      <p className="text-xs text-gray-400 truncate">{b.email}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {session.waitlist.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-gray-800 mb-2">Waitlist ({session.waitlist.length})</h3>
              <div className="space-y-2">
                {session.waitlist.map((w, i) => (
                  <div key={w.uid} className="flex items-center gap-3 bg-amber-50 rounded-lg px-3 py-2.5">
                    <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ backgroundColor: "#fef3c7", color: "#92400e" }}>
                      {i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{w.name}</p>
                      <p className="text-xs text-gray-400 truncate">{w.email}</p>
                    </div>
                    {confirmedBooked < session.maxCapacity && (
                      <button
                        onClick={() => handlePromote(w)}
                        disabled={promoting === w.uid}
                        className="shrink-0 text-xs font-semibold px-2.5 py-1.5 rounded-lg text-white transition disabled:opacity-50"
                        style={{ backgroundColor: "#001c48" }}
                      >
                        {promoting === w.uid ? "…" : "Move to booked"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 pb-6 pt-3 border-t border-gray-100">
          {confirmCancel ? (
            <div className="space-y-2">
              <p className="text-sm text-red-700 font-medium text-center">Cancel this session for all students?</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmCancel(false)}
                  disabled={cancelling}
                  className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-semibold text-gray-700"
                >
                  Keep
                </button>
                <button
                  onClick={handleCancelSession}
                  disabled={cancelling}
                  className="flex-1 rounded-lg py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition disabled:opacity-50"
                >
                  {cancelling ? "Cancelling…" : "Yes, Cancel"}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setConfirmCancel(true)}
              className="w-full rounded-lg border border-red-200 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 transition"
            >
              Cancel Session
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function CoachCalendarPage() {
  const router = useRouter();
  const pathname = usePathname();

  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState("");
  const [coachId, setCoachId] = useState("");
  const [coachName, setCoachName] = useState("");
  const [sessions, setSessions] = useState<Session[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [coaches, setCoaches] = useState<{ uid: string; name: string }[]>([]);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  const [showCreate, setShowCreate] = useState(false);
  const [selectedSession, setSelectedSession] = useState<Session | null>(null);
  const [activeTab, setActiveTab] = useState<"all" | "booked" | "pending">("all");
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push("/login"); return; }
      setUid(user.uid);
      try {
        const profileSnap = await getDoc(doc(db, "users", user.uid));
        const data = profileSnap.data();
        const role = data?.role as string | undefined;
        if (role !== "coach" && role !== "admin") {
          router.push("/student/dashboard");
          return;
        }
        const userIsAdmin = role === "admin";
        setIsAdmin(userIsAdmin);
        setCoachId(user.uid);
        setCoachName(data?.fullName ?? data?.name ?? user.displayName ?? "Coach");

        if (userIsAdmin) {
          const coachSnap = await getDocs(query(collection(db, "users"), where("role", "==", "coach")));
          const coachList = coachSnap.docs.map(d => ({
            uid: d.id,
            name: (d.data().fullName as string) ?? (d.data().name as string) ?? "Coach",
          }));
          setCoaches(coachList);
        }

        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

        // Admins see all bookings; coaches only see bookings for their own sessions
        const bookingsQuery = userIsAdmin
          ? getDocs(collection(db, "bookings"))
          : getDocs(query(collection(db, "bookings"), where("coachId", "==", user.uid)));

        const [sessionsSnap, bookingsSnap] = await Promise.all([
          getDocs(collection(db, "sessions")),
          bookingsQuery,
        ]);

        const list: Session[] = sessionsSnap.docs
          .map(d => ({
            id: d.id,
            ...(d.data() as Omit<Session, "id">),
            bookedBy: d.data().bookedBy ?? [],
            waitlist: d.data().waitlist ?? [],
          }))
          .filter(s => s.status !== "cancelled" && s.date >= todayStr)
          .sort((a, b) => {
            const da = a.date + "T" + a.startTime;
            const db2 = b.date + "T" + b.startTime;
            return da.localeCompare(db2);
          });
        setSessions(list);

        const bookingList: Booking[] = bookingsSnap.docs
          .map(d => ({ id: d.id, ...(d.data() as Omit<Booking, "id">) }))
          .filter(b => b.status !== "cancelled");
        console.log("[coach/calendar] bookings loaded:", bookingList.length, "total, pending:", bookingList.filter(b => b.status === "pending_approval").length);
        bookingList.forEach(b => console.log("  →", b.id, "| status:", b.status, "| coachId:", b.coachId, "| sessionId:", b.sessionId, "| student:", b.studentId));
        setBookings(bookingList);
      } catch (err) {
        console.error("[coach/calendar]", err);
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, [router]);

  async function handleRefresh() {
    if (refreshing || !uid) return;
    setRefreshing(true);
    try {
      const today = new Date();
      const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      const [sessionsSnap, bookingsSnap] = await Promise.all([
        getDocs(collection(db, "sessions")),
        isAdmin
          ? getDocs(collection(db, "bookings"))
          : getDocs(query(collection(db, "bookings"), where("coachId", "==", uid))),
      ]);
      const sessionList: Session[] = sessionsSnap.docs
        .map(d => ({
          id: d.id,
          ...(d.data() as Omit<Session, "id">),
          bookedBy: d.data().bookedBy ?? [],
          waitlist: d.data().waitlist ?? [],
        }))
        .filter(s => s.status !== "cancelled" && s.date >= todayStr)
        .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
      const bookingList: Booking[] = bookingsSnap.docs
        .map(d => ({ id: d.id, ...(d.data() as Omit<Booking, "id">) }))
        .filter(b => b.status !== "cancelled");
      setSessions(sessionList);
      setBookings(bookingList);
    } catch (err) {
      console.error("[refresh]", err);
    } finally {
      setRefreshing(false);
    }
  }

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

  const daysInMonth = getDaysInMonth(viewYear, viewMonth);
  const firstDay = getFirstDayOfMonth(viewYear, viewMonth);
  const monthName = new Date(viewYear, viewMonth, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const sessionDates = new Set(sessions.map(s => s.date));

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

  async function handleApproveBooking(booking: Booking) {
    try {
      await updateDoc(doc(db, "bookings", booking.id), { status: "confirmed" });
      console.log("[approve booking] Push notification would be sent to student:", booking.studentId);
      setBookings(prev => prev.map(b => b.id === booking.id ? { ...b, status: "confirmed" } : b));
      if (selectedSession) {
        setSelectedSession(prev => prev ? prev : null);
      }
    } catch (err) {
      console.error("[approve booking]", err);
    }
  }

  async function handleDeclineBooking(booking: Booking) {
    try {
      await updateDoc(doc(db, "bookings", booking.id), { status: "declined" });
      const sessionRef = doc(db, "sessions", booking.sessionId);
      const sessionToUpdate = sessions.find(s => s.id === booking.sessionId);
      if (sessionToUpdate) {
        const newBookedBy = sessionToUpdate.bookedBy.filter(b => b.uid !== booking.studentId);
        const newStatus = newBookedBy.length >= sessionToUpdate.maxCapacity ? "full" : "available";
        await updateDoc(sessionRef, { bookedBy: newBookedBy, status: newStatus });
        const updatedSession: Session = { ...sessionToUpdate, bookedBy: newBookedBy, status: newStatus };
        setSessions(prev => prev.map(s => s.id === booking.sessionId ? updatedSession : s));
        if (selectedSession?.id === booking.sessionId) {
          setSelectedSession(updatedSession);
        }
      }
      console.log("[decline booking] Push notification would be sent to student:", booking.studentId);
      setBookings(prev => prev.map(b => b.id === booking.id ? { ...b, status: "declined" } : b));
    } catch (err) {
      console.error("[decline booking]", err);
    }
  }

  // Tab-filtered session lists (selectedDate applies on top)
  const baseSessions = selectedDate ? sessions.filter(s => s.date === selectedDate) : sessions;

  const allTabSessions = baseSessions;
  const bookedTabSessions = baseSessions.filter(s =>
    bookings.some(b => b.sessionId === s.id && b.status === "confirmed")
  );
  const pendingTabSessions = baseSessions.filter(s =>
    bookings.some(b => b.sessionId === s.id && b.status === "pending_approval")
  );

  const tabSessions =
    activeTab === "all" ? allTabSessions :
    activeTab === "booked" ? bookedTabSessions :
    pendingTabSessions;

  const emptyMessages: Record<"all" | "booked" | "pending", string> = {
    all: "No upcoming sessions",
    booked: "No sessions with bookings",
    pending: "No pending approvals",
  };

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
          <div className="flex items-center gap-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-2 rounded-lg transition hover:opacity-80 disabled:opacity-50"
              style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
              title="Refresh"
            >
              <svg
                className={`h-4 w-4 text-white ${refreshing ? "animate-spin" : ""}`}
                viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            </button>
            <button
              onClick={() => setShowCreate(true)}
              className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ backgroundColor: "rgba(255,255,255,0.15)" }}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Create Session
            </button>
          </div>
        </div>
        <h1 className="text-2xl font-extrabold text-white leading-tight">Calendar</h1>
        <p className="text-xs mt-0.5" style={{ color: "#01fff9" }}>{sessions.length} upcoming session{sessions.length !== 1 ? "s" : ""}</p>
      </div>

      {/* Calendar */}
      <div className="bg-white border-b border-gray-200">
        {/* Month nav */}
        <div className="flex items-center justify-between px-4 py-3">
          <button onClick={prevMonth} className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition px-2 py-1">
            ← Prev
          </button>
          <span className="text-sm font-bold text-gray-900">{monthName}</span>
          <button onClick={nextMonth} className="text-sm font-semibold text-gray-600 hover:text-gray-900 transition px-2 py-1">
            Next →
          </button>
        </div>

        {/* Day labels */}
        <div className="grid grid-cols-7 px-2" style={{ backgroundColor: "#001c48" }}>
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(d => (
            <div key={d} className="text-center text-xs font-semibold text-white py-1.5">{d}</div>
          ))}
        </div>

        {/* Day cells */}
        <div className="grid grid-cols-7 px-2 pb-2">
          {Array.from({ length: firstDay }).map((_, i) => (
            <div key={`empty-${i}`} />
          ))}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dayStr = makeDayStr(day);
            const hasSession = sessionDates.has(dayStr);
            const isToday = dayStr === todayStr;
            const isSelected = dayStr === selectedDate;

            return (
              <button
                key={day}
                onClick={() => setSelectedDate(isSelected ? null : dayStr)}
                className="flex flex-col items-center py-1.5 rounded-lg transition"
                style={{
                  backgroundColor: isSelected ? "#001c48" : isToday ? "rgba(1,255,249,0.1)" : undefined,
                }}
              >
                <span
                  className="text-sm font-medium leading-none"
                  style={{ color: isSelected ? "white" : isToday ? "#001c48" : "#111827" }}
                >
                  {day}
                </span>
                {hasSession && (
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
            <button
              onClick={() => setSelectedDate(null)}
              className="text-xs font-semibold"
              style={{ color: "#001c48" }}
            >
              Show all sessions ×
            </button>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div className="flex border-b border-gray-200 bg-white">
        {(["all", "booked", "pending"] as const).map(tab => {
          const allCount = sessions.length;
          const bookedCount = sessions.filter(s =>
            bookings.some(b => b.sessionId === s.id && b.status === "confirmed")
          ).length;
          const pendingCount = sessions.filter(s => bookings.some(b => b.sessionId === s.id && b.status === "pending_approval")).length;
          const count = tab === "all" ? allCount : tab === "booked" ? bookedCount : pendingCount;
          const baseLabel = tab === "all" ? "All Sessions" : tab === "booked" ? "Booked" : "Pending Approval";
          const label = `${baseLabel} (${count})`;
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="flex-1 py-3 text-xs font-semibold transition border-b-2"
              style={{
                borderBottomColor: isActive ? "#001c48" : "transparent",
                color: isActive ? "#001c48" : "#9ca3af",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Session list */}
      <div className="px-4 py-4 space-y-3">
        {selectedDate && (
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
            {formatDisplayDate(selectedDate)}
          </p>
        )}

        {tabSessions.length === 0 ? (
          <div className="bg-white rounded-xl border-2 border-dashed border-gray-200 py-12 text-center px-4">
            <CalendarIcon className="h-10 w-10 text-gray-200 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-500 mb-4">
              {selectedDate ? `No sessions on this date` : emptyMessages[activeTab]}
            </p>
            {activeTab === "all" && (
              <button
                onClick={() => setShowCreate(true)}
                className="rounded-lg px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition"
                style={{ backgroundColor: "#001c48" }}
              >
                Create a session
              </button>
            )}
          </div>
        ) : (
          tabSessions.map(s => {
            const confirmed = confirmedBookedCount(s, bookings);
            const color = sessionStatusColor(s, confirmed);
            const label = sessionStatusLabel(s, confirmed);
            const pendingCount = bookings.filter(b => b.sessionId === s.id && b.status === "pending_approval").length;
            return (
              <button
                key={s.id}
                onClick={() => setSelectedSession(s)}
                className="w-full bg-white rounded-xl border border-gray-200 p-4 text-left hover:shadow-sm active:opacity-90 transition"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="flex-1 min-w-0">
                    <h3 className="text-sm font-bold text-gray-900 truncate">{s.title}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {formatDisplayDate(s.date)} · {formatTime(s.startTime)} – {formatTime(s.endTime)}
                    </p>
                    {s.location && <p className="text-xs text-gray-400">{s.location}</p>}
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {pendingCount > 0 && (
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={{ backgroundColor: "#fef3c7", color: "#92400e" }}
                      >
                        {pendingCount} Pending
                      </span>
                    )}
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={{ backgroundColor: `${color}20`, color }}
                    >
                      {label}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, (confirmed / s.maxCapacity) * 100)}%`,
                        backgroundColor: color,
                      }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 shrink-0 tabular-nums">
                    {confirmed}/{s.maxCapacity}
                    {pendingCount > 0 && ` · ${pendingCount} pending`}
                    {s.waitlist.length > 0 && ` · ${s.waitlist.length} waitlisted`}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>

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

      {/* Modals */}
      {showCreate && (
        <CreateSessionModal
          onClose={() => setShowCreate(false)}
          onCreated={s => setSessions(prev => [...prev, s].sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)))}
          coachId={coachId}
          coachName={coachName}
          isAdmin={isAdmin}
          coaches={coaches}
        />
      )}

      {selectedSession && (
        <SessionDetailModal
          session={selectedSession}
          onClose={() => setSelectedSession(null)}
          onCancelled={id => {
            setSessions(prev => prev.filter(s => s.id !== id));
            setSelectedSession(null);
          }}
          onUpdated={updated => {
            setSessions(prev => prev.map(s => s.id === updated.id ? updated : s));
            setSelectedSession(updated);
          }}
          bookings={bookings}
          onApproveBooking={handleApproveBooking}
          onDeclineBooking={handleDeclineBooking}
        />
      )}
    </main>
  );
}
