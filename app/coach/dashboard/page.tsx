"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { clearAuthCookies } from "@/lib/cookies";
import { useNotificationCounts } from "@/lib/NotificationsContext";
import VideoActionsMenu from "@/components/VideoActionsMenu";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StudentData {
  id: string;
  fullName: string;
  email: string;
}

interface VideoData {
  id: string;
  title: string;
  coachName: string;
  createdAt: string;
  studentIds: string[];
  viewedBy: string[];
}

interface StudentStat extends StudentData {
  assigned: number;
  watched: number;
  rate: number;
  status: "all_watched" | "pending" | "not_started" | "no_videos";
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch { return ""; }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: StudentStat["status"] }) {
  if (status === "all_watched")
    return <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full shrink-0" style={{ backgroundColor: "rgba(1,255,249,0.15)", color: "#001c48" }}>All watched</span>;
  if (status === "pending")
    return <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full shrink-0" style={{ backgroundColor: "#fef3c7", color: "#92400e" }}>Pending</span>;
  if (status === "not_started")
    return <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full shrink-0" style={{ backgroundColor: "#fee2e2", color: "#991b1b" }}>Not started</span>;
  return null;
}

// Nav icon components
function HomeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.47 3.841a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.061l-1.97-1.97V6a.75.75 0 00-.75-.75h-1.5a.75.75 0 00-.75.75v1.78L13.5 5.409a3 3 0 00-3 0L2.19 11.47a.75.75 0 001.061 1.06l8.219-8.69z" />
      <path d="M12 5.432l8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H5.625a1.875 1.875 0 01-1.875-1.875v-6.198a2.29 2.29 0 00.091-.086L12 5.432z" />
    </svg>
  );
}

function VideoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M4.5 4.5a3 3 0 00-3 3v9a3 3 0 003 3h8.25a3 3 0 003-3v-9a3 3 0 00-3-3H4.5zM19.94 18.75l-2.69-2.69V7.94l2.69-2.69c.944-.945 2.56-.276 2.56 1.06v11.38c0 1.336-1.616 2.005-2.56 1.06z" />
    </svg>
  );
}

function StudentsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M4.5 6.375a4.125 4.125 0 118.25 0 4.125 4.125 0 01-8.25 0zM14.25 8.625a3.375 3.375 0 116.75 0 3.375 3.375 0 01-6.75 0zM1.5 19.125a7.125 7.125 0 0114.25 0v.003l-.001.119a.75.75 0 01-.363.63 13.067 13.067 0 01-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 01-.364-.63l-.001-.122zM17.25 19.128l-.001.144a2.25 2.25 0 01-.233.96 10.088 10.088 0 005.06-1.01.75.75 0 00.42-.643 4.875 4.875 0 00-6.957-4.611 8.586 8.586 0 011.71 5.157v.003z" />
    </svg>
  );
}

function InviteIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path fillRule="evenodd" d="M19.902 4.098a3.75 3.75 0 00-5.304 0l-4.5 4.5a3.75 3.75 0 001.035 6.037.75.75 0 01-.646 1.353 5.25 5.25 0 01-1.449-8.45l4.5-4.5a5.25 5.25 0 117.424 7.424l-1.757 1.757a.75.75 0 11-1.06-1.06l1.757-1.757a3.75 3.75 0 000-5.304zm-7.389 4.267a.75.75 0 011-.353 5.25 5.25 0 011.449 8.45l-4.5 4.5a5.25 5.25 0 11-7.424-7.424l1.757-1.757a.75.75 0 111.06 1.06l-1.757 1.757a3.75 3.75 0 105.304 5.304l4.5-4.5a3.75 3.75 0 00-1.035-6.037.75.75 0 01-.354-1z" clipRule="evenodd" />
    </svg>
  );
}

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path fillRule="evenodd" d="M4.848 2.771A49.144 49.144 0 0112 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 01-3.476.383.39.39 0 00-.297.17l-2.755 4.133a.75.75 0 01-1.248 0l-2.755-4.133a.39.39 0 00-.297-.17 48.9 48.9 0 01-3.476-.384c-1.978-.29-3.348-2.024-3.348-3.97V6.741c0-1.946 1.37-3.68 3.348-3.97z" clipRule="evenodd" />
    </svg>
  );
}

const NAV_ITEMS = [
  { href: "/coach/dashboard", label: "Home", Icon: HomeIcon },
  { href: "/coach/videos", label: "Videos", Icon: VideoIcon },
  { href: "/coach/students", label: "Athletes", Icon: StudentsIcon },
  { href: "/coach/messages", label: "Messages", Icon: ChatIcon },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CoachDashboard() {
  const router = useRouter();
  const pathname = usePathname();

  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState<string | null>(null);
  const [coachName, setCoachName] = useState("");
  const [students, setStudents] = useState<StudentData[]>([]);
  const [videos, setVideos] = useState<VideoData[]>([]);
  const [videosNeedingReply, setVideosNeedingReply] = useState(0);
  const [studentSearch, setStudentSearch] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const { notifications: allNotifications, newComment, newMessage, markRead } = useNotificationCounts();
  const notifications = allNotifications.filter(n => n.type !== "booking" && n.type !== "booking_approved" && n.type !== "booking_declined");

  const greeting = getGreeting();

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push("/login"); return; }
      setUid(user.uid);

      try {
        // Load the caller's role first: admins see every athlete and video;
        // coaches see only their own. A blanket query would return docs the
        // rules forbid a coach from reading, which fails the whole query.
        const profileSnap = await getDoc(doc(db, "users", user.uid));
        const viewerRole = profileSnap.data()?.role as string | undefined;
        const admin = viewerRole === "admin";
        setCoachName(profileSnap.data()?.fullName ?? profileSnap.data()?.name ?? user.displayName ?? "Coach");
        if (admin) setIsAdmin(true);

        const studentsQuery = admin
          ? query(collection(db, "users"), where("role", "==", "student"))
          : query(collection(db, "users"), where("coachId", "==", user.uid));
        const videosQuery = admin
          ? collection(db, "videos")
          : query(collection(db, "videos"), where("coachId", "==", user.uid));

        const [studentsSnap, videosSnap] = await Promise.all([
          getDocs(studentsQuery),
          getDocs(videosQuery),
        ]);

        const studentDocs: StudentData[] = studentsSnap.docs.map(d => ({
          id: d.id,
          fullName: (d.data().fullName as string) ?? "Athlete",
          email: (d.data().email as string) ?? "",
        }));

        const videoDocs: VideoData[] = videosSnap.docs.map(d => ({
          id: d.id,
          title: (d.data().title as string) ?? "Untitled",
          coachName: (d.data().coachName as string) ?? "",
          createdAt: (d.data().createdAt as string) ?? "",
          studentIds: (d.data().studentIds as string[]) ?? [],
          viewedBy: (d.data().viewedBy as string[]) ?? [],
        }));

        setStudents(studentDocs);
        setVideos(videoDocs);
        setLoading(false);

        // Load comments in background — count videos needing reply (matches videos page logic exactly)
        if (videoDocs.length > 0) {
          const commentSnaps = await Promise.all(
            videoDocs.map(v => getDocs(collection(db, "videos", v.id, "comments")))
          );
          let needsReplyCount = 0;
          commentSnaps.forEach(snap => {
            const comments = snap.docs.map(d => ({
              id: d.id,
              role: d.data().role as "coach" | "student",
              parentId: d.data().parentId as string | null,
            }));
            const topLevelStudent = comments.filter(c => c.role === "student" && c.parentId === null);
            const hasUnreplied = topLevelStudent.some(c =>
              !comments.some(r => r.parentId === c.id && r.role === "coach")
            );
            if (hasUnreplied) needsReplyCount++;
          });
          setVideosNeedingReply(needsReplyCount);
        }
      } catch (err) {
        console.error("[dashboard]", err);
        setLoading(false);
      }
    });
    return unsub;
  }, [router]);

  const studentStats = useMemo<StudentStat[]>(() => {
    return students.map(s => {
      const assigned = videos.filter(v => v.studentIds.includes(s.id));
      const watched = assigned.filter(v => v.viewedBy.includes(s.id));
      const rate = assigned.length > 0 ? Math.round(watched.length / assigned.length * 100) : 0;
      const status: StudentStat["status"] =
        assigned.length === 0 ? "no_videos" :
        watched.length === 0 ? "not_started" :
        watched.length === assigned.length ? "all_watched" :
        "pending";
      return { ...s, assigned: assigned.length, watched: watched.length, rate, status };
    }).sort((a, b) => a.fullName.localeCompare(b.fullName));
  }, [students, videos]);

  const recentVideos = useMemo(() => {
    return [...videos]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5)
      .map(v => {
        const assigned = v.studentIds.length;
        const watched = v.studentIds.filter(sid => v.viewedBy.includes(sid)).length;
        const rate = assigned > 0 ? Math.round(watched / assigned * 100) : 0;
        return { ...v, assignedCount: assigned, watchedCount: watched, rate };
      });
  }, [videos]);

  const overallWatchRate = useMemo(() => {
    const total = videos.reduce((sum, v) => sum + v.studentIds.length, 0);
    const watched = videos.reduce((sum, v) => sum + v.studentIds.filter(sid => v.viewedBy.includes(sid)).length, 0);
    return total > 0 ? Math.round(watched / total * 100) : 0;
  }, [videos]);

  const filteredStudents = useMemo(() => {
    const q = studentSearch.trim().toLowerCase();
    if (!q) return studentStats;
    return studentStats.filter(s =>
      s.fullName.toLowerCase().includes(q) || s.email.toLowerCase().includes(q)
    );
  }, [studentStats, studentSearch]);

  async function handleSignOut() {
    await signOut(auth);
    clearAuthCookies();
    router.push("/login");
  }

  async function handleShare(videoId: string) {
    const url = `${window.location.origin}/student/videos/${videoId}`;
    await navigator.clipboard.writeText(url).catch(() => {});
    setCopiedId(videoId);
    setTimeout(() => setCopiedId(null), 2000);
  }

  // ---- LOADING ----
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

  const statCards = [
    {
      label: "Athletes",
      value: students.length,
      href: "/coach/students",
      icon: <svg className="h-4 w-4 mb-1 mx-auto" style={{ color: "#01fff9" }} viewBox="0 0 24 24" fill="currentColor"><path d="M4.5 6.375a4.125 4.125 0 118.25 0 4.125 4.125 0 01-8.25 0zM14.25 8.625a3.375 3.375 0 116.75 0 3.375 3.375 0 01-6.75 0zM1.5 19.125a7.125 7.125 0 0114.25 0v.003l-.001.119a.75.75 0 01-.363.63 13.067 13.067 0 01-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 01-.364-.63l-.001-.122zM17.25 19.128l-.001.144a2.25 2.25 0 01-.233.96 10.088 10.088 0 005.06-1.01.75.75 0 00.42-.643 4.875 4.875 0 00-6.957-4.611 8.586 8.586 0 011.71 5.157v.003z" /></svg>,
    },
    {
      label: "Videos",
      value: videos.length,
      href: "/coach/videos",
      icon: <svg className="h-4 w-4 mb-1 mx-auto" style={{ color: "#01fff9" }} viewBox="0 0 24 24" fill="currentColor"><path d="M4.5 4.5a3 3 0 00-3 3v9a3 3 0 003 3h8.25a3 3 0 003-3v-9a3 3 0 00-3-3H4.5zM19.94 18.75l-2.69-2.69V7.94l2.69-2.69c.944-.945 2.56-.276 2.56 1.06v11.38c0 1.336-1.616 2.005-2.56 1.06z" /></svg>,
    },
    {
      label: "Watch Rate",
      value: `${overallWatchRate}%`,
      href: "/coach/videos",
      icon: <svg className="h-4 w-4 mb-1 mx-auto" style={{ color: "#01fff9" }} viewBox="0 0 24 24" fill="currentColor"><path d="M12 15a3 3 0 100-6 3 3 0 000 6z" /><path fillRule="evenodd" d="M1.323 11.447C2.811 6.976 7.028 3.75 12.001 3.75c4.97 0 9.185 3.223 10.675 7.69.12.362.12.752 0 1.113-1.487 4.471-5.705 7.697-10.677 7.697-4.97 0-9.186-3.223-10.675-7.69a1.762 1.762 0 010-1.113zM17.25 12a5.25 5.25 0 11-10.5 0 5.25 5.25 0 0110.5 0z" clipRule="evenodd" /></svg>,
    },
    {
      label: "Videos Needing Reply",
      value: videosNeedingReply,
      href: "/coach/videos?needsReply=true",
      icon: <svg className="h-4 w-4 mb-1 mx-auto" style={{ color: "#01fff9" }} viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M4.848 2.771A49.144 49.144 0 0112 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 01-3.476.383.39.39 0 00-.297.17l-2.755 4.133a.75.75 0 01-1.248 0l-2.755-4.133a.39.39 0 00-.297-.17 48.9 48.9 0 01-3.476-.384c-1.978-.29-3.348-2.024-3.348-3.97V6.741c0-1.946 1.37-3.68 3.348-3.97z" clipRule="evenodd" /></svg>,
    },
  ];

  return (
    <main className="min-h-screen bg-gray-50 pb-20">

      {/* ------------------------------------------------------------------ */}
      {/* Header                                                               */}
      {/* ------------------------------------------------------------------ */}
      <div style={{ backgroundColor: "#001c48" }} className="pt-12 pb-5 px-4">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-5">
          <img src="/logo-light.png" alt="Ball Masters Florida" style={{ width: 80, height: "auto" }} />
          <div className="flex items-center gap-3">
            <Link href="/coach/settings" style={{ color: "rgba(1,255,249,0.7)" }} className="hover:text-white transition">
              <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor">
                <path fillRule="evenodd" d="M11.078 2.25c-.917 0-1.699.663-1.85 1.567L9.05 4.889c-.02.12-.115.26-.297.348a7.493 7.493 0 00-.986.57c-.166.115-.334.126-.45.083L6.3 5.508a1.875 1.875 0 00-2.282.819l-.922 1.597a1.875 1.875 0 00.432 2.385l.84.692c.095.078.17.229.154.43a7.598 7.598 0 000 1.139c.015.2-.059.352-.153.43l-.841.692a1.875 1.875 0 00-.432 2.385l.922 1.597a1.875 1.875 0 002.282.818l1.019-.382c.115-.043.283-.031.45.082.312.214.641.405.985.57.182.088.277.228.297.35l.178 1.071c.151.904.933 1.567 1.85 1.567h1.844c.916 0 1.699-.663 1.85-1.567l.178-1.072c.02-.12.114-.26.297-.349.344-.165.673-.356.985-.57.167-.114.335-.125.45-.082l1.02.382a1.875 1.875 0 002.28-.819l.923-1.597a1.875 1.875 0 00-.432-2.385l-.84-.692c-.095-.078-.17-.229-.154-.43a7.614 7.614 0 000-1.139c-.016-.2.059-.352.153-.43l.84-.692c.708-.582.891-1.59.433-2.385l-.922-1.597a1.875 1.875 0 00-2.282-.818l-1.02.382c-.114.043-.282.031-.449-.083a7.49 7.49 0 00-.985-.57c-.183-.087-.277-.227-.297-.348l-.179-1.072a1.875 1.875 0 00-1.85-1.567h-1.843zM12 15.75a3.75 3.75 0 100-7.5 3.75 3.75 0 000 7.5z" clipRule="evenodd" />
              </svg>
            </Link>
            <button
              onClick={handleSignOut}
              className="flex items-center gap-1.5 hover:text-white transition text-xs font-medium"
              style={{ color: "rgba(1,255,249,0.7)" }}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Sign out
            </button>
          </div>
        </div>

        {/* Greeting */}
        <div className="mb-5">
          <p className="text-sm font-medium" style={{ color: "#01fff9" }}>{greeting},</p>
          <h1 className="text-2xl font-extrabold text-white leading-tight mt-0.5">{coachName}</h1>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-4 gap-2">
          {statCards.map(s => (
            <Link
              key={s.label}
              href={s.href}
              className="rounded-xl text-center py-3 px-1 transition-all hover:brightness-125 active:brightness-110"
              style={{
                backgroundColor: "rgba(255,255,255,0.12)",
                border: "1px solid transparent",
              }}
              onMouseEnter={e => ((e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(1,255,249,0.4)")}
              onMouseLeave={e => ((e.currentTarget as HTMLAnchorElement).style.borderColor = "transparent")}
            >
              {s.icon}
              <div className="text-lg font-extrabold text-white leading-none">{s.value}</div>
              <div className="text-xs mt-0.5 leading-tight" style={{ color: "rgba(1,255,249,0.7)" }}>{s.label}</div>
            </Link>
          ))}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Content                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="px-4 py-5 space-y-7">

        {/* Manage Coaches (admin only) */}
        {isAdmin && (
          <Link href="/coach/coaches">
            <div
              className="flex items-center gap-3 bg-white rounded-xl border border-gray-200 px-4 py-3.5 hover:bg-gray-50 transition active:bg-gray-100"
            >
              <div
                className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ backgroundColor: "rgba(0,28,72,0.08)" }}
              >
                <svg className="h-5 w-5" style={{ color: "#001c48" }} viewBox="0 0 24 24" fill="currentColor">
                  <path d="M4.5 6.375a4.125 4.125 0 118.25 0 4.125 4.125 0 01-8.25 0zM14.25 8.625a3.375 3.375 0 116.75 0 3.375 3.375 0 01-6.75 0zM1.5 19.125a7.125 7.125 0 0114.25 0v.003l-.001.119a.75.75 0 01-.363.63 13.067 13.067 0 01-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 01-.364-.63l-.001-.122zM17.25 19.128l-.001.144a2.25 2.25 0 01-.233.96 10.088 10.088 0 005.06-1.01.75.75 0 00.42-.643 4.875 4.875 0 00-6.957-4.611 8.586 8.586 0 011.71 5.157v.003z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">Manage Coaches</p>
                <p className="text-xs text-gray-400 mt-0.5">Invite, assign head coach, delete accounts</p>
              </div>
              <svg className="h-4 w-4 text-gray-300 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
              </svg>
            </div>
          </Link>
        )}

        {/* Quick Actions */}
        <div className={isAdmin ? "pt-7" : ""}>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Quick Actions</h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              {
                label: "Upload Video", href: "/coach/upload", bg: "#001c48",
                icon: <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" /></svg>,
              },
              {
                label: "Invite Athletes", href: "/coach/invite", bg: "#001c48",
                icon: <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M19 7.5v3m0 0v3m0-3h3m-3 0h-3m-2.25-4.125a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zM4 19.235v-.11a6.375 6.375 0 0112.75 0v.109A12.318 12.318 0 0110.374 21c-2.331 0-4.512-.645-6.374-1.766z" /></svg>,
              },
              {
                label: "All Videos", href: "/coach/videos", bg: "#001c48",
                icon: <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-1.5A1.125 1.125 0 0118 18.375M20.625 4.5H3.375m17.25 0c.621 0 1.125.504 1.125 1.125M20.625 4.5h-1.5C18.504 4.5 18 5.004 18 5.625m3.75 0v1.5c0 .621-.504 1.125-1.125 1.125M3.375 4.5c-.621 0-1.125.504-1.125 1.125M3.375 4.5h1.5C5.496 4.5 6 5.004 6 5.625m-3.75 0v1.5c0 .621.504 1.125 1.125 1.125m0 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m1.5-3.75C6.504 8.25 7 7.746 7 7.125v-1.5M4.875 8.25C5.496 8.25 6 8.754 6 9.375v1.5m0-5.25v5.25m0-5.25C6 5.004 6.504 4.5 7.125 4.5h9.75c.621 0 1.125.504 1.125 1.125m1.125 2.625h1.5m-1.5 0A1.125 1.125 0 0118 7.125v-1.5m1.125 2.625c-.621 0-1.125.504-1.125 1.125v1.5m2.625-2.625c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125M18 5.625v5.25M7.125 12h9.75m-9.75 0A1.125 1.125 0 016 10.875M7.125 12C6.504 12 6 12.504 6 13.125m0-2.25C6 11.496 5.496 12 4.875 12M18 10.875c0 .621-.504 1.125-1.125 1.125M18 10.875c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-7.5 0h7.5" /></svg>,
              },
            ].map(action => (
              <Link key={action.href} href={action.href}>
                <div
                  className="rounded-xl p-4 flex flex-col items-center justify-center gap-2 active:opacity-80 transition shadow-sm h-full"
                  style={{ backgroundColor: action.bg }}
                >
                  {action.icon}
                  <span className="text-xs font-semibold text-white text-center leading-tight">{action.label}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Activity */}
        {notifications.length > 0 && (
          <div>
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Activity</h2>
            <div className="space-y-2">
              {notifications.slice(0, 5).map(n => {
                const ts = n.createdAt;
                const diff = ts ? Date.now() - ts.seconds * 1000 : 0;
                const m = Math.floor(diff / 60000);
                const ago = m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`;
                return (
                  <div key={n.id} className="cursor-pointer" onClick={() => { markRead([n.id]); router.push(n.link); }}>
                    <div className="bg-white rounded-xl border border-gray-200 p-3.5 flex gap-3 hover:shadow-sm active:opacity-90 transition">
                      <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(0,28,72,0.06)" }}>
                        {n.type === "new_comment" && <svg className="h-4 w-4" style={{ color: "#001c48" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" /></svg>}
                        {n.type === "new_message" && <svg className="h-4 w-4" style={{ color: "#001c48" }} viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M4.848 2.771A49.144 49.144 0 0112 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 01-3.476.383.39.39 0 00-.297.17l-2.755 4.133a.75.75 0 01-1.248 0l-2.755-4.133a.39.39 0 00-.297-.17 48.9 48.9 0 01-3.476-.384c-1.978-.29-3.348-2.024-3.348-3.97V6.741c0-1.946 1.37-3.68 3.348-3.97z" clipRule="evenodd" /></svg>}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-gray-900 leading-snug">{n.title}</p>
                          <span className="text-xs text-gray-400 shrink-0">{ago}</span>
                        </div>
                        {n.body && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{n.body}</p>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Recent Videos */}
        {videos.length > 0 ? (
          <div>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Recent Videos</h2>
              <Link href="/coach/videos" className="text-xs font-semibold" style={{ color: "#001c48" }}>View all →</Link>
            </div>
            <div className="space-y-3">
              {recentVideos.map(v => (
                <div
                  key={v.id}
                  onClick={() => router.push(`/coach/videos/${v.id}/annotate`)}
                  className="bg-white rounded-xl border border-gray-200 p-4 cursor-pointer hover:bg-gray-50 active:bg-gray-100 transition"
                >
                  <div className="flex items-start gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm font-semibold text-gray-900 truncate">{v.title}</h3>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {v.coachName && <span className="font-medium text-gray-500">{v.coachName} · </span>}
                        {formatDate(v.createdAt)}
                        {v.assignedCount > 0 && <> · {v.assignedCount} athlete{v.assignedCount !== 1 ? "s" : ""}</>}
                      </p>
                    </div>
                    {v.assignedCount > 0 && (
                      <span
                        className="text-sm font-bold shrink-0"
                        style={{ color: v.rate === 100 ? "#01fff9" : v.rate === 0 ? "#dc2626" : "#d97706" }}
                      >
                        {v.rate}%
                      </span>
                    )}
                    <VideoActionsMenu
                      items={[
                        { label: "Annotate & Notes", onClick: () => router.push(`/coach/videos/${v.id}/annotate`) },
                        { label: "Cut Clips", onClick: () => router.push(`/coach/videos/${v.id}/clips`) },
                        { label: copiedId === v.id ? "Copied!" : "Assign to Athlete", onClick: () => handleShare(v.id) },
                      ]}
                    />
                  </div>

                  {v.assignedCount > 0 && (
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${v.rate}%`, backgroundColor: v.rate === 100 ? "#01fff9" : "#001c48" }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border-2 border-dashed border-gray-200 py-10 text-center px-4">
            <svg className="h-10 w-10 text-gray-200 mx-auto mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
            <p className="text-sm font-medium text-gray-500 mb-4">No videos uploaded yet</p>
            <Link href="/coach/upload">
              <button className="rounded-lg px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition" style={{ backgroundColor: "#001c48" }}>
                Upload your first video
              </button>
            </Link>
          </div>
        )}

        {/* Students */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Athletes</h2>
            {students.length > 0 && <span className="text-xs text-gray-400">{students.length} total</span>}
          </div>

          {students.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 py-8 text-center px-4">
              <p className="text-sm text-gray-400 mb-4">No athletes have joined yet</p>
              <Link href="/coach/invite">
                <button className="rounded-lg px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition" style={{ backgroundColor: "#001c48" }}>
                  Invite athletes
                </button>
              </Link>
            </div>
          ) : (
            <>
              <div className="relative mb-3">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
                </svg>
                <input
                  type="text"
                  value={studentSearch}
                  onChange={e => setStudentSearch(e.target.value)}
                  placeholder="Search athletes…"
                  className="w-full pl-9 pr-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 bg-white border border-gray-200 rounded-xl focus:outline-none"
                  onFocus={e => (e.target.style.borderColor = "#001c48")}
                  onBlur={e => (e.target.style.borderColor = "#e5e7eb")}
                />
              </div>

              {filteredStudents.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-6">No athletes match &ldquo;{studentSearch}&rdquo;</p>
              ) : (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  {filteredStudents.map((s, i) => (
                    <Link key={s.id} href={`/coach/students/${s.id}`}>
                      <div
                        className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition"
                        style={{ borderTop: i > 0 ? "1px solid #f3f4f6" : undefined }}
                      >
                        <div
                          className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 text-sm font-bold"
                          style={{ backgroundColor: "#dbeafe", color: "#001c48" }}
                        >
                          {s.fullName.charAt(0).toUpperCase()}
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-sm font-semibold text-gray-900 truncate">{s.fullName}</span>
                            <StatusBadge status={s.status} />
                          </div>
                          {s.assigned > 0 ? (
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full"
                                  style={{ width: `${s.rate}%`, backgroundColor: s.rate === 100 ? "#01fff9" : "#001c48" }}
                                />
                              </div>
                              <span className="text-xs text-gray-400 shrink-0 tabular-nums">{s.watched}/{s.assigned}</span>
                            </div>
                          ) : (
                            <p className="text-xs text-gray-400">No videos assigned</p>
                          )}
                        </div>

                        <svg className="h-4 w-4 text-gray-300 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Bottom Navigation                                                    */}
      {/* ------------------------------------------------------------------ */}
      <nav
        className="fixed bottom-0 inset-x-0 bg-gray-900 border-t border-gray-800 flex"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {NAV_ITEMS.map(item => {
          const isActive = pathname === item.href;
          const badge = item.href === "/coach/videos" ? newComment : item.href === "/coach/messages" ? newMessage : 0;
          return (
            <Link key={item.href} href={item.href} className="flex-1 flex flex-col items-center py-2.5 gap-0.5 transition" style={isActive ? { color: "#01fff9" } : {}}>
              <div className="relative">
                <item.Icon className={`h-5 w-5 ${isActive ? "" : "text-gray-500"}`} />
                {badge > 0 && (
                  <span className="absolute -top-1 -right-1.5 h-4 min-w-[16px] flex items-center justify-center rounded-full px-0.5" style={{ backgroundColor: "#01fff9", color: "#001c48", fontSize: "9px", fontWeight: 700 }}>
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </div>
              <span className={`text-xs ${isActive ? "font-semibold" : "text-gray-500"}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>
    </main>
  );
}
