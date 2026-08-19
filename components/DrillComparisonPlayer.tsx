"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { collection, getDocs, onSnapshot, setDoc, deleteDoc, doc, updateDoc, arrayUnion } from "firebase/firestore";
import { db, auth } from "@/lib/firebase";
import { renderAnnotations, type AnnotationFrame } from "@/lib/annotations";
import CommentsSection from "@/components/CommentsSection";

const REACTIONS = [
  { emoji: "👍", label: "Good" },
  { emoji: "💪", label: "Great effort" },
  { emoji: "❓", label: "Question" },
  { emoji: "🔄", label: "Will retry" },
] as const;

interface DrillMeta {
  id: string;
  title: string;
  coachName: string;
  viewedBy: string[];
  createdAt: string;
  downloadAllowed: boolean;
  layout: "side_by_side" | "stacked" | "tabs";
  syncPlayback: boolean;
}

interface Props {
  videoId: string;
  uid: string;
  userName: string;
  meta: DrillMeta;
  coachVideoUrl: string;
  studentVideoUrl: string;
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  } catch { return ""; }
}

type PanelRenderer = (maxH: string, extraStyle?: React.CSSProperties) => React.ReactNode;

// Declared at module scope on purpose: as a function inside the parent's render
// body this became a new component type on every re-render, and the parent DOES
// re-render mid-playback (onTimeUpdate -> setActiveAnnotation), which unmounted
// and remounted both <video> elements at each annotation boundary.
function VideoSection({
  layout,
  coachPanel,
  studentPanel,
  activeTab,
  setActiveTab,
}: {
  layout: DrillMeta["layout"];
  coachPanel: PanelRenderer;
  studentPanel: PanelRenderer;
  activeTab: "coach" | "student";
  setActiveTab: (tab: "coach" | "student") => void;
}) {
  if (layout === "side_by_side") {
    return (
      <div className="bg-black shrink-0 flex" style={{ gap: 2 }}>
        {coachPanel("40vh")}
        {studentPanel("40vh")}
      </div>
    );
  }
  if (layout === "stacked") {
    return (
      <div className="bg-black shrink-0">
        {coachPanel("38vh")}
        <div style={{ height: 2, backgroundColor: "#111" }} />
        {studentPanel("38vh")}
      </div>
    );
  }
  // tabs
  return (
    <div className="bg-black shrink-0">
      <div className="flex bg-gray-900 border-b border-gray-800">
        {(["coach", "student"] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="flex-1 py-2 text-sm font-semibold transition"
            style={{
              color: activeTab === tab ? "#4ade80" : "#9ca3af",
              borderBottom: activeTab === tab ? "2px solid #4ade80" : "2px solid transparent",
            }}
          >
            {tab === "coach" ? "Coach Demo" : "Your Attempt"}
          </button>
        ))}
      </div>
      <div style={{ display: activeTab === "coach" ? "block" : "none" }}>
        {coachPanel("50vh")}
      </div>
      <div style={{ display: activeTab === "student" ? "block" : "none" }}>
        {studentPanel("50vh")}
      </div>
    </div>
  );
}

export default function DrillComparisonPlayer({ videoId, uid, userName, meta, coachVideoUrl, studentVideoUrl }: Props) {
  const coachRef = useRef<HTMLVideoElement>(null);
  const studentRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const syncingRef = useRef(false);
  const hasRecordedView = useRef(false);
  const lastPausedAt = useRef<number | null>(null);
  const reactionsUnsubRef = useRef<(() => void) | null>(null);

  const [annotations, setAnnotations] = useState<AnnotationFrame[]>([]);
  const [activeAnnotation, setActiveAnnotation] = useState<AnnotationFrame | null>(null);
  const [reactions, setReactions] = useState<Record<string, string>>({});
  const [watched, setWatched] = useState((meta.viewedBy ?? []).includes(uid));
  const [activeTab, setActiveTab] = useState<"coach" | "student">("coach");
  const [coachVideoError, setCoachVideoError] = useState(false);
  const [studentVideoError, setStudentVideoError] = useState(false);

  const { layout, syncPlayback } = meta;

  useEffect(() => {
    async function load() {
      const snap = await getDocs(collection(db, "videos", videoId, "annotations"));
      setAnnotations(
        snap.docs
          .map(d => ({ id: d.id, ...(d.data() as Omit<AnnotationFrame, "id">) }))
          .sort((a, b) => a.timestamp - b.timestamp)
      );
    }
    load();

    reactionsUnsubRef.current = onSnapshot(collection(db, "videos", videoId, "reactions"), (snap) => {
      const map: Record<string, string> = {};
      snap.docs.forEach(d => { map[d.id] = (d.data() as { emoji: string }).emoji; });
      setReactions(map);
    });

    return () => { reactionsUnsubRef.current?.(); };
  }, [videoId]);

  // Keep canvas sized to coach video
  useEffect(() => {
    const v = coachRef.current;
    if (!v) return;
    const obs = new ResizeObserver(() => {
      if (canvasRef.current) {
        canvasRef.current.width = v.clientWidth;
        canvasRef.current.height = v.clientHeight;
      }
    });
    obs.observe(v);
    return () => obs.disconnect();
  }, [coachVideoUrl]);

  // Render annotations on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (activeAnnotation) renderAnnotations(ctx, activeAnnotation.drawings, canvas.width, canvas.height);
  }, [activeAnnotation]);

  async function recordView() {
    if (hasRecordedView.current || watched) return;
    hasRecordedView.current = true;
    try {
      await updateDoc(doc(db, "videos", videoId), { viewedBy: arrayUnion(uid) });
      setWatched(true);
    } catch { /* non-critical */ }
  }

  async function toggleReaction(emoji: string) {
    const ref = doc(db, "videos", videoId, "reactions", uid);
    if (reactions[uid] === emoji) await deleteDoc(ref);
    else await setDoc(ref, { emoji, authorId: uid, createdAt: new Date().toISOString() });
  }

  // Sync helpers (guard against feedback loops)
  function syncPlay(source: "coach" | "student") {
    if (!syncPlayback || syncingRef.current) return;
    syncingRef.current = true;
    const target = source === "coach" ? studentRef.current : coachRef.current;
    target?.play().catch(() => {});
    syncingRef.current = false;
  }

  function syncPause(source: "coach" | "student") {
    if (!syncPlayback || syncingRef.current) return;
    syncingRef.current = true;
    const target = source === "coach" ? studentRef.current : coachRef.current;
    target?.pause();
    syncingRef.current = false;
  }

  function syncSeek(source: "coach" | "student") {
    if (!syncPlayback || syncingRef.current) return;
    const srcRef = source === "coach" ? coachRef : studentRef;
    const tgtRef = source === "coach" ? studentRef : coachRef;
    if (!srcRef.current || !tgtRef.current) return;
    const target = srcRef.current.currentTime;
    if (Math.abs(tgtRef.current.currentTime - target) > 0.15) {
      syncingRef.current = true;
      tgtRef.current.currentTime = target;
      setTimeout(() => { syncingRef.current = false; }, 200);
    }
    lastPausedAt.current = null;
  }

  function handleCoachTimeUpdate() {
    const v = coachRef.current;
    if (!v) return;
    const t = v.currentTime;
    const found = annotations.find(a => Math.abs(a.timestamp - t) < 0.5) ?? null;
    setActiveAnnotation(found);
    if (found?.pauseOnPlay && lastPausedAt.current !== found.timestamp) {
      lastPausedAt.current = found.timestamp;
      v.pause();
      if (syncPlayback) studentRef.current?.pause();
    }
  }

  // Label bar shared between video panels
  function LabelBar({ text, side }: { text: string; side: "coach" | "student" }) {
    const isCoach = side === "coach";
    return (
      <div
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          zIndex: 10,
          padding: "3px 10px",
          fontSize: 11,
          fontWeight: 700,
          color: "white",
          backgroundColor: isCoach ? "rgba(26,107,69,0.85)" : "rgba(0,0,0,0.6)",
          letterSpacing: "0.03em",
          pointerEvents: "none",
        }}
      >
        {text}
      </div>
    );
  }

  const coachPanel = (maxH: string, extraStyle?: React.CSSProperties) => (
    <div style={{ position: "relative", lineHeight: 0, flex: 1, ...extraStyle }}>
      <LabelBar text="Coach Demo" side="coach" />
      {coachVideoError ? (
        <div className="w-full bg-black flex items-center justify-center" style={{ minHeight: 120, maxHeight: maxH }}>
          <p className="text-red-400 text-xs px-4 text-center">Coach video failed to load. Check R2 keys in Vercel logs.</p>
        </div>
      ) : (
        <video
          ref={coachRef}
          src={coachVideoUrl}
          controls
          controlsList={meta.downloadAllowed ? undefined : "nodownload"}
          className="w-full bg-black"
          style={{ maxHeight: maxH, display: "block" }}
          playsInline
          muted
          onPlay={() => { recordView(); syncPlay("coach"); }}
          onPause={() => syncPause("coach")}
          onSeeked={() => syncSeek("coach")}
          onTimeUpdate={handleCoachTimeUpdate}
          onError={() => setCoachVideoError(true)}
        />
      )}
      <canvas
        ref={canvasRef}
        style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
      />
      {activeAnnotation && !coachVideoError && (
        <div style={{ position: "absolute", top: 24, right: 8, backgroundColor: "rgba(0,0,0,0.68)", color: "white", borderRadius: 9999, padding: "3px 10px", fontSize: 11, fontWeight: 600, pointerEvents: "none" }}>
          ✏ Coach note
        </div>
      )}
    </div>
  );

  const studentPanel = (maxH: string, extraStyle?: React.CSSProperties) => (
    <div style={{ position: "relative", lineHeight: 0, flex: 1, ...extraStyle }}>
      <LabelBar text="Your Attempt" side="student" />
      {studentVideoError ? (
        <div className="w-full bg-black flex items-center justify-center" style={{ minHeight: 120, maxHeight: maxH }}>
          <p className="text-red-400 text-xs px-4 text-center">Student video failed to load. Check R2 keys in Vercel logs.</p>
        </div>
      ) : (
        <video
          ref={studentRef}
          src={studentVideoUrl}
          controls
          controlsList={meta.downloadAllowed ? undefined : "nodownload"}
          className="w-full bg-black"
          style={{ maxHeight: maxH, display: "block" }}
          playsInline
          muted
          onPlay={() => syncPlay("student")}
          onPause={() => syncPause("student")}
          onSeeked={() => syncSeek("student")}
          onError={() => setStudentVideoError(true)}
        />
      )}
    </div>
  );

  return (
    <main className="min-h-screen bg-gray-950 flex flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-gray-900 shrink-0">
        <Link href="/student/videos" className="flex items-center gap-1.5 text-sm text-gray-400 hover:text-white transition">
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
          </svg>
          All videos
        </Link>
        <div className="flex items-center gap-1.5">
          <span className="text-xl">⚽</span>
          <span className="text-sm font-bold text-white">Ballmasters</span>
        </div>
        {watched ? (
          <div className="flex items-center gap-1 text-xs font-medium" style={{ color: "#4ade80" }}>
            <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
            </svg>
            Watched
          </div>
        ) : <div className="w-16" />}
      </div>

      {/* Two-video section */}
      <VideoSection
        layout={layout}
        coachPanel={coachPanel}
        studentPanel={studentPanel}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* Scrollable section */}
      <div className="flex-1 overflow-y-auto">
        {/* Metadata */}
        <div className="bg-gray-900 px-6 py-4">
          <div className="flex items-center gap-2 mb-0.5">
            <span
              className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ backgroundColor: "#14532d", color: "#4ade80" }}
            >
              Drill Comparison
            </span>
            {syncPlayback && (
              <span className="text-xs text-gray-500">· Synced playback</span>
            )}
          </div>
          <h1 className="text-lg font-bold text-white leading-snug mt-1">{meta.title}</h1>
          <div className="flex items-center gap-2 text-sm text-gray-400 mt-1 flex-wrap">
            <span>{meta.coachName}</span>
            {meta.createdAt && <><span>·</span><span>{formatDate(meta.createdAt)}</span></>}
          </div>
        </div>

        {/* Reactions */}
        <div className="bg-gray-900 border-t border-gray-800 px-4 py-3">
          <div className="flex items-center gap-2 flex-wrap">
            {REACTIONS.map(r => {
              const count = Object.values(reactions).filter(e => e === r.emoji).length;
              const selected = reactions[uid] === r.emoji;
              return (
                <button
                  key={r.emoji}
                  onClick={() => toggleReaction(r.emoji)}
                  title={r.label}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition"
                  style={{
                    backgroundColor: selected ? "#14532d" : "#1f2937",
                    color: selected ? "#4ade80" : "#9ca3af",
                    border: `1px solid ${selected ? "#16a34a" : "transparent"}`,
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
            <CommentsSection videoId={videoId} uid={uid} authorName={userName} role="student" />
          )}
        </div>
      </div>
    </main>
  );
}
