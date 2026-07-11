"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { collection, addDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

interface Segment { id: number; start: number; end: number; text: string; }
interface Word { word: string; start: number; end: number; }
interface Transcript { text: string; duration: number; segments: Segment[]; words: Word[]; }
interface CutPoint { time: number; phrase: string; }
interface VideoDoc {
  id: string;
  title: string;
  coachId: string;
  coachName: string;
  fileName: string;
  studentIds: string[];
  downloadAllowed: boolean;
  transcript?: Transcript;
  transcriptionSkippedReason?: string;
}

function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export default function ClipsPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [idToken, setIdToken] = useState<string | null>(null);
  const [video, setVideo] = useState<VideoDoc | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [cutPoints, setCutPoints] = useState<CutPoint[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [transcribing, setTranscribing] = useState(false);
  const [splitting, setSplitting] = useState(false);
  const [splitDone, setSplitDone] = useState(0);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState<number | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push("/login"); return; }
      try {
        const token = await user.getIdToken();
        setIdToken(token);
        const res = await fetch(`/api/videos/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Failed to load video");
        const data = await res.json();
        setVideo(data);
        setVideoUrl(data.videoUrl);
        if (data.transcript) setTranscript(data.transcript);
      } catch (err) {
        setError((err as Error).message);
      }
    });
    return unsub;
  }, [id, router]);

  // Global drag handlers
  useEffect(() => {
    if (dragging === null) return;
    function onMove(e: MouseEvent) {
      if (!timelineRef.current || !duration) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
      const t = (x / rect.width) * duration;
      setCutPoints((prev) => prev.map((c, i) => (i === dragging ? { ...c, time: t } : c)));
    }
    function onUp() { setDragging(null); }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, duration]);

  function handleTimelineClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!timelineRef.current || !duration || dragging !== null) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width));
    const t = (x / rect.width) * duration;
    if (cutPoints.some((c) => Math.abs(c.time - t) < 1)) return;
    setCutPoints((prev) => [...prev, { time: t, phrase: "" }]);
    if (videoRef.current) videoRef.current.currentTime = t;
  }

  function markCutHere() {
    if (!duration) return;
    const t = currentTime;
    if (cutPoints.some((c) => Math.abs(c.time - t) < 1)) return;
    setCutPoints((prev) => [...prev, { time: t, phrase: "" }]);
  }

  function removeCut(time: number) {
    setCutPoints((prev) => prev.filter((c) => c.time !== time));
  }

  function toggleSegmentCut(seg: Segment) {
    const existing = cutPoints.find((c) => Math.abs(c.time - seg.start) < 1.5);
    if (existing) {
      setCutPoints((prev) => prev.filter((c) => Math.abs(c.time - seg.start) >= 1.5));
    } else {
      setCutPoints((prev) => [...prev, { time: seg.start, phrase: "" }]);
    }
  }

  async function handleTranscribe() {
    if (!idToken) return;
    setTranscribing(true);
    setError("");
    try {
      const res = await fetch("/api/transcribe", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: id }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.transcriptionSkippedReason) {
        setVideo((v) => v ? { ...v, transcriptionSkippedReason: data.transcriptionSkippedReason } : v);
        return;
      }
      setTranscript(data.transcript);

      // Auto-detect cut points from transcript
      const clipsRes = await fetch("/api/clips", {
        method: "POST",
        headers: { Authorization: `Bearer ${idToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ segments: data.transcript.segments }),
      });
      const clipsData = await clipsRes.json();
      if (clipsRes.ok && clipsData.cutPoints?.length) {
        setCutPoints(clipsData.cutPoints);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setTranscribing(false);
    }
  }

  async function handleSplit() {
    if (!video || cutPoints.length === 0) return;
    setSplitting(true);
    setError("");
    try {
      const sorted = [...cutPoints.map((c) => c.time)].sort((a, b) => a - b);
      const boundaries = [0, ...sorted, duration];
      let count = 0;
      for (let i = 0; i < boundaries.length - 1; i++) {
        const startTime = boundaries[i];
        const endTime = boundaries[i + 1];
        if (endTime - startTime < 2) continue;
        await addDoc(collection(db, "videos"), {
          title: `${video.title} – Clip ${count + 1}`,
          parentVideoId: id,
          startTime,
          endTime,
          fileName: video.fileName,
          coachId: video.coachId,
          coachName: video.coachName,
          studentIds: video.studentIds ?? [],
          viewedBy: [],
          status: "clip",
          downloadAllowed: video.downloadAllowed ?? false,
          createdAt: new Date().toISOString(),
        });
        count++;
      }
      setSplitDone(count);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSplitting(false);
    }
  }

  const sortedCuts = [...cutPoints].sort((a, b) => a.time - b.time);
  const clipCount = cutPoints.length + 1;

  // ── Success screen ──────────────────────────────────────────────────────────
  if (splitDone > 0) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div
            className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-full"
            style={{ backgroundColor: "rgba(1,255,249,0.1)" }}
          >
            <svg className="h-8 w-8" style={{ color: "#001c48" }} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            {splitDone} clip{splitDone !== 1 ? "s" : ""} created
          </h1>
          <p className="text-sm text-gray-500 mb-6">
            Each clip is now in your students' video libraries.
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => { setSplitDone(0); setCutPoints([]); }}
              className="text-sm font-medium text-gray-500 hover:text-gray-700 transition"
            >
              ← Edit cuts again
            </button>
            <Link
              href="/coach/dashboard"
              className="text-sm font-semibold hover:underline"
              style={{ color: "#001c48" }}
            >
              Back to Dashboard →
            </Link>
          </div>
        </div>
      </main>
    );
  }

  // ── Main UI ─────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-gray-950 flex flex-col">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800 shrink-0">
        <Link
          href="/coach/dashboard"
          aria-label="Back to dashboard"
          className="flex items-center justify-center sm:justify-start gap-1.5 text-sm text-gray-400 hover:text-white transition min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
          </svg>
          <span className="hidden sm:inline">Dashboard</span>
        </Link>
        <div className="flex items-center gap-2 min-w-0">
          <img src="/logo-light.png" alt="Ball Masters Florida" className="hidden sm:block" style={{ height: "32px", width: "auto" }} />
          <span className="text-sm font-bold text-white whitespace-nowrap">Clip Editor</span>
        </div>
        <div className="w-20" />
      </div>

      {/* Video player */}
      <div className="bg-black shrink-0">
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            className="w-full"
            style={{ maxHeight: "40vh" }}
            playsInline
            onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime ?? 0)}
            onLoadedMetadata={() => setDuration(videoRef.current?.duration ?? 0)}
          />
        ) : (
          <div className="h-40 flex items-center justify-center text-gray-600 text-sm">
            Loading…
          </div>
        )}
      </div>

      {/* Timeline + action bar */}
      <div className="bg-gray-900 px-4 pt-4 pb-5 shrink-0">
        {/* Time readout */}
        <div className="flex justify-between mb-2">
          <span className="text-xs font-mono text-gray-400">{formatTime(currentTime)}</span>
          <span className="text-xs font-mono text-gray-600">{formatTime(duration)}</span>
        </div>

        {/* Timeline track */}
        <div
          ref={timelineRef}
          className="relative h-7 rounded cursor-crosshair select-none"
          style={{ backgroundColor: "#374151" }}
          onClick={handleTimelineClick}
        >
          {/* Played region */}
          <div
            className="absolute inset-y-0 left-0 rounded-l pointer-events-none"
            style={{
              width: `${duration ? (currentTime / duration) * 100 : 0}%`,
              backgroundColor: "#166534",
            }}
          />
          {/* Playhead */}
          <div
            className="absolute top-0 bottom-0 w-px pointer-events-none"
            style={{
              left: `${duration ? (currentTime / duration) * 100 : 0}%`,
              backgroundColor: "white",
            }}
          />

          {/* Cut markers */}
          {cutPoints.map((cut, i) => {
            const pct = duration ? (cut.time / duration) * 100 : 0;
            return (
              <div
                key={cut.time}
                className="absolute inset-y-0 z-10"
                style={{ left: `${pct}%` }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setDragging(i);
                }}
                onClick={(e) => e.stopPropagation()}
              >
                {/* Line */}
                <div
                  className="absolute inset-y-0 w-px -translate-x-px pointer-events-none"
                  style={{ backgroundColor: "#facc15" }}
                />
                {/* Drag handle (top) */}
                <div
                  className="absolute -top-2 -translate-x-1/2 h-3 w-3 rounded-full cursor-ew-resize"
                  style={{ backgroundColor: "#facc15" }}
                />
                {/* Remove button */}
                <button
                  className="absolute -top-7 -translate-x-1/2 rounded px-1 py-0.5 text-xs font-bold text-red-400 hover:text-red-300 transition"
                  style={{ backgroundColor: "#1f2937" }}
                  onClick={(e) => {
                    e.stopPropagation();
                    removeCut(cut.time);
                  }}
                >
                  ✕
                </button>
                {/* Time label (bottom) */}
                <div
                  className="absolute top-full mt-1 -translate-x-1/2 text-xs font-mono whitespace-nowrap pointer-events-none"
                  style={{ color: "#facc15" }}
                >
                  {formatTime(cut.time)}
                </div>
              </div>
            );
          })}
        </div>

        {/* Hint */}
        <p className="mt-6 mb-4 text-xs text-gray-600 text-center">
          Click the timeline to add cut points · Drag yellow markers to adjust · Click ✕ to remove
        </p>

        {/* Action bar */}
        <div className="flex items-center gap-3">
          <button
            onClick={markCutHere}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-white bg-gray-700 hover:bg-gray-600 transition shrink-0"
          >
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path d="M10.75 4.75a.75.75 0 00-1.5 0v4.5h-4.5a.75.75 0 000 1.5h4.5v4.5a.75.75 0 001.5 0v-4.5h4.5a.75.75 0 000-1.5h-4.5v-4.5z" />
            </svg>
            Cut at {formatTime(currentTime)}
          </button>

          <div className="flex-1" />

          {cutPoints.length > 0 && (
            <span className="text-xs text-gray-500 shrink-0">
              {cutPoints.length} cut{cutPoints.length !== 1 ? "s" : ""} → {clipCount} clips
            </span>
          )}

          <button
            onClick={handleSplit}
            disabled={cutPoints.length === 0 || splitting}
            className="shrink-0 px-4 py-1.5 rounded-lg text-sm font-semibold text-white transition"
            style={{
              backgroundColor: cutPoints.length === 0 ? "#374151" : "#001c48",
              opacity: splitting ? 0.6 : 1,
            }}
          >
            {splitting ? "Creating…" : "Split into Clips"}
          </button>
        </div>

        {error && (
          <div className="mt-3 rounded-lg px-3 py-2 text-sm text-red-400" style={{ backgroundColor: "#1c0a0a" }}>
            {error}
          </div>
        )}
      </div>

      {/* Transcript + cut list */}
      <div className="flex flex-1 min-h-0 bg-gray-50 flex-col lg:flex-row overflow-hidden">

        {/* Transcript panel */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200 bg-white shrink-0">
            <h2 className="text-sm font-semibold text-gray-700">Transcript</h2>
            {!transcript && !transcribing && video?.transcriptionSkippedReason !== "under13_privacy" && (
              <button
                onClick={handleTranscribe}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white transition"
                style={{ backgroundColor: "#001c48" }}
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
                Transcribe with AI
              </button>
            )}
            {transcribing && (
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <svg className="h-4 w-4 animate-spin" style={{ color: "#001c48" }} viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Transcribing…
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            {!transcript && !transcribing && video?.transcriptionSkippedReason === "under13_privacy" && (
              <div className="flex flex-col items-center justify-center py-16 text-center px-6">
                <svg className="h-10 w-10 mb-3 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                </svg>
                <p className="text-sm font-medium text-gray-700 mb-1">Transcription unavailable</p>
                <p className="text-xs text-gray-500 leading-relaxed">
                  Transcription is turned off for videos that include athletes under 13, to protect their privacy.
                </p>
              </div>
            )}
            {!transcript && !transcribing && !video?.transcriptionSkippedReason && (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <svg className="h-10 w-10 mb-3 text-gray-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                </svg>
                <p className="text-sm text-gray-400">No transcript yet</p>
                <p className="text-xs text-gray-400 mt-1">
                  AI will automatically suggest cut points after transcription.
                </p>
              </div>
            )}

            {transcript && (
              <div className="space-y-0.5">
                {transcript.segments.map((seg) => {
                  const hasCut = cutPoints.some((c) => Math.abs(c.time - seg.start) < 1.5);
                  return (
                    <div
                      key={seg.id}
                      className="group flex gap-3 px-2 py-2 rounded-lg cursor-pointer transition-colors"
                      style={{ backgroundColor: hasCut ? "#fefce8" : undefined }}
                      onMouseOver={(e) => {
                        if (!hasCut) (e.currentTarget as HTMLDivElement).style.backgroundColor = "#f9fafb";
                      }}
                      onMouseOut={(e) => {
                        (e.currentTarget as HTMLDivElement).style.backgroundColor = hasCut ? "#fefce8" : "";
                      }}
                      onClick={() => {
                        if (videoRef.current) videoRef.current.currentTime = seg.start;
                      }}
                    >
                      <span className="shrink-0 w-10 text-right text-xs font-mono text-gray-400 pt-0.5">
                        {formatTime(seg.start)}
                      </span>
                      <p className="flex-1 text-sm text-gray-800 leading-relaxed">{seg.text}</p>
                      <button
                        title={hasCut ? "Remove cut" : "Add cut before this"}
                        className="shrink-0 mt-0.5 transition"
                        style={{ color: hasCut ? "#eab308" : "#d1d5db" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSegmentCut(seg);
                        }}
                      >
                        ✂
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Cut list panel */}
        {sortedCuts.length > 0 && (
          <div className="lg:w-60 border-t lg:border-t-0 lg:border-l border-gray-200 bg-white flex flex-col shrink-0">
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700">
                Cuts
                <span className="ml-2 text-xs font-normal text-gray-400">
                  {sortedCuts.length} → {clipCount} clips
                </span>
              </h2>
            </div>
            <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
              {sortedCuts.map((cut, i) => (
                <div key={cut.time} className="flex items-center gap-2">
                  <div className="h-2 w-2 rounded-full shrink-0" style={{ backgroundColor: "#facc15" }} />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-mono text-gray-800">{formatTime(cut.time)}</span>
                    {cut.phrase && (
                      <p className="text-xs text-gray-400 truncate">"{cut.phrase}"</p>
                    )}
                  </div>
                  <button
                    onClick={() => removeCut(cut.time)}
                    className="shrink-0 text-gray-300 hover:text-red-400 transition"
                  >
                    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
            <div className="px-4 py-3 border-t border-gray-100">
              <p className="text-xs text-gray-400 leading-snug">
                Drag yellow markers to adjust. Click the timeline to add new cuts.
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
