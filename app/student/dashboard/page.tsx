"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { clearAuthCookies } from "@/lib/cookies";
import { requestNotificationPermission } from "@/lib/notifications";

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

interface CoachActivity {
  id: string;
  videoId: string;
  videoTitle: string;
  authorName: string;
  text: string;
  createdAt: string;
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

function ChatIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path fillRule="evenodd" d="M4.848 2.771A49.144 49.144 0 0112 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 01-3.476.383.39.39 0 00-.297.17l-2.755 4.133a.75.75 0 01-1.248 0l-2.755-4.133a.39.39 0 00-.297-.17 48.9 48.9 0 01-3.476-.384c-1.978-.29-3.348-2.024-3.348-3.97V6.741c0-1.946 1.37-3.68 3.348-3.97z" clipRule="evenodd" />
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

const NAV_ITEMS = [
  { href: "/student/dashboard", label: "Home", Icon: HomeIcon },
  { href: "/student/videos", label: "My Videos", Icon: VideoIcon },
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
  const [videos, setVideos] = useState<Video[]>([]);
  const [activity, setActivity] = useState<CoachActivity[]>([]);
  const [showNotifBanner, setShowNotifBanner] = useState(false);
  const [notifEnabling, setNotifEnabling] = useState(false);

  const greeting = getGreeting();

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

        // Load coach comments in background
        if (videoDocs.length > 0) {
          const commentSnaps = await Promise.all(
            videoDocs.map(v => getDocs(collection(db, "videos", v.id, "comments")))
          );
          const coachComments: CoachActivity[] = [];
          commentSnaps.forEach((snap, i) => {
            snap.docs.forEach(d => {
              if ((d.data().role as string) === "coach") {
                coachComments.push({
                  id: d.id,
                  videoId: videoDocs[i].id,
                  videoTitle: videoDocs[i].title,
                  authorName: (d.data().authorName as string) ?? "Coach",
                  text: (d.data().text as string) ?? "",
                  createdAt: (d.data().createdAt as string) ?? "",
                });
              }
            });
          });
          coachComments.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          setActivity(coachComments.slice(0, 6));
        }
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
            style={{ backgroundColor: "#01fff9", color: "#001c48" }}
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

          {/* New / Unread — amber if > 0 */}
          <div
            className="rounded-xl text-center py-3 px-1 transition"
            style={{
              backgroundColor: unwatchedCount > 0 ? "rgba(251,191,36,0.2)" : "rgba(255,255,255,0.12)",
            }}
          >
            <svg
              className="h-4 w-4 mb-1 mx-auto"
              style={{ color: unwatchedCount > 0 ? "#fbbf24" : "#01fff9" }}
              viewBox="0 0 24 24"
              fill="currentColor"
            >
              <path fillRule="evenodd" d="M12 2.25c-5.385 0-9.75 4.365-9.75 9.75s4.365 9.75 9.75 9.75 9.75-4.365 9.75-9.75S17.385 2.25 12 2.25zM12.75 9a.75.75 0 00-1.5 0v2.25H9a.75.75 0 000 1.5h2.25V15a.75.75 0 001.5 0v-2.25H15a.75.75 0 000-1.5h-2.25V9z" clipRule="evenodd" />
            </svg>
            <div
              className="text-lg font-extrabold leading-none"
              style={{ color: unwatchedCount > 0 ? "#fbbf24" : "white" }}
            >
              {unwatchedCount}
            </div>
            <div
              className="text-xs mt-0.5 leading-tight"
              style={{ color: unwatchedCount > 0 ? "#fde68a" : "rgba(1,255,249,0.7)" }}
            >
              New
            </div>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------------ */}
      {/* Content                                                              */}
      {/* ------------------------------------------------------------------ */}
      <div className="px-4 py-5 space-y-7">

        {/* Continue Watching */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Continue Watching</h2>
            {videos.length > 6 && (
              <Link href="/student/videos" className="text-xs font-semibold" style={{ color: "#001c48" }}>
                See all →
              </Link>
            )}
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
            <div className="space-y-2.5">
              {continueWatching.map(v => {
                const isWatched = uid ? v.viewedBy.includes(uid) : false;
                const isDrill = v.type === "drill_comparison";
                return (
                  <Link key={v.id} href={`/student/videos/${v.id}`}>
                    <div
                      className="bg-white rounded-xl border border-gray-200 flex items-stretch overflow-hidden hover:shadow-sm active:opacity-90 transition"
                    >
                      {/* Left accent bar */}
                      <div
                        className="w-1 shrink-0"
                        style={{ backgroundColor: isWatched ? "#e5e7eb" : "#001c48" }}
                      />

                      {/* Play icon */}
                      <div
                        className="flex items-center justify-center w-12 shrink-0"
                        style={{ backgroundColor: isWatched ? "#f9fafb" : "rgba(1,255,249,0.08)" }}
                      >
                        <svg
                          className="h-5 w-5"
                          style={{ color: isWatched ? "#d1d5db" : "#001c48" }}
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
                        </svg>
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0 py-3 px-3">
                        <div className="flex items-start gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 truncate leading-snug">{v.title}</p>
                            <p className="text-xs text-gray-400 mt-0.5">
                              {v.coachName}
                              {v.createdAt && <> · {formatDate(v.createdAt)}</>}
                              {isDrill && <> · Drill</>}
                            </p>
                          </div>
                          <div className="shrink-0 mt-0.5">
                            {isWatched ? (
                              <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "#f3f4f6", color: "#9ca3af" }}>
                                Watched
                              </span>
                            ) : (
                              <span className="text-xs font-semibold px-1.5 py-0.5 rounded-full" style={{ backgroundColor: "rgba(1,255,249,0.15)", color: "#001c48" }}>
                                New
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Chevron */}
                      <div className="flex items-center pr-3">
                        <svg className="h-4 w-4 text-gray-300" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </div>
                  </Link>
                );
              })}

              {videos.length > 6 && (
                <Link href="/student/videos">
                  <div className="text-center py-3 text-sm font-semibold" style={{ color: "#001c48" }}>
                    View all {videos.length} videos →
                  </div>
                </Link>
              )}
            </div>
          )}
        </div>

        {/* Coach Activity */}
        <div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Recent Coach Feedback</h2>

          {activity.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 py-8 text-center px-4">
              <svg className="h-8 w-8 text-gray-200 mx-auto mb-2" viewBox="0 0 24 24" fill="currentColor">
                <path fillRule="evenodd" d="M4.848 2.771A49.144 49.144 0 0112 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 01-3.476.383.39.39 0 00-.297.17l-2.755 4.133a.75.75 0 01-1.248 0l-2.755-4.133a.39.39 0 00-.297-.17 48.9 48.9 0 01-3.476-.384c-1.978-.29-3.348-2.024-3.348-3.97V6.741c0-1.946 1.37-3.68 3.348-3.97z" clipRule="evenodd" />
              </svg>
              <p className="text-sm text-gray-400">No coach feedback yet.</p>
              <p className="text-xs text-gray-400 mt-0.5">Comments will appear here once your coach responds.</p>
            </div>
          ) : (
            <div className="space-y-2.5">
              {activity.map(item => (
                <Link key={item.id} href={`/student/videos/${item.videoId}`}>
                  <div className="bg-white rounded-xl border border-gray-200 p-4 flex gap-3 hover:shadow-sm active:opacity-90 transition">
                    {/* Coach avatar */}
                    <div
                      className="h-9 w-9 rounded-full flex items-center justify-center shrink-0 text-sm font-bold"
                      style={{ backgroundColor: "#dbeafe", color: "#001c48" }}
                    >
                      {item.authorName.charAt(0).toUpperCase()}
                    </div>

                    {/* Content */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 mb-0.5 flex-wrap">
                        <span className="text-xs font-semibold text-gray-800">{item.authorName}</span>
                        <span
                          className="text-xs font-medium px-1.5 py-0.5 rounded-full"
                          style={{ backgroundColor: "#001c48", color: "#01fff9" }}
                        >
                          Coach
                        </span>
                        <span className="text-xs text-gray-400 ml-auto">{timeAgo(item.createdAt)}</span>
                      </div>
                      <p className="text-xs text-gray-500 mb-1 truncate">
                        on <span className="font-medium text-gray-700">{item.videoTitle}</span>
                      </p>
                      <p className="text-sm text-gray-700 leading-snug line-clamp-2">{item.text}</p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
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
          return (
            <Link key={item.href} href={item.href} className="flex-1 flex flex-col items-center py-2.5 gap-0.5 transition" style={isActive ? { color: "#01fff9" } : {}}>
              <item.Icon className={`h-5 w-5 ${isActive ? "" : "text-gray-500"}`} />
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
