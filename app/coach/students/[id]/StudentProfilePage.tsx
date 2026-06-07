"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import type { Booking } from "@/lib/sessionTypes";
import ViewToggle from "@/components/ViewToggle";
import { useViewMode } from "@/lib/useViewMode";
import InitialsAvatar from "@/components/InitialsAvatar";

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
function InviteIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M19.902 4.098a3.75 3.75 0 00-5.304 0l-4.5 4.5a3.75 3.75 0 001.035 6.037.75.75 0 01-.646 1.353 5.25 5.25 0 01-1.449-8.45l4.5-4.5a5.25 5.25 0 117.424 7.424l-1.757 1.757a.75.75 0 11-1.06-1.06l1.757-1.757a3.75 3.75 0 000-5.304zm-7.389 4.267a.75.75 0 011-.353 5.25 5.25 0 011.449 8.45l-4.5 4.5a5.25 5.25 0 11-7.424-7.424l1.757-1.757a.75.75 0 111.06 1.06l-1.757 1.757a3.75 3.75 0 105.304 5.304l4.5-4.5a3.75 3.75 0 00-1.035-6.037.75.75 0 01-.354-1z" clipRule="evenodd" /></svg>;
}
function CalendarIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zm13.5 9a1.5 1.5 0 00-1.5-1.5H5.25a1.5 1.5 0 00-1.5 1.5v7.5a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5v-7.5z" clipRule="evenodd" /></svg>;
}

const NAV_ITEMS = [
  { href: "/coach/dashboard", label: "Home", Icon: HomeIcon },
  { href: "/coach/videos", label: "Videos", Icon: VideoIcon },
  { href: "/coach/students", label: "Students", Icon: StudentsIcon },
  { href: "/coach/calendar", label: "Calendar", Icon: CalendarIcon },
  { href: "/coach/invite", label: "Invite", Icon: InviteIcon },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StudentDoc {
  fullName: string;
  email: string;
  avatarId?: string;
}

interface VideoDoc {
  id: string;
  title: string;
  coachName: string;
  createdAt: string;
  viewedBy: string[];
  studentIds: string[];
  type?: string;
  coachVideoKey?: string;
}

function abbreviateName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return name;
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

function VideoMetaRows({ v, student, studentId, size, abbreviate }: {
  v: VideoDoc; student: StudentDoc; studentId: string; size: number; abbreviate?: boolean;
}) {
  const extra = Math.max(0, v.studentIds.length - 1);
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
        <span className="text-xs text-gray-700 truncate">{abbreviate ? abbreviateName(v.coachName) : (v.coachName || "Unknown")}</span>
      </div>
      <div className="flex items-center gap-1.5 mt-0.5">
        <span className="text-xs text-gray-400 shrink-0" style={{ width: labelW }}>Student:</span>
        <InitialsAvatar name={student.fullName} id={studentId} size={size} variant="student" avatarId={student.avatarId || undefined} />
        <span className="text-xs text-gray-700 truncate">
          {abbreviate ? student.fullName.split(" ")[0] : student.fullName}
          {extra > 0 ? ` +${extra} more` : ""}
        </span>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function StudentProfilePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuth();
  const [viewMode, setViewMode] = useViewMode("student-profile");

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [student, setStudent] = useState<StudentDoc | null>(null);
  const [videos, setVideos] = useState<VideoDoc[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    if (!id) return;

    (async () => {
      try {
        const [studentSnap, videosSnap] = await Promise.all([
          getDoc(doc(db, "users", id)),
          getDocs(query(collection(db, "videos"), where("studentIds", "array-contains", id))),
        ]);

        if (!studentSnap.exists()) {
          setNotFound(true);
          setLoading(false);
          return;
        }

        setStudent(studentSnap.data() as StudentDoc);

        const videoList: VideoDoc[] = videosSnap.docs
          .map(d => ({
            id: d.id,
            title: (d.data().title as string) ?? "Untitled",
            coachName: (d.data().coachName as string) ?? "",
            createdAt: (d.data().createdAt as string) ?? "",
            viewedBy: (d.data().viewedBy as string[]) ?? [],
            studentIds: (d.data().studentIds as string[]) ?? [],
            type: d.data().type as string | undefined,
            coachVideoKey: d.data().coachVideoKey as string | undefined,
          }))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setVideos(videoList);

        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
        const bookingsSnap = await getDocs(query(
          collection(db, "bookings"),
          where("studentId", "==", id),
          where("status", "==", "confirmed"),
        ));
        const bookingList: Booking[] = bookingsSnap.docs
          .map(d => ({ id: d.id, ...(d.data() as Omit<Booking, "id">) }))
          .filter(b => b.date >= todayStr)
          .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
        setBookings(bookingList);
      } catch (err) {
        console.error("[student-profile]", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [authLoading, user, id, router]);

  const assigned = videos.length;
  const watched = videos.filter(v => v.viewedBy.includes(id)).length;
  const watchRate = assigned > 0 ? Math.round((watched / assigned) * 100) : 0;

  if (authLoading || loading) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <svg className="h-10 w-10 animate-spin text-white opacity-40" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      </main>
    );
  }

  if (notFound || !student) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-lg font-semibold text-gray-700">Student not found</p>
          <Link href="/coach/students" className="mt-3 inline-block text-sm font-medium hover:underline" style={{ color: "#001c48" }}>
            ← Back to students
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-20">

      {/* Header */}
      <div style={{ backgroundColor: "#001c48" }} className="pt-12 pb-5 px-4">
        <div className="flex items-center gap-2 mb-3">
          <img src="/logo-light.png" alt="Ball Masters Florida" style={{ height: "32px", width: "auto" }} />
        </div>

        <Link
          href="/coach/students"
          className="inline-flex items-center gap-1 text-sm mb-4"
          style={{ color: "rgba(1,255,249,0.7)" }}
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 010 1.06L8.06 10l3.72 3.72a.75.75 0 11-1.06 1.06l-4.25-4.25a.75.75 0 010-1.06l4.25-4.25a.75.75 0 011.06 0z" clipRule="evenodd" />
          </svg>
          Back
        </Link>

        {/* Student identity */}
        <div className="flex items-center gap-3 mb-5">
          <InitialsAvatar name={student.fullName} id={id} size={56} variant="student" avatarId={student.avatarId || undefined} />
          <div>
            <h1 className="text-xl font-extrabold text-white leading-tight">{student.fullName}</h1>
            <p className="text-sm" style={{ color: "rgba(1,255,249,0.7)" }}>{student.email}</p>
          </div>
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Assigned", value: assigned },
            { label: "Watched", value: watched },
            { label: "Watch Rate", value: `${watchRate}%` },
          ].map(s => (
            <div
              key={s.label}
              className="rounded-xl text-center py-3 px-1"
              style={{ backgroundColor: "rgba(255,255,255,0.12)" }}
            >
              <div className="text-xl font-extrabold text-white leading-none">{s.value}</div>
              <div className="text-xs mt-0.5 leading-tight" style={{ color: "rgba(1,255,249,0.7)" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 space-y-5">

        {/* Videos */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400">Videos</h2>
            {videos.length > 0 && <ViewToggle value={viewMode} onChange={setViewMode} />}
          </div>
          {videos.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 px-4 py-6 text-center text-sm text-gray-400">
              No videos assigned yet
            </div>
          ) : viewMode === "list" ? (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {videos.map((v, i) => {
                const isDrill = v.type === "drill_comparison" || !!v.coachVideoKey;
                const href = isDrill ? `/coach/videos/${v.id}/drill` : `/coach/videos/${v.id}/annotate`;
                const isWatched = v.viewedBy.includes(id);
                return (
                  <Link key={v.id} href={href}>
                    <div
                      className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 active:bg-gray-100 transition"
                      style={{ borderTop: i > 0 ? "1px solid #f3f4f6" : undefined }}
                    >
                      <svg className="h-4 w-4 shrink-0 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
                        <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{v.title}</p>
                        <VideoMetaRows v={v} student={student!} studentId={id} size={26} />
                      </div>
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0"
                        style={isWatched
                          ? { backgroundColor: "#dcfce7", color: "#15803d" }
                          : { backgroundColor: "rgba(1,255,249,0.15)", color: "#001c48" }}
                      >
                        {isWatched ? "Watched" : "New"}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-2 gap-3">
              {videos.map(v => {
                const isDrill = v.type === "drill_comparison" || !!v.coachVideoKey;
                const href = isDrill ? `/coach/videos/${v.id}/drill` : `/coach/videos/${v.id}/annotate`;
                const isWatched = v.viewedBy.includes(id);
                return (
                  <div key={v.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <Link href={href}>
                      <div className="flex items-center justify-center h-16" style={{ backgroundColor: "rgba(0,28,72,0.05)" }}>
                        <svg className="h-7 w-7 text-gray-300" viewBox="0 0 24 24" fill="currentColor">
                          <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </Link>
                    <div className="p-2.5">
                      <Link href={href}>
                        <p className="text-xs font-bold text-gray-900 line-clamp-2 leading-snug mb-1 hover:underline">{v.title}</p>
                      </Link>
                      <VideoMetaRows v={v} student={student!} studentId={id} size={24} abbreviate />
                      <span
                        className="text-xs font-semibold px-1.5 py-0.5 mt-1.5 inline-block rounded-full"
                        style={isWatched
                          ? { backgroundColor: "#dcfce7", color: "#15803d" }
                          : { backgroundColor: "rgba(1,255,249,0.15)", color: "#001c48" }}
                      >
                        {isWatched ? "Watched" : "New"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              {videos.map(v => {
                const isDrill = v.type === "drill_comparison" || !!v.coachVideoKey;
                const href = isDrill ? `/coach/videos/${v.id}/drill` : `/coach/videos/${v.id}/annotate`;
                const isWatched = v.viewedBy.includes(id);
                return (
                  <div key={v.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="p-4 pb-3">
                      <div className="flex items-start gap-2 mb-3">
                        <div className="flex-1 min-w-0">
                          <Link href={href}>
                            <h3 className="text-sm font-bold text-gray-900 leading-snug hover:underline truncate cursor-pointer">{v.title}</h3>
                          </Link>
                          <VideoMetaRows v={v} student={student!} studentId={id} size={26} />
                        </div>
                        <span
                          className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0"
                          style={isWatched
                            ? { backgroundColor: "#dcfce7", color: "#15803d" }
                            : { backgroundColor: "rgba(1,255,249,0.15)", color: "#001c48" }}
                        >
                          {isWatched ? "Watched" : "New"}
                        </span>
                      </div>
                    </div>
                    <div className="border-t border-gray-100">
                      <Link href={href}>
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
        </section>

        {/* Upcoming sessions */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Upcoming Sessions</h2>
          {bookings.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 px-4 py-6 text-center text-sm text-gray-400">
              No upcoming sessions
            </div>
          ) : (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {bookings.map((b, i) => {
                const dateStr = b.date
                  ? new Date(b.date + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
                  : b.date;
                return (
                  <div
                    key={b.id}
                    className="flex items-center gap-3 px-4 py-3.5"
                    style={{ borderTop: i > 0 ? "1px solid #f3f4f6" : undefined }}
                  >
                    <div
                      className="h-9 w-9 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: "rgba(1,255,249,0.12)" }}
                    >
                      <svg className="h-4 w-4" style={{ color: "#001c48" }} viewBox="0 0 24 24" fill="currentColor">
                        <path fillRule="evenodd" d="M6.75 2.25A.75.75 0 017.5 3v1.5h9V3A.75.75 0 0118 3v1.5h.75a3 3 0 013 3v11.25a3 3 0 01-3 3H5.25a3 3 0 01-3-3V7.5a3 3 0 013-3H6V3a.75.75 0 01.75-.75zm13.5 9a1.5 1.5 0 00-1.5-1.5H5.25a1.5 1.5 0 00-1.5 1.5v7.5a1.5 1.5 0 001.5 1.5h13.5a1.5 1.5 0 001.5-1.5v-7.5z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-gray-900 truncate">{b.title}</p>
                      <p className="text-xs text-gray-400 mt-0.5">{dateStr} · {b.startTime}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

      </div>

      {/* Bottom nav */}
      <nav
        className="fixed bottom-0 inset-x-0 bg-gray-900 border-t border-gray-800 flex"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {NAV_ITEMS.map(item => {
          const isActive = pathname === item.href ||
            (item.href === "/coach/students" && pathname.startsWith("/coach/students"));
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex-1 flex flex-col items-center py-2.5 gap-0.5 transition"
              style={isActive ? { color: "#01fff9" } : undefined}
            >
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
