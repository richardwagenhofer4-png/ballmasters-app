"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc, arrayUnion, collection, getDocs, onSnapshot, setDoc, deleteDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { renderAnnotations, type AnnotationFrame } from "@/lib/annotations";
import CommentsSection from "@/components/CommentsSection";
import DrillComparisonPlayer from "@/components/DrillComparisonPlayer";

const REACTIONS = [
  { emoji: "👍", label: "Good" },
  { emoji: "💪", label: "Great effort" },
  { emoji: "❓", label: "Question" },
  { emoji: "🔄", label: "Will retry" },
] as const;

interface VideoMeta {
  id: string;
  title: string;
  coachName: string;
  coachId: string;
  viewedBy: string[];
  createdAt: string;
  downloadAllowed: boolean;
  fileName?: string;
  startTime?: number;
  endTime?: number;
  type?: string;
  layout?: "side_by_side" | "stacked" | "tabs";
  syncPlayback?: boolean;
}

interface VoiceoverMeta {
  fileName: string;
  startTime: number;
  duration: number;
  mimeType: string;
  createdAt: string;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "long",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export default function VideoPlayerPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const lastPausedAt = useRef<number | null>(null);

  const [uid, setUid] = useState<string | null>(null);
  const [meta, setMeta] = useState<VideoMeta | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [drillUrls, setDrillUrls] = useState<{ coachVideoUrl: string; studentVideoUrl: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [watched, setWatched] = useState(false);
  const [annotations, setAnnotations] = useState<AnnotationFrame[]>([]);
  const [activeAnnotation, setActiveAnnotation] = useState<AnnotationFrame | null>(null);
  const [voiceoverMeta, setVoiceoverMeta] = useState<VoiceoverMeta | null>(null);
  const [voiceoverActive, setVoiceoverActive] = useState(false);
  const [userName, setUserName] = useState("");
  const [reactions, setReactions] = useState<Record<string, string>>({});
  const [canvasSize, setCanvasSize] = useState({ w: 0, h: 0 });
  const hasRecordedView = useRef(false);
  const voiceoverAudioRef = useRef<HTMLAudioElement | null>(null);
  const reactionsUnsubRef = useRef<(() => void) | null>(null);

  // Load video metadata, presigned URL, and annotations
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push("/login"); return; }
      setUid(user.uid);

      // Load student's display name
      const userSnap = await getDoc(doc(db, "users", user.uid));
      setUserName((userSnap.data()?.name as string) ?? user.displayName ?? "Student");

      // Real-time reactions listener
      if (reactionsUnsubRef.current) reactionsUnsubRef.current();
      reactionsUnsubRef.current = onSnapshot(collection(db, "videos", id, "reactions"), (snap) => {
        const map: Record<string, string> = {};
        snap.docs.forEach(d => { map[d.id] = (d.data() as { emoji: string }).emoji; });
        setReactions(map);
      });

      try {
        const snap = await getDoc(doc(db, "videos", id));
        if (!snap.exists()) {
          setError("Video not found.");
          setLoading(false);
          return;
        }
        const data = { id: snap.id, ...(snap.data() as Omit<VideoMeta, "id">) };
        setMeta(data);
        setWatched((data.viewedBy ?? []).includes(user.uid));

        const idToken = await user.getIdToken();
        const res = await fetch(`/api/videos/${id}`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (!res.ok) {
          const { error: msg } = await res.json();
          throw new Error(msg ?? "Failed to load video");
        }
        const resData = await res.json();

        if (data.type === "drill_comparison" || (snap.data()?.coachVideoKey && snap.data()?.studentVideoKey)) {
          setDrillUrls({
            coachVideoUrl: resData.coachVideoUrl as string,
            studentVideoUrl: resData.studentVideoUrl as string,
          });
        } else {
          setVideoUrl(resData.videoUrl as string);

          // Load coach annotations (subcollection — rules allow student reads)
          const annotSnap = await getDocs(collection(db, "videos", id, "annotations"));
          setAnnotations(
            annotSnap.docs
              .map(d => ({ id: d.id, ...(d.data() as Omit<AnnotationFrame, "id">) }))
              .sort((a, b) => a.timestamp - b.timestamp)
          );

          // Load voiceover if exists
          const voSnap = await getDoc(doc(db, "videos", id, "voiceover", "main"));
          if (voSnap.exists()) {
            const voMeta = voSnap.data() as VoiceoverMeta;
            setVoiceoverMeta(voMeta);
            const voRes = await fetch(`/api/voiceover?videoId=${id}`, {
              headers: { Authorization: `Bearer ${idToken}` },
            });
            if (voRes.ok) {
              const { audioUrl } = await voRes.json();
              const audio = new Audio(audioUrl);
              audio.preload = "auto";
              voiceoverAudioRef.current = audio;
            }
          }
        }
      } catch (err: unknown) {
        console.error("[video-player]", err);
        setError((err as Error).message ?? "Failed to load video.");
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, [id, router]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const updateCanvas = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const dpr = window.devicePixelRatio || 1;
      canvas.width = video.clientWidth * dpr;
      canvas.height = video.clientHeight * dpr;
      canvas.style.width = video.clientWidth + "px";
      canvas.style.height = video.clientHeight + "px";
      setCanvasSize({ w: video.clientWidth, h: video.clientHeight });
    };
    const obs = new ResizeObserver(updateCanvas);
    obs.observe(video);
    video.addEventListener("loadedmetadata", updateCanvas);
    return () => {
      obs.disconnect();
      video.removeEventListener("loadedmetadata", updateCanvas);
    };
  }, [videoUrl]);

  // Voiceover + reactions cleanup
  useEffect(() => {
    return () => {
      voiceoverAudioRef.current?.pause();
      voiceoverAudioRef.current = null;
      reactionsUnsubRef.current?.();
    };
  }, []);

  useEffect(() => {
    console.log("[annotation render] canvasSize:", canvasSize, "activeAnnotation:", activeAnnotation?.id ?? "none", "canvas dims:", canvasRef.current?.width, canvasRef.current?.height);
    const canvas = canvasRef.current;
    if (!canvas || canvas.width === 0 || canvas.height === 0) return;
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvasSize.w;
    const cssH = canvasSize.h;
    if (!cssW || !cssH) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, cssW, cssH);
    if (activeAnnotation) {
      renderAnnotations(ctx, activeAnnotation.drawings, cssW, cssH);
    }
  }, [activeAnnotation, canvasSize]);

  async function toggleReaction(emoji: string) {
    if (!uid) return;
    const ref = doc(db, "videos", id, "reactions", uid);
    if (reactions[uid] === emoji) {
      await deleteDoc(ref);
    } else {
      await setDoc(ref, { emoji, authorId: uid, createdAt: new Date().toISOString() });
    }
  }

  function syncVoiceover(videoPaused: boolean) {
    const audio = voiceoverAudioRef.current;
    const video = videoRef.current;
    if (!audio || !video || !voiceoverMeta) return;
    const expected = video.currentTime - voiceoverMeta.startTime;
    if (expected < 0 || expected > voiceoverMeta.duration + 0.5) {
      audio.pause();
      setVoiceoverActive(false);
      return;
    }
    if (Math.abs(audio.currentTime - expected) > 0.3) audio.currentTime = expected;
    if (videoPaused) {
      audio.pause();
      setVoiceoverActive(false);
    } else {
      audio.play().catch(() => {});
      setVoiceoverActive(true);
    }
  }

  async function handlePlay() {
    syncVoiceover(false);
    if (hasRecordedView.current || !uid || !id || watched) return;
    hasRecordedView.current = true;
    try {
      await updateDoc(doc(db, "videos", id), { viewedBy: arrayUnion(uid) });
      setWatched(true);
    } catch (err) {
      console.error("[video-player] failed to record view:", err);
    }
  }

  function handlePause() {
    voiceoverAudioRef.current?.pause();
    setVoiceoverActive(false);
  }

  function handleLoadedMetadata() {
    if (videoRef.current && meta?.startTime) {
      videoRef.current.currentTime = meta.startTime;
    }
  }

  function handleTimeUpdate() {
    const video = videoRef.current;
    if (!video) return;
    const t = video.currentTime;

    // Clip boundary enforcement
    if (meta?.endTime !== undefined && meta.endTime > 0 && t >= meta.endTime) {
      video.pause();
      video.currentTime = meta.endTime;
      return;
    }

    // Find matching annotation (within ±0.5 s)
    const found = annotations.find(a => Math.abs(a.timestamp - t) < 0.5) ?? null;
    setActiveAnnotation(found);

    // Auto-pause once per annotation (resets on seek)
    if (found?.pauseOnPlay && lastPausedAt.current !== found.timestamp) {
      lastPausedAt.current = found.timestamp;
      video.pause();
    }
  }

  function handleSeeked() {
    lastPausedAt.current = null;
    syncVoiceover(videoRef.current?.paused ?? true);
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
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-red-600 font-medium mb-4">{error}</p>
          <Link href="/student/videos" className="text-sm font-semibold hover:underline" style={{ color: "#001c48" }}>
            ← Back to videos
          </Link>
        </div>
      </main>
    );
  }

  // Drill comparison — render dedicated player
  if (drillUrls && meta && uid) {
    return (
      <DrillComparisonPlayer
        videoId={id}
        uid={uid}
        userName={userName}
        meta={{
          id: meta.id,
          title: meta.title,
          coachName: meta.coachName,
          viewedBy: meta.viewedBy ?? [],
          createdAt: meta.createdAt,
          downloadAllowed: meta.downloadAllowed ?? false,
          layout: meta.layout ?? "side_by_side",
          syncPlayback: meta.syncPlayback ?? true,
        }}
        coachVideoUrl={drillUrls.coachVideoUrl}
        studentVideoUrl={drillUrls.studentVideoUrl}
      />
    );
  }

  return (
    <main className="min-h-screen bg-gray-950 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900">
        <Link
          href="/student/videos"
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
          </svg>
          All videos
        </Link>

        <img src="/logo-light.png" alt="Ball Masters Florida" style={{ width: 80, height: "auto" }} />

        {watched && (
          <div className="flex items-center gap-1 text-xs font-medium" style={{ color: "#01fff9" }}>
            <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
            </svg>
            Watched
          </div>
        )}
        {!watched && <div className="w-16" />}
      </div>

      {/* Video player with canvas overlay */}
      <div className="bg-black shrink-0">
        {videoUrl ? (
          <div className="relative w-full" style={{ lineHeight: 0 }}>
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              controlsList={meta?.downloadAllowed ? undefined : "nodownload"}
              onPlay={handlePlay}
              onPause={handlePause}
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={handleTimeUpdate}
              onSeeked={handleSeeked}
              className="w-full bg-black"
              style={{ maxHeight: "75vh", display: "block" }}
              playsInline
            >
              Your browser does not support video playback.
            </video>

            {/* Annotation canvas — pointer-events:none so video controls still work */}
            <canvas
              ref={canvasRef}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                pointerEvents: "none",
              }}
            />

            {/* Voiceover active badge */}
            {voiceoverActive && (
              <div
                style={{
                  position: "absolute",
                  top: 10,
                  left: 10,
                  backgroundColor: "rgba(0,0,0,0.68)",
                  color: "white",
                  borderRadius: "9999px",
                  padding: "4px 12px",
                  fontSize: "12px",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  pointerEvents: "none",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2a3 3 0 013 3v6a3 3 0 11-6 0V5a3 3 0 013-3zm-1 15.93V20H9a1 1 0 100 2h6a1 1 0 100-2h-2v-2.07A8.001 8.001 0 0020 11a1 1 0 10-2 0 6 6 0 01-12 0 1 1 0 10-2 0 8.001 8.001 0 007 7.93z" />
                </svg>
                Coach voiceover
              </div>
            )}

            {/* Coach annotation badge */}
            {activeAnnotation && (
              <div
                style={{
                  position: "absolute",
                  top: 10,
                  right: 10,
                  backgroundColor: "rgba(0,0,0,0.68)",
                  color: "white",
                  borderRadius: "9999px",
                  padding: "4px 12px",
                  fontSize: "12px",
                  fontWeight: 600,
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  pointerEvents: "none",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536M9 13l6.586-6.586a2 2 0 112.828 2.828L11.828 15.828a2 2 0 01-1.414.586H7v-3a2 2 0 01.586-1.414z" />
                </svg>
                Coach note
              </div>
            )}
          </div>
        ) : (
          <div className="text-gray-500 text-sm">Video unavailable.</div>
        )}
      </div>

      {/* Scrollable content below video */}
      <div className="flex-1 overflow-y-auto">

      {/* Metadata panel */}
      <div className="bg-gray-900 px-6 py-5">
        <h1 className="text-lg font-bold text-white leading-snug mb-1">
          {meta?.title ?? "Untitled"}
        </h1>
        <div className="flex items-center gap-3 text-sm text-gray-400">
          <span>{meta?.coachName}</span>
          {meta?.createdAt && (
            <>
              <span>·</span>
              <span>{formatDate(meta.createdAt)}</span>
            </>
          )}
          {annotations.length > 0 && (
            <>
              <span>·</span>
              <span className="text-xs" style={{ color: "#9ca3af" }}>
                {annotations.length} coach note{annotations.length !== 1 ? "s" : ""}
              </span>
            </>
          )}
          {!watched && (
            <>
              <span>·</span>
              <span
                className="font-semibold text-xs px-2 py-0.5 rounded-full"
                style={{ backgroundColor: "#001c48", color: "#01fff9" }}
              >
                New
              </span>
            </>
          )}
        </div>
      </div>

      {/* Reactions */}
      <div className="bg-gray-900 border-t border-gray-800 px-4 py-3">
        <div className="flex items-center gap-2 flex-wrap">
          {REACTIONS.map(r => {
            const count = Object.values(reactions).filter(e => e === r.emoji).length;
            const selected = uid ? reactions[uid] === r.emoji : false;
            return (
              <button
                key={r.emoji}
                onClick={() => toggleReaction(r.emoji)}
                title={r.label}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition"
                style={{
                  backgroundColor: selected ? "#001c48" : "#1f2937",
                  color: selected ? "#01fff9" : "#9ca3af",
                  border: `1px solid ${selected ? "#01fff9" : "transparent"}`,
                }}
              >
                <span>{r.emoji}</span>
                {count > 0 && <span className="text-xs">{count}</span>}
              </button>
            );
          })}
        </div>
      </div>

      {/* Comments */}
      <div className="bg-white">
        {uid && userName && (
          <CommentsSection videoId={id} uid={uid} authorName={userName} role="student" />
        )}
      </div>

      </div>
    </main>
  );
}
