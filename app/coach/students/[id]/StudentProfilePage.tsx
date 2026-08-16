"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { collection, doc, getDoc, getDocs, query, setDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { getAthleteCoachId } from "@/lib/getAthleteCoach";
import { getOrCreateThread, sendMessage } from "@/lib/messaging";
import ViewToggle from "@/components/ViewToggle";
import { useViewMode } from "@/lib/useViewMode";
import InitialsAvatar from "@/components/InitialsAvatar";
import { useNotificationCounts } from "@/lib/NotificationsContext";

// ---------------------------------------------------------------------------
// Nav Icons
// ---------------------------------------------------------------------------

function HomeIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M11.47 3.841a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.061l-1.97-1.97V6a.75.75 0 00-.75-.75h-1.5a.75.75 0 00-.75.75v1.78L13.5 5.409a3 3 0 00-3 0L2.19 11.47a.75.75 0 001.061 1.06l8.219-8.69z" /><path d="M12 5.432l8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H5.625a1.875 1.875 0 01-1.875-1.875v-6.198a2.29 2.29 0 00.091-.086L12 5.432z" /></svg>;
}
function VideoIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M4.5 4.5a3 3 0 00-3 3v9a3 3 0 003 3h8.25a3 3 0 003-3v-9a3 3 0 00-3-3H4.5zM19.94 18.75l-2.69-2.69V7.94l2.69-2.69c.944-.945 2.56-.276 2.56 1.06v11.38c0 1.336-1.616 2.005-2.56 1.06z" /></svg>;
}
function StudentsIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M4.5 6.375a4.125 4.125 0 118.25 0 4.125 4.125 0 01-8.25 0zM14.25 8.625a3.375 3.375 0 116.75 0 3.375 3.375 0 01-6.75 0zM1.5 19.125a7.125 7.125 0 0114.25 0v.003l-.001.119a.75.75 0 01-.363.63 13.067 13.067 0 01-6.761 1.873c-2.472 0-4.786-.684-6.76-1.873a.75.75 0 01-.364-.63l-.001-.122zM17.25 19.128l-.001.144a2.25 2.25 0 01-.233.96 10.088 10.088 0 005.06-1.01.75.75 0 00.42-.643 4.875 4.875 0 00-6.957-4.611 8.586 8.586 0 011.71 5.157v.003z" /></svg>;
}
function InviteIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M19.902 4.098a3.75 3.75 0 00-5.304 0l-4.5 4.5a3.75 3.75 0 001.035 6.037.75.75 0 01-.646 1.353 5.25 5.25 0 01-1.449-8.45l4.5-4.5a5.25 5.25 0 117.424 7.424l-1.757 1.757a.75.75 0 11-1.06-1.06l1.757-1.757a3.75 3.75 0 000-5.304zm-7.389 4.267a.75.75 0 011-.353 5.25 5.25 0 011.449 8.45l-4.5 4.5a5.25 5.25 0 11-7.424-7.424l1.757-1.757a.75.75 0 111.06 1.06l-1.757 1.757a3.75 3.75 0 105.304 5.304l4.5-4.5a3.75 3.75 0 00-1.035-6.037.75.75 0 01-.354-1z" clipRule="evenodd" /></svg>;
}
function ChatIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M4.848 2.771A49.144 49.144 0 0112 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 01-3.476.383.39.39 0 00-.297.17l-2.755 4.133a.75.75 0 01-1.248 0l-2.755-4.133a.39.39 0 00-.297-.17 48.9 48.9 0 01-3.476-.384c-1.978-.29-3.348-2.024-3.348-3.97V6.741c0-1.946 1.37-3.68 3.348-3.97z" clipRule="evenodd" /></svg>;
}

const NAV_ITEMS = [
  { href: "/coach/dashboard", label: "Home", Icon: HomeIcon },
  { href: "/coach/videos", label: "Videos", Icon: VideoIcon },
  { href: "/coach/students", label: "Athletes", Icon: StudentsIcon },
  { href: "/coach/messages", label: "Messages", Icon: ChatIcon },
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface StudentDoc {
  fullName: string;
  email: string;
  avatarId?: string;
  coachId?: string;
  guardianManaged?: boolean;
  guardianName?: string;
  guardianEmail?: string;
}

interface CoachOption {
  id: string;
  name: string;
}

interface VideoDoc {
  id: string;
  title: string;
  coachName: string;
  createdAt: string;
  viewedBy: string[];
  studentIds: string[];
  type?: string;
  coachVideoKey?: string;
}

function abbreviateName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return name;
  return `${parts[0]} ${parts[parts.length - 1][0]}.`;
}

function VideoMetaRows({ v, student, studentId, size, abbreviate }: {
  v: VideoDoc; student: StudentDoc; studentId: string; size: number; abbreviate?: boolean;
}) {
  const extra = Math.max(0, v.studentIds.length - 1);
  const labelW = size <= 24 ? 44 : 52;
  const dateStr = v.createdAt
    ? new Date(v.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "";
  return (
    <>
      <p className="text-xs text-gray-400 mt-0.5">{dateStr}</p>
      <div className="flex items-center gap-1.5 mt-1">
        <span className="text-xs text-gray-400 shrink-0" style={{ width: labelW }}>Coach:</span>
        <InitialsAvatar name={v.coachName || "?"} id={v.id} size={size} variant="coach" />
        <span className="text-xs text-gray-700 truncate">{abbreviate ? abbreviateName(v.coachName) : (v.coachName || "Unknown")}</span>
      </div>
      <div className="flex items-center gap-1.5 mt-0.5">
        <span className="text-xs text-gray-400 shrink-0" style={{ width: labelW }}>Athlete:</span>
        <InitialsAvatar name={student.fullName} id={studentId} size={size} variant="student" avatarId={student.avatarId || undefined} />
        <span className="text-xs text-gray-700 truncate">
          {abbreviate ? student.fullName.split(" ")[0] : student.fullName}
          {extra > 0 ? ` +${extra} more` : ""}
        </span>
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function StudentProfilePage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuth();
  const [viewMode, setViewMode] = useViewMode("student-profile");
  const { newComment, newMessage } = useNotificationCounts();

  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [student, setStudent] = useState<StudentDoc | null>(null);
  const [videos, setVideos] = useState<VideoDoc[]>([]);

  // Admin-only coach assignment state
  const [isAdmin, setIsAdmin] = useState(false);
  const [athleteCoachId, setAthleteCoachId] = useState<string | null>(null);
  const [athleteCoachName, setAthleteCoachName] = useState("");
  const [coaches, setCoaches] = useState<CoachOption[]>([]);
  const [selectedCoachId, setSelectedCoachId] = useState("");
  const [savingCoach, setSavingCoach] = useState(false);
  const [coachSaveSuccess, setCoachSaveSuccess] = useState(false);

  // Admin-only delete state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const deleteInputRef = useRef<HTMLInputElement>(null);

  // Coach-initiated messaging (only when the viewer is this athlete's resolved coach)
  const [viewerFullName, setViewerFullName] = useState("");
  const [resolvedCoachId, setResolvedCoachId] = useState<string | null>(null);
  const [showCompose, setShowCompose] = useState(false);
  const [composeText, setComposeText] = useState("");
  const [sending, setSending] = useState(false);
  const [composeError, setComposeError] = useState("");

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    if (!id) return;

    (async () => {
      try {
        // Load the viewer's role first: an admin sees this athlete's videos
        // regardless of owner; a coach sees only their own of them. The coach
        // branch combines array-contains with an equality filter, which needs
        // a composite index on videos (coachId ASC + studentIds CONTAINS).
        const viewerSnap = await getDoc(doc(db, "users", user.uid));
        const viewerData = viewerSnap.data();
        const admin = (viewerData?.role as string) === "admin";
        // Needed as coachName and senderName when the coach starts a conversation.
        setViewerFullName((viewerData?.fullName as string) ?? "");

        const videosQuery = admin
          ? query(collection(db, "videos"), where("studentIds", "array-contains", id))
          : query(collection(db, "videos"), where("studentIds", "array-contains", id), where("coachId", "==", user.uid));

        const [studentSnap, videosSnap] = await Promise.all([
          getDoc(doc(db, "users", id)),
          getDocs(videosQuery),
        ]);

        if (!studentSnap.exists()) {
          setNotFound(true);
          setLoading(false);
          return;
        }

        const studentData = studentSnap.data() as StudentDoc;
        setStudent(studentData);

        // Set for every viewer (was previously admin-only).
        setAthleteCoachId(studentData.coachId ?? null);

        // Resolve the athlete's coach (their coachId, else the head coach) to
        // decide whether this viewer may message them. The Message button and
        // the thread-create rule both hinge on the viewer BEING this coach.
        const resolved = await getAthleteCoachId(id);
        setResolvedCoachId(resolved);

        // Admin-only: load coach list for reassignment
        if (admin) {
          setIsAdmin(true);
          const currentCoachId = studentData.coachId ?? null;
          setSelectedCoachId(currentCoachId ?? "");
          const coachesSnap = await getDocs(
            query(collection(db, "users"), where("role", "in", ["coach", "admin"]))
          );
          const cList: CoachOption[] = coachesSnap.docs
            .filter(d => {
              const name = (d.data().fullName as string | undefined) ?? "";
              return name.trim().length > 0;
            })
            .map(d => ({ id: d.id, name: d.data().fullName as string }));
          setCoaches(cList);
          if (currentCoachId) {
            const found = cList.find(c => c.id === currentCoachId);
            setAthleteCoachName(found?.name ?? currentCoachId);
          }
        }

        const videoList: VideoDoc[] = videosSnap.docs
          .map(d => ({
            id: d.id,
            title: (d.data().title as string) ?? "Untitled",
            coachName: (d.data().coachName as string) ?? "",
            createdAt: (d.data().createdAt as string) ?? "",
            viewedBy: (d.data().viewedBy as string[]) ?? [],
            studentIds: (d.data().studentIds as string[]) ?? [],
            type: d.data().type as string | undefined,
            coachVideoKey: d.data().coachVideoKey as string | undefined,
          }))
          .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        setVideos(videoList);
      } catch (err) {
        console.error("[student-profile]", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [authLoading, user, id, router]);

  async function handleDeleteAthlete() {
    if (!user || deletingAccount) return;
    setDeletingAccount(true);
    setDeleteError("");
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ targetUid: id }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Deletion failed");
      router.push("/coach/students");
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Something went wrong.");
      setDeletingAccount(false);
    }
  }

  async function handleSaveCoach() {
    if (!selectedCoachId || savingCoach) return;
    setSavingCoach(true);
    setCoachSaveSuccess(false);
    try {
      // Clear the needs-assignment flag in the same write — once a coach is
      // assigned the athlete is no longer stranded.
      await setDoc(doc(db, "users", id), { coachId: selectedCoachId, needsCoachAssignment: false }, { merge: true });
      setAthleteCoachId(selectedCoachId);
      const found = coaches.find(c => c.id === selectedCoachId);
      setAthleteCoachName(found?.name ?? selectedCoachId);
      setCoachSaveSuccess(true);
      setTimeout(() => setCoachSaveSuccess(false), 3000);
    } catch (err) {
      console.error("[student-profile] save coachId error:", err);
    } finally {
      setSavingCoach(false);
    }
  }

  async function handleSendMessage() {
    const text = composeText.trim();
    if (!user || !student || !text || sending) return;
    setSending(true);
    setComposeError("");
    try {
      const tid = await getOrCreateThread(user.uid, id, viewerFullName, student.fullName, student.avatarId ?? "");
      await sendMessage(tid, user.uid, "coach", text, null, viewerFullName);
      router.push("/coach/messages");
    } catch (err) {
      console.error("[student-profile] send message error:", err);
      setComposeError(err instanceof Error ? err.message : "Could not send message. Please try again.");
      setSending(false);
    }
  }

  const assigned = videos.length;
  const watched = videos.filter(v => v.viewedBy.includes(id)).length;
  const watchRate = assigned > 0 ? Math.round((watched / assigned) * 100) : 0;

  if (authLoading || loading) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <svg className="h-10 w-10 animate-spin text-white opacity-40" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      </main>
    );
  }

  if (notFound || !student) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <p className="text-lg font-semibold text-gray-700">Athlete not found</p>
          <Link href="/coach/students" className="mt-3 inline-block text-sm font-medium hover:underline" style={{ color: "#001c48" }}>
            ← Back to athletes
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-20">

      {/* Header */}
      <div style={{ backgroundColor: "#001c48" }} className="pt-12 pb-5 px-4">
        <div className="flex items-center gap-2 mb-3">
          <img src="/logo-light.png" alt="Ball Masters Florida" style={{ height: "32px", width: "auto" }} />
        </div>

        <Link
          href="/coach/students"
          className="inline-flex items-center gap-1 text-sm mb-4"
          style={{ color: "rgba(1,255,249,0.7)" }}
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 010 1.06L8.06 10l3.72 3.72a.75.75 0 11-1.06 1.06l-4.25-4.25a.75.75 0 010-1.06l4.25-4.25a.75.75 0 011.06 0z" clipRule="evenodd" />
          </svg>
          Back
        </Link>

        {/* Student identity */}
        <div className="flex items-center justify-between gap-3 mb-5">
          <div className="flex items-center gap-3 min-w-0">
            <InitialsAvatar name={student.fullName} id={id} size={56} variant="student" avatarId={student.avatarId || undefined} />
            <div>
              <h1 className="text-xl font-extrabold text-white leading-tight">{student.fullName}</h1>
              <p className="text-sm" style={{ color: "rgba(1,255,249,0.7)" }}>{student.email}</p>
              {(student.guardianManaged || !!(student.guardianEmail || student.guardianName)) && (
                <span
                  className="inline-flex items-center gap-1 mt-1.5 text-xs font-semibold px-2 py-0.5 rounded-full"
                  style={{ backgroundColor: "rgba(1,255,249,0.15)", color: "#01fff9" }}
                >
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                  </svg>
                  Guardian-managed account
                </span>
              )}
            </div>
          </div>
          {user?.uid === resolvedCoachId && (
            <button
              onClick={() => { setComposeText(""); setComposeError(""); setShowCompose(true); }}
              className="shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition hover:opacity-90"
              style={{ backgroundColor: "#01fff9", color: "#001c48" }}
            >
              <ChatIcon className="h-4 w-4" />
              Message
            </button>
          )}
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: "Assigned", value: assigned },
            { label: "Watched", value: watched },
            { label: "Watch Rate", value: `${watchRate}%` },
          ].map(s => (
            <div
              key={s.label}
              className="rounded-xl text-center py-3 px-1"
              style={{ backgroundColor: "rgba(255,255,255,0.12)" }}
            >
              <div className="text-xl font-extrabold text-white leading-none">{s.value}</div>
              <div className="text-xs mt-0.5 leading-tight" style={{ color: "rgba(1,255,249,0.7)" }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="px-4 py-4 space-y-5">

        {/* Coach Assignment (admin only) */}
        {isAdmin && (
          <section className="bg-white rounded-xl border border-gray-200 px-4 py-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Coach Assignment</h2>
            <p className="text-xs text-gray-500 mb-3">
              Assigned coach:{" "}
              <span className="font-semibold text-gray-800">
                {athleteCoachName || "No coach assigned"}
              </span>
            </p>
            <div className="flex items-center gap-2">
              <select
                value={selectedCoachId}
                onChange={e => setSelectedCoachId(e.target.value)}
                className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-400 transition"
              >
                <option value="">— Select a coach —</option>
                {coaches.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <button
                onClick={handleSaveCoach}
                disabled={savingCoach || !selectedCoachId || selectedCoachId === athleteCoachId}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-40"
                style={{ backgroundColor: "#001c48" }}
              >
                {savingCoach ? "Saving…" : "Save"}
              </button>
            </div>
            {coachSaveSuccess && (
              <p className="text-xs mt-2 font-medium" style={{ color: "#15803d" }}>Coach assigned successfully.</p>
            )}

            <div className="mt-5 pt-4 border-t border-gray-100">
              <p className="text-xs font-semibold text-red-400 uppercase tracking-widest mb-3">Danger Zone</p>
              <button
                onClick={() => { setShowDeleteConfirm(true); setDeleteConfirmText(""); setDeleteError(""); setTimeout(() => deleteInputRef.current?.focus(), 50); }}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-red-200 px-4 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 transition"
              >
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
                Delete This Athlete
              </button>
            </div>
          </section>
        )}

        {/* Guardian contact — shown when account is guardian-managed (or has legacy guardian fields) */}
        {(student.guardianManaged || !!(student.guardianEmail || student.guardianName)) && (
          <section className="bg-white rounded-xl border border-gray-200 px-4 py-4">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Guardian Contact</h2>
            {student.guardianName && (
              <div className="flex items-center gap-2 mb-2">
                <svg className="h-4 w-4 shrink-0 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
                  <path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" />
                </svg>
                <span className="text-sm text-gray-800">{student.guardianName}</span>
              </div>
            )}
            {student.guardianEmail && (
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 shrink-0 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M1.5 8.67v8.58a3 3 0 003 3h15a3 3 0 003-3V8.67l-8.928 5.493a3 3 0 01-3.144 0L1.5 8.67z" />
                  <path d="M22.5 6.908V6.75a3 3 0 00-3-3h-15a3 3 0 00-3 3v.158l9.714 5.978a1.5 1.5 0 001.572 0L22.5 6.908z" />
                </svg>
                <a
                  href={`mailto:${student.guardianEmail}`}
                  className="text-sm text-gray-800 hover:underline"
                  style={{ color: "#001c48" }}
                >
                  {student.guardianEmail}
                </a>
              </div>
            )}
          </section>
        )}

        {/* Videos */}
        <section>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400">Videos</h2>
            {videos.length > 0 && <ViewToggle value={viewMode} onChange={setViewMode} />}
          </div>
          {videos.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 px-4 py-6 text-center text-sm text-gray-400">
              No videos assigned yet
            </div>
          ) : viewMode === "list" ? (
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {videos.map((v, i) => {
                const isDrill = v.type === "drill_comparison" || !!v.coachVideoKey;
                const href = isDrill ? `/coach/videos/${v.id}/drill` : `/coach/videos/${v.id}/annotate`;
                const isWatched = v.viewedBy.includes(id);
                return (
                  <Link key={v.id} href={href}>
                    <div
                      className="flex items-center gap-3 px-4 py-3.5 hover:bg-gray-50 active:bg-gray-100 transition"
                      style={{ borderTop: i > 0 ? "1px solid #f3f4f6" : undefined }}
                    >
                      <svg className="h-4 w-4 shrink-0 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
                        <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
                      </svg>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{v.title}</p>
                        <VideoMetaRows v={v} student={student!} studentId={id} size={26} />
                      </div>
                      <span
                        className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0"
                        style={isWatched
                          ? { backgroundColor: "#dcfce7", color: "#15803d" }
                          : { backgroundColor: "rgba(1,255,249,0.15)", color: "#001c48" }}
                      >
                        {isWatched ? "Watched" : "New"}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          ) : viewMode === "grid" ? (
            <div className="grid grid-cols-2 gap-3">
              {videos.map(v => {
                const isDrill = v.type === "drill_comparison" || !!v.coachVideoKey;
                const href = isDrill ? `/coach/videos/${v.id}/drill` : `/coach/videos/${v.id}/annotate`;
                const isWatched = v.viewedBy.includes(id);
                return (
                  <div key={v.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <Link href={href}>
                      <div className="flex items-center justify-center h-16" style={{ backgroundColor: "rgba(0,28,72,0.05)" }}>
                        <svg className="h-7 w-7 text-gray-300" viewBox="0 0 24 24" fill="currentColor">
                          <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </Link>
                    <div className="p-2.5">
                      <Link href={href}>
                        <p className="text-xs font-bold text-gray-900 line-clamp-2 leading-snug mb-1 hover:underline">{v.title}</p>
                      </Link>
                      <VideoMetaRows v={v} student={student!} studentId={id} size={24} abbreviate />
                      <span
                        className="text-xs font-semibold px-1.5 py-0.5 mt-1.5 inline-block rounded-full"
                        style={isWatched
                          ? { backgroundColor: "#dcfce7", color: "#15803d" }
                          : { backgroundColor: "rgba(1,255,249,0.15)", color: "#001c48" }}
                      >
                        {isWatched ? "Watched" : "New"}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              {videos.map(v => {
                const isDrill = v.type === "drill_comparison" || !!v.coachVideoKey;
                const href = isDrill ? `/coach/videos/${v.id}/drill` : `/coach/videos/${v.id}/annotate`;
                const isWatched = v.viewedBy.includes(id);
                return (
                  <div key={v.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="p-4 pb-3">
                      <div className="flex items-start gap-2 mb-3">
                        <div className="flex-1 min-w-0">
                          <Link href={href}>
                            <h3 className="text-sm font-bold text-gray-900 leading-snug hover:underline truncate cursor-pointer">{v.title}</h3>
                          </Link>
                          <VideoMetaRows v={v} student={student!} studentId={id} size={26} />
                        </div>
                        <span
                          className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0"
                          style={isWatched
                            ? { backgroundColor: "#dcfce7", color: "#15803d" }
                            : { backgroundColor: "rgba(1,255,249,0.15)", color: "#001c48" }}
                        >
                          {isWatched ? "Watched" : "New"}
                        </span>
                      </div>
                    </div>
                    <div className="border-t border-gray-100">
                      <Link href={href}>
                        <button className="w-full py-2.5 text-xs font-semibold text-gray-600 hover:bg-gray-50 transition flex items-center justify-center gap-1">
                          <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-1.427 1.529-2.33 2.779-1.643l11.54 6.347c1.295.712 1.295 2.573 0 3.286L8.029 19.99c-1.25.687-2.779-.217-2.779-1.643V5.653z" />
                          </svg>
                          Watch
                        </button>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

      </div>

      {/* Delete Athlete Confirm Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <svg className="h-5 w-5 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-900">Delete {student?.fullName}?</h2>
              </div>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              This permanently deletes their account, messages, removes them from all videos and sessions, and deletes their login. <span className="font-semibold">This cannot be undone.</span>
            </p>
            <p className="text-xs font-semibold text-gray-500 mb-2">Type <span className="text-red-600 font-bold">DELETE</span> to confirm</p>
            <input
              ref={deleteInputRef}
              type="text"
              value={deleteConfirmText}
              onChange={e => setDeleteConfirmText(e.target.value)}
              placeholder="DELETE"
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-red-400 mb-4 transition"
            />
            {deleteError && <p className="text-xs text-red-600 mb-3">{deleteError}</p>}
            <div className="flex gap-3">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                disabled={deletingAccount}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteAthlete}
                disabled={deleteConfirmText !== "DELETE" || deletingAccount}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition disabled:opacity-40"
                style={{ backgroundColor: "#dc2626" }}
              >
                {deletingAccount ? "Deleting…" : "Delete Athlete"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Compose message (coach → assigned athlete) */}
      {showCompose && student && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-gray-900 mb-1">Message {student.fullName}</h2>
            <p className="text-xs text-gray-500 mb-4">This starts a conversation in Messages.</p>
            <textarea
              value={composeText}
              onChange={e => setComposeText(e.target.value)}
              placeholder="Write a message…"
              rows={4}
              className="w-full rounded-xl border border-gray-300 px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:border-cyan-400 mb-4 transition resize-none"
            />
            {composeError && <p className="text-xs text-red-600 mb-3">{composeError}</p>}
            <div className="flex gap-3">
              <button
                onClick={() => setShowCompose(false)}
                disabled={sending}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSendMessage}
                disabled={sending || !composeText.trim()}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition disabled:opacity-40"
                style={{ backgroundColor: "#001c48" }}
              >
                {sending ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom nav */}
      <nav
        className="fixed bottom-0 inset-x-0 bg-gray-900 border-t border-gray-800 flex"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {NAV_ITEMS.map(item => {
          const isActive = pathname === item.href ||
            (item.href === "/coach/students" && pathname.startsWith("/coach/students"));
          const badge =
            item.href === "/coach/videos" ? newComment :
            item.href === "/coach/messages" ? newMessage : 0;
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex-1 flex flex-col items-center py-2.5 gap-0.5 transition"
              style={isActive ? { color: "#01fff9" } : undefined}
            >
              <div className="relative">
                <item.Icon className={`h-5 w-5 ${isActive ? "" : "text-gray-500"}`} />
                {badge > 0 && (
                  <span className="absolute -top-1 -right-1.5 h-4 min-w-[16px] flex items-center justify-center rounded-full px-0.5" style={{ backgroundColor: "#01fff9", color: "#001c48", fontSize: "9px", fontWeight: 700 }}>
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </div>
              <span className={`text-xs ${isActive ? "font-semibold" : "text-gray-500"}`}>
                {item.label}
              </span>
            </Link>
          );
        })}
      </nav>

    </main>
  );
}
