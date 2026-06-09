"use client";

import { useEffect, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
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

function ChatIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M4.848 2.771A49.144 49.144 0 0112 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 01-3.476.383.39.39 0 00-.297.17l-2.755 4.133a.75.75 0 01-1.248 0l-2.755-4.133a.39.39 0 00-.297-.17 48.9 48.9 0 01-3.476-.384c-1.978-.29-3.348-2.024-3.348-3.97V6.741c0-1.946 1.37-3.68 3.348-3.97z" clipRule="evenodd" /></svg>;
}

const NAV_ITEMS = [
  { href: "/coach/dashboard", label: "Home", Icon: HomeIcon },
  { href: "/coach/videos", label: "Videos", Icon: VideoIcon },
  { href: "/coach/students", label: "Athletes", Icon: StudentsIcon },
  { href: "/coach/calendar", label: "Calendar", Icon: CalendarIcon },
  { href: "/coach/messages", label: "Messages", Icon: ChatIcon },
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

function generateSessionTitle(startTime: string, coachName: string): string {
  const [hourStr] = startTime.split(":");
  const hour = parseInt(hourStr, 10);
  const timeOfDay =
    hour < 12 ? "Morning" :
    hour < 17 ? "Afternoon" :
    hour < 20 ? "Evening" :
    "Night";
  const firstName = coachName.split(" ")[0];
  return `${timeOfDay} Session with Coach ${firstName}`;
}

// confirmedBooked excludes pending_approval entries so capacity reflects only approved bookings
function confirmedBookedCount(session: Session, bookings: Booking[]): number {
  const pending = bookings.filter(b => b.sessionId === session.id && b.status === "pending_approval").length;
  return Math.max(0, session.bookedBy.length - pending);
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

// ---------------------------------------------------------------------------
// Batch Create Helpers & Modal
// ---------------------------------------------------------------------------

interface SessionDraft { date: string; startTime: string; endTime: string; }
interface SlotRow { id: number; startTime: string; endTime: string; }

const DAYS = [
  { label: "Mon", day: 1 }, { label: "Tue", day: 2 }, { label: "Wed", day: 3 },
  { label: "Thu", day: 4 }, { label: "Fri", day: 5 }, { label: "Sat", day: 6 }, { label: "Sun", day: 0 },
];

function dateStrToDate(s: string): Date { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); }
function dateToStr(d: Date): string { return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`; }
function addDays(dateStr: string, n: number): string { const d = dateStrToDate(dateStr); d.setDate(d.getDate() + n); return dateToStr(d); }
function formatDateLabel(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

interface BatchCreateModalProps {
  onClose: () => void;
  coachId: string;
  coachName: string;
  isAdmin: boolean;
  coaches: { uid: string; name: string }[];
  existingSessions: Session[];
}

function BatchCreateModal({ onClose, coachId, coachName, isAdmin, coaches, existingSessions }: BatchCreateModalProps) {
  const [tab, setTab] = useState<"recurring" | "multislot" | "duplicate">("recurring");
  const [selectedCoachId, setSelectedCoachId] = useState("");
  const [selectedCoachName, setSelectedCoachName] = useState("");
  const [type, setType] = useState<"individual" | "group">("individual");
  const [capacity, setCapacity] = useState(5);
  const [location, setLocation] = useState("");
  const [notes, setNotes] = useState("");

  const [recurStart, setRecurStart] = useState(todayDateStr());
  const [recurEnd, setRecurEnd] = useState(addDays(todayDateStr(), 27));
  const [recurDays, setRecurDays] = useState<number[]>([1, 3, 5]);
  const [recurStartTime, setRecurStartTime] = useState(() => nextQuarterHour());
  const [recurEndTime, setRecurEndTime] = useState(() => addOneHour(nextQuarterHour()));

  const [multiDate, setMultiDate] = useState(todayDateStr());
  const [slots, setSlots] = useState<SlotRow[]>([{ id: 1, startTime: nextQuarterHour(), endTime: addOneHour(nextQuarterHour()) }]);
  const [nextSlotId, setNextSlotId] = useState(2);

  const [dupSourceId, setDupSourceId] = useState("");
  const [dupDates, setDupDates] = useState<string[]>([addDays(todayDateStr(), 1)]);

  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<{ created: number; skipped: number } | null>(null);
  const [error, setError] = useState("");

  const effectiveCoachId = (isAdmin && selectedCoachId) ? selectedCoachId : coachId;
  const effectiveCoachName = (isAdmin && selectedCoachName) ? selectedCoachName : coachName;
  const existingKeys = new Set(existingSessions.map(s => `${s.coachId}__${s.date}__${s.startTime}`));

  function computeDrafts(): SessionDraft[] {
    if (tab === "recurring") {
      if (!recurStart || !recurEnd || recurDays.length === 0) return [];
      const drafts: SessionDraft[] = [];
      let cur = recurStart;
      while (cur <= recurEnd) {
        if (recurDays.includes(dateStrToDate(cur).getDay()))
          drafts.push({ date: cur, startTime: recurStartTime, endTime: recurEndTime });
        cur = addDays(cur, 1);
      }
      return drafts;
    }
    if (tab === "multislot") {
      if (!multiDate) return [];
      return slots.map(s => ({ date: multiDate, startTime: s.startTime, endTime: s.endTime }));
    }
    if (tab === "duplicate") {
      const src = existingSessions.find(s => s.id === dupSourceId);
      if (!src) return [];
      return dupDates.filter(Boolean).map(date => ({ date, startTime: src.startTime, endTime: src.endTime }));
    }
    return [];
  }

  const drafts = computeDrafts();
  const newDrafts = drafts.filter(d => !existingKeys.has(`${effectiveCoachId}__${d.date}__${d.startTime}`));
  const skipCount = drafts.length - newDrafts.length;

  async function handleCreate() {
    if (newDrafts.length === 0) return;
    setSaving(true);
    setError("");
    try {
      const now = new Date().toISOString();
      const maxCap = type === "individual" ? 1 : capacity;
      const seenKeys = new Set<string>();
      const deduped = newDrafts.filter(d => {
        const k = `${effectiveCoachId}__${d.date}__${d.startTime}`;
        if (seenKeys.has(k)) return false;
        seenKeys.add(k);
        return true;
      });
      const totalSkipped = drafts.length - deduped.length;
      for (let i = 0; i < deduped.length; i += 500) {
        const batch = writeBatch(db);
        for (const d of deduped.slice(i, i + 500)) {
          batch.set(doc(collection(db, "sessions")), {
            title: generateSessionTitle(d.startTime, effectiveCoachName),
            coachId: effectiveCoachId, coachName: effectiveCoachName, type,
            maxCapacity: maxCap, date: d.date, startTime: d.startTime, endTime: d.endTime,
            location: location.trim(), notes: notes.trim(),
            bookedBy: [], waitlist: [], status: "available", createdAt: now, school: "",
          });
        }
        await batch.commit();
      }
      setResult({ created: deduped.length, skipped: totalSkipped });
    } catch (err) {
      console.error("[batch create]", err);
      setError("Failed to create sessions. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (result) {
    return (
      <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
        <div className="absolute inset-0 bg-black/50" onClick={onClose} />
        <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md p-8 text-center shadow-2xl">
          <div className="h-14 w-14 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ backgroundColor: "#dcfce7" }}>
            <svg className="h-7 w-7" style={{ color: "#16a34a" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-gray-900 mb-1">Sessions Created</h2>
          <p className="text-sm text-gray-600 mb-1">Created <span className="font-semibold text-green-600">{result.created}</span> session{result.created !== 1 ? "s" : ""}</p>
          {result.skipped > 0 && <p className="text-sm text-gray-400">Skipped <span className="font-semibold">{result.skipped}</span> duplicate{result.skipped !== 1 ? "s" : ""}</p>}
          <button onClick={onClose} className="mt-6 w-full rounded-xl py-3 text-sm font-semibold text-white" style={{ backgroundColor: "#001c48" }}>Done</button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={() => !saving && onClose()} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md flex flex-col" style={{ maxHeight: "92vh" }}>
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
          <h2 className="text-base font-bold text-gray-900">Batch Create Sessions</h2>
          <button onClick={() => !saving && onClose()} className="text-gray-400 hover:text-gray-600">
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg>
          </button>
        </div>

        <div className="flex border-b border-gray-100 px-2">
          {(["recurring", "multislot", "duplicate"] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className="flex-1 py-2.5 text-xs font-semibold border-b-2 transition"
              style={{ borderBottomColor: tab === t ? "#001c48" : "transparent", color: tab === t ? "#001c48" : "#9ca3af" }}>
              {t === "recurring" ? "Recurring" : t === "multislot" ? "Multi-Slot" : "Duplicate"}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto flex-1 px-6 py-5 space-y-4">
          {error && <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{error}</p>}

          {isAdmin && coaches.length > 0 && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Coach</label>
              <select value={selectedCoachId} onChange={e => { const c = coaches.find(x => x.uid === e.target.value); setSelectedCoachId(e.target.value); setSelectedCoachName(c?.name ?? ""); }}
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none">
                <option value="">Select a coach…</option>
                {coaches.map(c => <option key={c.uid} value={c.uid}>{c.name}</option>)}
              </select>
            </div>
          )}

          {tab === "recurring" && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
                  <input type="date" value={recurStart} min={todayDateStr()} onChange={e => setRecurStart(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
                  <input type="date" value={recurEnd} min={recurStart || todayDateStr()} onChange={e => setRecurEnd(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none" />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Repeat on</label>
                <div className="flex gap-1.5 flex-wrap">
                  {DAYS.map(({ label, day }) => {
                    const on = recurDays.includes(day);
                    return (
                      <button key={day} onClick={() => setRecurDays(prev => on ? prev.filter(d => d !== day) : [...prev, day])}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg transition"
                        style={{ backgroundColor: on ? "#001c48" : "#f3f4f6", color: on ? "white" : "#374151" }}>
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Start Time</label>
                  <select value={recurStartTime} onChange={e => { setRecurStartTime(e.target.value); setRecurEndTime(addOneHour(e.target.value)); }}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none bg-white">
                    {TIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">End Time</label>
                  <select value={recurEndTime} onChange={e => setRecurEndTime(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none bg-white">
                    {TIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
              </div>
            </>
          )}

          {tab === "multislot" && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input type="date" value={multiDate} min={todayDateStr()} onChange={e => setMultiDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Time Slots</label>
                <div className="space-y-2">
                  {slots.map(slot => (
                    <div key={slot.id} className="flex items-center gap-2">
                      <select value={slot.startTime} onChange={e => { const ns = e.target.value; setSlots(prev => prev.map(s => s.id === slot.id ? { ...s, startTime: ns, endTime: addOneHour(ns) } : s)); }}
                        className="flex-1 rounded-lg border border-gray-200 px-2 py-2 text-xs text-gray-900 focus:outline-none bg-white">
                        {TIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <span className="text-xs text-gray-400">–</span>
                      <select value={slot.endTime} onChange={e => setSlots(prev => prev.map(s => s.id === slot.id ? { ...s, endTime: e.target.value } : s))}
                        className="flex-1 rounded-lg border border-gray-200 px-2 py-2 text-xs text-gray-900 focus:outline-none bg-white">
                        {TIME_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      {slots.length > 1 && (
                        <button onClick={() => setSlots(prev => prev.filter(s => s.id !== slot.id))} className="text-gray-300 hover:text-red-400 transition shrink-0">
                          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button onClick={() => {
                  const last = slots[slots.length - 1];
                  const ns = last ? addOneHour(last.endTime) : nextQuarterHour();
                  const capped = ns > "22:00" ? "06:00" : ns;
                  setSlots(prev => [...prev, { id: nextSlotId, startTime: capped, endTime: addOneHour(capped) }]);
                  setNextSlotId(n => n + 1);
                }} className="mt-2 text-xs font-semibold transition" style={{ color: "#001c48" }}>
                  + Add slot
                </button>
              </div>
            </>
          )}

          {tab === "duplicate" && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Source Session</label>
                <select value={dupSourceId} onChange={e => setDupSourceId(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none">
                  <option value="">Pick a session to duplicate…</option>
                  {existingSessions.map(s => (
                    <option key={s.id} value={s.id}>{formatDateLabel(s.date)} · {formatTime(s.startTime)} — {s.title}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Target Dates</label>
                <div className="space-y-2">
                  {dupDates.map((date, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <input type="date" value={date} min={todayDateStr()}
                        onChange={e => setDupDates(prev => prev.map((d, i) => i === idx ? e.target.value : d))}
                        className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none" />
                      {dupDates.length > 1 && (
                        <button onClick={() => setDupDates(prev => prev.filter((_, i) => i !== idx))} className="text-gray-300 hover:text-red-400 transition shrink-0">
                          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" /></svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button onClick={() => setDupDates(prev => [...prev, addDays(prev[prev.length - 1] || todayDateStr(), 7)])}
                  className="mt-2 text-xs font-semibold transition" style={{ color: "#001c48" }}>
                  + Add date
                </button>
              </div>
            </>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Session Type</label>
            <div className="flex gap-2">
              <button onClick={() => setType("individual")} className="flex-1 py-2 text-sm font-semibold rounded-lg transition"
                style={{ backgroundColor: type === "individual" ? "#001c48" : "#f3f4f6", color: type === "individual" ? "white" : "#374151" }}>
                Individual
              </button>
              <button onClick={() => setType("group")} className="flex-1 py-2 text-sm font-semibold rounded-lg transition"
                style={{ backgroundColor: type === "group" ? "#001c48" : "#f3f4f6", color: type === "group" ? "white" : "#374151" }}>
                Group
              </button>
            </div>
          </div>

          {type === "group" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Max Capacity</label>
              <input type="number" min={2} max={100} value={capacity} onChange={e => setCapacity(Math.max(2, parseInt(e.target.value, 10) || 2))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none" />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
            <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Court 1, Main Gym"
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none" />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Any details for athletes…"
              className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none resize-none" />
          </div>

          {drafts.length > 0 && (
            <div className="rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: "rgba(0,28,72,0.05)" }}>
              <p className="font-semibold text-gray-800">
                This will create <span style={{ color: "#001c48" }}>{newDrafts.length}</span> session{newDrafts.length !== 1 ? "s" : ""}
                {skipCount > 0 && <span className="text-gray-400 font-normal"> · skip {skipCount} duplicate{skipCount !== 1 ? "s" : ""}</span>}
              </p>
            </div>
          )}
        </div>

        <div className="px-6 pb-6 pt-3 flex gap-3 border-t border-gray-100">
          <button onClick={onClose} disabled={saving}
            className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition disabled:opacity-50">
            Cancel
          </button>
          <button onClick={handleCreate} disabled={saving || newDrafts.length === 0}
            className="flex-1 rounded-lg py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
            style={{ backgroundColor: "#001c48" }}>
            {saving ? "Creating…" : `Create ${newDrafts.length > 0 ? newDrafts.length : ""} Session${newDrafts.length !== 1 ? "s" : ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

interface CreateSessionModalProps {
  onClose: () => void;
  onCreated: (s: Session) => void;
  coachId: string;
  coachName: string;
  isAdmin: boolean;
  coaches: { uid: string; name: string }[];
  existingSessions: Session[];
}

function CreateSessionModal({ onClose, onCreated, coachId, coachName, isAdmin, coaches, existingSessions }: CreateSessionModalProps) {
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
    if (!date || !startTime || !endTime) {
      setError("Date, start time and end time are required.");
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
      const isDuplicate = existingSessions.some(
        s => s.coachId === effectiveCoachId && s.date === date && s.startTime === startTime && s.status !== "cancelled"
      );
      if (isDuplicate) {
        setError("A session already exists for this coach at this date and time.");
        setSaving(false);
        return;
      }
      const data = {
        title: generateSessionTitle(startTime, effectiveCoachName),
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
              placeholder="Any details for athletes…"
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
  onApproveBooking: (booking: Booking, message: string) => Promise<void>;
  onDeclineBooking: (booking: Booking) => Promise<void>;
}

function SessionDetailModal({ session, onClose, onCancelled, onUpdated, bookings, onApproveBooking, onDeclineBooking }: SessionDetailModalProps) {
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState("");
  const [promoting, setPromoting] = useState<string | null>(null);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [approvingWithMessageId, setApprovingWithMessageId] = useState<string | null>(null);
  const [approvalMessage, setApprovalMessage] = useState("");

  const pendingBookings = bookings.filter(b => b.sessionId === session.id && b.status === "pending_approval");
  const confirmedBooked = Math.max(0, session.bookedBy.length - pendingBookings.length);

  async function handleCancelSession() {
    setCancelling(true);
    setCancelError("");
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, "sessions", session.id), { status: "cancelled" });
      const activeBookings = bookings.filter(
        b => b.sessionId === session.id && b.status !== "cancelled" && b.status !== "declined"
      );
      for (const b of activeBookings) {
        batch.update(doc(db, "bookings", b.id), { status: "cancelled" });
      }
      await batch.commit();
      onCancelled(session.id);
      onClose();
    } catch (err) {
      console.error("[cancel session]", err);
      setCancelError("Failed to cancel session. Please try again.");
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
        status: (confirmedBooked + 1) >= session.maxCapacity ? "full" : "available",
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
                  <div key={b.id} className="rounded-lg px-3 py-2.5" style={{ backgroundColor: "#fef3c7" }}>
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold shrink-0" style={{ backgroundColor: "#fde68a", color: "#92400e" }}>
                        {b.studentName.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{b.studentName}</p>
                        <p className="text-xs text-gray-500 truncate">{b.studentEmail}</p>
                        <p className="text-xs text-gray-400">{new Date(b.createdAt).toLocaleString()}</p>
                      </div>
                      {approvingWithMessageId !== b.id && (
                        <div className="flex flex-col gap-1 shrink-0">
                          <button
                            onClick={() => { setApprovingWithMessageId(b.id); setApprovalMessage(""); }}
                            disabled={decliningId === b.id}
                            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg text-white transition disabled:opacity-50"
                            style={{ backgroundColor: "#22c55e" }}
                          >
                            Approve
                          </button>
                          <button
                            onClick={async () => { setDecliningId(b.id); await onDeclineBooking(b); setDecliningId(null); }}
                            disabled={decliningId === b.id}
                            className="text-xs font-semibold px-2.5 py-1.5 rounded-lg text-white transition disabled:opacity-50 bg-red-500"
                          >
                            {decliningId === b.id ? "…" : "Decline"}
                          </button>
                        </div>
                      )}
                    </div>
                    {approvingWithMessageId === b.id && (
                      <div className="mt-3 space-y-2">
                        <textarea
                          value={approvalMessage}
                          onChange={e => setApprovalMessage(e.target.value)}
                          rows={2}
                          placeholder="e.g. See you at Pro World! Bring your boots."
                          className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-xs text-gray-900 focus:outline-none resize-none"
                        />
                        <p className="text-xs text-amber-700 font-medium">Add a message (optional)</p>
                        <div className="flex items-center gap-3">
                          <button
                            onClick={async () => {
                              setApprovingId(b.id);
                              await onApproveBooking(b, approvalMessage);
                              setApprovingId(null);
                              setApprovingWithMessageId(null);
                              setApprovalMessage("");
                            }}
                            disabled={approvingId === b.id}
                            className="flex-1 text-xs font-semibold py-2 rounded-lg text-white transition disabled:opacity-50"
                            style={{ backgroundColor: "#001c48" }}
                          >
                            {approvingId === b.id ? "…" : "Send Approval"}
                          </button>
                          <button
                            onClick={async () => {
                              setApprovingId(b.id);
                              await onApproveBooking(b, "");
                              setApprovingId(null);
                              setApprovingWithMessageId(null);
                            }}
                            disabled={approvingId === b.id}
                            className="text-xs font-semibold text-gray-500 hover:text-gray-700 transition disabled:opacity-50"
                          >
                            Skip
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <h3 className="text-sm font-semibold text-gray-800 mb-2">Booked ({confirmedBooked})</h3>
            {confirmedBooked === 0 ? (
              <p className="text-sm text-gray-400">No one booked yet.</p>
            ) : (
              <div className="space-y-2">
                {session.bookedBy.filter(b => !pendingBookings.some(p => p.studentId === b.uid)).map(b => (
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
              <p className="text-sm text-red-700 font-medium text-center">Cancel this session for all athletes?</p>
              {cancelError && <p className="text-xs text-red-600 bg-red-50 rounded-lg px-3 py-2 text-center">{cancelError}</p>}
              <div className="flex gap-2">
                <button
                  onClick={() => { setConfirmCancel(false); setCancelError(""); }}
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
              onClick={() => { setConfirmCancel(true); setCancelError(""); }}
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
  const { user, loading: authLoading } = useAuth();

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
  const [activeTab, setActiveTab] = useState<"all" | "available" | "booked" | "pending">("all");
  const [refreshing, setRefreshing] = useState(false);
  const [athletes, setAthletes] = useState<{ uid: string; name: string }[]>([]);
  const [filterAthlete, setFilterAthlete] = useState("");
  const [filterType, setFilterType] = useState<"" | "individual" | "group">("");
  const [showBatchCreate, setShowBatchCreate] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }

    let unsubBookings: (() => void) | null = null;
    let unsubSessions: (() => void) | null = null;

    setUid(user.uid);

    (async () => {
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
          const coachSnap = await getDocs(query(collection(db, "users"), where("role", "in", ["coach", "admin"])));
          const coachList = coachSnap.docs
            .filter(d => {
              const name = (d.data().fullName as string | undefined) ?? "";
              return name.trim().length > 0;
            })
            .map(d => ({ uid: d.id, name: d.data().fullName as string }));
          setCoaches(coachList);
        }

        // Load athletes for filter dropdown (all coaches + admins can filter by athlete)
        const athletesSnap = await getDocs(query(collection(db, "users"), where("role", "==", "student")));
        const athleteList = athletesSnap.docs
          .filter(d => (d.data().fullName as string | undefined)?.trim())
          .map(d => ({ uid: d.id, name: d.data().fullName as string }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setAthletes(athleteList);

        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

        // Real-time listener for sessions — picks up status changes (e.g. full after approval)
        unsubSessions = onSnapshot(collection(db, "sessions"), (snap) => {
          const list: Session[] = snap.docs
            .map(d => ({
              id: d.id,
              ...(d.data() as Omit<Session, "id">),
              bookedBy: d.data().bookedBy ?? [],
              waitlist: d.data().waitlist ?? [],
            }))
            .filter(s => s.status !== "cancelled" && s.date >= todayStr)
            .sort((a, b) => (a.date + "T" + a.startTime).localeCompare(b.date + "T" + b.startTime));
          setSessions(list);
        }, (err) => {
          console.error("[coach/calendar] sessions listener error:", err);
        });

        // Real-time listener: admins see all bookings, coaches see their own
        const bookingsQ = userIsAdmin
          ? collection(db, "bookings")
          : query(collection(db, "bookings"), where("coachId", "==", user.uid));

        unsubBookings = onSnapshot(bookingsQ, (snap) => {
          const bookingList: Booking[] = snap.docs
            .map(d => ({ id: d.id, ...(d.data() as Omit<Booking, "id">) }))
            .filter(b => b.status !== "cancelled");
          setBookings(prev => {
            // For any booking already confirmed locally, don't downgrade it back to pending_approval
            // from a snapshot that may be slightly behind the Firestore write
            return bookingList.map(b => {
              const existing = prev.find(p => p.id === b.id);
              if (existing?.status === "confirmed" && b.status === "pending_approval") return existing;
              return b;
            });
          });
          setLoading(false);
        }, (err) => {
          console.error("[coach/calendar] bookings listener error:", err);
          setLoading(false);
        });

      } catch (err) {
        console.error("[coach/calendar]", err);
        setLoading(false);
      }
    })();

    return () => {
      if (unsubBookings) unsubBookings();
      if (unsubSessions) unsubSessions();
    };
  }, [authLoading, user, router]);

  async function handleRefresh() {
    if (refreshing || !uid) return;
    setRefreshing(true);
    try {
      // Sessions and bookings update automatically via onSnapshot listeners.
      // Only re-fetch the coaches list here (admin only, infrequently changes).
      if (isAdmin) {
        const coachSnap = await getDocs(query(collection(db, "users"), where("role", "==", "coach")));
        setCoaches(coachSnap.docs.map(d => ({
          uid: d.id,
          name: (d.data().fullName as string) ?? (d.data().name as string) ?? "Coach",
        })));
      }
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
  useEffect(() => {
    if (!selectedSession) return;
    const updated = sessions.find(s => s.id === selectedSession.id);
    if (updated) setSelectedSession(updated);
  }, [sessions]);

  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  function makeDayStr(day: number): string {
    return `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  async function handleApproveBooking(booking: Booking, message: string) {
    try {
      const verifyQuery = query(
        collection(db, "bookings"),
        where("sessionId", "==", booking.sessionId),
        where("studentId", "==", booking.studentId),
        where("status", "==", "pending_approval")
      );
      const verifySnap = await getDocs(verifyQuery);

      if (booking.id === verifySnap.docs[0]?.id || verifySnap.size > 0) {
        const docId = verifySnap.size > 0 ? verifySnap.docs[0].id : booking.id;
        const update: Record<string, string> = { status: "confirmed" };
        if (message.trim()) update.approvalMessage = message.trim();
        await updateDoc(doc(db, "bookings", docId), update);

        // Update both bookings and sessions state together so React batches into one render.
        // bookedBy already contains the approved student (added at booking time), so
        // bookedBy.length is the correct confirmed count after approval.
        const sessionToUpdate = sessions.find(s => s.id === booking.sessionId);
        const newSessionStatus = sessionToUpdate
          ? (sessionToUpdate.bookedBy.length >= sessionToUpdate.maxCapacity ? "full" : "available")
          : null;
        const updatedSession = sessionToUpdate && newSessionStatus
          ? { ...sessionToUpdate, status: newSessionStatus as Session["status"] }
          : null;

        flushSync(() => {
          setBookings(prev => prev.map(b =>
            b.id === docId ? { ...b, status: "confirmed", approvalMessage: message.trim() || undefined } : b
          ));
          if (updatedSession) {
            setSessions(prev => prev.map(s => s.id === booking.sessionId ? updatedSession : s));
            if (selectedSession?.id === booking.sessionId) setSelectedSession(updatedSession);
          }
        });
        if (updatedSession) {
          await updateDoc(doc(db, "sessions", booking.sessionId), { status: newSessionStatus });
        }
      } else {
        console.error("[approve] ✗ no matching pending_approval booking found in Firestore — cannot update");
      }
    } catch (err) {
      console.error("[approve] ✗ error:", err);
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
      setBookings(prev => prev.map(b => b.id === booking.id ? { ...b, status: "declined" } : b));
    } catch (err) {
      console.error("[decline booking]", err);
    }
  }

  // Tab-filtered session lists (selectedDate and user filters apply on top)
  const baseSessions = selectedDate ? sessions.filter(s => s.date === selectedDate) : sessions;

  const filteredBase = baseSessions.filter(s => {
    if (filterType && s.type !== filterType) return false;
    if (filterAthlete &&
        !s.bookedBy.some(b => b.uid === filterAthlete) &&
        !s.waitlist.some(w => w.uid === filterAthlete)) return false;
    return true;
  });

  const allTabSessions = filteredBase;
  const availableTabSessions = filteredBase.filter(s => {
    const confirmed = confirmedBookedCount(s, bookings);
    const pending = bookings.filter(b => b.sessionId === s.id && b.status === "pending_approval").length;
    return confirmed === 0 && pending === 0;
  });
  const bookedTabSessions = filteredBase.filter(s =>
    confirmedBookedCount(s, bookings) > 0
  );
  const pendingTabSessions = filteredBase.filter(s =>
    bookings.some(b => b.sessionId === s.id && b.status === "pending_approval")
  );

  const tabSessions =
    activeTab === "all" ? allTabSessions :
    activeTab === "available" ? availableTabSessions :
    activeTab === "booked" ? bookedTabSessions :
    pendingTabSessions;

  const emptyMessages: Record<"all" | "available" | "booked" | "pending", string> = {
    all: "No upcoming sessions",
    available: "No empty sessions",
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
              onClick={() => setShowBatchCreate(true)}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ backgroundColor: "rgba(255,255,255,0.10)" }}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5M3.75 6h16.5M3.75 18h16.5" />
              </svg>
              Batch
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
        {(["all", "available", "booked", "pending"] as const).map(tab => {
          const allCount = sessions.length;
          const availableCount = availableTabSessions.length;
          const bookedCount = bookedTabSessions.length;
          const pendingCount = pendingTabSessions.length;
          const count = tab === "all" ? allCount : tab === "available" ? availableCount : tab === "booked" ? bookedCount : pendingCount;
          const baseLabel = tab === "all" ? "All Sessions" : tab === "available" ? "Available" : tab === "booked" ? "Booked" : "Pending Approval";
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

      {/* Filters */}
      <div className="px-4 pt-3 pb-2 flex gap-2 bg-white border-b border-gray-100">
        <select
          value={filterAthlete}
          onChange={e => setFilterAthlete(e.target.value)}
          className="flex-1 text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-2 py-2 focus:outline-none"
          style={filterAthlete ? { borderColor: "#001c48", color: "#001c48", backgroundColor: "rgba(0,28,72,0.04)" } : undefined}
        >
          <option value="">All Athletes</option>
          {athletes.map(a => <option key={a.uid} value={a.uid}>{a.name}</option>)}
        </select>
        <select
          value={filterType}
          onChange={e => setFilterType(e.target.value as "" | "individual" | "group")}
          className="flex-1 text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-2 py-2 focus:outline-none"
          style={filterType ? { borderColor: "#001c48", color: "#001c48", backgroundColor: "rgba(0,28,72,0.04)" } : undefined}
        >
          <option value="">All Types</option>
          <option value="individual">Individual</option>
          <option value="group">Group</option>
        </select>
        {(filterAthlete || filterType) && (
          <button
            onClick={() => { setFilterAthlete(""); setFilterType(""); }}
            className="shrink-0 px-3 py-2 rounded-lg text-xs font-semibold transition"
            style={{ backgroundColor: "#001c48", color: "#01fff9" }}
          >
            Clear
          </button>
        )}
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
            const pendingCount = bookings.filter(b => b.sessionId === s.id && b.status === "pending_approval").length;
            const isFull = s.status === "full" || confirmed >= s.maxCapacity;
            const barColor = isFull ? "#ef4444" : confirmed > 0 ? "#001c48" : pendingCount > 0 ? "#f59e0b" : "#22c55e";
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
                    {isFull ? (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: "#fee2e2", color: "#ef4444" }}>
                        Full
                      </span>
                    ) : confirmed > 0 ? (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: "#001c4815", color: "#001c48" }}>
                        {confirmed}/{s.maxCapacity} Booked
                      </span>
                    ) : pendingCount === 0 ? (
                      <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: "#dcfce7", color: "#16a34a" }}>
                        Available
                      </span>
                    ) : null}
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, (confirmed / s.maxCapacity) * 100)}%`,
                        backgroundColor: barColor,
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
      {showBatchCreate && (
        <BatchCreateModal
          onClose={() => setShowBatchCreate(false)}
          coachId={coachId}
          coachName={coachName}
          isAdmin={isAdmin}
          coaches={coaches}
          existingSessions={sessions}
        />
      )}

      {showCreate && (
        <CreateSessionModal
          onClose={() => setShowCreate(false)}
          onCreated={s => setSessions(prev => [...prev, s].sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime)))}
          coachId={coachId}
          coachName={coachName}
          isAdmin={isAdmin}
          coaches={coaches}
          existingSessions={sessions}
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
