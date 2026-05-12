"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, updateDoc, arrayUnion, collection, getDocs } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { renderAnnotations } from "@/app/coach/videos/[id]/annotate/page";
import type { AnnotationFrame } from "@/app/coach/videos/[id]/annotate/page";

interface VideoMeta {
  id: string;
  title: string;
  coachName: string;
  coachId: string;
  viewedBy: string[];
  createdAt: string;
  downloadAllowed: boolean;
  fileName: string;
  startTime?: number;
  endTime?: number;
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [watched, setWatched] = useState(false);
  const [annotations, setAnnotations] = useState<AnnotationFrame[]>([]);
  const [activeAnnotation, setActiveAnnotation] = useState<AnnotationFrame | null>(null);
  const hasRecordedView = useRef(false);

  // Load video metadata, presigned URL, and annotations
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push("/login"); return; }
      setUid(user.uid);

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
        const { videoUrl: url } = await res.json();
        setVideoUrl(url);

        // Load coach annotations (subcollection — rules allow student reads)
        const annotSnap = await getDocs(collection(db, "videos", id, "annotations"));
        setAnnotations(
          annotSnap.docs
            .map(d => ({ id: d.id, ...(d.data() as Omit<AnnotationFrame, "id">) }))
            .sort((a, b) => a.timestamp - b.timestamp)
        );
      } catch (err: unknown) {
        console.error("[video-player]", err);
        setError((err as Error).message ?? "Failed to load video.");
      } finally {
        setLoading(false);
      }
    });
    return unsub;
  }, [id, router]);

  // Keep canvas sized to video element
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const obs = new ResizeObserver(() => {
      if (canvasRef.current) {
        canvasRef.current.width = video.clientWidth;
        canvasRef.current.height = video.clientHeight;
      }
    });
    obs.observe(video);
    return () => obs.disconnect();
  }, [videoUrl]);

  // Render active annotation on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (activeAnnotation) {
      renderAnnotations(ctx, activeAnnotation.drawings, canvas.width, canvas.height);
    }
  }, [activeAnnotation]);

  async function handlePlay() {
    if (hasRecordedView.current || !uid || !id || watched) return;
    hasRecordedView.current = true;
    try {
      await updateDoc(doc(db, "videos", id), { viewedBy: arrayUnion(uid) });
      setWatched(true);
    } catch (err) {
      console.error("[video-player] failed to record view:", err);
    }
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
    // Reset auto-pause memory so the same annotation can pause again after seeking back
    lastPausedAt.current = null;
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
          <Link href="/student/videos" className="text-sm font-semibold hover:underline" style={{ color: "#1A6B45" }}>
            ← Back to videos
          </Link>
        </div>
      </main>
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

        <div className="flex items-center gap-1.5">
          <span className="text-xl">⚽</span>
          <span className="text-sm font-bold text-white">Ballmasters</span>
        </div>

        {watched && (
          <div className="flex items-center gap-1 text-xs font-medium" style={{ color: "#4ade80" }}>
            <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
            </svg>
            Watched
          </div>
        )}
        {!watched && <div className="w-16" />}
      </div>

      {/* Video player with canvas overlay */}
      <div className="flex-1 flex flex-col items-center justify-center bg-black">
        {videoUrl ? (
          <div className="relative w-full" style={{ lineHeight: 0 }}>
            <video
              ref={videoRef}
              src={videoUrl}
              controls
              controlsList={meta?.downloadAllowed ? undefined : "nodownload"}
              onPlay={handlePlay}
              onLoadedMetadata={handleLoadedMetadata}
              onTimeUpdate={handleTimeUpdate}
              onSeeked={handleSeeked}
              className="w-full bg-black"
              style={{ maxHeight: "70vh", display: "block" }}
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
                style={{ backgroundColor: "#14532d", color: "#4ade80" }}
              >
                New
              </span>
            </>
          )}
        </div>
      </div>
    </main>
  );
}
