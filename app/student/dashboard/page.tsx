"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { clearAuthCookies } from "@/lib/cookies";
import { requestNotificationPermission } from "@/lib/notifications";
import { useNotificationCounts } from "@/lib/NotificationsContext";
import ViewToggle from "@/components/ViewToggle";
import { useViewMode } from "@/lib/useViewMode";
import InitialsAvatar from "@/components/InitialsAvatar";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Video {
  id: string;
  title: string;
  coachName: string;
  viewedBy: string[];
  createdAt: string;
  type?: string;
}

function abbreviateName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return name;
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

function VideoMetaRows({ v, studentName, uid, avatarId, size, abbreviate }: {
  v: Video; studentName: string; uid: string; avatarId: string; size: number; abbreviate?: boolean;
}) {
  const labelW = size <= 24 ? 44 : 52;
  const dateStr = v.createdAt
    ? new Date(v.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "";
  return (
    <>
      <p className="text-xs text-gray-400 mt-0.5">{dateStr}</p>
      <div className="flex items-center gap-1.5 mt-1">
        <span className="text-xs text-gray-400 shrink-0" style={{ width: labelW }}>Coach:</span>
        <InitialsAvatar name={v.coachName || "?"} id={v.id} size={size} variant="coach" />
        <span className="text-xs text-gray-700 truncate">{abbreviate ? abbreviateName(v.coachName) : (v.coachName || "Coach")}</span>
      </div>
      <div className="flex items-center gap-1.5 mt-0.5">
        <span className="text-xs text-gray-400 shrink-0" style={{ width: labelW }}>Athlete:</span>
        <InitialsAvatar name={studentName || "?"} id={uid} size={size} variant="student" avatarId={avatarId || undefined} />
        <span className="text-xs text-gray-700 truncate">{abbreviate ? (studentName.split(" ")[0] || "Me") : (studentName || "Me")}</span>
      </div>
    </>
  );
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

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ---------------------------------------------------------------------------
// Nav icons
// ---------------------------------------------------------------------------

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

function CalendarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path fillRule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zm13.5 9a1.5 1.5 0 00-1.5-1.5H5.25a1.5 1.5 0 00-1.5 1.5v7.5a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5v-7.5z" clipRule="evenodd" />
    </svg>
  );
}

function ProfileIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" />
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
  { href: "/student/dashboard", label: "Home", Icon: HomeIcon },
  { href: "/student/videos", label: "My Videos", Icon: VideoIcon },
  { href: "/student/calendar", label: "Calendar", Icon: CalendarIcon },
  { href: "/student/messages", label: "Messages", Icon: ChatIcon },
  { href: "/student/profile", label: "Profile", Icon: ProfileIcon },
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function StudentDashboard() {
  const router = useRouter();
  const pathname = usePathname();

  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState<string | null>(null);
  const [studentName, setStudentName] = useState("");
  const [avatarId, setAvatarId] = useState("");
  const [videos, setVideos] = useState<Video[]>([]);
  const [showNotifBanner, setShowNotifBanner] = useState(false);
  const { notifications, newVideo, newMessage, bookingUpdate, markRead } = useNotificationCounts();
  const [notifEnabling, setNotifEnabling] = useState(false);

  const greeting = getGreeting();
  const [viewMode, setViewMode] = useViewMode("student-dashboard");

  useEffect(() => {
    if (typeof window === "undefined") return;
    const dismissed = localStorage.getItem("notif_banner_dismissed");
    if (!dismissed && typeof Notification !== "undefined" && Notification.permission === "default") {
      setShowNotifBanner(true);
    }
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push("/login"); return; }
      setUid(user.uid);

      try {
        const [profileSnap, videosSnap] = await Promise.all([
          getDoc(doc(db, "users", user.uid)),
          getDocs(query(collection(db, "videos"), where("studentIds", "array-contains", user.uid))),
        ]);

        const profileData = profileSnap.data();
        setStudentName(profileData?.fullName ?? profileData?.name ?? user.displayName ?? "Athlete");
        setAvatarId(profileData?.avatarId ?? "");

        const videoDocs: Video[] = videosSnap.docs.map(d => ({
          id: d.id,
          title: (d.data().title as string) ?? "Untitled",
          coachName: (d.data().coachName as string) ?? "Coach",
          viewedBy: (d.data().viewedBy as string[]) ?? [],
          createdAt: (d.data().createdAt as string) ?? "",
          type: d.data().type as string | undefined,
        }));

        setVideos(videoDocs);
        setLoading(false);
      } catch (err) {
        console.error("[student/dashboard]", err);
        setLoading(false);
      }
    });
    return unsub;
  }, [router]);

  const watchedCount = useMemo(
    () => videos.filter(v => uid && v.viewedBy.includes(uid)).length,
    [videos, uid]
  );

  const unwatchedCount = videos.length - watchedCount;

  const continueWatching = useMemo(() => {
    if (!uid) return [];
    const unwatched = videos
      .filter(v => !v.viewedBy.includes(uid))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    const watched = videos
      .filter(v => v.viewedBy.includes(uid))
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return [...unwatched, ...watched].slice(0, 6);
  }, [videos, uid]);

  async function handleSignOut() {
    await signOut(auth);
    clearAuthCookies();
    router.push("/login");
  }

  async function handleEnableNotifications() {
    setNotifEnabling(true);
    try {
      await requestNotificationPermission();
    } catch (err) {
      console.error("[notifications]", err);
    } finally {
      localStorage.setItem("notif_banner_dismissed", "1");
      setShowNotifBanner(false);
      setNotifEnabling(false);
    }
  }

  function dismissNotifBanner() {
    localStorage.setItem("notif_banner_dismissed", "1");
    setShowNotifBanner(false);
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

  return (
    <main className="min-h-screen bg-gray-50 pb-20">

      {/* ------------------------------------------------------------------ */}
      {/* Notification permission banner                                       */}
      {/* ------------------------------------------------------------------ */}
      {showNotifBanner && (
        <div className="fixed top-0 inset-x-0 z-50 flex items-center gap-3 px-4 py-3 text-sm text-white shadow-lg" style={{ backgroundColor: "#001c48", paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}>
          <svg className="h-5 w-5 shrink-0" style={{ color: "#01fff9" }} viewBox="0 0 24 24" fill="currentColor">
            <path d="M5.85 3.5a.75.75 0 00-1.117-1 9.719 9.719 0 00-2.348 4.876.75.75 0 001.479.248A8.219 8.219 0 015.85 3.5zM19.267 2.5a.75.75 0 10-1.118 1 8.22 8.22 0 011.987 4.124.75.75 0 001.48-.248A9.72 9.72 0 0019.266 2.5z" />
            <path fillRule="evenodd" d="M12 2.25A6.75 6.75 0 005.25 9v.75a8.217 8.217 0 01-2.119 5.52.75.75 0 00.298 1.206c1.544.57 3.16.99 4.831 1.243a3.75 3.75 0 107.48 0 24.583 24.583 0 004.83-1.244.75.75 0 00.298-1.205 8.217 8.217 0 01-2.118-5.52V9A6.75 6.75 0 0012 2.25zM9.75 18c0-.034 0-.067.002-.1a25.05 25.05 0 004.496 0l.002.1a2.25 2.25 0 11-4.5 0z" clipRule="evenodd" />
          </svg>
          <p className="flex-1 leading-snug" style={{ color: "rgba(1,255,249,0.85)" }}>Enable notifications to know when your coach posts new videos</p>
          <button
            onClick={handleEnableNotifications}
            disabled={notifEnabling}
            className="shrink-0 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-60 transition"
            style={{ backgroundColor: "#001c48", color: "white", border: "1px solid rgba(1,255,249,0.4)" }}
          >
            {notifEnabling ? "…" : "Enable"}
          </button>
          <button onClick={dismissNotifBanner} className="shrink-0 hover:text-white transition" style={{ color: "rgba(1,255,249,0.7)" }}>
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
            </svg>
          </button>
        </div>
      )}

      {/* ------------------------------------------------------------------ */}
      {/* Header                                                               */}
      {/* ------------------------------------------------------------------ */}
      <div style={{ backgroundColor: "#001c48" }} className="pt-12 pb-5 px-4">
        {/* Top bar */}
        <div className="flex items-center justify-between mb-5">
          <img src="/logo-light.png" alt="Ball Masters Florida" style={{ width: 80, height: "auto" }} />
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

        {/* Greeting */}
        <div className="mb-5">
          <p className="text-sm font-medium" style={{ color: "#01fff9" }}>{greeting},</p>
          <h1 className="text-2xl font-extrabold text-white leading-tight mt-0.5">{studentName}</h1>
        </div>

        {/* Stats — 3 cards */}
        <div className="grid grid-cols-3 gap-2">
          {/* Assigned */}
          <div className="rounded-xl text-center py-3 px-1" style={{ backgroundColor: "rgba(255,255,255,0.12)" }}>
            <svg className="h-4 w-4 mb-1 mx-auto" style={{ color: "#01fff9" }} viewBox="0 0 24 24" fill="currentColor">
              <path d="M4.5 4.5a3 3 0 00-3 3v9a3 3 0 003 3h8.25a3 3 0 003-3v-9a3 3 0 00-3-3H4.5zM19.94 18.75l-2.69-2.69V7.94l2.69-2.69c.944-.945 2.56-.276 2.56 1.06v11.38c0 1.336-1.616 2.005-2.56 1.06z" />
            </svg>
            <div className="text-lg font-extrabold text-white leading-none">{videos.length}</div>
            <div className="text-xs mt-0.5 leading-tight" style={{ color: "rgba(1,255,249,0.7)" }}>Assigned</div>
          </div>

          {/* Watched */}
          <div className="rounded-xl text-center py-3 px-1" style={{ backgroundColor: "rgba(255,255,255,0.12)" }}>
            <svg className="h-4 w-4 mb-1 mx-auto" style={{ color: "#01fff9" }} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
            </svg>
            <div className="text-lg font-extrabold text-white leading-none">{watchedCount}</div>
            <div className="text-xs mt-0.5 leading-tight" style={{ color: "rgba(1,255,249,0.7)" }}>Watched</div>
          </div>

          {/* New */}
          <div className="rounded-xl text-center py-3 px-1" style={{ backgroundColor: "rgba(255,255,255,0.12)" }}>
            <svg className="h-4 w-4 mb-1 mx-auto" style={{ color: "#01fff9" }} viewBox="0 0 24 24" fill="currentColor">
              <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM12.75 9a.75.75 0 00-1.5 0v2.25H9a.75.75 0 000 1.5h2.25V15a.75.75 0 001.5 0v-2.25H15a.75.75 0 000-1.5h-2.25V9z" clipRule="evenodd" />
            </svg>
            <div className="text-lg font-extrabold leading-none text-white">{unwatchedCount}</div>
            <div className="text-xs mt-0.5 leading-tight" style={{ color: "rgba(1,255,249,0.7)" }}>New</div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Content                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="px-4 py-5 space-y-7">

        {/* Quick Actions */}
        <div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Quick Actions</h2>
          <div className="grid grid-cols-3 gap-3">
            {[
              {
                label: "Book Lesson", href: "/student/calendar",
                icon: <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" /></svg>,
              },
              {
                label: "Message Coach", href: "/student/messages",
                icon: <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z" /></svg>,
              },
              {
                label: "All Videos", href: "/student/videos",
                icon: <svg className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 01-1.125-1.125M3.375 19.5h1.5C5.496 19.5 6 18.996 6 18.375m-3.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-1.5A1.125 1.125 0 0118 18.375M20.625 4.5H3.375m17.25 0c.621 0 1.125.504 1.125 1.125M20.625 4.5h-1.5C18.504 4.5 18 5.004 18 5.625m3.75 0v1.5c0 .621-.504 1.125-1.125 1.125M3.375 4.5c-.621 0-1.125.504-1.125 1.125M3.375 4.5h1.5C5.496 4.5 6 5.004 6 5.625m-3.75 0v1.5c0 .621.504 1.125 1.125 1.125m0 0h1.5m-1.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m1.5-3.75C6.504 8.25 7 7.746 7 7.125v-1.5M4.875 8.25C5.496 8.25 6 8.754 6 9.375v1.5m0-5.25v5.25m0-5.25C6 5.004 6.504 4.5 7.125 4.5h9.75c.621 0 1.125.504 1.125 1.125m1.125 2.625h1.5m-1.5 0A1.125 1.125 0 0118 7.125v-1.5m1.125 2.625c-.621 0-1.125.504-1.125 1.125v1.5m2.625-2.625c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125M18 5.625v5.25M7.125 12h9.75m-9.75 0A1.125 1.125 0 016 10.875M7.125 12C6.504 12 6 12.504 6 13.125m0-2.25C6 11.496 5.496 12 4.875 12M18 10.875c0 .621-.504 1.125-1.125 1.125M18 10.875c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-7.5 0h7.5" /></svg>,
              },
            ].map(action => (
              <Link key={action.href} href={action.href}>
                <div className="rounded-xl p-4 flex flex-col items-center justify-center gap-2 active:opacity-80 transition shadow-sm h-full" style={{ backgroundColor: "#001c48" }}>
                  {action.icon}
                  <span className="text-xs font-semibold text-white text-center leading-tight">{action.label}</span>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Activity */}
        <div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Activity</h2>

          {notifications.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 py-8 text-center px-4">
              <svg className="h-8 w-8 text-gray-200 mx-auto mb-2" viewBox="0 0 24 24" fill="currentColor">
                <path fillRule="evenodd" d="M2.25 12c0-5.385 4.365-9.75 9.75-9.75s9.75 4.365 9.75 9.75-4.365 9.75-9.75 9.75S2.25 17.385 2.25 12zm13.36-1.814a.75.75 0 10-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 00-1.06 1.06l2.25 2.25a.75.75 0 001.14-.094l3.75-5.25z" clipRule="evenodd" />
              </svg>
              <p className="text-sm text-gray-400">You&apos;re all caught up!</p>
              <p className="text-xs text-gray-400 mt-0.5">New videos, messages, and updates will appear here.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {notifications.slice(0, 6).map(n => {
                const ts = n.createdAt;
                const diff = ts ? Date.now() - ts.seconds * 1000 : 0;
                const m = Math.floor(diff / 60000);
                const ago = m < 1 ? "just now" : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.floor(m / 60)}h ago` : `${Math.floor(m / 1440)}d ago`;
                return (
                  <div key={n.id} className="cursor-pointer" onClick={() => { markRead([n.id]); router.push(n.link); }}>
                    <div className="bg-white rounded-xl border border-gray-200 p-3.5 flex gap-3 hover:shadow-sm active:opacity-90 transition">
                      <div className="h-9 w-9 rounded-full flex items-center justify-center shrink-0" style={{ backgroundColor: "rgba(1,255,249,0.12)" }}>
                        {n.type === "new_video" && <svg className="h-4 w-4" style={{ color: "#001c48" }} viewBox="0 0 24 24" fill="currentColor"><path d="M4.5 4.5a3 3 0 00-3 3v9a3 3 0 003 3h8.25a3 3 0 003-3v-9a3 3 0 00-3-3H4.5zM19.94 18.75l-2.69-2.69V7.94l2.69-2.69c.944-.945 2.56-.276 2.56 1.06v11.38c0 1.336-1.616 2.005-2.56 1.06z" /></svg>}
                        {n.type === "new_message" && <svg className="h-4 w-4" style={{ color: "#001c48" }} viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M4.848 2.771A49.144 49.144 0 0112 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 01-3.476.383.39.39 0 00-.297.17l-2.755 4.133a.75.75 0 01-1.248 0l-2.755-4.133a.39.39 0 00-.297-.17 48.9 48.9 0 01-3.476-.384c-1.978-.29-3.348-2.024-3.348-3.97V6.741c0-1.946 1.37-3.68 3.348-3.97z" clipRule="evenodd" /></svg>}
                        {n.type === "new_comment" && <svg className="h-4 w-4" style={{ color: "#001c48" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 01.865-.501 48.172 48.172 0 003.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0012 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018z" /></svg>}
                        {(n.type === "booking_approved" || n.type === "booking_declined" || n.type === "booking") && <svg className="h-4 w-4" style={{ color: "#001c48" }} viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zm13.5 9a1.5 1.5 0 00-1.5-1.5H5.25a1.5 1.5 0 00-1.5 1.5v7.5a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5v-7.5z" clipRule="evenodd" /></svg>}
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
          )}
        </div>

        {/* Continue Watching */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Continue Watching</h2>
            <div className="flex items-center gap-2">
              <ViewToggle value={viewMode} onChange={setViewMode} />
              {videos.length > 6 && (
                <Link href="/student/videos" className="text-xs font-semibold" style={{ color: "#001c48" }}>
                  See all →
                </Link>
              )}
            </div>
          </div>

          {videos.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 py-10 text-center px-4">
              <svg className="h-10 w-10 text-gray-200 mx-auto mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9A2.25 2.25 0 0013.5 5.25h-9A2.25 2.25 0 002.25 7.5v9A2.25 2.25 0 004.5 18.75z" />
              </svg>
              <p className="text-sm font-medium text-gray-500 mb-1">No videos yet</p>
              <p className="text-xs text-gray-400">Your coach will assign videos here. Check back soon!</p>
            </div>
          ) : (
            <>
              {viewMode === "grid" ? (
                <div className="grid grid-cols-2 gap-2.5">
                  {continueWatching.map(v => {
                    const isWatched = uid ? v.viewedBy.includes(uid) : false;
                    return (
                      <div key={v.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <Link href={`/student/videos/${v.id}`}>
                          <div className="flex items-center justify-center h-16" style={{ backgroundColor: isWatched ? "#f9fafb" : "rgba(1,255,249,0.08)" }}>
                            <svg className="h-7 w-7" style={{ color: isWatched ? "#d1d5db" : "#001c48" }} viewBox="0 0 24 24" fill="currentColor">
                              <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
                            </svg>
                          </div>
                        </Link>
                        <div className="p-2.5">
                          <Link href={`/student/videos/${v.id}`}>
                            <div className="flex items-start gap-1 mb-0.5">
                              <p className="text-xs font-bold text-gray-900 line-clamp-2 leading-snug flex-1 min-w-0 hover:underline">{v.title}</p>
                              <span className="shrink-0 text-xs font-bold px-1.5 py-0.5 rounded-full" style={isWatched ? { backgroundColor: "#f3f4f6", color: "#9ca3af" } : { backgroundColor: "#01fff9", color: "#001c48" }}>
                                {isWatched ? "✓" : "New"}
                              </span>
                            </div>
                          </Link>
                          <VideoMetaRows v={v} studentName={studentName} uid={uid!} avatarId={avatarId} size={24} abbreviate />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : viewMode === "list" ? (
                <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  {continueWatching.map((v, i) => {
                    const isWatched = uid ? v.viewedBy.includes(uid) : false;
                    return (
                      <Link key={v.id} href={`/student/videos/${v.id}`}>
                        <div className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 active:bg-gray-100 transition" style={{ borderTop: i > 0 ? "1px solid #f3f4f6" : undefined }}>
                          <svg className="h-4 w-4 shrink-0" style={{ color: isWatched ? "#d1d5db" : "#001c48" }} viewBox="0 0 24 24" fill="currentColor">
                            <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
                          </svg>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-gray-900 truncate">{v.title}</p>
                            <VideoMetaRows v={v} studentName={studentName} uid={uid!} avatarId={avatarId} size={26} />
                          </div>
                          <span className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full" style={isWatched ? { backgroundColor: "#f3f4f6", color: "#9ca3af" } : { backgroundColor: "#01fff9", color: "#001c48" }}>
                            {isWatched ? "Watched" : "New"}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-2.5">
                  {continueWatching.map(v => {
                    const isWatched = uid ? v.viewedBy.includes(uid) : false;
                    return (
                      <div key={v.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <div className="p-4 pb-3">
                          <div className="flex items-start gap-2">
                            <div className="flex-1 min-w-0">
                              <Link href={`/student/videos/${v.id}`}>
                                <h3 className="text-sm font-bold text-gray-900 truncate hover:underline">{v.title}</h3>
                              </Link>
                              <VideoMetaRows v={v} studentName={studentName} uid={uid!} avatarId={avatarId} size={26} />
                            </div>
                            <span className="shrink-0 text-xs font-semibold px-1.5 py-0.5 rounded-full" style={isWatched ? { backgroundColor: "#f3f4f6", color: "#9ca3af" } : { backgroundColor: "#01fff9", color: "#001c48" }}>
                              {isWatched ? "Watched" : "New"}
                            </span>
                          </div>
                        </div>
                        <div className="border-t border-gray-100">
                          <Link href={`/student/videos/${v.id}`}>
                            <button className="w-full py-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition flex items-center justify-center gap-1">
                              <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L8.029 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653z" />
                              </svg>
                              Watch
                            </button>
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              {videos.length > 6 && (
                <Link href="/student/videos">
                  <div className="text-center py-3 text-sm font-semibold" style={{ color: "#001c48" }}>
                    View all {videos.length} videos →
                  </div>
                </Link>
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
          const badge = item.href === "/student/videos" ? newVideo : item.href === "/student/messages" ? newMessage : item.href === "/student/calendar" ? bookingUpdate : 0;
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
