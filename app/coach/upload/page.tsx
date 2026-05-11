"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, getDocs, query, where } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

const MAX_BYTES = 500 * 1024 * 1024; // 500 MB
const ACCEPTED = ["video/mp4", "video/quicktime", "video/x-msvideo", "video/webm", "video/mov"];

type Student = { id: string; fullName: string; email: string };
type UploadStatus = "idle" | "requesting" | "uploading" | "saving" | "success" | "error";

// Upload a file to a presigned R2 URL via XHR so we can track progress
function putToR2(url: string, file: File, onProgress: (pct: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.upload.addEventListener("progress", (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });
    xhr.addEventListener("load", () => {
      xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`R2 upload failed (${xhr.status})`));
    });
    xhr.addEventListener("error", () => reject(new Error("Network error during upload")));
    xhr.open("PUT", url);
    xhr.setRequestHeader("Content-Type", file.type);
    xhr.send(file);
  });
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function UploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const [title, setTitle] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [studentsLoading, setStudentsLoading] = useState(true);

  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState<UploadStatus>("idle");
  const [error, setError] = useState("");

  const filteredStudents = students.filter(
    (s) =>
      s.fullName.toLowerCase().includes(studentSearch.toLowerCase()) ||
      s.email.toLowerCase().includes(studentSearch.toLowerCase())
  );

  // Load student list from Firestore (rule allows coaches to read all users)
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

  function pickFile(f: File) {
    setFileError("");
    if (!f.type.startsWith("video/") && !ACCEPTED.includes(f.type)) {
      setFileError("Please select a video file (MP4, MOV, AVI, WebM).");
      return;
    }
    if (f.size > MAX_BYTES) {
      setFileError(`File is too large (${formatBytes(f.size)}). Maximum size is 500 MB.`);
      return;
    }
    setFile(f);
    if (!title) setTitle(f.name.replace(/\.[^.]+$/, "").replace(/[-_]/g, " "));
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    const f = e.dataTransfer.files[0];
    if (f) pickFile(f);
  }

  function toggleStudent(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleUpload() {
    if (!file) { setError("Please select a video file."); return; }
    if (!title.trim()) { setError("Please enter a video title."); return; }

    const user = auth.currentUser;
    if (!user) { router.push("/login"); return; }

    setError("");
    setProgress(0);

    try {
      // 1. Get a fresh ID token
      setStatus("requesting");
      const idToken = await user.getIdToken();

      // 2. Request a presigned upload URL from our API
      const uploadRes = await fetch("/api/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          fileName: file.name,
          fileType: file.type,
          fileSize: file.size,
        }),
      });

      if (!uploadRes.ok) {
        const { error: msg } = await uploadRes.json();
        throw new Error(msg ?? "Failed to get upload URL");
      }

      const { uploadUrl, key } = await uploadRes.json();

      // 3. Upload the file directly to R2 (presigned PUT)
      setStatus("uploading");
      await putToR2(uploadUrl, file, setProgress);

      // 4. Save video metadata to Firestore via our API
      setStatus("saving");
      const saveRes = await fetch("/api/videos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
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

      setStatus("success");
    } catch (err: unknown) {
      console.error("[upload]", err);
      setError((err as Error).message ?? "Upload failed. Please try again.");
      setStatus("error");
    }
  }

  function reset() {
    setFile(null);
    setFileError("");
    setTitle("");
    setSelectedIds(new Set());
    setStudentSearch("");
    setProgress(0);
    setStatus("idle");
    setError("");
  }

  const isWorking = ["requesting", "uploading", "saving"].includes(status);

  // ---- SUCCESS SCREEN ----
  if (status === "success") {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="bg-white rounded-2xl shadow-lg p-10 max-w-md w-full text-center">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4"
            style={{ backgroundColor: "#f0faf5" }}
          >
            <svg className="h-8 w-8" style={{ color: "#1A6B45" }} viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Video uploaded!</h2>
          <p className="text-gray-500 text-sm mb-8">
            <span className="font-semibold text-gray-700">{title}</span> has been saved and
            {selectedIds.size > 0
              ? ` shared with ${selectedIds.size} student${selectedIds.size > 1 ? "s" : ""}.`
              : " is ready to assign to students."}
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
              style={{ backgroundColor: "#1A6B45" }}
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
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-full mb-4"
            style={{ backgroundColor: "#1A6B45" }}
          >
            <span className="text-3xl">⚽</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight" style={{ color: "#1A6B45" }}>
            Upload Video
          </h1>
          <p className="mt-1 text-gray-500 text-sm">Share coaching footage with your students</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8 space-y-6">
          {/* Global error */}
          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-11.25a.75.75 0 011.5 0v4.5a.75.75 0 01-1.5 0v-4.5zm.75 7.5a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
              </svg>
              {error}
            </div>
          )}

          {/* Drop zone */}
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Video file</p>
            {file ? (
              <div
                className="flex items-center justify-between rounded-xl border-2 px-4 py-3"
                style={{ borderColor: "#1A6B45", backgroundColor: "#f0faf5" }}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <svg className="h-8 w-8 shrink-0" style={{ color: "#1A6B45" }} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 10.5l4.72-4.72a.75.75 0 011.28.53v11.38a.75.75 0 01-1.28.53l-4.72-4.72M4.5 18.75h9a2.25 2.25 0 002.25-2.25v-9A2.25 2.25 0 0013.5 5.25h-9A2.25 2.25 0 002.25 7.5v9A2.25 2.25 0 004.5 18.75z" />
                  </svg>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                    <p className="text-xs text-gray-500">{formatBytes(file.size)}</p>
                  </div>
                </div>
                {!isWorking && (
                  <button
                    onClick={() => setFile(null)}
                    className="ml-3 text-gray-400 hover:text-gray-600 transition shrink-0"
                  >
                    <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.28 7.22a.75.75 0 00-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 101.06 1.06L10 11.06l1.72 1.72a.75.75 0 101.06-1.06L11.06 10l1.72-1.72a.75.75 0 00-1.06-1.06L10 8.94 8.28 7.22z" clipRule="evenodd" />
                    </svg>
                  </button>
                )}
              </div>
            ) : (
              <div
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed py-10 cursor-pointer transition"
                style={{
                  borderColor: isDragging ? "#1A6B45" : "#d1d5db",
                  backgroundColor: isDragging ? "#f0faf5" : "white",
                }}
              >
                <svg className="h-10 w-10 text-gray-300 mb-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
                </svg>
                <p className="text-sm font-medium text-gray-600">
                  Drag & drop a video here, or{" "}
                  <span style={{ color: "#1A6B45" }} className="font-semibold">browse</span>
                </p>
                <p className="mt-1 text-xs text-gray-400">MP4, MOV, AVI, WebM · max 500 MB</p>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) pickFile(f); }}
            />
            {fileError && <p className="mt-1.5 text-xs text-red-600">{fileError}</p>}
          </div>

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
              onFocus={(e) => (e.target.style.boxShadow = "0 0 0 2px #1A6B45")}
              onBlur={(e) => (e.target.style.boxShadow = "")}
            />
          </div>

          {/* Student selector */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">
                Assign to students{" "}
                <span className="text-gray-400 font-normal">(optional)</span>
              </span>
              {selectedIds.size > 0 && (
                <span
                  className="text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: "#f0faf5", color: "#1A6B45" }}
                >
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
                Loading students…
              </div>
            ) : students.length === 0 ? (
              <p className="text-sm text-gray-400 py-2">
                No students have registered yet.
              </p>
            ) : (
              <div className="rounded-xl border border-gray-200 overflow-hidden">
                {/* Search */}
                <div className="border-b border-gray-200 px-3 py-2 flex items-center gap-2">
                  <svg className="h-4 w-4 text-gray-400 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clipRule="evenodd" />
                  </svg>
                  <input
                    type="text"
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    placeholder="Search students…"
                    disabled={isWorking}
                    className="w-full text-sm text-gray-700 placeholder-gray-400 focus:outline-none bg-transparent disabled:opacity-60"
                  />
                </div>

                {/* List */}
                <div className="max-h-48 overflow-y-auto divide-y divide-gray-100">
                  {filteredStudents.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-gray-400">No students match your search.</p>
                  ) : (
                    filteredStudents.map((s) => {
                      const checked = selectedIds.has(s.id);
                      return (
                        <label
                          key={s.id}
                          className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50 transition"
                        >
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

          {/* Progress bar — only visible while uploading */}
          {status === "uploading" && (
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>Uploading…</span>
                <span>{progress}%</span>
              </div>
              <div className="h-2.5 w-full rounded-full bg-gray-200 overflow-hidden">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${progress}%`, backgroundColor: "#1A6B45" }}
                />
              </div>
            </div>
          )}

          {/* Status label for non-progress steps */}
          {(status === "requesting" || status === "saving") && (
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
              {status === "requesting" ? "Preparing upload…" : "Saving video…"}
            </div>
          )}

          {/* Upload button */}
          <button
            type="button"
            onClick={handleUpload}
            disabled={!file || isWorking}
            className="w-full rounded-lg py-3 text-sm font-semibold text-white transition hover:opacity-90 active:opacity-80 disabled:cursor-not-allowed"
            style={{
              backgroundColor: !file || isWorking ? "#86c9a8" : "#1A6B45",
            }}
          >
            {isWorking ? "Uploading…" : "Upload video"}
          </button>
        </div>
      </div>
    </main>
  );
}
