"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import ViewToggle from "@/components/ViewToggle";
import { useViewMode } from "@/lib/useViewMode";
import InitialsAvatar from "@/components/InitialsAvatar";
import { useNotificationCounts } from "@/lib/NotificationsContext";

interface Video {
  id: string;
  title: string;
  coachName: string;
  coachId: string;
  studentIds: string[];
  fileName: string;
  viewedBy: string[];
  createdAt: string;
  status: string;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  } catch { return ""; }
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
  return (
    <>
      <p className="text-xs text-gray-400 mt-0.5">{formatDate(v.createdAt)}</p>
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
function ChatIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M4.848 2.771A49.144 49.144 0 0112 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 01-3.476.383.39.39 0 00-.297.17l-2.755 4.133a.75.75 0 01-1.248 0l-2.755-4.133a.39.39 0 00-.297-.17 48.9 48.9 0 01-3.476-.384c-1.978-.29-3.348-2.024-3.348-3.97V6.741c0-1.946 1.37-3.68 3.348-3.97z" clipRule="evenodd" /></svg>;
}

const NAV_ITEMS = [
  { href: "/student/dashboard", label: "Home", Icon: HomeIcon },
  { href: "/student/videos", label: "My Videos", Icon: VideoIcon },
  { href: "/student/calendar", label: "Calendar", Icon: CalendarIcon },
  { href: "/student/messages", label: "Messages", Icon: ChatIcon },
  { href: "/student/profile", label: "Profile", Icon: ProfileIcon },
];

export default function StudentVideosPage() {
  const router = useRouter();
  const pathname = usePathname();
  const [viewMode, setViewMode] = useViewMode("student-videos");
  const { newVideo, newMessage, bookingUpdate } = useNotificationCounts();
  const [videos, setVideos] = useState<Video[]>([]);
  const [uid, setUid] = useState<string | null>(null);
  const [studentName, setStudentName] = useState("");
  const [avatarId, setAvatarId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

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
        const list = videosSnap.docs
          .map(d => ({ id: d.id, ...(d.data() as Omit<Video, "id">) }))
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setVideos(list);
      } catch (err) {
        console.error("[student/videos]", err);
        setError("Failed to load your videos. Please refresh.");
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, [router]);

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
      <div style={{ backgroundColor: "#001c48" }} className="pt-12 pb-5 px-4">
        <div className="flex items-center gap-2 mb-4">
          <img src="/logo-light.png" alt="Ball Masters Florida" style={{ height: "32px", width: "auto" }} />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-white leading-tight">My Videos</h1>
            <p className="text-green-300 text-xs mt-0.5">{videos.length} video{videos.length !== 1 ? "s" : ""}</p>
          </div>
          <ViewToggle value={viewMode} onChange={setViewMode} />
        </div>
      </div>

      <div className="px-4 py-4">
        {error && (
          <div className="mb-4 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">{error}</div>
        )}

        {videos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
              <svg className="h-8 w-8 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9A2.25 2.25 0 0013.5 5.25h-9A2.25 2.25 0 002.25 7.5v9A2.25 2.25 0 004.5 18.75z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-600 mb-1">No videos yet</h2>
            <p className="text-sm text-gray-400 max-w-xs">Your coach will assign videos to you here. Check back soon!</p>
          </div>
        ) : viewMode === "list" ? (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {videos.map((video, i) => {
              const watched = uid ? (video.viewedBy ?? []).includes(uid) : false;
              return (
                <Link key={video.id} href={`/student/videos/${video.id}`}>
                  <div
                    className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 active:bg-gray-100 transition"
                    style={{ borderTop: i > 0 ? "1px solid #f3f4f6" : undefined }}
                  >
                    <svg className="h-4 w-4 shrink-0" style={{ color: watched ? "#d1d5db" : "#001c48" }} viewBox="0 0 24 24" fill="currentColor">
                      <path fillRule="evenodd" d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-bold text-gray-900 truncate">{video.title}</p>
                      <VideoMetaRows v={video} studentName={studentName} uid={uid!} avatarId={avatarId} size={26} />
                    </div>
                    <span
                      className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full"
                      style={watched ? { backgroundColor: "#f3f4f6", color: "#9ca3af" } : { backgroundColor: "#01fff9", color: "#001c48" }}
                    >
                      {watched ? "Watched" : "New"}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-2 gap-3">
            {videos.map(video => {
              const watched = uid ? (video.viewedBy ?? []).includes(uid) : false;
              return (
                <div key={video.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <Link href={`/student/videos/${video.id}`}>
                    <div className="flex items-center justify-center h-16" style={{ backgroundColor: watched ? "#f9fafb" : "rgba(1,255,249,0.08)" }}>
                      <svg className="h-7 w-7" style={{ color: watched ? "#d1d5db" : "#001c48" }} viewBox="0 0 24 24" fill="currentColor">
                        <path fillRule="evenodd" d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </Link>
                  <div className="p-2.5">
                    <Link href={`/student/videos/${video.id}`}>
                      <div className="flex items-start gap-1 mb-0.5">
                        <p className="text-xs font-bold text-gray-900 line-clamp-2 leading-snug flex-1 min-w-0 hover:underline">{video.title}</p>
                        <span className="shrink-0 text-xs font-bold px-1.5 py-0.5 rounded-full" style={watched ? { backgroundColor: "#f3f4f6", color: "#9ca3af" } : { backgroundColor: "#01fff9", color: "#001c48" }}>
                          {watched ? "✓" : "New"}
                        </span>
                      </div>
                    </Link>
                    <VideoMetaRows v={video} studentName={studentName} uid={uid!} avatarId={avatarId} size={24} abbreviate />
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="space-y-3">
            {videos.map(video => {
              const watched = uid ? (video.viewedBy ?? []).includes(uid) : false;
              return (
                <div key={video.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                  <div className="p-4 pb-3">
                    <div className="flex items-start gap-2">
                      <div className="flex-1 min-w-0">
                        <Link href={`/student/videos/${video.id}`}>
                          <h3 className="text-sm font-bold text-gray-900 truncate hover:underline">{video.title}</h3>
                        </Link>
                        <VideoMetaRows v={video} studentName={studentName} uid={uid!} avatarId={avatarId} size={26} />
                      </div>
                      <span
                        className="shrink-0 text-xs font-semibold px-2 py-0.5 rounded-full"
                        style={watched ? { backgroundColor: "#f3f4f6", color: "#9ca3af" } : { backgroundColor: "#01fff9", color: "#001c48" }}
                      >
                        {watched ? "Watched" : "New"}
                      </span>
                    </div>
                  </div>
                  <div className="border-t border-gray-100">
                    <Link href={`/student/videos/${video.id}`}>
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
      </div>

      <nav className="fixed bottom-0 inset-x-0 bg-gray-900 border-t border-gray-800 flex" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {NAV_ITEMS.map(item => {
          const isActive = pathname === item.href;
          const badge =
            item.href === "/student/videos" ? newVideo :
            item.href === "/student/messages" ? newMessage :
            item.href === "/student/calendar" ? bookingUpdate : 0;
          return (
            <Link key={item.href} href={item.href} className="flex-1 flex flex-col items-center py-2.5 gap-0.5 transition" style={isActive ? { color: "#01fff9" } : undefined}>
              <div className="relative">
                <item.Icon className={`h-5 w-5 ${isActive ? "" : "text-gray-500"}`} />
                {badge > 0 && (
                  <span className="absolute -top-1 -right-1.5 h-4 min-w-[16px] flex items-center justify-center rounded-full px-0.5" style={{ backgroundColor: "#01fff9", color: "#001c48", fontSize: "9px", fontWeight: 700 }}>
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </div>
              <span className={`text-xs ${isActive ? "font-semibold" : "text-gray-500"}`}>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </main>
  );
}
