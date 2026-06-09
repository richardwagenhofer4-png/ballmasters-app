"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs, query, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { createNotification, sendVideoNotification } from "@/lib/notifications";

const MAX_BYTES = 500 * 1024 * 1024;
const ACCEPTED = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/webm", "video/mov"];

type Student = { id: string; fullName: string; email: string };
type UploadStatus = "idle" | "requesting" | "uploading" | "saving" | "success" | "error";
type Mode = "standard" | "drill_comparison";
type Layout = "side_by_side" | "stacked" | "tabs";

function putToR2(url: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });
    xhr.addEventListener("load", () => {
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`R2 upload failed (${xhr.status}): ${xhr.responseText}`));
    });
    xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
    xhr.open("PUT", url);
    // No setRequestHeader calls — Content-Type is not in SignedHeaders so the
    // browser can send whatever it wants without breaking the signature.
    xhr.send(file);
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function validateFile(f: File): string | null {
  if (!f.type.startsWith("video/") && !ACCEPTED.includes(f.type))
    return "Please select a video file (MP4, MOV, AVI, WebM).";
  if (f.size > MAX_BYTES)
    return `File is too large (${formatBytes(f.size)}). Maximum size is 500 MB.`;
  return null;
}

interface DropZoneProps {
  label: string;
  file: File | null;
  fileError: string;
  isDragging: boolean;
  isWorking: boolean;
  onPickFile: (f: File) => void;
  onClear: () => void;
  onBrowse: () => void;
  onDragEnter: () => void;
  onDragLeave: () => void;
}

function DropZone({ label, file, fileError, isDragging, isWorking, onPickFile, onClear, onBrowse, onDragEnter, onDragLeave }: DropZoneProps) {
  return (
    <div>
      <p className="text-sm font-medium text-gray-700 mb-2">{label}</p>
      {file ? (
        <div
          className="flex items-center justify-between rounded-xl border-2 px-4 py-3"
          style={{ borderColor: "#001c48", backgroundColor: "rgba(1,255,249,0.06)" }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <svg className="h-7 w-7 shrink-0" style={{ color: "#001c48" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9A2.25 2.25 0 0013.5 5.25h-9A2.25 2.25 0 002.25 7.5v9A2.25 2.25 0 004.5 18.75z" />
            </svg>
            <div className="min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
              <p className="text-xs text-gray-500">{formatBytes(file.size)}</p>
            </div>
          </div>
          {!isWorking && (
            <button onClick={onClear} className="ml-3 text-gray-400 hover:text-gray-600 transition shrink-0">
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>
      ) : (
        <div
          onDragOver={(e) => { e.preventDefault(); onDragEnter(); }}
          onDragLeave={onDragLeave}
          onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) onPickFile(f); }}
          onClick={onBrowse}
          className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-8 cursor-pointer transition"
          style={{
            borderColor: isDragging ? "#001c48" : "#d1d5db",
            backgroundColor: isDragging ? "rgba(1,255,249,0.06)" : "white",
          }}
        >
          <svg className="h-9 w-9 text-gray-300 mb-2" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
          </svg>
          <p className="text-sm font-medium text-gray-600">
            Drag & drop or <span style={{ color: "#001c48" }} className="font-semibold">browse</span>
          </p>
          <p className="mt-1 text-xs text-gray-400">MP4, MOV · max 500 MB</p>
        </div>
      )}
      {fileError && <p className="mt-1.5 text-xs text-red-600">{fileError}</p>}
    </div>
  );
}

export default function UploadPage() {
  const router = useRouter();

  // Mode
  const [mode, setMode] = useState<Mode>("standard");

  // Standard video
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  // Drill comparison — coach video
  const coachInputRef = useRef<HTMLInputElement>(null);
  const [coachFile, setCoachFile] = useState<File | null>(null);
  const [coachFileError, setCoachFileError] = useState("");
  const [isDraggingCoach, setIsDraggingCoach] = useState(false);

  // Drill comparison — student video
  const studentInputRef = useRef<HTMLInputElement>(null);
  const [studentFile, setStudentFile] = useState<File | null>(null);
  const [studentFileError, setStudentFileError] = useState("");
  const [isDraggingStudent, setIsDraggingStudent] = useState(false);

  // Drill comparison settings
  const [layout, setLayout] = useState<Layout>("side_by_side");
  const [syncPlayback, setSyncPlayback] = useState(true);

  // Shared
  const [title, setTitle] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [studentsLoading, setStudentsLoading] = useState(true);

  const [progress, setProgress] = useState(0);
  const [coachProgress, setCoachProgress] = useState(0);
  const [studentProgress, setStudentProgress] = useState(0);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [error, setError] = useState("");

  const filteredStudents = students.filter(
    (s) =>
      s.fullName.toLowerCase().includes(studentSearch.toLowerCase()) ||
      s.email.toLowerCase().includes(studentSearch.toLowerCase())
  );

  useEffect(() => {
    async function load() {
      try {
        const q = query(collection(db, "users"), where("role", "==", "student"));
        const snap = await getDocs(q);
        setStudents(
          snap.docs.map((d) => ({
            id: d.id,
            fullName: (d.data().fullName as string) ?? "Unknown",
            email: (d.data().email as string) ?? "",
          }))
        );
      } catch (err) {
        console.error("Failed to load students:", err);
      } finally {
        setStudentsLoading(false);
      }
    }
    load();
  }, []);

  function handleModeChange(newMode: Mode) {
    if (newMode === mode) return;
    setMode(newMode);
    setFile(null); setFileError("");
    setCoachFile(null); setCoachFileError("");
    setStudentFile(null); setStudentFileError("");
    setError("");
  }

  function pickStandardFile(f: File) {
    const err = validateFile(f);
    if (err) { setFileError(err); return; }
    setFileError("");
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "));
  }

  function pickCoachFile(f: File) {
    const err = validateFile(f);
    if (err) { setCoachFileError(err); return; }
    setCoachFileError("");
    setCoachFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "));
  }

  function pickStudentFile(f: File) {
    const err = validateFile(f);
    if (err) { setStudentFileError(err); return; }
    setStudentFileError("");
    setStudentFile(f);
  }

  function toggleStudent(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleUpload() {
    if (!title.trim()) { setError("Please enter a video title."); return; }

    if (mode === "standard") {
      if (!file) { setError("Please select a video file."); return; }
    } else {
      if (!coachFile) { setError("Please select the Coach Demo video."); return; }
      if (!studentFile) { setError("Please select the Athlete Attempt video."); return; }
    }

    const user = auth.currentUser;
    if (!user) { router.push("/login"); return; }

    setError("");
    setStatus("requesting");

    try {
      const idToken = await user.getIdToken();

      if (mode === "standard") {
        const uploadRes = await fetch("/api/upload", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ fileName: file!.name, fileSize: file!.size }),
        });
        if (!uploadRes.ok) {
          const { error: msg } = await uploadRes.json();
          throw new Error(msg ?? "Failed to get upload URL");
        }
        const { uploadUrl, key } = await uploadRes.json();

        setStatus("uploading");
        setProgress(0);
        await putToR2(uploadUrl, file!, setProgress);

        setStatus("saving");
        const saveRes = await fetch("/api/videos", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({
            title: title.trim(),
            fileName: key,
            studentIds: Array.from(selectedIds),
            downloadAllowed: false,
            status: "published",
          }),
        });
        if (!saveRes.ok) {
          const { error: msg } = await saveRes.json();
          throw new Error(msg ?? "Failed to save video metadata");
        }
        const saved = await saveRes.json();
        const assignedIds = Array.from(selectedIds);
        if (assignedIds.length > 0) {
          sendVideoNotification(assignedIds, title.trim(), saved.id).catch(console.error);
          for (const sid of assignedIds) {
            createNotification({ recipientId: sid, type: "new_video", title: "New video from your coach", body: title.trim(), link: `/student/videos/${saved.id}` }).catch(console.error);
          }
        }
      } else {
        // Drill comparison — get two presigned URLs in parallel, then upload
        const [coachUrlRes, studentUrlRes] = await Promise.all([
          fetch("/api/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
            body: JSON.stringify({ fileName: coachFile!.name, fileSize: coachFile!.size }),
          }),
          fetch("/api/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
            body: JSON.stringify({ fileName: studentFile!.name, fileSize: studentFile!.size }),
          }),
        ]);
        if (!coachUrlRes.ok) throw new Error((await coachUrlRes.json()).error ?? "Failed to get coach upload URL");
        if (!studentUrlRes.ok) throw new Error((await studentUrlRes.json()).error ?? "Failed to get student upload URL");

        const { uploadUrl: coachUploadUrl, key: coachKey } = await coachUrlRes.json();
        const { uploadUrl: studentUploadUrl, key: studentKey } = await studentUrlRes.json();

        setStatus("uploading");
        setCoachProgress(0);
        setStudentProgress(0);
        await Promise.all([
          putToR2(coachUploadUrl, coachFile!, setCoachProgress),
          putToR2(studentUploadUrl, studentFile!, setStudentProgress),
        ]);

        setStatus("saving");
        const saveRes = await fetch("/api/videos", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({
            type: "drill_comparison",
            title: title.trim(),
            coachVideoKey: coachKey,
            studentVideoKey: studentKey,
            studentIds: Array.from(selectedIds),
            layout,
            syncPlayback,
            downloadAllowed: false,
            status: "published",
          }),
        });
        if (!saveRes.ok) {
          const { error: msg } = await saveRes.json();
          throw new Error(msg ?? "Failed to save video metadata");
        }
        const saved = await saveRes.json();
        const assignedIds = Array.from(selectedIds);
        if (assignedIds.length > 0) {
          sendVideoNotification(assignedIds, title.trim(), saved.id).catch(console.error);
          for (const sid of assignedIds) {
            createNotification({ recipientId: sid, type: "new_video", title: "New video from your coach", body: title.trim(), link: `/student/videos/${saved.id}` }).catch(console.error);
          }
        }
      }

      setStatus("success");
    } catch (err: unknown) {
      console.error("[upload]", err);
      setError((err as Error).message ?? "Upload failed. Please try again.");
      setStatus("error");
    }
  }

  function reset() {
    setFile(null); setFileError("");
    setCoachFile(null); setCoachFileError("");
    setStudentFile(null); setStudentFileError("");
    setTitle("");
    setSelectedIds(new Set());
    setStudentSearch("");
    setProgress(0);
    setCoachProgress(0);
    setStudentProgress(0);
    setStatus("idle");
    setError("");
  }

  const isWorking = ["requesting", "uploading", "saving"].includes(status);
  const canSubmit = !isWorking && !!title.trim() && (
    mode === "standard" ? !!file : (!!coachFile && !!studentFile)
  );

  // ---- SUCCESS SCREEN ----
  if (status === "success") {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-lg p-10 max-w-md w-full text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4" style={{ backgroundColor: "rgba(1,255,249,0.1)" }}>
            <svg className="h-8 w-8" style={{ color: "#001c48" }} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">
            {mode === "drill_comparison" ? "Drill comparison uploaded!" : "Video uploaded!"}
          </h2>
          <p className="text-gray-500 text-sm mb-8">
            <span className="font-semibold text-gray-700">{title}</span> has been saved and
            {selectedIds.size > 0
              ? ` shared with ${selectedIds.size} athlete${selectedIds.size > 1 ? "s" : ""}.`
              : " is ready to assign to athletes."}
          </p>
          <div className="flex gap-3">
            <button
              onClick={reset}
              className="flex-1 rounded-lg border-2 border-gray-300 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition"
            >
              Upload another
            </button>
            <button
              onClick={() => router.push("/coach/dashboard")}
              className="flex-1 rounded-lg py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
              style={{ backgroundColor: "#001c48" }}
            >
              Dashboard
            </button>
          </div>
        </div>
      </main>
    );
  }

  // ---- MAIN UPLOAD FORM ----
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="mx-auto max-w-xl">
        {/* Header */}
        <div className="text-center mb-8">
          <img
            src="/logo-dark.png"
            alt="Ball Masters Florida"
            style={{ width: 120, height: "auto", margin: "0 auto 12px" }}
          />
          <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: "#001c48" }}>
            Upload Video
          </h1>
          <p className="mt-1 text-gray-500 text-sm">Share coaching footage with your athletes</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8 space-y-6">
          {/* Mode toggle */}
          <div className="flex rounded-xl overflow-hidden border border-gray-200">
            {(["standard", "drill_comparison"] as const).map((m) => (
              <button
                key={m}
                onClick={() => handleModeChange(m)}
                disabled={isWorking}
                className="flex-1 py-2.5 text-sm font-semibold transition disabled:opacity-60"
                style={{
                  backgroundColor: mode === m ? "#001c48" : "white",
                  color: mode === m ? "white" : "#6b7280",
                }}
              >
                {m === "standard" ? "Standard Video" : "Drill Comparison"}
              </button>
            ))}
          </div>

          {/* Global error */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-11.25a.75.75 0 011.5 0v4.5a.75.75 0 01-1.5 0v-4.5zm.75 7.5a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}

          {/* Video file(s) */}
          {mode === "standard" ? (
            <>
              <DropZone
                label="Video file"
                file={file}
                fileError={fileError}
                isDragging={isDragging}
                isWorking={isWorking}
                onPickFile={pickStandardFile}
                onClear={() => setFile(null)}
                onBrowse={() => fileInputRef.current?.click()}
                onDragEnter={() => setIsDragging(true)}
                onDragLeave={() => setIsDragging(false)}
              />
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) pickStandardFile(f); e.target.value = ""; }}
              />
            </>
          ) : (
            <>
              <div className="space-y-4">
                <DropZone
                  label="Coach Demo"
                  file={coachFile}
                  fileError={coachFileError}
                  isDragging={isDraggingCoach}
                  isWorking={isWorking}
                  onPickFile={pickCoachFile}
                  onClear={() => setCoachFile(null)}
                  onBrowse={() => coachInputRef.current?.click()}
                  onDragEnter={() => setIsDraggingCoach(true)}
                  onDragLeave={() => setIsDraggingCoach(false)}
                />
                <DropZone
                  label="Athlete Attempt"
                  file={studentFile}
                  fileError={studentFileError}
                  isDragging={isDraggingStudent}
                  isWorking={isWorking}
                  onPickFile={pickStudentFile}
                  onClear={() => setStudentFile(null)}
                  onBrowse={() => studentInputRef.current?.click()}
                  onDragEnter={() => setIsDraggingStudent(true)}
                  onDragLeave={() => setIsDraggingStudent(false)}
                />
              </div>
              <input
                ref={coachInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) pickCoachFile(f); e.target.value = ""; }}
              />
              <input
                ref={studentInputRef}
                type="file"
                accept="video/*"
                className="hidden"
                onChange={(e) => { const f = e.target.files?.[0]; if (f) pickStudentFile(f); e.target.value = ""; }}
              />

              {/* Layout selector */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Layout</p>
                <div className="flex gap-2">
                  {(["side_by_side", "stacked", "tabs"] as const).map((l) => (
                    <button
                      key={l}
                      onClick={() => setLayout(l)}
                      disabled={isWorking}
                      className="flex-1 py-2 text-xs font-semibold rounded-lg transition disabled:opacity-60"
                      style={{
                        backgroundColor: layout === l ? "#001c48" : "#f3f4f6",
                        color: layout === l ? "white" : "#374151",
                      }}
                    >
                      {l === "side_by_side" ? "Side by Side" : l === "stacked" ? "Stacked" : "Separate Tabs"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Playback selector */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Playback</p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSyncPlayback(true)}
                    disabled={isWorking}
                    className="flex-1 py-2 text-xs font-semibold rounded-lg transition disabled:opacity-60"
                    style={{ backgroundColor: syncPlayback ? "#001c48" : "#f3f4f6", color: syncPlayback ? "white" : "#374151" }}
                  >
                    Synced
                  </button>
                  <button
                    onClick={() => setSyncPlayback(false)}
                    disabled={isWorking}
                    className="flex-1 py-2 text-xs font-semibold rounded-lg transition disabled:opacity-60"
                    style={{ backgroundColor: !syncPlayback ? "#001c48" : "#f3f4f6", color: !syncPlayback ? "white" : "#374151" }}
                  >
                    Independent
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Title */}
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-gray-700 mb-1">
              Video title
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Dribbling drills — Week 4"
              disabled={isWorking}
              className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none transition disabled:opacity-60"
              onFocus={(e) => (e.target.style.boxShadow = "0 0 0 2px #001c48")}
              onBlur={(e) => (e.target.style.boxShadow = "")}
            />
          </div>

          {/* Student selector */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">
                Assign to athletes{" "}
                <span className="text-gray-400 font-normal">(optional)</span>
              </span>
              {selectedIds.size > 0 && (
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ backgroundColor: "rgba(1,255,249,0.1)", color: "#001c48" }}>
                  {selectedIds.size} selected
                </span>
              )}
            </div>

            {studentsLoading ? (
              <div className="flex items-center gap-2 py-4 text-sm text-gray-400">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                </svg>
                Loading athletes…
              </div>
            ) : students.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">No athletes have registered yet.</p>
            ) : (
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                <div className="border-b border-gray-200 px-3 py-2 flex items-center gap-2">
                  <svg className="h-4 w-4 text-gray-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
                  </svg>
                  <input
                    type="text"
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    placeholder="Search athletes…"
                    disabled={isWorking}
                    className="w-full text-sm text-gray-700 placeholder-gray-400 focus:outline-none bg-transparent disabled:opacity-60"
                  />
                </div>
                <div className="max-h-48 overflow-y-auto divide-y divide-gray-100">
                  {filteredStudents.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-gray-400">No athletes match your search.</p>
                  ) : (
                    filteredStudents.map((s) => {
                      const checked = selectedIds.has(s.id);
                      return (
                        <label key={s.id} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50 transition">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleStudent(s.id)}
                            disabled={isWorking}
                            className="h-4 w-4 rounded accent-emerald-700 disabled:opacity-60"
                          />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{s.fullName}</p>
                            <p className="text-xs text-gray-400 truncate">{s.email}</p>
                          </div>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Progress */}
          {status === "uploading" && mode === "standard" && (
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Uploading…</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-gray-200 overflow-hidden">
                <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, backgroundColor: "#001c48" }} />
              </div>
            </div>
          )}
          {status === "uploading" && mode === "drill_comparison" && (
            <div className="space-y-3">
              {([["Coach Demo", coachProgress], ["Athlete Attempt", studentProgress]] as [string, number][]).map(([label, pct]) => (
                <div key={label}>
                  <div className="flex justify-between text-xs text-gray-500 mb-1">
                    <span>{label}</span>
                    <span>{pct}%</span>
                  </div>
                  <div className="h-2 w-full rounded-full bg-gray-200 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: "#001c48" }} />
                  </div>
                </div>
              ))}
            </div>
          )}

          {(status === "requesting" || status === "saving") && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              {status === "requesting" ? "Preparing upload…" : "Saving video…"}
            </div>
          )}

          {/* Submit */}
          <button
            type="button"
            onClick={handleUpload}
            disabled={!canSubmit}
            className="w-full rounded-lg py-3 text-sm font-semibold text-white transition hover:opacity-90 active:opacity-80 disabled:cursor-not-allowed"
            style={{ backgroundColor: canSubmit ? "#001c48" : "rgba(0,28,72,0.35)" }}
          >
            {isWorking ? "Uploading…" : mode === "drill_comparison" ? "Upload drill comparison" : "Upload video"}
          </button>
        </div>
      </div>
    </main>
  );
}
