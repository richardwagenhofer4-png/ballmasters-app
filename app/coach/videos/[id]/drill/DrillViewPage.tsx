"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, getDocs, query, updateDoc, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

interface DrillDoc {
  id: string;
  title: string;
  coachId: string;
  coachName: string;
  coachVideoKey: string;
  studentVideoKey: string;
  studentIds: string[];
  viewedBy: string[];
  downloadAllowed: boolean;
  status: "published" | "draft";
  layout: "side_by_side" | "stacked" | "tabs";
  syncPlayback: boolean;
  createdAt: string;
}

interface Student {
  id: string;
  fullName: string;
  email: string;
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  } catch { return ""; }
}

function LabelBar({ text, side }: { text: string; side: "coach" | "student" }) {
  return (
    <div style={{
      position: "absolute", top: 0, left: 0, right: 0, zIndex: 10,
      padding: "3px 10px", fontSize: 11, fontWeight: 700, color: "white",
      backgroundColor: side === "coach" ? "rgba(26,107,69,0.85)" : "rgba(0,0,0,0.6)",
      letterSpacing: "0.03em", pointerEvents: "none",
    }}>
      {text}
    </div>
  );
}

export default function DrillViewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const coachRef = useRef<HTMLVideoElement>(null);
  const studentRef = useRef<HTMLVideoElement>(null);
  const syncingRef = useRef(false);

  const [drill, setDrill] = useState<DrillDoc | null>(null);
  const [coachVideoUrl, setCoachVideoUrl] = useState<string | null>(null);
  const [studentVideoUrl, setStudentVideoUrl] = useState<string | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState<"coach" | "student">("coach");

  // Edit modal state
  const [editOpen, setEditOpen] = useState(false);
  const [allStudents, setAllStudents] = useState<Student[]>([]);
  const [editTitle, setEditTitle] = useState("");
  const [editStudentIds, setEditStudentIds] = useState<Set<string>>(new Set());
  const [editStatus, setEditStatus] = useState<"published" | "draft">("published");
  const [editStudentSearch, setEditStudentSearch] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push("/login"); return; }
      try {
        const idToken = await user.getIdToken();

        // Fetch presigned URLs from the API
        const res = await fetch(`/api/videos/${id}`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (!res.ok) {
          const { error: msg } = await res.json().catch(() => ({}));
          throw new Error(msg ?? "Failed to load drill");
        }
        const data = await res.json();

        if (!data.coachVideoUrl || !data.studentVideoUrl) {
          throw new Error("This video is not a drill comparison.");
        }

        // Load Firestore doc for full metadata
        const snap = await getDoc(doc(db, "videos", id));
        if (!snap.exists()) throw new Error("Drill not found.");
        const raw = snap.data();

        const drillDoc: DrillDoc = {
          id: snap.id,
          title: raw.title ?? "Untitled",
          coachId: raw.coachId ?? "",
          coachName: raw.coachName ?? "",
          coachVideoKey: raw.coachVideoKey ?? "",
          studentVideoKey: raw.studentVideoKey ?? "",
          studentIds: raw.studentIds ?? [],
          viewedBy: raw.viewedBy ?? [],
          downloadAllowed: raw.downloadAllowed ?? false,
          status: raw.status ?? "published",
          layout: raw.layout ?? "side_by_side",
          syncPlayback: raw.syncPlayback ?? true,
          createdAt: raw.createdAt ?? "",
        };
        setDrill(drillDoc);
        setCoachVideoUrl(data.coachVideoUrl);
        setStudentVideoUrl(data.studentVideoUrl);

        // Load assigned students
        if (drillDoc.studentIds.length > 0) {
          const studentsSnap = await getDocs(
            query(collection(db, "users"), where("role", "==", "student"))
          );
          const all = studentsSnap.docs.map(d => ({
            id: d.id,
            fullName: (d.data().fullName as string) ?? "Student",
            email: (d.data().email as string) ?? "",
          }));
          setAllStudents(all);
          setStudents(all.filter(s => drillDoc.studentIds.includes(s.id)));
        } else {
          const studentsSnap = await getDocs(
            query(collection(db, "users"), where("role", "==", "student"))
          );
          setAllStudents(studentsSnap.docs.map(d => ({
            id: d.id,
            fullName: (d.data().fullName as string) ?? "Student",
            email: (d.data().email as string) ?? "",
          })));
        }
      } catch (err: unknown) {
        setError((err as Error).message ?? "Failed to load drill.");
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, [id, router]);

  // Sync playback helpers
  function syncPlay(source: "coach" | "student") {
    if (!drill?.syncPlayback || syncingRef.current) return;
    syncingRef.current = true;
    const target = source === "coach" ? studentRef.current : coachRef.current;
    target?.play().catch(() => {});
    syncingRef.current = false;
  }

  function syncPause(source: "coach" | "student") {
    if (!drill?.syncPlayback || syncingRef.current) return;
    syncingRef.current = true;
    (source === "coach" ? studentRef.current : coachRef.current)?.pause();
    syncingRef.current = false;
  }

  function syncSeek(source: "coach" | "student") {
    if (!drill?.syncPlayback || syncingRef.current) return;
    const srcRef = source === "coach" ? coachRef : studentRef;
    const tgtRef = source === "coach" ? studentRef : coachRef;
    if (!srcRef.current || !tgtRef.current) return;
    const target = srcRef.current.currentTime;
    if (Math.abs(tgtRef.current.currentTime - target) > 0.15) {
      syncingRef.current = true;
      tgtRef.current.currentTime = target;
      setTimeout(() => { syncingRef.current = false; }, 200);
    }
  }

  function openEdit() {
    if (!drill) return;
    setEditTitle(drill.title);
    setEditStudentIds(new Set(drill.studentIds));
    setEditStatus(drill.status);
    setEditStudentSearch("");
    setEditOpen(true);
  }

  async function saveEdit() {
    if (!drill || !editTitle.trim()) return;
    setEditSaving(true);
    try {
      const updated = {
        title: editTitle.trim(),
        studentIds: Array.from(editStudentIds),
        status: editStatus,
      };
      await updateDoc(doc(db, "videos", id), updated);
      setDrill(prev => prev ? { ...prev, ...updated } : prev);
      setStudents(allStudents.filter(s => editStudentIds.has(s.id)));
      setEditOpen(false);
    } catch (err) {
      console.error("[drill/edit]", err);
    } finally {
      setEditSaving(false);
    }
  }

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

  if (error) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-red-400 font-medium mb-4">{error}</p>
          <Link href="/coach/videos" className="text-sm font-semibold text-green-400 hover:text-green-300">
            ← Back to videos
          </Link>
        </div>
      </main>
    );
  }

  if (!drill || !coachVideoUrl || !studentVideoUrl) return null;

  const controlsList = drill.downloadAllowed ? undefined : "nodownload";

  const coachPanel = (maxH: string, extraStyle?: React.CSSProperties) => (
    <div style={{ position: "relative", lineHeight: 0, flex: 1, ...extraStyle }}>
      <LabelBar text="Coach Demo" side="coach" />
      <video
        ref={coachRef}
        src={coachVideoUrl}
        controls
        controlsList={controlsList}
        className="w-full bg-black"
        style={{ maxHeight: maxH, display: "block" }}
        playsInline
        onPlay={() => syncPlay("coach")}
        onPause={() => syncPause("coach")}
        onSeeked={() => syncSeek("coach")}
      />
    </div>
  );

  const studentPanel = (maxH: string, extraStyle?: React.CSSProperties) => (
    <div style={{ position: "relative", lineHeight: 0, flex: 1, ...extraStyle }}>
      <LabelBar text="Student Attempt" side="student" />
      <video
        ref={studentRef}
        src={studentVideoUrl}
        controls
        controlsList={controlsList}
        className="w-full bg-black"
        style={{ maxHeight: maxH, display: "block" }}
        playsInline
        onPlay={() => syncPlay("student")}
        onPause={() => syncPause("student")}
        onSeeked={() => syncSeek("student")}
      />
    </div>
  );

  function VideoSection() {
    if (drill!.layout === "side_by_side") {
      return (
        <div className="bg-black shrink-0 flex" style={{ gap: 2 }}>
          {coachPanel("42vh")}
          {studentPanel("42vh")}
        </div>
      );
    }
    if (drill!.layout === "stacked") {
      return (
        <div className="bg-black shrink-0">
          {coachPanel("38vh")}
          <div style={{ height: 2, backgroundColor: "#111" }} />
          {studentPanel("38vh")}
        </div>
      );
    }
    // tabs
    return (
      <div className="bg-black shrink-0">
        <div className="flex bg-gray-900 border-b border-gray-800">
          {(["coach", "student"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className="flex-1 py-2 text-sm font-semibold transition"
              style={{
                color: activeTab === tab ? "#4ade80" : "#9ca3af",
                borderBottom: activeTab === tab ? "2px solid #4ade80" : "2px solid transparent",
              }}
            >
              {tab === "coach" ? "Coach Demo" : "Student Attempt"}
            </button>
          ))}
        </div>
        <div style={{ display: activeTab === "coach" ? "block" : "none" }}>{coachPanel("52vh")}</div>
        <div style={{ display: activeTab === "student" ? "block" : "none" }}>{studentPanel("52vh")}</div>
      </div>
    );
  }

  const editFilteredStudents = editStudentSearch.trim()
    ? allStudents.filter(s => {
        const q = editStudentSearch.toLowerCase();
        return s.fullName.toLowerCase().includes(q) || s.email.toLowerCase().includes(q);
      })
    : allStudents;

  return (
    <main className="min-h-screen bg-gray-950 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 shrink-0">
        <Link href="/coach/videos" className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition">
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
          </svg>
          Videos
        </Link>
        <img src="/logo-light.png" alt="Ball Masters Florida" style={{ height: "32px", width: "auto" }} />
        <button
          onClick={openEdit}
          className="flex items-center gap-1 text-sm font-semibold transition"
          style={{ color: "#4ade80" }}
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
          </svg>
          Edit
        </button>
      </div>

      {/* Video section */}
      <VideoSection />

      {/* Scrollable metadata */}
      <div className="flex-1 overflow-y-auto">
        {/* Title block */}
        <div className="bg-gray-900 px-5 py-4 shrink-0">
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: "#1e1b4b", color: "#a78bfa" }}>
              Drill Comparison
            </span>
            {drill.syncPlayback && (
              <span className="text-xs text-gray-500">· Synced playback</span>
            )}
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={drill.status === "published"
                ? { backgroundColor: "#001c48", color: "#01fff9" }
                : { backgroundColor: "#374151", color: "#9ca3af" }}
            >
              {drill.status === "published" ? "Published" : "Draft"}
            </span>
          </div>
          <h1 className="text-lg font-bold text-white leading-snug mt-1">{drill.title}</h1>
          <p className="text-sm text-gray-400 mt-1">{formatDate(drill.createdAt)}</p>
        </div>

        {/* Students */}
        <div className="bg-gray-900 border-t border-gray-800 px-5 py-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Assigned Students</p>
          {students.length === 0 ? (
            <p className="text-sm text-gray-500">No students assigned yet.</p>
          ) : (
            <div className="space-y-2">
              {students.map(s => (
                <div key={s.id} className="flex items-center gap-3">
                  <div
                    className="h-8 w-8 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
                    style={{ backgroundColor: "#dbeafe", color: "#001c48" }}
                  >
                    {s.fullName.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-white truncate">{s.fullName}</p>
                    <p className="text-xs text-gray-500 truncate">{s.email}</p>
                  </div>
                  {drill.viewedBy.includes(s.id) ? (
                    <div className="ml-auto flex items-center gap-1 text-xs font-medium shrink-0" style={{ color: "#4ade80" }}>
                      <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                      </svg>
                      Watched
                    </div>
                  ) : (
                    <span className="ml-auto text-xs text-gray-600 shrink-0">Not watched</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Edit modal */}
      {editOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/60" onClick={() => !editSaving && setEditOpen(false)} />
          <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md flex flex-col" style={{ maxHeight: "85vh" }}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Edit Drill</h2>
              <button onClick={() => !editSaving && setEditOpen(false)} className="text-gray-400 hover:text-gray-600">
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>

            <div className="overflow-y-auto flex-1 px-6 py-5 space-y-5">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 px-3 py-2.5 text-sm text-gray-900 focus:outline-none"
                  onFocus={e => (e.target.style.borderColor = "#001c48")}
                  onBlur={e => (e.target.style.borderColor = "#e5e7eb")}
                />
              </div>

              {/* Students */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">Assigned Students</label>
                  {editStudentIds.size > 0 && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(1,255,249,0.1)", color: "#001c48" }}>
                      {editStudentIds.size} selected
                    </span>
                  )}
                </div>
                <div className="rounded-xl border border-gray-200 overflow-hidden">
                  <div className="border-b border-gray-100 px-3 py-2 flex items-center gap-2">
                    <svg className="h-4 w-4 text-gray-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
                    </svg>
                    <input
                      type="text"
                      value={editStudentSearch}
                      onChange={e => setEditStudentSearch(e.target.value)}
                      placeholder="Search students…"
                      className="w-full text-sm text-gray-700 placeholder-gray-400 focus:outline-none bg-transparent"
                    />
                  </div>
                  <div className="max-h-40 overflow-y-auto divide-y divide-gray-50">
                    {editFilteredStudents.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-gray-400">No students found.</p>
                    ) : (
                      editFilteredStudents.map(s => {
                        const checked = editStudentIds.has(s.id);
                        return (
                          <label key={s.id} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => {
                                setEditStudentIds(prev => {
                                  const next = new Set(prev);
                                  next.has(s.id) ? next.delete(s.id) : next.add(s.id);
                                  return next;
                                });
                              }}
                              className="h-4 w-4 rounded accent-emerald-700"
                            />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-gray-800 truncate">{s.fullName}</p>
                              <p className="text-xs text-gray-400 truncate">{s.email}</p>
                            </div>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditStatus("published")}
                    className="flex-1 py-2 text-sm font-semibold rounded-lg transition"
                    style={{ backgroundColor: editStatus === "published" ? "#001c48" : "#f3f4f6", color: editStatus === "published" ? "white" : "#374151" }}
                  >
                    Published
                  </button>
                  <button
                    onClick={() => setEditStatus("draft")}
                    className="flex-1 py-2 text-sm font-semibold rounded-lg transition"
                    style={{ backgroundColor: editStatus === "draft" ? "#374151" : "#f3f4f6", color: editStatus === "draft" ? "white" : "#374151" }}
                  >
                    Draft
                  </button>
                </div>
              </div>
            </div>

            <div className="px-6 pb-6 pt-3 flex gap-3 border-t border-gray-100">
              <button
                onClick={() => setEditOpen(false)}
                disabled={editSaving}
                className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={editSaving || !editTitle.trim()}
                className="flex-1 rounded-lg py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: "#001c48" }}
              >
                {editSaving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
