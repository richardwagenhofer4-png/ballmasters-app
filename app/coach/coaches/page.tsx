"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { collection, doc, getDoc, getDocs, query, setDoc, where } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { createCoachInvite } from "@/lib/coachInvites";
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

interface CoachRow {
  uid: string;
  name: string;
  email: string;
  role: "coach" | "admin";
  avatarId?: string;
  athleteCount: number;
  videoCount: number;
}

interface Invite {
  email: string;
  link: string;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function CoachesPage() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuth();
  const { newComment, newMessage } = useNotificationCounts();

  const [loading, setLoading] = useState(true);
  const [viewerUid, setViewerUid] = useState("");
  const [coaches, setCoaches] = useState<CoachRow[]>([]);

  // Head Coach
  const [headCoachId, setHeadCoachId] = useState("");
  const [selectedHeadCoach, setSelectedHeadCoach] = useState("");
  const [savingHeadCoach, setSavingHeadCoach] = useState(false);
  const [headCoachSaved, setHeadCoachSaved] = useState(false);

  // Invite
  const [inviteEmail, setInviteEmail] = useState("");
  const [generating, setGenerating] = useState(false);
  const [inviteError, setInviteError] = useState("");
  const [invites, setInvites] = useState<Invite[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  // Delete
  const [deleteTarget, setDeleteTarget] = useState<CoachRow | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingCoach, setDeletingCoach] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const deleteInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }

    (async () => {
      try {
        const profileSnap = await getDoc(doc(db, "users", user.uid));
        const role = profileSnap.data()?.role as string | undefined;
        if (role !== "admin") {
          router.push("/coach/dashboard");
          return;
        }
        setViewerUid(user.uid);

        const [coachesSnap, studentsSnap, videosSnap, settingsSnap] = await Promise.all([
          getDocs(query(collection(db, "users"), where("role", "in", ["coach", "admin"]))),
          getDocs(query(collection(db, "users"), where("role", "==", "student"))),
          getDocs(collection(db, "videos")),
          getDoc(doc(db, "settings", "general")),
        ]);

        const rawCoaches = coachesSnap.docs.filter(d => (d.data().fullName as string | undefined)?.trim());
        const coachRows: CoachRow[] = rawCoaches
          .map(d => ({
            uid: d.id,
            name: d.data().fullName as string,
            email: (d.data().email as string) ?? "",
            role: d.data().role as "coach" | "admin",
            avatarId: d.data().avatarId as string | undefined,
            athleteCount: studentsSnap.docs.filter(s => s.data().coachId === d.id).length,
            videoCount: videosSnap.docs.filter(v => v.data().coachId === d.id).length,
          }))
          .sort((a, b) => a.name.localeCompare(b.name));

        setCoaches(coachRows);

        const currentHeadCoachId = (settingsSnap.data()?.headCoachId as string) ?? "";
        setHeadCoachId(currentHeadCoachId);
        setSelectedHeadCoach(currentHeadCoachId);
      } catch (err) {
        console.error("[coaches page]", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [authLoading, user, router]);

  async function handleSaveHeadCoach() {
    if (!selectedHeadCoach || savingHeadCoach) return;
    setSavingHeadCoach(true);
    setHeadCoachSaved(false);
    try {
      await setDoc(doc(db, "settings", "general"), { headCoachId: selectedHeadCoach }, { merge: true });
      setHeadCoachId(selectedHeadCoach);
      setHeadCoachSaved(true);
      setTimeout(() => setHeadCoachSaved(false), 3000);
    } catch (err) {
      console.error("[coaches page] save headCoachId:", err);
    } finally {
      setSavingHeadCoach(false);
    }
  }

  async function handleGenerateInvite(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const trimmed = inviteEmail.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setInviteError("Please enter a valid email address.");
      return;
    }
    setInviteError("");
    setGenerating(true);
    try {
      const token = await createCoachInvite(user.uid, trimmed);
      const link = `${window.location.origin}/register?coachInvite=${token}`;
      setInvites(prev => [{ email: trimmed, link }, ...prev]);
      setInviteEmail("");
    } catch (err: unknown) {
      setInviteError((err as Error).message ?? "Failed to generate invite.");
    } finally {
      setGenerating(false);
    }
  }

  async function copyLink(link: string) {
    await navigator.clipboard.writeText(link).catch(() => {});
    setCopied(link);
    setTimeout(() => setCopied(null), 2500);
  }

  async function handleDeleteCoach() {
    if (!user || !deleteTarget || deletingCoach) return;
    setDeletingCoach(true);
    setDeleteError("");
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ targetUid: deleteTarget.uid }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Deletion failed");
      setCoaches(prev => prev.filter(c => c.uid !== deleteTarget.uid));
      setDeleteTarget(null);
      setDeleteConfirmText("");
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Something went wrong.");
      setDeletingCoach(false);
    }
  }

  const headCoachName = coaches.find(c => c.uid === headCoachId)?.name ?? null;

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

  return (
    <main className="min-h-screen bg-gray-50 pb-20">

      {/* Header */}
      <div style={{ backgroundColor: "#001c48" }} className="pt-12 pb-5 px-4">
        <div className="flex items-center gap-2 mb-3">
          <img src="/logo-light.png" alt="Ball Masters Florida" style={{ height: "32px", width: "auto" }} />
        </div>
        <Link
          href="/coach/dashboard"
          className="inline-flex items-center gap-1 text-sm mb-4"
          style={{ color: "rgba(1,255,249,0.7)" }}
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 010 1.06L8.06 10l3.72 3.72a.75.75 0 11-1.06 1.06l-4.25-4.25a.75.75 0 010-1.06l4.25-4.25a.75.75 0 011.06 0z" clipRule="evenodd" />
          </svg>
          Dashboard
        </Link>
        <h1 className="text-2xl font-extrabold text-white leading-tight">Coaches</h1>
        <p className="text-xs mt-0.5" style={{ color: "#01fff9" }}>
          {coaches.length} coach{coaches.length !== 1 ? "es" : ""} · Admin only
        </p>
      </div>

      <div className="px-4 py-5 space-y-6">

        {/* ---------------------------------------------------------------- */}
        {/* Coaches List                                                       */}
        {/* ---------------------------------------------------------------- */}
        <section>
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">All Coaches</h2>
          {coaches.length === 0 ? (
            <div className="bg-white rounded-xl border border-gray-200 px-4 py-8 text-center text-sm text-gray-400">
              No coaches found
            </div>
          ) : (
            <div className="space-y-2">
              {coaches.map(coach => (
                <div key={coach.uid} className="bg-white rounded-xl border border-gray-200 px-4 py-3.5 flex items-center gap-3">
                  <InitialsAvatar name={coach.name} id={coach.uid} size={44} variant="coach" avatarId={coach.avatarId} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-gray-900 truncate">{coach.name}</span>
                      <span
                        className="text-xs font-semibold px-1.5 py-0.5 rounded-full shrink-0"
                        style={coach.role === "admin"
                          ? { backgroundColor: "rgba(1,255,249,0.15)", color: "#001c48" }
                          : { backgroundColor: "#f3f4f6", color: "#374151" }}
                      >
                        {coach.role === "admin" ? "Admin" : "Coach"}
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5 truncate">{coach.email}</p>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {coach.athleteCount} athlete{coach.athleteCount !== 1 ? "s" : ""} · {coach.videoCount} video{coach.videoCount !== 1 ? "s" : ""}
                    </p>
                  </div>
                  {coach.uid !== viewerUid && coach.uid !== headCoachId && (
                    <button
                      onClick={() => {
                        setDeleteTarget(coach);
                        setDeleteConfirmText("");
                        setDeleteError("");
                        setTimeout(() => deleteInputRef.current?.focus(), 50);
                      }}
                      className="shrink-0 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-600 hover:bg-red-50 transition"
                    >
                      Delete
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Head Coach Setting                                                 */}
        {/* ---------------------------------------------------------------- */}
        <section className="bg-white rounded-xl border border-gray-200 px-4 py-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">Head Coach</h2>
          <p className="text-xs text-gray-500 mb-3">
            Default coach for athletes with no assigned coach.{" "}
            {headCoachName && (
              <span className="font-semibold text-gray-800">Currently: {headCoachName}</span>
            )}
          </p>
          <div className="flex items-center gap-2">
            <select
              value={selectedHeadCoach}
              onChange={e => setSelectedHeadCoach(e.target.value)}
              className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:border-blue-400 transition"
            >
              <option value="">— Select a coach —</option>
              {coaches.map(c => (
                <option key={c.uid} value={c.uid}>{c.name}</option>
              ))}
            </select>
            <button
              onClick={handleSaveHeadCoach}
              disabled={savingHeadCoach || !selectedHeadCoach || selectedHeadCoach === headCoachId}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-40"
              style={{ backgroundColor: "#001c48" }}
            >
              {savingHeadCoach ? "Saving…" : "Save"}
            </button>
          </div>
          {headCoachSaved && (
            <p className="text-xs mt-2 font-medium" style={{ color: "#15803d" }}>Head coach saved.</p>
          )}
        </section>

        {/* ---------------------------------------------------------------- */}
        {/* Invite a Coach                                                     */}
        {/* ---------------------------------------------------------------- */}
        <section className="bg-white rounded-xl border border-gray-200 px-4 py-4">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-4">Invite a Coach</h2>
          <form onSubmit={handleGenerateInvite} className="space-y-3">
            {inviteError && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {inviteError}
              </div>
            )}
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Coach email address</label>
              <input
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="coach@example.com"
                className="w-full rounded-lg border border-gray-300 px-3 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
                onFocus={e => (e.target.style.boxShadow = "0 0 0 2px #001c48")}
                onBlur={e => (e.target.style.boxShadow = "")}
              />
              <p className="mt-1 text-xs text-gray-400">
                One-time use link. The coach can register with any email — this is just for your records.
              </p>
            </div>
            <button
              type="submit"
              disabled={generating}
              className="w-full rounded-lg py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60 transition"
              style={{ backgroundColor: "#001c48" }}
            >
              {generating ? "Generating…" : "Generate invite link"}
            </button>
          </form>

          {invites.length > 0 && (
            <div className="mt-4 space-y-3">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Generated this session</p>
              {invites.map((inv, i) => (
                <div key={i} className="border border-gray-100 rounded-xl p-3">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-semibold text-gray-800 truncate">{inv.email}</span>
                    <span
                      className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ml-2"
                      style={{ backgroundColor: "#001c48", color: "#01fff9" }}
                    >
                      One-time
                    </span>
                  </div>
                  <div className="text-xs font-mono text-gray-500 bg-gray-50 rounded-lg px-3 py-2 mb-3 break-all">
                    {inv.link}
                  </div>
                  <button
                    onClick={() => copyLink(inv.link)}
                    className="w-full rounded-lg py-2 text-sm font-semibold transition"
                    style={
                      copied === inv.link
                        ? { backgroundColor: "rgba(1,255,249,0.1)", color: "#001c48", border: "1px solid #01fff9" }
                        : { backgroundColor: "#f3f4f6", color: "#374151", border: "1px solid transparent" }
                    }
                  >
                    {copied === inv.link ? "Copied!" : "Copy link"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>

      {/* Delete Coach Modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <svg className="h-5 w-5 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-gray-900">Delete {deleteTarget.name}?</h2>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              This permanently deletes their account and login, reassigns their athletes to the head coach, and cancels their future sessions. <span className="font-semibold">This cannot be undone.</span>
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
                onClick={() => { setDeleteTarget(null); setDeleteConfirmText(""); setDeleteError(""); }}
                disabled={deletingCoach}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600 hover:bg-gray-50 transition disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteCoach}
                disabled={deleteConfirmText !== "DELETE" || deletingCoach}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition disabled:opacity-40"
                style={{ backgroundColor: "#dc2626" }}
              >
                {deletingCoach ? "Deleting…" : "Delete Coach"}
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
          const isActive = pathname === item.href;
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
              <span className={`text-xs ${isActive ? "font-semibold" : "text-gray-500"}`}>{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </main>
  );
}
