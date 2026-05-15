"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import {
  collection, deleteDoc, doc, getDocs, query, updateDoc, where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { clearAuthCookies } from "@/lib/cookies";
import { sendVideoNotification } from "@/lib/notifications";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Video {
  id: string;
  title: string;
  coachName: string;
  type?: string;
  coachVideoKey?: string;
  studentIds: string[];
  viewedBy: string[];
  downloadAllowed: boolean;
  status: "published" | "draft";
  createdAt: string;
}

interface Student {
  id: string;
  fullName: string;
  email: string;
}

type StatusFilter = "all" | "published" | "draft";
type TypeFilter = "all" | "standard" | "drill";
type SortBy = "newest" | "oldest" | "most_watched" | "least_watched";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return ""; }
}

function watchRate(v: Video): number | null {
  if (v.studentIds.length === 0) return null;
  return Math.round(v.studentIds.filter(sid => v.viewedBy.includes(sid)).length / v.studentIds.length * 100);
}

function rateColor(rate: number): string {
  if (rate >= 75) return "#01fff9";
  if (rate >= 50) return "#d97706";
  return "#dc2626";
}

// ---------------------------------------------------------------------------
// Nav
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
function InviteIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M19.902 4.098a3.75 3.75 0 00-5.304 0l-4.5 4.5a3.75 3.75 0 001.035 6.037.75.75 0 01-.646 1.353 5.25 5.25 0 01-1.449-8.45l4.5-4.5a5.25 5.25 0 117.424 7.424l-1.757 1.757a.75.75 0 11-1.06-1.06l1.757-1.757a3.75 3.75 0 000-5.304zm-7.389 4.267a.75.75 0 011-.353 5.25 5.25 0 011.449 8.45l-4.5 4.5a5.25 5.25 0 11-7.424-7.424l1.757-1.757a.75.75 0 111.06 1.06l-1.757 1.757a3.75 3.75 0 105.304 5.304l4.5-4.5a3.75 3.75 0 00-1.035-6.037.75.75 0 01-.354-1z" clipRule="evenodd" /></svg>;
}
function SettingsIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.493 7.493 0 00-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 00-2.282.819l-.922 1.597a1.875 1.875 0 00.432 2.385l.84.692c.095.078.17.229.154.43a7.598 7.598 0 000 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 00-.432 2.385l.922 1.597a1.875 1.875 0 002.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 002.28-.819l.923-1.597a1.875 1.875 0 00-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.614 7.614 0 000-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 00-2.282-.818l-1.02.382c-.114.043-.282.031-.449-.083a7.49 7.49 0 00-.985-.57c-.183-.087-.277-.227-.297-.348l-.179-1.072a1.875 1.875 0 00-1.85-1.567h-1.843zM12 15.75a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z" clipRule="evenodd" /></svg>;
}

const NAV_ITEMS = [
  { href: "/coach/dashboard", label: "Home", Icon: HomeIcon },
  { href: "/coach/videos", label: "Videos", Icon: VideoIcon },
  { href: "/coach/students", label: "Students", Icon: StudentsIcon },
  { href: "/coach/invite", label: "Invite", Icon: InviteIcon },
  { href: "/coach/settings", label: "Settings", Icon: SettingsIcon },
];

// ---------------------------------------------------------------------------
// Student Avatars
// ---------------------------------------------------------------------------

function StudentAvatars({ ids, students }: { ids: string[]; students: Student[] }) {
  const shown = ids.slice(0, 3).map(id => students.find(s => s.id === id)).filter(Boolean) as Student[];
  const extra = ids.length - 3;
  if (ids.length === 0) return <span className="text-xs text-gray-400">No students</span>;
  return (
    <div className="flex items-center gap-1">
      <div className="flex" style={{ gap: -4 }}>
        {shown.map((s, i) => (
          <div
            key={s.id}
            className="h-5 w-5 rounded-full flex items-center justify-center text-xs font-bold border border-white"
            style={{ backgroundColor: "#dbeafe", color: "#001c48", marginLeft: i > 0 ? -6 : 0, zIndex: 3 - i, position: "relative" }}
          >
            {s.fullName.charAt(0).toUpperCase()}
          </div>
        ))}
        {extra > 0 && (
          <div
            className="h-5 w-5 rounded-full flex items-center justify-center text-xs font-bold border border-white"
            style={{ backgroundColor: "#f3f4f6", color: "#6b7280", marginLeft: -6, position: "relative" }}
          >
            +{extra}
          </div>
        )}
      </div>
      <span className="text-xs text-gray-500">{ids.length} student{ids.length !== 1 ? "s" : ""}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CoachVideosPage() {
  const router = useRouter();
  const pathname = usePathname();

  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState<string | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [students, setStudents] = useState<Student[]>([]);

  // Filters
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("all");
  const [sortBy, setSortBy] = useState<SortBy>("newest");

  // Edit modal
  const [editingVideo, setEditingVideo] = useState<Video | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editStudentIds, setEditStudentIds] = useState<Set<string>>(new Set());
  const [editDownloadAllowed, setEditDownloadAllowed] = useState(false);
  const [editStatus, setEditStatus] = useState<"published" | "draft">("published");
  const [editStudentSearch, setEditStudentSearch] = useState("");
  const [editSaving, setEditSaving] = useState(false);

  // Delete modal
  const [deletingVideo, setDeletingVideo] = useState<Video | null>(null);
  const [deleteConfirming, setDeleteConfirming] = useState(false);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push("/login"); return; }
      setUid(user.uid);
      try {
        const [videosSnap, studentsSnap] = await Promise.all([
          getDocs(collection(db, "videos")),
          getDocs(query(collection(db, "users"), where("role", "==", "student"))),
        ]);
        setVideos(videosSnap.docs.map(d => ({
          id: d.id,
          title: (d.data().title as string) ?? "Untitled",
          coachName: (d.data().coachName as string) ?? "",
          type: d.data().type as string | undefined,
          coachVideoKey: d.data().coachVideoKey as string | undefined,
          studentIds: (d.data().studentIds as string[]) ?? [],
          viewedBy: (d.data().viewedBy as string[]) ?? [],
          downloadAllowed: (d.data().downloadAllowed as boolean) ?? false,
          status: (d.data().status as "published" | "draft") ?? "published",
          createdAt: (d.data().createdAt as string) ?? "",
        })));
        setStudents(studentsSnap.docs.map(d => ({
          id: d.id,
          fullName: (d.data().fullName as string) ?? "Student",
          email: (d.data().email as string) ?? "",
        })));
      } catch (err) {
        console.error("[coach/videos]", err);
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, [router]);

  // Filtered + sorted videos
  const filtered = useMemo(() => {
    let result = [...videos];
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(v => v.title.toLowerCase().includes(q));
    }
    if (statusFilter !== "all") result = result.filter(v => v.status === statusFilter);
    if (typeFilter === "standard") result = result.filter(v => (!v.type || v.type === "standard") && !v.coachVideoKey);
    if (typeFilter === "drill") result = result.filter(v => v.type === "drill_comparison" || !!v.coachVideoKey);
    switch (sortBy) {
      case "newest": result.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()); break;
      case "oldest": result.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()); break;
      case "most_watched": result.sort((a, b) => (watchRate(b) ?? -1) - (watchRate(a) ?? -1)); break;
      case "least_watched": result.sort((a, b) => (watchRate(a) ?? 101) - (watchRate(b) ?? 101)); break;
    }
    return result;
  }, [videos, search, statusFilter, typeFilter, sortBy]);

  const editFilteredStudents = useMemo(() => {
    const q = editStudentSearch.toLowerCase();
    if (!q) return students;
    return students.filter(s => s.fullName.toLowerCase().includes(q) || s.email.toLowerCase().includes(q));
  }, [students, editStudentSearch]);

  // Open edit modal
  function openEdit(v: Video) {
    setEditingVideo(v);
    setEditTitle(v.title);
    setEditStudentIds(new Set(v.studentIds));
    setEditDownloadAllowed(v.downloadAllowed);
    setEditStatus(v.status);
    setEditStudentSearch("");
  }

  // Save edit
  async function saveEdit() {
    if (!editingVideo || !editTitle.trim()) return;
    setEditSaving(true);
    try {
      const updated = {
        title: editTitle.trim(),
        studentIds: Array.from(editStudentIds),
        downloadAllowed: editDownloadAllowed,
        status: editStatus,
      };
      await updateDoc(doc(db, "videos", editingVideo.id), updated);
      setVideos(prev => prev.map(v => v.id === editingVideo.id ? { ...v, ...updated } : v));

      const wasPublishedNow = editStatus === "published" && editingVideo.status !== "published";
      if (wasPublishedNow && updated.studentIds.length > 0) {
        sendVideoNotification(updated.studentIds, updated.title, editingVideo.id).catch(console.error);
      }

      setEditingVideo(null);
    } catch (err) {
      console.error("[edit video]", err);
    } finally {
      setEditSaving(false);
    }
  }

  // Confirm delete
  async function confirmDelete() {
    if (!deletingVideo) return;
    setDeleteConfirming(true);
    try {
      await deleteDoc(doc(db, "videos", deletingVideo.id));
      setVideos(prev => prev.filter(v => v.id !== deletingVideo.id));
      setDeletingVideo(null);
    } catch (err) {
      console.error("[delete video]", err);
    } finally {
      setDeleteConfirming(false);
    }
  }

  async function handleSignOut() {
    await signOut(auth);
    clearAuthCookies();
    router.push("/login");
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

  return (
    <main className="min-h-screen bg-gray-50 pb-20">

      {/* ------------------------------------------------------------------ */}
      {/* Header                                                               */}
      {/* ------------------------------------------------------------------ */}
      <div style={{ backgroundColor: "#001c48" }} className="pt-12 pb-4 px-4">
        <div className="flex items-center justify-between mb-1">
          <img src="/logo-light.png" alt="Ball Masters Florida" style={{ width: 80, height: "auto" }} />
          <button onClick={handleSignOut} className="hover:text-white transition text-xs font-medium flex items-center gap-1" style={{ color: "rgba(1,255,249,0.7)" }}>
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign out
          </button>
        </div>
        <div className="flex items-center justify-between mt-3">
          <div>
            <h1 className="text-2xl font-extrabold text-white leading-tight">My Videos</h1>
            <p className="text-xs mt-0.5" style={{ color: "#01fff9" }}>{videos.length} video{videos.length !== 1 ? "s" : ""} total</p>
          </div>
          <Link href="/coach/upload">
            <button
              className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition hover:opacity-90 active:opacity-80"
              style={{ backgroundColor: "white", color: "#001c48" }}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Upload New
            </button>
          </Link>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Filters                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="bg-white border-b border-gray-200 px-4 py-3 space-y-2.5">
        {/* Search */}
        <div className="relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search videos…"
            className="w-full pl-9 pr-4 py-2 text-sm text-gray-900 placeholder-gray-400 border border-gray-200 rounded-lg focus:outline-none"
            onFocus={e => (e.target.style.borderColor = "#001c48")}
            onBlur={e => (e.target.style.borderColor = "#e5e7eb")}
          />
        </div>

        {/* Filter selects */}
        <div className="flex gap-2">
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as StatusFilter)}
            className="flex-1 text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-2 py-2 focus:outline-none"
          >
            <option value="all">All Status</option>
            <option value="published">Published</option>
            <option value="draft">Draft</option>
          </select>
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as TypeFilter)}
            className="flex-1 text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-2 py-2 focus:outline-none"
          >
            <option value="all">All Types</option>
            <option value="standard">Standard</option>
            <option value="drill">Drill</option>
          </select>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as SortBy)}
            className="flex-1 text-xs text-gray-700 bg-gray-50 border border-gray-200 rounded-lg px-2 py-2 focus:outline-none"
          >
            <option value="newest">Newest</option>
            <option value="oldest">Oldest</option>
            <option value="most_watched">Most Watched</option>
            <option value="least_watched">Least Watched</option>
          </select>
        </div>

        {/* Active filter count */}
        {(search || statusFilter !== "all" || typeFilter !== "all") && (
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">{filtered.length} result{filtered.length !== 1 ? "s" : ""}</span>
            <button
              onClick={() => { setSearch(""); setStatusFilter("all"); setTypeFilter("all"); setSortBy("newest"); }}
              className="text-xs font-semibold"
              style={{ color: "#001c48" }}
            >
              Clear filters
            </button>
          </div>
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Video list                                                           */}
      {/* ------------------------------------------------------------------ */}
      <div className="px-4 py-4 space-y-3">

        {/* Empty state */}
        {videos.length === 0 ? (
          <div className="bg-white rounded-xl border-2 border-dashed border-gray-200 py-12 text-center px-4 mt-4">
            <svg className="h-10 w-10 text-gray-200 mx-auto mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9A2.25 2.25 0 0013.5 5.25h-9A2.25 2.25 0 002.25 7.5v9A2.25 2.25 0 004.5 18.75z" />
            </svg>
            <p className="text-sm font-medium text-gray-500 mb-4">No videos uploaded yet</p>
            <Link href="/coach/upload">
              <button className="rounded-lg px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition" style={{ backgroundColor: "#001c48" }}>
                Upload your first video
              </button>
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-sm text-gray-400">No videos match your filters.</p>
            <button
              onClick={() => { setSearch(""); setStatusFilter("all"); setTypeFilter("all"); }}
              className="mt-2 text-sm font-semibold"
              style={{ color: "#001c48" }}
            >
              Clear filters
            </button>
          </div>
        ) : (
          filtered.map(v => {
            const rate = watchRate(v);
            const isDrill = v.type === "drill_comparison" || !!v.coachVideoKey;
            return (
              <div key={v.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {/* Drill comparison thumbnail placeholder */}
                {isDrill && (
                  <div className="flex h-20 shrink-0" style={{ gap: 2, backgroundColor: "#111" }}>
                    <div className="flex-1 flex items-center justify-center" style={{ backgroundColor: "#001c48" }}>
                      <svg className="h-6 w-6 opacity-60" style={{ color: "white" }} viewBox="0 0 24 24" fill="currentColor">
                        <path d="M4.5 4.5a3 3 0 00-3 3v9a3 3 0 003 3h8.25a3 3 0 003-3v-9a3 3 0 00-3-3H4.5zM19.94 18.75l-2.69-2.69V7.94l2.69-2.69c.944-.945 2.56-.276 2.56 1.06v11.38c0 1.336-1.616 2.005-2.56 1.06z" />
                      </svg>
                    </div>
                    <div className="flex-1 flex items-center justify-center" style={{ backgroundColor: "#374151" }}>
                      <svg className="h-6 w-6 opacity-40" style={{ color: "white" }} viewBox="0 0 24 24" fill="currentColor">
                        <path d="M4.5 4.5a3 3 0 00-3 3v9a3 3 0 003 3h8.25a3 3 0 003-3v-9a3 3 0 00-3-3H4.5zM19.94 18.75l-2.69-2.69V7.94l2.69-2.69c.944-.945 2.56-.276 2.56 1.06v11.38c0 1.336-1.616 2.005-2.56 1.06z" />
                      </svg>
                    </div>
                  </div>
                )}

                {/* Top section */}
                <div className="p-4 pb-3">
                  {/* Title row */}
                  <div className="flex items-start gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <Link href={isDrill ? `/coach/videos/${v.id}/drill` : `/coach/videos/${v.id}/annotate`}>
                        <h3 className="text-sm font-bold text-gray-900 leading-snug hover:underline truncate cursor-pointer">
                          {v.title}
                        </h3>
                      </Link>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {v.coachName && <span className="font-medium text-gray-500">{v.coachName} · </span>}
                        {formatDate(v.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      {/* Type badge */}
                      <span
                        className="text-xs font-semibold px-1.5 py-0.5 rounded-full"
                        style={isDrill
                          ? { backgroundColor: "#ede9fe", color: "#6d28d9" }
                          : { backgroundColor: "#dbeafe", color: "#1d4ed8" }}
                      >
                        {isDrill ? "Drill" : "Standard"}
                      </span>
                      {/* Status badge */}
                      <span
                        className="text-xs font-semibold px-1.5 py-0.5 rounded-full"
                        style={v.status === "published"
                          ? { backgroundColor: "rgba(1,255,249,0.15)", color: "#001c48" }
                          : { backgroundColor: "#f3f4f6", color: "#6b7280" }}
                      >
                        {v.status === "published" ? "Published" : "Draft"}
                      </span>
                    </div>
                  </div>

                  {/* Students */}
                  <div className="mb-3">
                    <StudentAvatars ids={v.studentIds} students={students} />
                  </div>

                  {/* Watch rate bar */}
                  {rate !== null ? (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-gray-400">Watch rate</span>
                        <span className="text-xs font-bold" style={{ color: rateColor(rate) }}>{rate}%</span>
                      </div>
                      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{ width: `${rate}%`, backgroundColor: rateColor(rate) }}
                        />
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-gray-400">No students assigned</p>
                  )}
                </div>

                {/* Action bar */}
                <div className="flex border-t border-gray-100">
                  {isDrill ? (
                    <>
                      <Link href={`/coach/videos/${v.id}/drill`} className="flex-1">
                        <button className="w-full py-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition flex items-center justify-center gap-1">
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M4.5 4.5a3 3 0 00-3 3v9a3 3 0 003 3h8.25a3 3 0 003-3v-9a3 3 0 00-3-3H4.5zM19.94 18.75l-2.69-2.69V7.94l2.69-2.69c.944-.945 2.56-.276 2.56 1.06v11.38c0 1.336-1.616 2.005-2.56 1.06z" />
                          </svg>
                          View Drill
                        </button>
                      </Link>
                      <div className="w-px bg-gray-100" />
                    </>
                  ) : (
                    <>
                      <Link href={`/coach/videos/${v.id}/annotate`} className="flex-1">
                        <button className="w-full py-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition flex items-center justify-center gap-1">
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-1.414.586H7v-3a2 2 0 01.586-1.414z" />
                          </svg>
                          Annotate
                        </button>
                      </Link>
                      <div className="w-px bg-gray-100" />
                      <Link href={`/coach/videos/${v.id}/clips`} className="flex-1">
                        <button className="w-full py-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition flex items-center justify-center gap-1">
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 3.75H6A2.25 2.25 0 003.75 6v1.5M16.5 3.75H18A2.25 2.25 0 0120.25 6v1.5m0 9V18A2.25 2.25 0 0118 20.25h-1.5m-9 0H6A2.25 2.25 0 013.75 18v-1.5M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          </svg>
                          Clips
                        </button>
                      </Link>
                      <div className="w-px bg-gray-100" />
                    </>
                  )}
                  <button
                    onClick={() => openEdit(v)}
                    className="flex-1 py-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition flex items-center justify-center gap-1"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487zm0 0L19.5 7.125" />
                    </svg>
                    Edit
                  </button>
                  <div className="w-px bg-gray-100" />
                  <button
                    onClick={() => setDeletingVideo(v)}
                    className="flex-1 py-2.5 text-xs font-semibold text-red-500 hover:bg-red-50 transition flex items-center justify-center gap-1"
                  >
                    <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                    </svg>
                    Delete
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Edit Modal                                                           */}
      {/* ------------------------------------------------------------------ */}
      {editingVideo && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-black/50" onClick={() => !editSaving && setEditingVideo(null)} />
          <div className="relative bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-md flex flex-col" style={{ maxHeight: "85vh" }}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
              <h2 className="text-base font-bold text-gray-900">Edit Video</h2>
              <button onClick={() => !editSaving && setEditingVideo(null)} className="text-gray-400 hover:text-gray-600 transition">
                <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                </svg>
              </button>
            </div>

            {/* Scrollable body */}
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
                  <div className="max-h-36 overflow-y-auto divide-y divide-gray-50">
                    {editFilteredStudents.length === 0 ? (
                      <p className="px-4 py-3 text-sm text-gray-400">No students found.</p>
                    ) : (
                      editFilteredStudents.map(s => {
                        const checked = editStudentIds.has(s.id);
                        return (
                          <label key={s.id} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50 transition">
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

              {/* Download allowed */}
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-700">Allow download</p>
                  <p className="text-xs text-gray-400">Students can download this video</p>
                </div>
                <button
                  onClick={() => setEditDownloadAllowed(!editDownloadAllowed)}
                  className="relative inline-flex h-6 w-11 shrink-0 rounded-full transition"
                  style={{ backgroundColor: editDownloadAllowed ? "#001c48" : "#d1d5db" }}
                >
                  <span
                    className="inline-block h-5 w-5 rounded-full bg-white shadow transform transition mt-0.5"
                    style={{ marginLeft: editDownloadAllowed ? "22px" : "2px" }}
                  />
                </button>
              </div>

              {/* Status */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Status</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditStatus("published")}
                    className="flex-1 py-2 text-sm font-semibold rounded-lg transition"
                    style={{
                      backgroundColor: editStatus === "published" ? "#001c48" : "#f3f4f6",
                      color: editStatus === "published" ? "white" : "#374151",
                    }}
                  >
                    Published
                  </button>
                  <button
                    onClick={() => setEditStatus("draft")}
                    className="flex-1 py-2 text-sm font-semibold rounded-lg transition"
                    style={{
                      backgroundColor: editStatus === "draft" ? "#374151" : "#f3f4f6",
                      color: editStatus === "draft" ? "white" : "#374151",
                    }}
                  >
                    Draft
                  </button>
                </div>
              </div>
            </div>

            {/* Footer buttons */}
            <div className="px-6 pb-6 pt-3 flex gap-3 border-t border-gray-100">
              <button
                onClick={() => setEditingVideo(null)}
                disabled={editSaving}
                className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={saveEdit}
                disabled={editSaving || !editTitle.trim()}
                className="flex-1 rounded-lg py-2.5 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
                style={{ backgroundColor: "#001c48" }}
              >
                {editSaving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Delete Confirmation Modal                                            */}
      {/* ------------------------------------------------------------------ */}
      {deletingVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => !deleteConfirming && setDeletingVideo(null)} />
          <div className="relative bg-white rounded-2xl w-full max-w-sm p-6 text-center shadow-xl">
            <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <svg className="h-6 w-6 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
              </svg>
            </div>
            <h2 className="text-base font-bold text-gray-900 mb-1">Delete this video?</h2>
            <p className="text-sm text-gray-500 mb-6">
              <span className="font-semibold text-gray-700">&ldquo;{deletingVideo.title}&rdquo;</span> will be permanently deleted. This cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeletingVideo(null)}
                disabled={deleteConfirming}
                className="flex-1 rounded-lg border border-gray-200 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                disabled={deleteConfirming}
                className="flex-1 rounded-lg py-2.5 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 transition disabled:opacity-50"
              >
                {deleteConfirming ? "Deleting…" : "Delete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Bottom Navigation                                                    */}
      {/* ------------------------------------------------------------------ */}
      <nav className="fixed bottom-0 inset-x-0 bg-gray-900 border-t border-gray-800 flex" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {NAV_ITEMS.map(item => {
          const isActive = pathname === item.href;
          return (
            <Link key={item.href} href={item.href} className="flex-1 flex flex-col items-center py-2.5 gap-0.5 transition">
              <item.Icon className={`h-5 w-5 ${isActive ? "" : "text-gray-500"}`} style={isActive ? { color: "#01fff9" } : {}} />
              <span className={`text-xs ${isActive ? "font-semibold" : "text-gray-500"}`} style={isActive ? { color: "#01fff9" } : {}}>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </main>
  );
}
