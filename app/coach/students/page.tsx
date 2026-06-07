"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import ViewToggle from "@/components/ViewToggle";
import { useViewMode } from "@/lib/useViewMode";
import InitialsAvatar from "@/components/InitialsAvatar";

interface Student {
  id: string;
  fullName: string;
  email: string;
  avatarId: string;
  joinedStr: string;
}

interface StudentStat {
  videoCount: number;
  watchRate: number | null;
  lessonCount: number;
}

interface VideoData {
  studentIds: string[];
  viewedBy: string[];
}

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

function formatJoinDate(createdAt: unknown): string {
  if (!createdAt) return "";
  try {
    const ts = createdAt as { toDate?: () => Date; seconds?: number };
    const d = ts.toDate ? ts.toDate() : ts.seconds ? new Date(ts.seconds * 1000) : new Date(createdAt as string);
    return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
  } catch { return ""; }
}

type SortField = "videos" | "lessons" | "watched";

function rateColor(rate: number): string {
  if (rate >= 75) return "#16a34a";
  if (rate >= 40) return "#d97706";
  return "#dc2626";
}

export default function StudentsListPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuth();
  const [viewMode, setViewMode] = useViewMode("coach-students");

  const [loading, setLoading] = useState(true);
  const [students, setStudents] = useState<Student[]>([]);
  const [stats, setStats] = useState<Record<string, StudentStat>>({});
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortField | null>(null);
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  function handleSort(field: SortField) {
    if (sortBy === field) {
      setSortDir(d => d === "desc" ? "asc" : "desc");
    } else {
      setSortBy(field);
      setSortDir("desc");
    }
  }

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    (async () => {
      try {
        const [usersSnap, videosSnap, bookingsSnap] = await Promise.all([
          getDocs(query(collection(db, "users"), where("role", "==", "student"))),
          getDocs(collection(db, "videos")),
          getDocs(query(collection(db, "bookings"), where("status", "==", "confirmed"))),
        ]);

        const list: Student[] = usersSnap.docs
          .map(d => ({
            id: d.id,
            fullName: (d.data().fullName as string) ?? "Athlete",
            email: (d.data().email as string) ?? "",
            avatarId: (d.data().avatarId as string) ?? "",
            joinedStr: formatJoinDate(d.data().createdAt),
          }))
          .sort((a, b) => a.fullName.localeCompare(b.fullName));

        const videos: VideoData[] = videosSnap.docs.map(d => ({
          studentIds: (d.data().studentIds as string[]) ?? [],
          viewedBy: (d.data().viewedBy as string[]) ?? [],
        }));

        const lessonsBySid: Record<string, number> = {};
        bookingsSnap.docs.forEach(d => {
          const sid = d.data().studentId as string;
          if (sid) lessonsBySid[sid] = (lessonsBySid[sid] ?? 0) + 1;
        });

        const statsMap: Record<string, StudentStat> = {};
        for (const s of list) {
          const myVideos = videos.filter(v => v.studentIds.includes(s.id));
          const videoCount = myVideos.length;
          const watchedCount = myVideos.filter(v => v.viewedBy.includes(s.id)).length;
          const watchRate = videoCount > 0 ? Math.round(watchedCount / videoCount * 100) : null;
          statsMap[s.id] = { videoCount, watchRate, lessonCount: lessonsBySid[s.id] ?? 0 };
        }

        setStudents(list);
        setStats(statsMap);
      } catch (err) {
        console.error("[coach/students]", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [authLoading, user, router]);

  const filtered = students.filter(s => {
    const q = search.toLowerCase();
    return !q || s.fullName.toLowerCase().includes(q) || s.email.toLowerCase().includes(q);
  });

  const displayed = useMemo(() => {
    if (!sortBy) return filtered;
    return [...filtered].sort((a, b) => {
      const sa = stats[a.id];
      const sb = stats[b.id];
      let av: number, bv: number;
      if (sortBy === "videos") {
        av = sa?.videoCount ?? 0;
        bv = sb?.videoCount ?? 0;
      } else if (sortBy === "lessons") {
        av = sa?.lessonCount ?? 0;
        bv = sb?.lessonCount ?? 0;
      } else {
        av = sa?.watchRate ?? -1;
        bv = sb?.watchRate ?? -1;
      }
      return sortDir === "desc" ? bv - av : av - bv;
    });
  }, [filtered, sortBy, sortDir, stats]);

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

  return (
    <main className="min-h-screen bg-gray-50 pb-20">
      <div style={{ backgroundColor: "#001c48" }} className="pt-12 pb-5 px-4">
        <div className="flex items-center gap-2 mb-4">
          <img src="/logo-light.png" alt="Ball Masters Florida" style={{ height: "32px", width: "auto" }} />
        </div>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-white leading-tight">Athletes</h1>
            <p className="text-green-300 text-xs mt-0.5">{students.length} registered</p>
          </div>
          <Link href="/coach/invite">
            <button
              className="flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition hover:opacity-90"
              style={{ backgroundColor: "white", color: "#001c48" }}
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Invite
            </button>
          </Link>
        </div>
      </div>

      <div className="px-4 py-4">
        {students.length === 0 ? (
          <div className="bg-white rounded-xl border-2 border-dashed border-gray-200 py-12 text-center px-4 mt-4">
            <StudentsIcon className="h-10 w-10 text-gray-200 mx-auto mb-3" />
            <p className="text-sm font-medium text-gray-500 mb-4">No athletes have joined yet</p>
            <Link href="/coach/invite">
              <button className="rounded-lg px-6 py-2.5 text-sm font-semibold text-white hover:opacity-90 transition" style={{ backgroundColor: "#001c48" }}>
                Invite athletes
              </button>
            </Link>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3">
              <div className="relative flex-1">
                <svg className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
                </svg>
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search athletes…"
                  className="w-full pl-9 pr-4 py-2.5 text-sm text-gray-900 placeholder-gray-400 bg-white border border-gray-200 rounded-xl focus:outline-none"
                  onFocus={e => (e.target.style.borderColor = "#001c48")}
                  onBlur={e => (e.target.style.borderColor = "#e5e7eb")}
                />
              </div>
              <ViewToggle value={viewMode} onChange={setViewMode} />
            </div>

            <div className="flex gap-2 mb-3">
              {([
                { field: "videos" as SortField, label: "Videos" },
                { field: "lessons" as SortField, label: "Lessons" },
                { field: "watched" as SortField, label: "Watched" },
              ]).map(({ field, label }) => {
                const isActive = sortBy === field;
                return (
                  <button
                    key={field}
                    onClick={() => handleSort(field)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition"
                    style={isActive
                      ? { backgroundColor: "#001c48", color: "white" }
                      : { backgroundColor: "#f3f4f6", color: "#6b7280" }}
                  >
                    {label}
                    {isActive && <span className="ml-0.5">{sortDir === "desc" ? "▼" : "▲"}</span>}
                  </button>
                );
              })}
            </div>

            {filtered.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">No athletes match &ldquo;{search}&rdquo;</p>
            ) : viewMode === "list" ? (
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                {displayed.map((s, i) => {
                  const st = stats[s.id];
                  return (
                    <Link key={s.id} href={`/coach/students/${s.id}`}>
                      <div
                        className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 active:bg-gray-100 transition"
                        style={{ borderTop: i > 0 ? "1px solid #f3f4f6" : undefined }}
                      >
                        <InitialsAvatar name={s.fullName} id={s.id} size={36} variant="student" avatarId={s.avatarId || undefined} />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{s.fullName}</p>
                          <p className="text-xs text-gray-400 truncate">{s.email}</p>
                        </div>
                        {st && (
                          <div className="text-right shrink-0">
                            <p className="text-xs text-gray-500">{st.videoCount} vid{st.videoCount !== 1 ? "s" : ""} · {st.lessonCount} lesson{st.lessonCount !== 1 ? "s" : ""}</p>
                            {st.watchRate !== null && (
                              <p className="text-xs font-semibold" style={{ color: rateColor(st.watchRate) }}>{st.watchRate}% watched</p>
                            )}
                          </div>
                        )}
                        <svg className="h-4 w-4 text-gray-300 shrink-0 ml-1" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : viewMode === "cards" ? (
              <div className="space-y-3">
                {displayed.map(s => {
                  const st = stats[s.id];
                  return (
                    <Link key={s.id} href={`/coach/students/${s.id}`}>
                      <div className="bg-white rounded-xl border border-gray-200 px-4 py-4 hover:bg-gray-50 active:bg-gray-100 transition">
                        <div className="flex items-center gap-3 mb-3">
                          <InitialsAvatar name={s.fullName} id={s.id} size={52} variant="student" avatarId={s.avatarId || undefined} />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-gray-900 truncate">{s.fullName}</p>
                            <p className="text-xs text-gray-400 truncate">{s.email}</p>
                            {s.joinedStr && <p className="text-xs text-gray-300 mt-0.5">Joined {s.joinedStr}</p>}
                          </div>
                          <svg className="h-4 w-4 text-gray-300 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                          </svg>
                        </div>
                        {st && (
                          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-gray-100">
                            <div className="text-center">
                              <p className="text-base font-bold text-gray-900">{st.videoCount}</p>
                              <p className="text-xs text-gray-400">Videos</p>
                            </div>
                            <div className="text-center">
                              <p className="text-base font-bold text-gray-900">{st.lessonCount}</p>
                              <p className="text-xs text-gray-400">Lessons</p>
                            </div>
                            <div className="text-center">
                              {st.watchRate !== null ? (
                                <>
                                  <p className="text-base font-bold" style={{ color: rateColor(st.watchRate) }}>{st.watchRate}%</p>
                                  <p className="text-xs text-gray-400">Watch rate</p>
                                </>
                              ) : (
                                <>
                                  <p className="text-base font-bold text-gray-300">—</p>
                                  <p className="text-xs text-gray-400">Watch rate</p>
                                </>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {displayed.map(s => {
                  const st = stats[s.id];
                  return (
                    <Link key={s.id} href={`/coach/students/${s.id}`}>
                      <div className="bg-white rounded-xl border border-gray-200 px-3 py-4 flex flex-col items-center text-center hover:bg-gray-50 active:bg-gray-100 transition">
                        <InitialsAvatar name={s.fullName} id={s.id} size={48} variant="student" avatarId={s.avatarId || undefined} />
                        <p className="text-sm font-bold text-gray-900 mt-2 truncate w-full">{s.fullName}</p>
                        {s.joinedStr && <p className="text-xs text-gray-300 mt-0.5">Joined {s.joinedStr}</p>}
                        {st && (
                          <p className="text-xs text-gray-500 mt-2">
                            {st.videoCount}v · {st.lessonCount}l
                            {st.watchRate !== null && (
                              <span style={{ color: rateColor(st.watchRate) }}> · {st.watchRate}%</span>
                            )}
                          </p>
                        )}
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      <nav
        className="fixed bottom-0 inset-x-0 bg-gray-900 border-t border-gray-800 flex"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {NAV_ITEMS.map(item => {
          const isActive = pathname === item.href;
          return (
            <Link key={item.href} href={item.href} className="flex-1 flex flex-col items-center py-2.5 gap-0.5 transition" style={isActive ? { color: "#01fff9" } : undefined}>
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
