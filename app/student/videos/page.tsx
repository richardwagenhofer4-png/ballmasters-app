"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, getDocs, query, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import ViewToggle from "@/components/ViewToggle";
import { useViewMode } from "@/lib/useViewMode";

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
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export default function StudentVideosPage() {
  const router = useRouter();
  const [viewMode, setViewMode] = useViewMode("student-videos");
  const [videos, setVideos] = useState<Video[]>([]);
  const [uid, setUid] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push("/login"); return; }
      setUid(user.uid);
      try {
        const q = query(
          collection(db, "videos"),
          where("studentIds", "array-contains", user.uid)
        );
        const snap = await getDocs(q);
        const list = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() as Omit<Video, "id">) }))
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

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div>
              <h1 className="text-2xl font-extrabold leading-tight" style={{ color: "#001c48" }}>
                My Videos
              </h1>
              <p className="text-xs text-gray-400">Ball Masters Florida</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <ViewToggle value={viewMode} onChange={setViewMode} />
            <Link
              href="/student/dashboard"
              className="text-sm font-medium text-gray-500 hover:text-gray-700 transition"
            >
              ← Dashboard
            </Link>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading ? (
          <div className="flex justify-center py-20">
            <svg className="h-8 w-8 animate-spin" style={{ color: "#001c48" }} viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
          </div>
        ) : videos.length === 0 ? (
          /* Empty state */
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
              <svg className="h-8 w-8 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9A2.25 2.25 0 0013.5 5.25h-9A2.25 2.25 0 002.25 7.5v9A2.25 2.25 0 004.5 18.75z" />
              </svg>
            </div>
            <h2 className="text-lg font-semibold text-gray-600 mb-1">No videos yet</h2>
            <p className="text-sm text-gray-400 max-w-xs">
              Your coach will assign videos to you here. Check back soon!
            </p>
          </div>
        ) : (
          /* Video list — layout switches with viewMode */
          viewMode === "grid" ? (
            <div className="grid grid-cols-2 gap-3">
              {videos.map((video) => {
                const watched = uid ? (video.viewedBy ?? []).includes(uid) : false;
                return (
                  <Link key={video.id} href={`/student/videos/${video.id}`} className="group block bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden">
                    <div className="flex items-center justify-center h-24" style={{ backgroundColor: watched ? "#f9fafb" : "rgba(1,255,249,0.08)" }}>
                      <svg className="h-10 w-10" style={{ color: watched ? "#d1d5db" : "#001c48" }} viewBox="0 0 24 24" fill="currentColor">
                        <path fillRule="evenodd" d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
                      </svg>
                    </div>
                    <div className="px-3 py-2.5">
                      <div className="flex items-start justify-between gap-1 mb-0.5">
                        <h3 className="text-xs font-semibold text-gray-900 leading-snug line-clamp-2">{video.title}</h3>
                        <span className="shrink-0 text-xs font-bold px-1.5 py-0.5 rounded-full ml-1" style={watched ? { backgroundColor: "#f3f4f6", color: "#9ca3af" } : { backgroundColor: "#01fff9", color: "#001c48" }}>
                          {watched ? "✓" : "New"}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 truncate">{video.coachName}{video.createdAt && ` · ${formatDate(video.createdAt)}`}</p>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : viewMode === "list" ? (
            <div className="bg-white rounded-xl shadow-sm overflow-hidden divide-y divide-gray-100">
              {videos.map((video) => {
                const watched = uid ? (video.viewedBy ?? []).includes(uid) : false;
                return (
                  <Link key={video.id} href={`/student/videos/${video.id}`} className="group flex items-center gap-3 px-4 py-2.5 hover:bg-gray-50 transition">
                    <svg className="h-4 w-4 shrink-0" style={{ color: watched ? "#d1d5db" : "#001c48" }} viewBox="0 0 24 24" fill="currentColor">
                      <path fillRule="evenodd" d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
                    </svg>
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-semibold text-gray-900 truncate">{video.title}</span>
                      <span className="text-xs text-gray-400 ml-2">{video.coachName}{video.createdAt && ` · ${formatDate(video.createdAt)}`}</span>
                    </div>
                    {!watched ? (
                      <span className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: "#01fff9", color: "#001c48" }}>New</span>
                    ) : (
                      <span className="shrink-0 text-xs text-gray-400 font-medium">Watched</span>
                    )}
                  </Link>
                );
              })}
            </div>
          ) : (
            /* cards — original layout */
            <div className="space-y-3">
              {videos.map((video) => {
                const watched = uid ? (video.viewedBy ?? []).includes(uid) : false;
                return (
                  <Link
                    key={video.id}
                    href={`/student/videos/${video.id}`}
                    className="group block bg-white rounded-xl shadow-sm hover:shadow-md transition-shadow overflow-hidden"
                  >
                    <div
                      className="flex items-stretch"
                      style={{
                        borderLeft: `4px solid ${watched ? "#d1d5db" : "#001c48"}`,
                      }}
                    >
                      {/* Play icon column */}
                      <div className="flex items-center justify-center w-14 shrink-0 bg-gray-50 group-hover:bg-gray-100 transition-colors">
                        <svg
                          className="h-6 w-6 transition-colors"
                          style={{ color: watched ? "#9ca3af" : "#001c48" }}
                          viewBox="0 0 24 24"
                          fill="currentColor"
                        >
                          <path fillRule="evenodd" d="M4.5 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L7.28 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
                        </svg>
                      </div>

                      {/* Content */}
                      <div className="flex-1 px-4 py-3.5 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="text-sm font-semibold text-gray-900 truncate leading-snug">
                            {video.title}
                          </h3>
                          {!watched ? (
                            <span
                              className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-full"
                              style={{ backgroundColor: "#01fff9", color: "#001c48" }}
                            >
                              New
                            </span>
                          ) : (
                            <span className="shrink-0 text-xs text-gray-400 font-medium">
                              Watched
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-xs text-gray-500">
                          {video.coachName}
                          {video.createdAt && (
                            <span className="ml-2 text-gray-400">· {formatDate(video.createdAt)}</span>
                          )}
                        </p>
                      </div>

                      {/* Chevron */}
                      <div className="flex items-center pr-4">
                        <svg className="h-4 w-4 text-gray-300 group-hover:text-gray-400 transition-colors" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          )
        )}
      </div>
    </main>
  );
}
