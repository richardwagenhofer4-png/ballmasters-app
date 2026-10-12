"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { onAuthStateChanged } from "firebase/auth";
import { doc, collection, getDocs, getDoc, setDoc, deleteDoc, updateDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import CommentsSection from "@/components/CommentsSection";
import { renderAnnotations, getContentRect, textFontSizePx, type DrawingType, type Drawing, type AnnotationFrame, type TextSize } from "@/lib/annotations";
import { useNotificationCounts } from "@/lib/NotificationsContext";
import {
  CAPTION_WARN_CHARS,
  FEEDBACK_MAX_CHARS,
  cleanSegments,
  sameSegments,
  transcriptToFeedback,
  type CaptionSegment,
} from "@/lib/captions";
import { loadCoachNotes } from "@/lib/captionsClient";
import { useActiveCaption } from "@/lib/useActiveCaption";
import CaptionOverlay from "@/components/CaptionOverlay";
import CoachFeedback from "@/components/CoachFeedback";

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

const TEXT_SIZES: { value: TextSize; label: string; title: string }[] = [
  { value: "s", label: "S", title: "Small text" },
  { value: "m", label: "M", title: "Medium text" },
  { value: "l", label: "L", title: "Large text" },
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
  const { notifications, markRead } = useNotificationCounts();

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
  const [toast, setToast] = useState<string | null>(null);
  const [showDoneModal, setShowDoneModal] = useState(false);
  const [textInput, setTextInput] = useState({ x: 0, y: 0, visible: false });
  const [textValue, setTextValue] = useState("");
  const [textSize, setTextSize] = useState<TextSize>("m");
  const [voiceover, setVoiceover] = useState<VoiceoverMeta | null>(null);
  const [recordingState, setRecordingState] = useState<"idle" | "recording" | "stopping" | "uploading">("idle");
  const [recordingTimer, setRecordingTimer] = useState(0);
  const [countdown, setCountdown] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [voiceoverError, setVoiceoverError] = useState("");
  const [previewMode, setPreviewMode] = useState(false);
  // Captions (made from the voiceover) and the coach's written feedback. The
  // "saved" copies are what athletes see; the others are the editable working
  // copies, so a fresh transcription stays a draft until the coach saves it.
  const [captionSegs, setCaptionSegs] = useState<CaptionSegment[]>([]);
  const [savedCaptions, setSavedCaptions] = useState<CaptionSegment[]>([]);
  const [feedbackText, setFeedbackText] = useState("");
  const [savedFeedback, setSavedFeedback] = useState("");
  const [transcribing, setTranscribing] = useState(false);
  const [notesError, setNotesError] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

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
  const countdownCancelledRef = useRef(false);
  const lastVideoTimeRef = useRef<number>(0);
  const abortedBySeekRef = useRef(false);
  const timerIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewBlobUrlRef = useRef<string | null>(null);
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewModeAudioRef = useRef<HTMLAudioElement | null>(null);
  const previewPausedAtRef = useRef<number | null>(null);
  // Last known videos/{id}.hasBreakdown. A ref, not state: syncHasBreakdown()
  // also runs from the recorder's onstop closure, which would see stale state.
  const hasBreakdownRef = useRef<boolean | undefined>(undefined);
  // Latest copies for code that runs from stale closures (the recorder's
  // onstop → doUploadVoiceover) and for the hasBreakdown decision.
  const voiceoverRef = useRef<VoiceoverMeta | null>(null);
  const savedCaptionsRef = useRef<CaptionSegment[]>([]);
  const savedFeedbackRef = useRef("");
  const captionsCreatedAtRef = useRef<string | null>(null);
  const transcribingRef = useRef(false);
  const mountedRef = useRef(true);

  useEffect(() => { annotationsRef.current = annotations; }, [annotations]);
  useEffect(() => { voiceoverRef.current = voiceover; }, [voiceover]);
  useEffect(() => { savedCaptionsRef.current = savedCaptions; }, [savedCaptions]);
  useEffect(() => { savedFeedbackRef.current = savedFeedback; }, [savedFeedback]);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Mark new_comment notifications for this video as read when the page opens
  useEffect(() => {
    if (!id) return;
    const toMark = notifications
      .filter(n => n.type === "new_comment" && (n.meta?.videoId as string | undefined) === id)
      .map(n => n.id);
    if (toMark.length > 0) markRead(toMark);
  }, [id, notifications, markRead]);

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
        hasBreakdownRef.current = data.hasBreakdown;
        if (data.videoUrl) {
          setVideoUrl(data.videoUrl);
        } else if (data.type === "drill_comparison" || data.coachVideoKey) {
          // Drill comparison videos have no single videoUrl (the API returns
          // coachVideoUrl/studentVideoUrl). They belong on the drill page —
          // redirect rather than hang forever on "Loading video…".
          router.replace(`/coach/videos/${id}/drill`);
          return;
        } else {
          // No playable URL and not a drill — fail visibly instead of hanging.
          throw new Error("This video has no playable file.");
        }

        const snap = await getDocs(collection(db, "videos", id, "annotations"));
        setAnnotations(
          snap.docs
            .map(d => ({ id: d.id, ...(d.data() as Omit<AnnotationFrame, "id">) }))
            .sort((a, b) => a.timestamp - b.timestamp)
        );

        const voSnap = await getDoc(doc(db, "videos", id, "voiceover", "main"));
        if (voSnap.exists()) setVoiceover(voSnap.data() as VoiceoverMeta);

        const notes = await loadCoachNotes(id);
        captionsCreatedAtRef.current = notes.captionsCreatedAt;
        setSavedCaptions(notes.captions);
        setCaptionSegs(notes.captions);
        setSavedFeedback(notes.feedback);
        setFeedbackText(notes.feedback);
      } catch (err) {
        setError((err as Error).message);
      }
    });
    return unsub;
  }, [id, router]);

  useEffect(() => {
    return () => {
      countdownCancelledRef.current = true;
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
        const dpr = window.devicePixelRatio || 1;
        canvasRef.current.width = video.clientWidth * dpr;
        canvasRef.current.height = video.clientHeight * dpr;
        canvasRef.current.style.width = video.clientWidth + "px";
        canvasRef.current.style.height = video.clientHeight + "px";
      }
    });
    obs.observe(video);
    return () => obs.disconnect();
  }, [videoUrl]);

  // ── Redraw canvas ───────────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, video.clientWidth, video.clientHeight);
    const all = liveDrawing ? [...drawings, liveDrawing] : drawings;
    const cr = getContentRect(video);
    if (cr) {
      ctx.save();
      ctx.translate(cr.offsetX, cr.offsetY);
      renderAnnotations(ctx, all, cr.width, cr.height);
      ctx.restore();
    } else {
      renderAnnotations(ctx, all, video.clientWidth, video.clientHeight);
    }
  }, [drawings, liveDrawing]);

  // ── Canvas pointer helpers ──────────────────────────────────────────────────
  function getPos(e: React.MouseEvent | React.TouchEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const clientX = "touches" in e ? (e.touches[0]?.clientX ?? 0) : e.clientX;
    const clientY = "touches" in e ? (e.touches[0]?.clientY ?? 0) : e.clientY;
    const px = clientX - rect.left;
    const py = clientY - rect.top;
    const cr = videoRef.current ? getContentRect(videoRef.current) : null;
    if (cr) {
      return {
        x: Math.max(0, Math.min(1, (px - cr.offsetX) / cr.width)),
        y: Math.max(0, Math.min(1, (py - cr.offsetY) / cr.height)),
      };
    }
    return {
      x: Math.max(0, Math.min(1, px / rect.width)),
      y: Math.max(0, Math.min(1, py / rect.height)),
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
      const px = e.changedTouches[0].clientX - rect.left;
      const py = e.changedTouches[0].clientY - rect.top;
      const cr = videoRef.current ? getContentRect(videoRef.current) : null;
      if (cr) {
        pos = {
          x: Math.max(0, Math.min(1, (px - cr.offsetX) / cr.width)),
          y: Math.max(0, Math.min(1, (py - cr.offsetY) / cr.height)),
        };
      } else {
        pos = {
          x: Math.max(0, Math.min(1, px / rect.width)),
          y: Math.max(0, Math.min(1, py / rect.height)),
        };
      }
    } else {
      pos = getPos(e as React.MouseEvent);
    }
    const start = drawStartRef.current!;
    drawStartRef.current = null;

    const video = videoRef.current;
    const cr = video ? getContentRect(video) : null;
    const contentW = cr ? cr.width : (video?.clientWidth ?? 1);
    const baseStroke = tool === "freehand" ? 2.5 : 3.5;
    const d: Drawing = { id: Date.now().toString(), type: tool, color, strokeWidth: baseStroke / contentW };

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
      const video = videoRef.current;
      const cr = video ? getContentRect(video) : null;
      const contentW = cr ? cr.width : (video?.clientWidth ?? 1);
      setDrawings(prev => [...prev, {
        id: Date.now().toString(),
        type: "text", color,
        strokeWidth: 3.5 / contentW,
        tx: textInput.x, ty: textInput.y,
        label: textValue.trim(),
        textSize,
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
  // Keeps videos/{id}.hasBreakdown in step with the annotations + voiceover
  // subcollections. Access-plan athletes can't read those subcollections, so
  // this flag is how their app knows to show the "Coach breakdown on this
  // clip" upgrade panel. Best-effort: a failed write never blocks the coach's
  // save, and scripts/backfill-has-breakdown.mjs can recompute it.
  // True when ANY coach breakdown exists on this video: drawings, a voiceover,
  // saved captions or saved feedback. Pass what has just changed, because React
  // state (and the refs that mirror it) lags a call behind.
  function breakdownExists(changed: { annotations?: number; voiceover?: boolean; captions?: number; feedback?: boolean } = {}) {
    const a = changed.annotations ?? annotationsRef.current.length;
    const v = changed.voiceover ?? voiceoverRef.current !== null;
    const c = changed.captions ?? savedCaptionsRef.current.length;
    const f = changed.feedback ?? savedFeedbackRef.current.length > 0;
    return a > 0 || v || c > 0 || f;
  }

  async function syncHasBreakdown(value: boolean) {
    if (hasBreakdownRef.current === value) return;
    try {
      await updateDoc(doc(db, "videos", id), { hasBreakdown: value });
      hasBreakdownRef.current = value;
    } catch (err) {
      console.error("[annotate] failed to update hasBreakdown:", err);
    }
  }

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
      setToast(`Annotation saved at ${fmt(t)}`);
      setTimeout(() => setToast(null), 2000);
      await syncHasBreakdown(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteAnnotation(annot: AnnotationFrame) {
    await deleteDoc(doc(db, "videos", id, "annotations", annot.id));
    const remaining = annotationsRef.current.filter(a => a.id !== annot.id);
    setAnnotations(prev => prev.filter(a => a.id !== annot.id));
    if (Math.abs((videoRef.current?.currentTime ?? 0) - annot.timestamp) < 0.5) {
      setDrawings([]);
      setPauseOnPlay(false);
    }
    await syncHasBreakdown(breakdownExists({ annotations: remaining.length }));
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

  function previewAnnotation(a: AnnotationFrame) {
    if (!videoRef.current) return;
    videoRef.current.currentTime = a.timestamp;
    videoRef.current.pause();
    setDrawings(a.drawings);
    setPauseOnPlay(a.pauseOnPlay);
    setLiveDrawing(null);
  }

  // Mic + upload target are prepared while the countdown runs so that
  // recorder.start() and video.play() can fire in the same tick.
  async function prepareRecording(): Promise<{ recorder: MediaRecorder; mimeType: string }> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
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
    return { recorder, mimeType };
  }

  function releaseMic() {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }

  async function startRecording() {
    if (recordingState !== "idle" || countdown !== null) return;
    const video = videoRef.current;
    if (!video) return;
    // A new take makes the captions made from the old one wrong.
    if (voiceover && (savedCaptions.length > 0 || captionSegs.length > 0)
      && !window.confirm("Recording again replaces your voiceover and its captions. Continue?")) return;
    setVoiceoverError("");

    // play() on an ended clip restarts it at 0, which would leave the anchor
    // pointing at the end of the video and desync the whole take.
    if (video.ended || (video.duration && video.currentTime >= video.duration - 0.05)) {
      setVoiceoverError("The playhead is at the end of the clip — scrub back to where the voiceover should start.");
      return;
    }

    // Anchor the take to the frame the video is parked on when the countdown
    // begins. Do not touch currentTime after this — a seek would abort the take.
    recordingStartVideoTimeRef.current = video.currentTime;
    video.pause();
    countdownCancelledRef.current = false;
    abortedBySeekRef.current = false;
    lastVideoTimeRef.current = recordingStartVideoTimeRef.current;

    try {
      const prep = prepareRecording();
      prep.catch(() => {}); // rejection is surfaced at the await below

      for (let n = 3; n > 0 && !countdownCancelledRef.current; n--) {
        setCountdown(n);
        await new Promise(r => setTimeout(r, 1000));
      }

      const { recorder, mimeType } = await prep;
      setCountdown(null);
      if (countdownCancelledRef.current) { releaseMic(); return; }

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: mimeType });
        // Duration in VIDEO time. The recorder is paused whenever the video is,
        // so the audio timeline matches the playback formula on the student
        // page (audio t = video t − startTime).
        // On a seek-abort, currentTime is already the seek DESTINATION by the
        // time `seeking` fires, so fall back to the last sampled frame.
        const endVideoTime = abortedBySeekRef.current
          ? lastVideoTimeRef.current
          : videoRef.current?.currentTime ?? recordingStartVideoTimeRef.current;
        const duration = Math.max(0, endVideoTime - recordingStartVideoTimeRef.current);
        doUploadVoiceover(blob, duration, mimeType);
      };

      // Keep speaker output out of the microphone while recording.
      video.muted = true;
      recorder.start(1000);
      video.play().catch(() => {});
      setRecordingState("recording");
      setRecordingTimer(0);
      // The timer reports elapsed VIDEO time, so it stops while the video does.
      timerIntervalRef.current = setInterval(() => {
        const v = videoRef.current;
        if (!v) return;
        lastVideoTimeRef.current = v.currentTime;
        setRecordingTimer(Math.max(0, v.currentTime - recordingStartVideoTimeRef.current));
      }, 250);
    } catch (err) {
      setCountdown(null);
      setVoiceoverError((err as Error).message);
      releaseMic();
      if (videoRef.current) videoRef.current.muted = false;
    }
  }

  function stopRecording() {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return; // already stopping
    setRecordingState("stopping");
    if (timerIntervalRef.current) { clearInterval(timerIntervalRef.current); timerIntervalRef.current = null; }
    recorder.stop();
    videoRef.current?.pause();
    releaseMic();
    if (videoRef.current) videoRef.current.muted = false;
  }

  // ── Recorder follows the video's playback state ─────────────────────────────
  // Any dead air while the video is paused/buffering would permanently desync
  // everything after it, since playback maps audio to video linearly.
  useEffect(() => {
    if (recordingState !== "recording") return;
    const video = videoRef.current;
    if (!video) return;

    const holdRecorder = () => {
      const rec = mediaRecorderRef.current;
      if (rec?.state === "recording") rec.pause();
    };
    const resumeRecorder = () => {
      const rec = mediaRecorderRef.current;
      if (rec?.state === "paused") rec.resume();
    };
    const handleEnded = () => stopRecording();
    const handleSeeking = () => {
      abortedBySeekRef.current = true;
      setVoiceoverError("Recording stopped — you can't scrub while recording. Press Record again to start a new take.");
      stopRecording();
    };

    video.addEventListener("pause", holdRecorder);
    video.addEventListener("waiting", holdRecorder);
    video.addEventListener("stalled", holdRecorder);
    video.addEventListener("playing", resumeRecorder);
    video.addEventListener("ended", handleEnded);
    video.addEventListener("seeking", handleSeeking);
    return () => {
      video.removeEventListener("pause", holdRecorder);
      video.removeEventListener("waiting", holdRecorder);
      video.removeEventListener("stalled", holdRecorder);
      video.removeEventListener("playing", resumeRecorder);
      video.removeEventListener("ended", handleEnded);
      video.removeEventListener("seeking", handleSeeking);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordingState]);

  async function doUploadVoiceover(blob: Blob, duration: number, mimeType: string) {
    setRecordingState("uploading");
    try {
      // No Content-Type header — Content-Type is not in SignedHeaders so the
      // browser can send whatever it naturally sends without breaking the signature.
      const uploadRes = await fetch(uploadUrlRef.current, { method: "PUT", body: blob });
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
      voiceoverRef.current = meta;
      await syncHasBreakdown(true);
      // The captions of any earlier take no longer match: clear them, then
      // draft new ones from this take. Runs from the recorder's onstop
      // closure, so these functions only touch refs and state setters.
      await discardCaptions();
      void generateCaptions();
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
      if (videoRef.current) videoRef.current.muted = false;
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
      audio.onended = () => {
        videoRef.current?.pause();
        if (videoRef.current) videoRef.current.muted = false;
        setPreviewing(false);
      };
      if (videoRef.current) videoRef.current.currentTime = voiceover.startTime;
      await audio.play();
      // Duck the clip's own soundtrack under the voiceover.
      if (videoRef.current) videoRef.current.muted = true;
      videoRef.current?.play();
      setPreviewing(true);
    } catch (err) {
      if (videoRef.current) videoRef.current.muted = false;
      setVoiceoverError((err as Error).message);
    }
  }

  async function deleteVoiceover() {
    try {
      const token = await auth.currentUser!.getIdToken();
      const res = await fetch(`/api/voiceover?videoId=${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const { error } = await res.json();
        throw new Error(error ?? "Failed to delete voiceover");
      }
      if (previewBlobUrlRef.current) { URL.revokeObjectURL(previewBlobUrlRef.current); previewBlobUrlRef.current = null; }
      previewAudioRef.current?.pause();
      previewAudioRef.current = null;
      if (videoRef.current) videoRef.current.muted = false;
      setVoiceover(null);
      voiceoverRef.current = null;
      setPreviewing(false);
      // Captions are made from the voiceover; they go with it.
      await discardCaptions();
      await syncHasBreakdown(breakdownExists({ voiceover: false }));
    } catch (err) {
      setVoiceoverError((err as Error).message);
    }
  }

  // ── Captions + coach's feedback ──────────────────────────────────────────────
  // Deletes the saved captions (and drops the working copy). Used when the
  // voiceover they were made from is deleted or replaced. Returns false if the
  // delete failed, in which case the old captions are still live.
  async function discardCaptions(): Promise<boolean> {
    try {
      await deleteDoc(doc(db, "videos", id, "captions", "main"));
    } catch (err) {
      if (mountedRef.current) setNotesError(`Couldn't remove the old captions: ${(err as Error).message}`);
      return false;
    }
    captionsCreatedAtRef.current = null;
    savedCaptionsRef.current = [];
    if (mountedRef.current) {
      setSavedCaptions([]);
      setCaptionSegs([]);
    }
    return true;
  }

  // Asks the server to transcribe the voiceover. The result is only a DRAFT in
  // the editor: athletes see nothing until the coach reviews it and saves.
  async function generateCaptions() {
    const requested = voiceoverRef.current;
    if (!requested || transcribingRef.current) return;
    transcribingRef.current = true;
    setTranscribing(true);
    setNotesError("");
    try {
      const token = await auth.currentUser!.getIdToken();
      const res = await fetch("/api/voiceover/transcribe", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ videoId: id }),
      });
      const data = (await res.json().catch(() => ({}))) as { segments?: unknown; error?: string };
      // The coach recorded again, or deleted the voiceover, while this ran:
      // these captions belong to a recording that no longer exists.
      if (voiceoverRef.current?.fileName !== requested.fileName) return;
      if (!res.ok) throw new Error(data.error ?? "The transcription service didn't answer.");
      if (!mountedRef.current) return;
      const segs = cleanSegments(data.segments);
      if (segs.length === 0) {
        setNotesError("No speech was found in the voiceover, so there are no captions to review.");
        return;
      }
      setCaptionSegs(segs);
      // Pre-fill the feedback box with the whole transcript, but never over
      // something the coach already wrote.
      const { text } = transcriptToFeedback(segs);
      setFeedbackText(prev => (prev.trim() ? prev : text));
      setToast("Captions ready — review them, then save");
      setTimeout(() => setToast(null), 3000);
    } catch (err) {
      if (mountedRef.current && voiceoverRef.current?.fileName === requested.fileName) {
        setNotesError(`Couldn't create captions. ${(err as Error).message}`);
      }
    } finally {
      transcribingRef.current = false;
      if (mountedRef.current) setTranscribing(false);
      // A newer take was saved while this one ran (its own request was skipped
      // because this one was in flight): draft captions for that one now.
      const current = voiceoverRef.current;
      if (mountedRef.current && current && current.fileName !== requested.fileName) void generateCaptions();
    }
  }

  function regenerateCaptions() {
    if (
      !sameSegments(cleanSegments(captionSegs), savedCaptions) &&
      !window.confirm("Creating captions again replaces the changes you've made to the list below. Continue?")
    ) return;
    void generateCaptions();
  }

  async function saveNotes() {
    if (savingNotes) return;
    setSavingNotes(true);
    setNotesError("");
    try {
      const now = new Date().toISOString();
      const segs = cleanSegments(captionSegs); // trims, drops emptied rows
      const feedback = feedbackText.trim().slice(0, FEEDBACK_MAX_CHARS);

      if (segs.length > 0) {
        const createdAt = captionsCreatedAtRef.current ?? now;
        await setDoc(doc(db, "videos", id, "captions", "main"), {
          segments: segs,
          source: "voiceover",
          createdAt,
          updatedAt: now,
        });
        captionsCreatedAtRef.current = createdAt;
      } else {
        await deleteDoc(doc(db, "videos", id, "captions", "main"));
        captionsCreatedAtRef.current = null;
      }

      if (feedback) {
        await setDoc(doc(db, "videos", id, "feedback", "main"), { text: feedback, updatedAt: now });
      } else {
        await deleteDoc(doc(db, "videos", id, "feedback", "main"));
      }

      savedCaptionsRef.current = segs;
      savedFeedbackRef.current = feedback;
      setSavedCaptions(segs);
      setCaptionSegs(segs);
      setSavedFeedback(feedback);
      setFeedbackText(feedback);
      setToast("Captions and feedback saved");
      setTimeout(() => setToast(null), 2000);
      await syncHasBreakdown(breakdownExists({ captions: segs.length, feedback: feedback.length > 0 }));
    } catch (err) {
      setNotesError(`Couldn't save: ${(err as Error).message}`);
    } finally {
      setSavingNotes(false);
    }
  }

  // ── Preview canvas sizing ───────────────────────────────────────────────────
  useEffect(() => {
    if (!previewMode) return;
    const pvid = previewVideoRef.current;
    const pcanvas = previewCanvasRef.current;
    if (!pvid || !pcanvas) return;
    const syncSize = () => {
      const dpr = window.devicePixelRatio || 1;
      pcanvas.width = pvid.clientWidth * dpr;
      pcanvas.height = pvid.clientHeight * dpr;
      pcanvas.style.width = pvid.clientWidth + "px";
      pcanvas.style.height = pvid.clientHeight + "px";
    };
    const obs = new ResizeObserver(syncSize);
    obs.observe(pvid);
    syncSize();
    return () => obs.disconnect();
  }, [previewMode]);

  // ── Preview mode handlers ───────────────────────────────────────────────────
  async function openPreview() {
    // The overlay has its own player; the editor's must fall silent underneath
    // it. Pause the editor video, stop a running voiceover preview (and undo its
    // ducking), and cancel a pending record countdown, which would otherwise
    // start the editor video when it reaches zero. A take already recording is
    // held, not stopped — pausing the video pauses the recorder with it.
    const editorVideo = videoRef.current;
    editorVideo?.pause();
    if (previewing) {
      previewAudioRef.current?.pause();
      if (editorVideo) editorVideo.muted = false;
      setPreviewing(false);
    }
    if (countdown !== null) countdownCancelledRef.current = true;

    // With captions saved, athletes hear the clip's own sound and read the
    // captions; the voiceover audio is only for videos that have no captions.
    if (voiceover && savedCaptionsRef.current.length === 0 && !previewModeAudioRef.current) {
      try {
        let src: string;
        if (previewBlobUrlRef.current) {
          src = previewBlobUrlRef.current;
        } else {
          const token = await auth.currentUser!.getIdToken();
          const res = await fetch(`/api/voiceover?videoId=${id}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (!res.ok) throw new Error("Failed to load voiceover");
          const { audioUrl } = await res.json();
          src = audioUrl;
        }
        const pmAudio = new Audio(src);
        // Restore the clip audio when the voiceover runs out mid-playback.
        pmAudio.onended = () => {
          if (previewVideoRef.current) previewVideoRef.current.muted = false;
        };
        previewModeAudioRef.current = pmAudio;
      } catch {
        // voiceover won't play in preview, but continue
      }
    }
    setPreviewMode(true);
  }

  function closePreview() {
    previewVideoRef.current?.pause();
    if (previewModeAudioRef.current) previewModeAudioRef.current.pause();
    if (previewVideoRef.current) previewVideoRef.current.muted = false;
    previewPausedAtRef.current = null;
    setPreviewMode(false);
  }

  function handlePreviewTimeUpdate() {
    const pvid = previewVideoRef.current;
    const pcanvas = previewCanvasRef.current;
    if (!pvid || !pcanvas) return;
    const t = pvid.currentTime;
    const ann = annotationsRef.current.find(a => Math.abs(a.timestamp - t) < 0.5);

    const ctx = pcanvas.getContext("2d");
    if (ctx) {
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, pvid.clientWidth, pvid.clientHeight);
      if (ann) {
        const cr = getContentRect(pvid);
        if (cr) {
          ctx.save();
          ctx.translate(cr.offsetX, cr.offsetY);
          renderAnnotations(ctx, ann.drawings, cr.width, cr.height);
          ctx.restore();
        } else {
          renderAnnotations(ctx, ann.drawings, pvid.clientWidth, pvid.clientHeight);
        }
      }
    }

    if (ann?.pauseOnPlay && !pvid.paused && previewPausedAtRef.current !== ann.timestamp) {
      previewPausedAtRef.current = ann.timestamp;
      pvid.pause();
      previewModeAudioRef.current?.pause();
      pvid.muted = false;
    }

    if (previewPausedAtRef.current !== null) {
      const stillNear = Math.abs(t - previewPausedAtRef.current) < 0.5;
      if (!stillNear) previewPausedAtRef.current = null;
    }
  }

  function handlePreviewPlay() {
    const pvid = previewVideoRef.current;
    const audio = previewModeAudioRef.current;
    if (!pvid || !audio || !voiceover || savedCaptionsRef.current.length > 0) return;
    const offset = pvid.currentTime - voiceover.startTime;
    if (offset >= 0 && offset < voiceover.duration) {
      audio.currentTime = offset;
      audio.play().catch(() => {});
      pvid.muted = true;
    } else {
      pvid.muted = false;
    }
  }

  function handlePreviewPause() {
    previewModeAudioRef.current?.pause();
    if (previewVideoRef.current) previewVideoRef.current.muted = false;
  }

  function handlePreviewSeeked() {
    const pvid = previewVideoRef.current;
    const pcanvas = previewCanvasRef.current;
    if (!pvid || !pcanvas) return;
    previewPausedAtRef.current = null;
    const t = pvid.currentTime;
    const ann = annotationsRef.current.find(a => Math.abs(a.timestamp - t) < 0.5);
    const ctx = pcanvas.getContext("2d");
    if (ctx) {
      const dpr = window.devicePixelRatio || 1;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, pvid.clientWidth, pvid.clientHeight);
      if (ann) {
        const cr = getContentRect(pvid);
        if (cr) {
          ctx.save();
          ctx.translate(cr.offsetX, cr.offsetY);
          renderAnnotations(ctx, ann.drawings, cr.width, cr.height);
          ctx.restore();
        } else {
          renderAnnotations(ctx, ann.drawings, pvid.clientWidth, pvid.clientHeight);
        }
      }
    }
    if (!pvid.paused && previewModeAudioRef.current && voiceover && savedCaptionsRef.current.length === 0) {
      const offset = t - voiceover.startTime;
      if (offset >= 0 && offset < voiceover.duration) {
        previewModeAudioRef.current.currentTime = offset;
        previewModeAudioRef.current.play().catch(() => {});
        pvid.muted = true;
      } else {
        previewModeAudioRef.current.pause();
        pvid.muted = false;
      }
    }
  }

  const captionsDirty = !sameSegments(cleanSegments(captionSegs), savedCaptions);
  const feedbackDirty = feedbackText.trim() !== savedFeedback;
  const notesDirty = captionsDirty || feedbackDirty;
  // What an athlete would see in the preview: the SAVED captions.
  const previewCaption = useActiveCaption(previewVideoRef, savedCaptions, previewMode);

  const atSavedFrame = annotations.some(
    a => Math.abs((videoRef.current?.currentTime ?? currentTime) - a.timestamp) < 0.5
  );

  // Convert content-rect-normalized coords back to element-box percentages for overlay positioning
  const textOverlayPos = (() => {
    const video = videoRef.current;
    const cr = video ? getContentRect(video) : null;
    if (cr && video) {
      return {
        left: `${((textInput.x * cr.width + cr.offsetX) / video.clientWidth) * 100}%`,
        top: `${((textInput.y * cr.height + cr.offsetY) / video.clientHeight) * 100}%`,
        // Same height the canvas draw is handed at line ~209, through the same
        // helper, so what the coach types is the size they get on confirm.
        fontSize: `${textFontSizePx(cr.height, textSize)}px`,
      };
    }
    return {
      left: `${textInput.x * 100}%`,
      top: `${textInput.y * 100}%`,
      fontSize: `${textFontSizePx(video?.clientHeight ?? 0, textSize)}px`,
    };
  })();

  // ── Render ─────────────────────────────────────────────────────────────────
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
          <span className="text-sm font-bold text-white whitespace-nowrap">Annotation Editor</span>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={openPreview}
            className="text-sm font-semibold transition"
            style={{ color: "#60a5fa" }}
          >
            Preview
          </button>
          <button
            onClick={() => setShowDoneModal(true)}
            className="text-sm font-semibold transition"
            style={{ color: "#4ade80" }}
          >
            Done →
          </button>
        </div>
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
            style={{ maxHeight: "75vh", display: "block" }}
            playsInline
            onTimeUpdate={() => setCurrentTime(videoRef.current?.currentTime ?? 0)}
            onPlay={() => setIsPaused(false)}
            onPause={() => setIsPaused(true)}
            onSeeked={handleSeeked}
          />
        ) : error ? (
          <div className="h-48 flex flex-col items-center justify-center gap-2 px-4 text-center text-sm">
            <p className="text-red-400">{error}</p>
            <Link href="/coach/videos" className="font-semibold" style={{ color: "#01fff9" }}>
              ← Back to videos
            </Link>
          </div>
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
              left: textOverlayPos.left,
              top: textOverlayPos.top,
              transform: "translate(4px, -100%)",
              background: "transparent",
              border: "none",
              outline: "none",
              color,
              fontSize: textOverlayPos.fontSize,
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

      {/* Compact toolbar */}
      <div className="bg-gray-900 border-b border-gray-800 px-3 py-2 shrink-0 space-y-1.5">

        {/* Row 1: Drawing toggle · tools · colors · undo */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={toggleDrawingMode}
            className="flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-bold transition shrink-0"
            style={{ backgroundColor: drawingMode ? "#001c48" : "#374151", color: "white" }}
          >
            <span>{drawingMode ? "✏" : "▶"}</span>
            {drawingMode ? "Drawing ON" : "Drawing OFF"}
          </button>

          <div className="w-px h-5 bg-gray-700 shrink-0" />

          <div
            className="flex items-center gap-1 transition-opacity"
            style={{ opacity: drawingMode ? 1 : 0.4 }}
          >
            {TOOLS.map(t => (
              <button
                key={t.type}
                title={t.label}
                onClick={() => { setTool(t.type); if (!drawingMode) toggleDrawingMode(); }}
                className="h-8 px-2.5 rounded-lg text-xs font-semibold transition"
                style={{
                  backgroundColor: tool === t.type && drawingMode ? "#001c48" : "#374151",
                  color: tool === t.type && drawingMode ? "white" : "#9ca3af",
                }}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {drawingMode && tool === "text" && (
            <>
              <div className="w-px h-5 bg-gray-700 shrink-0" />
              {/* S / M / L — the same size feeds the live input and the canvas
                  draw (textFontSizePx). mouseDown is held so picking a size
                  while typing doesn't blur the input and confirm the text. */}
              <div className="flex items-center gap-1" role="group" aria-label="Text size">
                {TEXT_SIZES.map(sz => (
                  <button
                    key={sz.value}
                    type="button"
                    title={sz.title}
                    aria-pressed={textSize === sz.value}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => setTextSize(sz.value)}
                    className="h-8 w-8 rounded-lg text-xs font-bold transition"
                    style={{
                      backgroundColor: textSize === sz.value ? "#001c48" : "#374151",
                      color: textSize === sz.value ? "white" : "#9ca3af",
                    }}
                  >
                    {sz.label}
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="w-px h-5 bg-gray-700 shrink-0" />

          <div
            className="flex items-center gap-1.5 transition-opacity"
            style={{ opacity: drawingMode ? 1 : 0.4 }}
          >
            {COLORS.map(c => (
              <button
                key={c.value}
                title={c.label}
                onClick={() => setColor(c.value)}
                className="h-5 w-5 rounded-full transition shrink-0"
                style={{
                  backgroundColor: c.value,
                  outline: color === c.value ? "2px solid white" : "2px solid transparent",
                  outlineOffset: "2px",
                  border: c.value === "#ffffff" ? "1px solid #6b7280" : "none",
                }}
              />
            ))}
          </div>

          <div className="flex-1" />

          <button
            onClick={() => setDrawings(prev => prev.slice(0, -1))}
            disabled={drawings.length === 0}
            className="h-7 px-2 rounded text-xs text-gray-400 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 transition shrink-0"
          >
            ↩ Undo
          </button>
          <button
            onClick={() => { setDrawings([]); setLiveDrawing(null); }}
            disabled={drawings.length === 0}
            className="h-7 px-2 rounded text-xs text-gray-400 bg-gray-800 hover:bg-gray-700 disabled:opacity-30 transition shrink-0"
          >
            ✕ Clear
          </button>
        </div>

        {/* Row 2: Pause toggle · time · save */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-1.5 text-xs text-gray-300 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={pauseOnPlay}
              onChange={e => setPauseOnPlay(e.target.checked)}
              className="rounded"
            />
            Pause athlete on play
          </label>
          <div className="flex-1" />
          <span className="text-xs text-gray-500 font-mono">{fmt(currentTime)}</span>
          <button
            onClick={saveAnnotation}
            disabled={drawings.length === 0 || saving}
            className="h-7 px-3 rounded text-xs font-semibold text-white transition disabled:opacity-40"
            style={{ backgroundColor: "#001c48" }}
          >
            {saving ? "Saving…" : `Save at ${fmt(currentTime)}`}
          </button>
        </div>

        {error && <p className="text-xs text-red-400">{error}</p>}
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

        {countdown !== null && (
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-600 text-sm font-bold text-white">
              {countdown}
            </span>
            <span className="text-xs text-gray-400">
              Playback and recording start together at {fmt(recordingStartVideoTimeRef.current)}…
            </span>
          </div>
        )}

        {recordingState === "idle" && countdown === null && (
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
                  style={{ backgroundColor: previewing ? "#001c48" : "#374151" }}
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
            <span className="text-xs text-gray-400">Recording — pauses with the video</span>
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

      {/* Captions + coach's feedback */}
      <div className="bg-gray-800 border-t border-gray-700 px-4 py-3 shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <svg className="h-3.5 w-3.5 text-gray-400" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M4 5h16a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V7a2 2 0 012-2zm3.5 4.5a2.5 2.5 0 000 5c.7 0 1.3-.3 1.8-.7l-.9-1.1a1.1 1.1 0 01-.9.4 1.1 1.1 0 010-2.2c.4 0 .7.1.9.4l.9-1.1a2.5 2.5 0 00-1.8-.7zm7 0a2.5 2.5 0 000 5c.7 0 1.3-.3 1.8-.7l-.9-1.1a1.1 1.1 0 01-.9.4 1.1 1.1 0 010-2.2c.4 0 .7.1.9.4l.9-1.1a2.5 2.5 0 00-1.8-.7z" />
          </svg>
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Captions &amp; feedback</span>
        </div>

        {/* Captions */}
        {!voiceover ? (
          <p className="text-xs text-gray-500">
            Record a voiceover and captions are made from it automatically. You can also just write feedback below.
          </p>
        ) : transcribing ? (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Creating captions from your voiceover…
          </div>
        ) : captionSegs.length === 0 ? (
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => void generateCaptions()}
              disabled={recordingState !== "idle"}
              className="h-8 px-3 rounded-lg text-sm font-semibold text-white transition disabled:opacity-40"
              style={{ backgroundColor: "#374151" }}
            >
              Create captions from voiceover
            </button>
            <span className="text-xs text-gray-500">Athletes then read your voiceover instead of hearing it.</span>
          </div>
        ) : (
          <div>
            <p className="text-xs mb-2" style={{ color: captionsDirty ? "#fbbf24" : "#9ca3af" }}>
              {captionsDirty
                ? "Review the captions, fix any words, then Save. Until you save, athletes hear your voiceover as audio instead."
                : "Saved. Athletes watch with the clip's own sound and read these captions; your voiceover audio isn't played."}
            </p>
            <ul className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
              {captionSegs.map((seg, i) => (
                <li key={i} className="flex items-start gap-2">
                  <button
                    onClick={() => seekTo(seg.start)}
                    title="Jump to this caption in the video"
                    className="mt-1.5 w-11 shrink-0 text-left text-xs font-mono font-semibold hover:underline"
                    style={{ color: "#01fff9" }}
                  >
                    {fmt(seg.start)}
                  </button>
                  <div className="flex-1 min-w-0">
                    <textarea
                      value={seg.text}
                      rows={2}
                      aria-label={`Caption at ${fmt(seg.start)}`}
                      onChange={e => {
                        const text = e.target.value;
                        setCaptionSegs(prev => prev.map((c, j) => (j === i ? { ...c, text } : c)));
                      }}
                      className="w-full resize-none rounded-md border border-gray-600 bg-gray-900 px-2 py-1.5 text-sm text-white focus:outline-none focus:border-gray-400"
                    />
                    {seg.text.length > CAPTION_WARN_CHARS && (
                      <p className="text-xs text-amber-400">Long — athletes see two lines, so the end may be cut off. Consider shortening.</p>
                    )}
                  </div>
                  <button
                    onClick={() => setCaptionSegs(prev => prev.filter((_, j) => j !== i))}
                    title="Delete this caption"
                    aria-label={`Delete caption at ${fmt(seg.start)}`}
                    className="mt-1 h-8 w-8 shrink-0 rounded text-gray-400 hover:text-red-400 hover:bg-gray-700 transition"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
            <button
              onClick={regenerateCaptions}
              disabled={recordingState !== "idle"}
              className="mt-2 text-xs text-gray-400 underline hover:text-white disabled:opacity-40"
            >
              Create captions again from the voiceover
            </button>
          </div>
        )}

        {/* Coach's feedback */}
        <label htmlFor="coach-feedback" className="mt-3 block text-xs font-semibold text-gray-400 uppercase tracking-wide">
          Coach&rsquo;s feedback
        </label>
        <textarea
          id="coach-feedback"
          value={feedbackText}
          onChange={e => setFeedbackText(e.target.value)}
          maxLength={FEEDBACK_MAX_CHARS}
          rows={5}
          placeholder="Written notes the athlete sees under the video. Fill in from your voiceover, or write your own."
          className="mt-1 w-full rounded-md border border-gray-600 bg-gray-900 px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-gray-400"
        />
        <p className="text-right text-xs text-gray-500">{feedbackText.length} / {FEEDBACK_MAX_CHARS}</p>

        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={saveNotes}
            disabled={!notesDirty || savingNotes}
            className="h-8 px-4 rounded-lg text-sm font-semibold text-white transition disabled:opacity-40"
            style={{ backgroundColor: "#001c48" }}
          >
            {savingNotes ? "Saving…" : "Save captions & feedback"}
          </button>
          {notesDirty && !savingNotes && <span className="text-xs text-amber-400">Unsaved changes</span>}
        </div>
        {notesError && <p className="mt-2 text-xs text-red-400">{notesError}</p>}
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
                onClick={() => previewAnnotation(a)}
                className="flex items-center gap-3 px-4 py-3 border-b border-gray-50 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                {/* Play/preview icon */}
                <svg className="h-4 w-4 shrink-0 text-gray-400" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                </svg>
                <span className="text-sm font-mono font-semibold shrink-0" style={{ color: "#01fff9" }}>
                  {fmt(a.timestamp)}
                </span>
                <span className="text-xs text-gray-400 shrink-0">
                  {a.drawings.length} drawing{a.drawings.length !== 1 ? "s" : ""}
                </span>
                <button
                  onClick={e => { e.stopPropagation(); togglePauseOnPlay(a); }}
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
                  onClick={e => { e.stopPropagation(); deleteAnnotation(a); }}
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
            videoCoachId={video.coachId}
            videoStudentIds={video.studentIds}
          />
        )}
      </div>
      {/* Save toast */}
      {toast && (
        <div
          style={{
            position: "fixed",
            top: "calc(16px + env(safe-area-inset-top))",
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 60,
            backgroundColor: "#001c48",
            color: "#01fff9",
            borderRadius: "9999px",
            padding: "8px 20px",
            fontSize: "13px",
            fontWeight: 600,
            boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
            whiteSpace: "nowrap",
            pointerEvents: "none",
          }}
        >
          ✓ {toast}
        </div>
      )}

      {/* Done confirmation modal */}
      {showDoneModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.75)",
            zIndex: 55,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "16px",
          }}
        >
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "20px",
              padding: "32px 24px",
              width: "100%",
              maxWidth: "360px",
              textAlign: "center",
            }}
          >
            {/* Checkmark */}
            <div
              style={{
                width: 64,
                height: 64,
                borderRadius: "50%",
                backgroundColor: "rgba(1,255,249,0.12)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                margin: "0 auto 16px",
              }}
            >
              <svg style={{ width: 32, height: 32, color: "#001c48" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h2 style={{ fontSize: "20px", fontWeight: 800, color: "#001c48", marginBottom: "8px" }}>
              Annotations saved!
            </h2>
            <p style={{ fontSize: "14px", color: "#6b7280", marginBottom: "24px" }}>
              Your annotations are live on this video.
            </p>
            {notesDirty && (
              <p style={{ fontSize: "13px", color: "#92400e", backgroundColor: "#fef3c7", borderRadius: "8px", padding: "8px 10px", marginBottom: "16px" }}>
                Your captions or feedback have changes that aren&rsquo;t saved yet. Athletes won&rsquo;t see them until you save.
              </p>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <button
                onClick={() => {
                  // In the Capacitor shell window.open hands the URL to the
                  // system browser, throwing the coach out into Safari. On
                  // desktop web the new tab is what we want, so keep it there.
                  if (Capacitor.isNativePlatform()) router.push(`/student/videos/${id}`);
                  else window.open(`/student/videos/${id}`, "_blank");
                }}
                style={{
                  width: "100%",
                  padding: "12px",
                  borderRadius: "10px",
                  backgroundColor: "#001c48",
                  color: "white",
                  fontSize: "14px",
                  fontWeight: 700,
                  border: "none",
                  cursor: "pointer",
                }}
              >
                Preview as Athlete
              </button>
              <Link
                href="/coach/videos"
                style={{
                  display: "block",
                  width: "100%",
                  padding: "12px",
                  borderRadius: "10px",
                  border: "1.5px solid #d1d5db",
                  color: "#374151",
                  fontSize: "14px",
                  fontWeight: 600,
                  textDecoration: "none",
                  boxSizing: "border-box",
                }}
              >
                Back to Videos
              </Link>
              {notesDirty && (
                <button
                  onClick={() => setShowDoneModal(false)}
                  style={{ background: "none", border: "none", color: "#001c48", fontSize: "14px", fontWeight: 600, cursor: "pointer", padding: "8px" }}
                >
                  Keep editing
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Full-screen preview overlay */}
      {previewMode && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "#000",
            zIndex: 50,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Preview header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "12px 16px",
              // Inline, not a class: this overlay is position:fixed and escapes
              // both globals.css safe-area rules, and the attribute-selector
              // approach does not survive minification in the iOS WKWebView.
              paddingTop: "calc(12px + env(safe-area-inset-top))",
              backgroundColor: "#111827",
              borderBottom: "1px solid #1f2937",
              flexShrink: 0,
            }}
          >
            <button
              onClick={closePreview}
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "14px",
                color: "#9ca3af",
                background: "none",
                border: "none",
                cursor: "pointer",
              }}
            >
              <svg style={{ height: 16, width: 16 }} viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
              </svg>
              Back to editing
            </button>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
              <img src="/logo-light.png" alt="Ball Masters Florida" style={{ height: "32px", width: "auto" }} />
              <span style={{ fontSize: "14px", fontWeight: "bold", color: "white" }}>Athlete Preview</span>
            </div>
            <div style={{ width: 120 }} />
          </div>

          {/* Preview video + canvas — same sizing constraints as the main draw player */}
          <div style={{ position: "relative", lineHeight: 0, flexShrink: 0 }}>
            {videoUrl && (
              <video
                ref={previewVideoRef}
                src={videoUrl}
                controls
                className="w-full"
                style={{ maxHeight: "75vh", display: "block" }}
                playsInline
                onTimeUpdate={handlePreviewTimeUpdate}
                onPlay={handlePreviewPlay}
                onPause={handlePreviewPause}
                onSeeked={handlePreviewSeeked}
              />
            )}
            <canvas
              ref={previewCanvasRef}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                pointerEvents: "none",
              }}
            />
            <CaptionOverlay text={previewCaption} />
          </div>

          {/* Preview info bar */}
          <div
            style={{
              padding: "8px 16px",
              backgroundColor: "#111827",
              flexShrink: 0,
              fontSize: "12px",
              color: "#6b7280",
              textAlign: "center",
            }}
          >
            {annotations.length} annotation{annotations.length !== 1 ? "s" : ""}
            {savedCaptions.length > 0
              ? " · Captions on (voiceover audio not played)"
              : voiceover ? " · Voiceover included" : " · No voiceover"}
            {" · "}Annotations with ⏸ will auto-pause
            {notesDirty && <div style={{ color: "#fbbf24", marginTop: 4 }}>Unsaved captions or feedback aren&rsquo;t shown in this preview.</div>}
          </div>
          <div style={{ overflowY: "auto", flex: 1 }}>
            <CoachFeedback text={savedFeedback} />
          </div>
        </div>
      )}
    </main>
  );
}
