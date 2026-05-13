"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, collection, getDocs, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import CommentsSection from "@/components/CommentsSection";
import { renderAnnotations, type DrawingType, type Drawing, type AnnotationFrame } from "@/lib/annotations";

export type { DrawingType, Drawing, AnnotationFrame };
export { renderAnnotations };

interface VideoDoc {
  id: string;
  title: string;
  coachId: string;
  coachName: string;
  fileName: string;
  studentIds: string[];
  downloadAllowed: boolean;
}

interface VoiceoverMeta {
  fileName: string;
  startTime: number;
  duration: number;
  mimeType: string;
  createdAt: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

const COLORS = [
  { value: "#ef4444", label: "Red" },
  { value: "#22c55e", label: "Green" },
  { value: "#facc15", label: "Yellow" },
  { value: "#ffffff", label: "White" },
  { value: "#111827", label: "Black" },
];

const TOOLS: { type: DrawingType; label: string; icon: string }[] = [
  { type: "arrow", label: "Arrow", icon: "→" },
  { type: "line", label: "Line", icon: "╱" },
  { type: "circle", label: "Circle", icon: "○" },
  { type: "freehand", label: "Draw", icon: "✏" },
  { type: "text", label: "Text", icon: "T" },
];

// ── Page ──────────────────────────────────────────────────────────────────────

export default function AnnotatePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [uid, setUid] = useState<string | null>(null);
  const [video, setVideo] = useState<VideoDoc | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [annotations, setAnnotations] = useState<AnnotationFrame[]>([]);
  const [drawings, setDrawings] = useState<Drawing[]>([]);
  const [liveDrawing, setLiveDrawing] = useState<Drawing | null>(null);
  const [tool, setTool] = useState<DrawingType>("arrow");
  const [color, setColor] = useState(COLORS[0].value);
  const [pauseOnPlay, setPauseOnPlay] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [drawingMode, setDrawingMode] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [textInput, setTextInput] = useState({ x: 0, y: 0, visible: false });
  const [textValue, setTextValue] = useState("");
  const [voiceover, setVoiceover] = useState<VoiceoverMeta | null>(null);
  const [recordingState, setRecordingState] = useState<"idle" | "recording" | "stopping" | "uploading">("idle");
  const [recordingTimer, setRecordingTimer] = useState(0);
  const [previewing, setPreviewing] = useState(false);
  const [voiceoverError, setVoiceoverError] = useState("");

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);
  const freehandRef = useRef<{ x: number; y: number }[]>([]);
  const annotationsRef = useRef<AnnotationFrame[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const uploadUrlRef = useRef<string>("");
  const fileNameRef = useRef<string>("");
  const recordingStartVideoTimeRef = useRef<number>(0);
  const wallStartRef = useRef<number>(0);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewBlobUrlRef = useRef<string | null>(null);

  useEffect(() => { annotationsRef.current = annotations; }, [annotations]);

  // ── Auth + data load ────────────────────────────────────────────────────────
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push("/login"); return; }
      setUid(user.uid);
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/videos/${id}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error("Failed to load video");
        const data = await res.json();
        setVideo(data);
        setVideoUrl(data.videoUrl);

        const snap = await getDocs(collection(db, "videos", id, "annotations"));
        setAnnotations(
          snap.docs
            .map(d => ({ id: d.id, ...(d.data() as Omit<AnnotationFrame, "id">) }))
            .sort((a, b) => a.timestamp - b.timestamp)
        );

        const voSnap = await getDoc(doc(db, "videos", id, "voiceover", "main"));
        if (voSnap.exists()) setVoiceover(voSnap.data() as VoiceoverMeta);
      } catch (err) {
        setError((err as Error).message);
      }
    });
    return unsub;
  }, [id, router]);

  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (previewBlobUrlRef.current) URL.revokeObjectURL(previewBlobUrlRef.current);
      previewAudioRef.current?.pause();
    };
  }, []);

  // ── Keep canvas sized to video element ──────────────────────────────────────
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

  // ── Redraw canvas ───────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const all = liveDrawing ? [...drawings, liveDrawing] : drawings;
    renderAnnotations(ctx, all, canvas.width, canvas.height);
  }, [drawings, liveDrawing]);

  // ── Canvas pointer helpers ──────────────────────────────────────────────────
  function getPos(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? (e.touches[0]?.clientX ?? 0) : e.clientX;
    const clientY = "touches" in e ? (e.touches[0]?.clientY ?? 0) : e.clientY;
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
    };
  }

  function toggleDrawingMode() {
    setDrawingMode(prev => {
      const next = !prev;
      // Auto-pause the video when entering drawing mode so there's a frame to annotate
      if (next && videoRef.current && !videoRef.current.paused) {
        videoRef.current.pause();
      }
      return next;
    });
    cancelDraw();
  }

  function handlePointerDown(e: React.MouseEvent | React.TouchEvent) {
    if (!drawingMode) return;
    e.preventDefault();
    const pos = getPos(e);
    if (tool === "text") {
      setTextInput({ x: pos.x, y: pos.y, visible: true });
      setTextValue("");
      return;
    }
    isDrawingRef.current = true;
    drawStartRef.current = pos;
    if (tool === "freehand") freehandRef.current = [pos];
  }

  function handlePointerMove(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawingRef.current || !drawStartRef.current) return;
    e.preventDefault();
    const pos = getPos(e);
    const start = drawStartRef.current;

    if (tool === "freehand") {
      const last = freehandRef.current[freehandRef.current.length - 1];
      if (!last || Math.hypot(pos.x - last.x, pos.y - last.y) > 0.004) {
        freehandRef.current.push(pos);
        setLiveDrawing({ id: "live", type: "freehand", color, points: [...freehandRef.current] });
      }
      return;
    }

    const preview: Drawing = { id: "live", type: tool, color };
    if (tool === "arrow" || tool === "line") {
      preview.x1 = start.x; preview.y1 = start.y;
      preview.x2 = pos.x; preview.y2 = pos.y;
    } else if (tool === "circle") {
      preview.cx = start.x; preview.cy = start.y;
      preview.r = Math.hypot(pos.x - start.x, pos.y - start.y);
    }
    setLiveDrawing(preview);
  }

  function handlePointerUp(e: React.MouseEvent | React.TouchEvent) {
    if (!isDrawingRef.current || !drawStartRef.current) return;
    isDrawingRef.current = false;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    let pos: { x: number; y: number };
    if ("changedTouches" in e) {
      pos = {
        x: Math.max(0, Math.min(1, (e.changedTouches[0].clientX - rect.left) / rect.width)),
        y: Math.max(0, Math.min(1, (e.changedTouches[0].clientY - rect.top) / rect.height)),
      };
    } else {
      pos = getPos(e as React.MouseEvent);
    }
    const start = drawStartRef.current!;
    drawStartRef.current = null;

    const d: Drawing = { id: Date.now().toString(), type: tool, color };

    if (tool === "arrow" || tool === "line") {
      if (Math.hypot(pos.x - start.x, pos.y - start.y) < 0.01) { setLiveDrawing(null); return; }
      d.x1 = start.x; d.y1 = start.y; d.x2 = pos.x; d.y2 = pos.y;
    } else if (tool === "circle") {
      const r = Math.hypot(pos.x - start.x, pos.y - start.y);
      if (r < 0.01) { setLiveDrawing(null); return; }
      d.cx = start.x; d.cy = start.y; d.r = r;
    } else if (tool === "freehand") {
      if (freehandRef.current.length < 2) { setLiveDrawing(null); freehandRef.current = []; return; }
      d.points = [...freehandRef.current];
      freehandRef.current = [];
    }

    setDrawings(prev => [...prev, d]);
    setLiveDrawing(null);
  }

  function cancelDraw() {
    isDrawingRef.current = false;
    drawStartRef.current = null;
    freehandRef.current = [];
    setLiveDrawing(null);
  }

  function confirmText() {
    if (textValue.trim()) {
      setDrawings(prev => [...prev, {
        id: Date.now().toString(),
        type: "text", color,
        tx: textInput.x, ty: textInput.y,
        label: textValue.trim(),
      }]);
    }
    setTextInput({ x: 0, y: 0, visible: false });
    setTextValue("");
  }

  // ── Video event handlers ────────────────────────────────────────────────────
  function handleSeeked() {
    const t = videoRef.current?.currentTime ?? 0;
    const saved = annotationsRef.current.find(a => Math.abs(a.timestamp - t) < 0.5);
    setDrawings(saved?.drawings ?? []);
    setPauseOnPlay(saved?.pauseOnPlay ?? false);
    setLiveDrawing(null);
  }

  // ── Firestore ops ───────────────────────────────────────────────────────────
  async function saveAnnotation() {
    if (!uid || drawings.length === 0) return;
    const t = Math.round((videoRef.current?.currentTime ?? 0) * 10) / 10;
    const key = String(Math.round(t * 10));
    setSaving(true);
    try {
      const data = { timestamp: t, pauseOnPlay, drawings, updatedAt: new Date().toISOString() };
      await setDoc(doc(db, "videos", id, "annotations", key), data);
      const updated = { id: key, ...data };
      setAnnotations(prev => {
        const idx = prev.findIndex(a => a.id === key);
        return idx >= 0
          ? prev.map((a, i) => (i === idx ? updated : a))
          : [...prev, updated].sort((a, b) => a.timestamp - b.timestamp);
      });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteAnnotation(annot: AnnotationFrame) {
    await deleteDoc(doc(db, "videos", id, "annotations", annot.id));
    setAnnotations(prev => prev.filter(a => a.id !== annot.id));
    if (Math.abs((videoRef.current?.currentTime ?? 0) - annot.timestamp) < 0.5) {
      setDrawings([]);
      setPauseOnPlay(false);
    }
  }

  async function togglePauseOnPlay(annot: AnnotationFrame) {
    const next = { ...annot, pauseOnPlay: !annot.pauseOnPlay };
    await setDoc(doc(db, "videos", id, "annotations", annot.id), next);
    setAnnotations(prev => prev.map(a => (a.id === annot.id ? next : a)));
    if (Math.abs((videoRef.current?.currentTime ?? 0) - annot.timestamp) < 0.5) {
      setPauseOnPlay(next.pauseOnPlay);
    }
  }

  function seekTo(t: number) {
    if (!videoRef.current) return;
    videoRef.current.currentTime = t;
    videoRef.current.pause();
  }

  async function startRecording() {
    setVoiceoverError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
        ? "audio/webm"
        : "audio/mp4";

      const token = await auth.currentUser!.getIdToken();
      const res = await fetch("/api/voiceover", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: id, mimeType }),
      });
      if (!res.ok) throw new Error("Failed to prepare upload");
      const { uploadUrl, fileName } = await res.json();
      uploadUrlRef.current = uploadUrl;
      fileNameRef.current = fileName;

      audioChunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      recordingStartVideoTimeRef.current = videoRef.current?.currentTime ?? 0;
      wallStartRef.current = Date.now();

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        const duration = (Date.now() - wallStartRef.current) / 1000;
        doUploadVoiceover(blob, duration, mimeType);
      };

      recorder.start(1000);
      setRecordingState("recording");
      setRecordingTimer(0);
      timerIntervalRef.current = setInterval(() => setRecordingTimer(prev => prev + 1), 1000);
    } catch (err) {
      setVoiceoverError((err as Error).message);
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
  }

  function stopRecording() {
    setRecordingState("stopping");
    if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null; }
    mediaRecorderRef.current?.stop();
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }

  async function doUploadVoiceover(blob: Blob, duration: number, mimeType: string) {
    setRecordingState("uploading");
    try {
      const uploadRes = await fetch(uploadUrlRef.current, {
        method: "PUT",
        body: blob,
        headers: { "Content-Type": mimeType },
      });
      if (!uploadRes.ok) throw new Error(`Voiceover upload failed (${uploadRes.status})`);
      const meta: VoiceoverMeta = {
        fileName: fileNameRef.current,
        startTime: recordingStartVideoTimeRef.current,
        duration,
        mimeType,
        createdAt: new Date().toISOString(),
      };
      await setDoc(doc(db, "videos", id, "voiceover", "main"), meta);
      if (previewBlobUrlRef.current) URL.revokeObjectURL(previewBlobUrlRef.current);
      previewBlobUrlRef.current = URL.createObjectURL(blob);
      previewAudioRef.current = null;
      setVoiceover(meta);
    } catch (err) {
      setVoiceoverError((err as Error).message);
    } finally {
      setRecordingState("idle");
    }
  }

  async function togglePreview() {
    if (previewing) {
      previewAudioRef.current?.pause();
      videoRef.current?.pause();
      setPreviewing(false);
      return;
    }
    if (!voiceover) return;
    try {
      if (!previewAudioRef.current) {
        let src: string;
        if (previewBlobUrlRef.current) {
          src = previewBlobUrlRef.current;
        } else {
          const token = await auth.currentUser!.getIdToken();
          const res = await fetch(`/api/voiceover?videoId=${id}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) throw new Error("Failed to load voiceover audio");
          const { audioUrl } = await res.json();
          src = audioUrl;
        }
        previewAudioRef.current = new Audio(src);
      }
      const audio = previewAudioRef.current;
      audio.currentTime = 0;
      audio.onended = () => { videoRef.current?.pause(); setPreviewing(false); };
      if (videoRef.current) videoRef.current.currentTime = voiceover.startTime;
      await audio.play();
      videoRef.current?.play();
      setPreviewing(true);
    } catch (err) {
      setVoiceoverError((err as Error).message);
    }
  }

  async function deleteVoiceover() {
    try {
      await deleteDoc(doc(db, "videos", id, "voiceover", "main"));
      if (previewBlobUrlRef.current) { URL.revokeObjectURL(previewBlobUrlRef.current); previewBlobUrlRef.current = null; }
      previewAudioRef.current?.pause();
      previewAudioRef.current = null;
      setVoiceover(null);
      setPreviewing(false);
    } catch (err) {
      setVoiceoverError((err as Error).message);
    }
  }

  const atSavedFrame = annotations.some(
    a => Math.abs((videoRef.current?.currentTime ?? currentTime) - a.timestamp) < 0.5
  );

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-gray-950 flex flex-col">

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 border-b border-gray-800 shrink-0">
        <Link
          href="/coach/dashboard"
          className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
          </svg>
          Dashboard
        </Link>
        <div className="flex items-center gap-2">
          <span className="text-xl">⚽</span>
          <span className="text-sm font-bold text-white">Annotation Editor</span>
        </div>
        <Link
          href="/coach/dashboard"
          className="text-sm font-semibold transition"
          style={{ color: "#4ade80" }}
        >
          Done →
        </Link>
      </div>

      {/* Video + Canvas */}
      <div
        className="bg-black shrink-0"
        style={{
          position: "relative",
          lineHeight: 0,
          outline: drawingMode ? "3px solid #22c55e" : "none",
          outlineOffset: "-3px",
        }}
      >
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            controls
            className="w-full"
            style={{ maxHeight: "42vh", display: "block" }}
            playsInline
            onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime ?? 0)}
            onPlay={() => setIsPaused(false)}
            onPause={() => setIsPaused(true)}
            onSeeked={handleSeeked}
          />
        ) : (
          <div className="h-48 flex items-center justify-center text-gray-600 text-sm">
            Loading video…
          </div>
        )}

        <canvas
          ref={canvasRef}
          style={{
            position: "absolute",
            inset: 0,
            width: "100%",
            height: "100%",
            cursor: drawingMode ? (tool === "text" ? "text" : "crosshair") : "default",
            pointerEvents: drawingMode ? "auto" : "none",
            touchAction: "none",
          }}
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onMouseLeave={cancelDraw}
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
          onTouchEnd={handlePointerUp}
        />

        {/* Inline text input for text tool */}
        {textInput.visible && (
          <input
            autoFocus
            style={{
              position: "absolute",
              left: `${textInput.x * 100}%`,
              top: `${textInput.y * 100}%`,
              transform: "translate(4px, -100%)",
              background: "transparent",
              border: "none",
              outline: "none",
              color,
              fontSize: "16px",
              fontWeight: "bold",
              textShadow: "0 0 4px black, 0 0 4px black",
              minWidth: "80px",
            }}
            value={textValue}
            onChange={e => setTextValue(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter" || e.key === "Escape") confirmText(); }}
            onBlur={confirmText}
          />
        )}

        {/* "Annotated frame" badge */}
        {atSavedFrame && (
          <div
            style={{
              position: "absolute",
              top: 8,
              left: 8,
              backgroundColor: "rgba(0,0,0,0.65)",
              color: "#facc15",
              borderRadius: "9999px",
              padding: "2px 10px",
              fontSize: "11px",
              fontWeight: 600,
              pointerEvents: "none",
            }}
          >
            ✓ Annotated frame
          </div>
        )}
      </div>

      {/* Toolbar */}
      <div className="bg-gray-900 border-b border-gray-800 px-4 py-3 shrink-0">

        {/* ── Drawing mode toggle — the primary control ── */}
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={toggleDrawingMode}
            className="flex items-center gap-2 h-10 px-4 rounded-lg text-sm font-bold transition"
            style={{
              backgroundColor: drawingMode ? "#16a34a" : "#374151",
              color: "white",
              minWidth: 160,
            }}
          >
            <span style={{ fontSize: 16 }}>{drawingMode ? "✏" : "▶"}</span>
            {drawingMode ? "Drawing ON" : "Drawing OFF"}
          </button>
          <span className="text-xs leading-snug" style={{ color: drawingMode ? "#86efac" : "#6b7280" }}>
            {drawingMode
              ? "Canvas active — draw on the frame"
              : "Video controls active — seek, play, fullscreen"}
          </span>
        </div>

        {/* Tool buttons — dimmed when drawing mode is off */}
        <div
          className="flex items-center gap-1.5 mb-3 flex-wrap transition-opacity"
          style={{ opacity: drawingMode ? 1 : 0.35 }}
        >
          {TOOLS.map(t => (
            <button
              key={t.type}
              title={t.label}
              onClick={() => { setTool(t.type); if (!drawingMode) toggleDrawingMode(); }}
              className="h-9 px-3 rounded-lg text-sm font-semibold transition"
              style={{
                backgroundColor: tool === t.type && drawingMode ? "#1A6B45" : "#374151",
                color: tool === t.type && drawingMode ? "white" : "#9ca3af",
              }}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Color swatches — dimmed when drawing mode is off */}
        <div
          className="flex items-center gap-2 mb-3 transition-opacity"
          style={{ opacity: drawingMode ? 1 : 0.35 }}
        >
          <span className="text-xs text-gray-500 mr-1">Color</span>
          {COLORS.map(c => (
            <button
              key={c.value}
              title={c.label}
              onClick={() => setColor(c.value)}
              className="h-7 w-7 rounded-full transition"
              style={{
                backgroundColor: c.value,
                outline: color === c.value ? "2px solid white" : "2px solid transparent",
                outlineOffset: "2px",
                border: c.value === "#ffffff" ? "1px solid #6b7280" : "none",
              }}
            />
          ))}
        </div>

        {/* Undo / Clear */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDrawings(prev => prev.slice(0, -1))}
            disabled={drawings.length === 0}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm text-gray-400 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 transition"
          >
            ↩ Undo
          </button>
          <button
            onClick={() => { setDrawings([]); setLiveDrawing(null); }}
            disabled={drawings.length === 0}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm text-gray-400 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 transition"
          >
            ✕ Clear frame
          </button>
        </div>
      </div>

      {/* Save bar */}
      <div className="bg-gray-800 px-4 py-3 shrink-0">
        <div className="flex items-center gap-3 flex-wrap">
          <label className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={pauseOnPlay}
              onChange={e => setPauseOnPlay(e.target.checked)}
              className="rounded"
            />
            Pause student on play
          </label>
          <div className="flex-1" />
          <span className="text-xs text-gray-500 font-mono">{fmt(currentTime)}</span>
          <button
            onClick={saveAnnotation}
            disabled={drawings.length === 0 || saving}
            className="px-4 py-1.5 rounded-lg text-sm font-semibold text-white transition disabled:opacity-40"
            style={{ backgroundColor: "#1A6B45" }}
          >
            {saving ? "Saving…" : `Save at ${fmt(currentTime)}`}
          </button>
        </div>
        {error && (
          <p className="mt-2 text-xs text-red-400">{error}</p>
        )}
      </div>

      {/* Voiceover section */}
      <div className="bg-gray-800 border-t border-gray-700 px-4 py-3 shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <svg className="h-3.5 w-3.5 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2a3 3 0 013 3v6a3 3 0 11-6 0V5a3 3 0 013-3zm-1 15.93V20H9a1 1 0 100 2h6a1 1 0 100-2h-2v-2.07A8.001 8.001 0 0020 11a1 1 0 10-2 0 6 6 0 01-12 0 1 1 0 10-2 0 8.001 8.001 0 007 7.93z" />
          </svg>
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Voiceover</span>
          {voiceover && recordingState === "idle" && (
            <span className="ml-auto text-xs text-gray-500">
              Starts at {fmt(voiceover.startTime)} · {Math.round(voiceover.duration)}s
            </span>
          )}
        </div>

        {recordingState === "idle" && (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={startRecording}
              className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm font-semibold text-white transition"
              style={{ backgroundColor: "#374151" }}
            >
              <span className="h-2 w-2 rounded-full bg-red-500 inline-block" />
              {voiceover ? "Re-record" : "Record Voiceover"}
            </button>
            {voiceover && (
              <>
                <button
                  onClick={togglePreview}
                  className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm font-semibold text-white transition"
                  style={{ backgroundColor: previewing ? "#1A6B45" : "#374151" }}
                >
                  {previewing ? "⏸ Stop" : "▶ Preview"}
                </button>
                <button
                  onClick={deleteVoiceover}
                  className="h-8 px-3 rounded-lg text-sm text-gray-400 bg-gray-700 hover:text-red-400 transition"
                >
                  ✕ Delete
                </button>
              </>
            )}
          </div>
        )}

        {recordingState === "recording" && (
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse inline-block" />
              <span className="text-sm font-mono font-semibold text-red-400">{fmt(recordingTimer)}</span>
            </div>
            <span className="text-xs text-gray-400">Recording from mic…</span>
            <button
              onClick={stopRecording}
              className="ml-auto flex items-center gap-1.5 h-8 px-3 rounded-lg text-sm font-semibold text-white bg-red-700 hover:bg-red-600 transition"
            >
              ■ Stop
            </button>
          </div>
        )}

        {(recordingState === "stopping" || recordingState === "uploading") && (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            {recordingState === "uploading" ? "Uploading voiceover…" : "Processing…"}
          </div>
        )}

        {voiceoverError && (
          <p className="mt-1 text-xs text-red-400">{voiceoverError}</p>
        )}
      </div>

      {/* Annotations list */}
      <div className="flex-1 bg-white overflow-y-auto">
        {annotations.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center text-gray-400">
            <div className="mb-3 text-3xl opacity-30">✏</div>
            <p className="text-sm">No annotations yet</p>
            <p className="text-xs mt-1">Pause the video, draw on the frame, then click Save.</p>
          </div>
        ) : (
          <>
            <div className="px-4 py-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-700">
                Saved annotations
                <span className="ml-2 text-xs font-normal text-gray-400">{annotations.length}</span>
              </h2>
            </div>
            {annotations.map(a => (
              <div
                key={a.id}
                className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors"
              >
                <button
                  onClick={() => seekTo(a.timestamp)}
                  className="text-sm font-mono font-semibold hover:underline shrink-0"
                  style={{ color: "#1A6B45" }}
                >
                  {fmt(a.timestamp)}
                </button>
                <span className="text-xs text-gray-400 shrink-0">
                  {a.drawings.length} drawing{a.drawings.length !== 1 ? "s" : ""}
                </span>
                <button
                  onClick={() => togglePauseOnPlay(a)}
                  className="text-xs px-2 py-0.5 rounded-full transition shrink-0"
                  style={{
                    backgroundColor: a.pauseOnPlay ? "#fef9c3" : "#f3f4f6",
                    color: a.pauseOnPlay ? "#854d0e" : "#6b7280",
                  }}
                >
                  {a.pauseOnPlay ? "⏸ pauses" : "▶ plays through"}
                </button>
                <div className="flex-1" />
                <button
                  onClick={() => deleteAnnotation(a)}
                  className="shrink-0 text-gray-300 hover:text-red-400 transition"
                  title="Delete annotation"
                >
                  <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zm-1 8a1 1 0 112 0v3a1 1 0 11-2 0v-3zm4-1a1 1 0 00-1 1v3a1 1 0 102 0v-3a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            ))}
          </>
        )}

        {/* Comments divider */}
        <div className="border-t-4 border-gray-100 mt-2" />

        {/* Coach comments */}
        {uid && video && (
          <CommentsSection
            videoId={id}
            uid={uid}
            authorName={video.coachName}
            role="coach"
          />
        )}
      </div>
    </main>
  );
}
