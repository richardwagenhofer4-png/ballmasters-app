"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, collection, getDocs, setDoc, deleteDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

// ── Types ──────────────────────────────────────────────────────────────────────

export type DrawingType = "arrow" | "line" | "circle" | "freehand" | "text";

export interface Drawing {
  id: string;
  type: DrawingType;
  color: string;
  // arrow / line
  x1?: number; y1?: number; x2?: number; y2?: number;
  // circle
  cx?: number; cy?: number; r?: number;
  // freehand
  points?: { x: number; y: number }[];
  // text
  tx?: number; ty?: number; label?: string;
}

export interface AnnotationFrame {
  id: string;          // Firestore doc ID = Math.round(timestamp*10).toString()
  timestamp: number;   // seconds
  pauseOnPlay: boolean;
  drawings: Drawing[];
}

interface VideoDoc {
  id: string;
  title: string;
  coachId: string;
  coachName: string;
  fileName: string;
  studentIds: string[];
  downloadAllowed: boolean;
}

// ── Rendering ─────────────────────────────────────────────────────────────────

export function renderAnnotations(
  ctx: CanvasRenderingContext2D,
  drawings: Drawing[],
  w: number,
  h: number
) {
  for (const d of drawings) {
    ctx.save();
    ctx.strokeStyle = d.color;
    ctx.fillStyle = d.color;
    ctx.lineWidth = d.type === "freehand" ? 2.5 : 3.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    switch (d.type) {
      case "line":
        if (d.x1 == null) break;
        ctx.beginPath();
        ctx.moveTo(d.x1 * w, d.y1! * h);
        ctx.lineTo(d.x2! * w, d.y2! * h);
        ctx.stroke();
        break;

      case "arrow": {
        if (d.x1 == null) break;
        const ax1 = d.x1 * w, ay1 = d.y1! * h;
        const ax2 = d.x2! * w, ay2 = d.y2! * h;
        ctx.beginPath();
        ctx.moveTo(ax1, ay1);
        ctx.lineTo(ax2, ay2);
        ctx.stroke();
        const angle = Math.atan2(ay2 - ay1, ax2 - ax1);
        const hlen = Math.max(12, Math.min(24, Math.hypot(ax2 - ax1, ay2 - ay1) * 0.3));
        ctx.beginPath();
        ctx.moveTo(ax2, ay2);
        ctx.lineTo(ax2 - hlen * Math.cos(angle - Math.PI / 6), ay2 - hlen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(ax2, ay2);
        ctx.lineTo(ax2 - hlen * Math.cos(angle + Math.PI / 6), ay2 - hlen * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
        break;
      }

      case "circle":
        if (d.cx == null) break;
        ctx.beginPath();
        ctx.arc(d.cx * w, d.cy! * h, d.r! * Math.min(w, h), 0, 2 * Math.PI);
        ctx.stroke();
        break;

      case "freehand":
        if (!d.points?.length) break;
        ctx.beginPath();
        ctx.moveTo(d.points[0].x * w, d.points[0].y * h);
        for (let i = 1; i < d.points.length; i++) {
          ctx.lineTo(d.points[i].x * w, d.points[i].y * h);
        }
        ctx.stroke();
        break;

      case "text":
        if (d.tx == null) break;
        ctx.font = `bold ${Math.max(14, Math.round(h * 0.045))}px sans-serif`;
        ctx.shadowColor = "rgba(0,0,0,0.85)";
        ctx.shadowBlur = 5;
        ctx.fillText(d.label ?? "", d.tx * w, d.ty! * h);
        break;
    }
    ctx.restore();
  }
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

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawingRef = useRef(false);
  const drawStartRef = useRef<{ x: number; y: number } | null>(null);
  const freehandRef = useRef<{ x: number; y: number }[]>([]);
  const annotationsRef = useRef<AnnotationFrame[]>([]);

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
      } catch (err) {
        setError((err as Error).message);
      }
    });
    return unsub;
  }, [id, router]);

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
      </div>
    </main>
  );
}
