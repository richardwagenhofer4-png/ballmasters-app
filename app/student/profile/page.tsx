"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { clearAuthCookies } from "@/lib/cookies";
import { useRef } from "react";
import InitialsAvatar, { AVATAR_OPTIONS } from "@/components/InitialsAvatar";
import { useNotificationCounts } from "@/lib/NotificationsContext";

function HomeIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M11.47 3.841a.75.75 0 011.06 0l8.69 8.69a.75.75 0 101.06-1.061l-1.97-1.97V6a.75.75 0 00-.75-.75h-1.5a.75.75 0 00-.75.75v1.78L13.5 5.409a3 3 0 00-3 0L2.19 11.47a.75.75 0 001.061 1.06l8.219-8.69z" /><path d="M12 5.432l8.159 8.159c.03.03.06.058.091.086v6.198c0 1.035-.84 1.875-1.875 1.875H15a.75.75 0 01-.75-.75v-4.5a.75.75 0 00-.75-.75h-3a.75.75 0 00-.75.75V21a.75.75 0 01-.75.75H5.625a1.875 1.875 0 01-1.875-1.875v-6.198a2.29 2.29 0 00.091-.086L12 5.432z" /></svg>;
}
function VideoIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path d="M4.5 4.5a3 3 0 00-3 3v9a3 3 0 003 3h8.25a3 3 0 003-3v-9a3 3 0 00-3-3H4.5zM19.94 18.75l-2.69-2.69V7.94l2.69-2.69c.944-.945 2.56-.276 2.56 1.06v11.38c0 1.336-1.616 2.005-2.56 1.06z" /></svg>;
}
function ProfileIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M7.5 6a4.5 4.5 0 119 0 4.5 4.5 0 01-9 0zM3.751 20.105a8.25 8.25 0 0116.498 0 .75.75 0 01-.437.695A18.683 18.683 0 0112 22.5c-2.786 0-5.433-.608-7.812-1.7a.75.75 0 01-.437-.695z" clipRule="evenodd" /></svg>;
}
function ChatIcon({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M4.848 2.771A49.144 49.144 0 0112 2.25c2.43 0 4.817.178 7.152.52 1.978.292 3.348 2.024 3.348 3.97v6.02c0 1.946-1.37 3.678-3.348 3.97a48.901 48.901 0 01-3.476.383.39.39 0 00-.297.17l-2.755 4.133a.75.75 0 01-1.248 0l-2.755-4.133a.39.39 0 00-.297-.17 48.9 48.9 0 01-3.476-.384c-1.978-.29-3.348-2.024-3.348-3.97V6.741c0-1.946 1.37-3.68 3.348-3.97z" clipRule="evenodd" /></svg>;
}

const NAV_ITEMS = [
  { href: "/student/dashboard", label: "Home", Icon: HomeIcon },
  { href: "/student/videos", label: "My Videos", Icon: VideoIcon },
  { href: "/student/messages", label: "Messages", Icon: ChatIcon },
  { href: "/student/profile", label: "Profile", Icon: ProfileIcon },
];

export default function StudentProfilePage() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, loading: authLoading } = useAuth();
  const { newVideo, newMessage } = useNotificationCounts();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [avatarId, setAvatarId] = useState<string | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [savingName, setSavingName] = useState(false);
  const [nameMsg, setNameMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const nameMsgTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const deleteInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) { router.push("/login"); return; }
    setEmail(user.email ?? "");
    getDoc(doc(db, "users", user.uid)).then(snap => {
      const data = snap.data();
      setName(data?.fullName ?? data?.name ?? user.displayName ?? "Athlete");
      setNameInput(data?.fullName ?? data?.name ?? user.displayName ?? "");
      setAvatarId(data?.avatarId ?? "");
    });
  }, [authLoading, user, router]);

  useEffect(() => () => { if (nameMsgTimerRef.current) clearTimeout(nameMsgTimerRef.current); }, []);

  function flashNameMsg(msg: { ok: boolean; text: string }) {
    if (nameMsgTimerRef.current) clearTimeout(nameMsgTimerRef.current);
    setNameMsg(msg);
    nameMsgTimerRef.current = setTimeout(() => setNameMsg(null), 3000);
  }

  async function handleSaveName() {
    if (!user || savingName) return;
    const trimmed = nameInput.trim();
    if (!trimmed) { flashNameMsg({ ok: false, text: "Name can't be empty." }); return; }
    setSavingName(true);
    try {
      await setDoc(doc(db, "users", user.uid), { fullName: trimmed }, { merge: true });
      setNameInput(trimmed);
      setName(trimmed);
      flashNameMsg({ ok: true, text: "Saved" });
    } catch {
      flashNameMsg({ ok: false, text: "Couldn't save — try again." });
    } finally {
      setSavingName(false);
    }
  }

  async function handleAvatarSelect(id: string) {
    if (!user) return;
    setAvatarId(id);
    await setDoc(doc(db, "users", user.uid), { avatarId: id }, { merge: true });
  }

  async function handleSignOut() {
    await signOut(auth);
    clearAuthCookies();
    router.push("/login");
  }

  async function handleDeleteAccount() {
    if (!user || deletingAccount) return;
    setDeletingAccount(true);
    setDeleteError("");
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/delete-account", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${token}` },
        body: JSON.stringify({ targetUid: user.uid }),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Deletion failed");
      await signOut(auth);
      clearAuthCookies();
      router.push("/login?deleted=1");
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Something went wrong.");
      setDeletingAccount(false);
    }
  }

  if (authLoading) {
    return (
      <main className="min-h-screen bg-gray-950 flex items-center justify-center">
        <svg className="h-10 w-10 animate-spin text-white opacity-40" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      </main>
    );
  }

  const uid = user?.uid ?? "";
  const displayName = name || "Athlete";
  const avatarCells = [
    { id: "", label: "Initials" },
    ...AVATAR_OPTIONS.map(o => ({ id: o.id, label: o.label })),
  ];

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col pb-20">
      <div style={{ backgroundColor: "#001c48" }} className="pt-12 pb-6 px-4">
        <div className="flex items-center justify-between mb-5">
          <img src="/logo-light.png" alt="Ball Masters Florida" style={{ height: "32px", width: "auto" }} />
        </div>

        <div className="flex flex-col items-center text-center">
          <div className="mb-3">
            {avatarId === null ? (
              <div className="rounded-full bg-white/20 animate-pulse" style={{ width: 72, height: 72 }} />
            ) : (
              <InitialsAvatar name={displayName} id={uid} size={72} variant="student" avatarId={avatarId || undefined} />
            )}
          </div>
          <h1 className="text-xl font-extrabold text-white">{displayName}</h1>
          {email && <p className="text-green-300 text-sm mt-0.5">{email}</p>}
          <span className="mt-2 text-xs font-semibold px-2.5 py-1 rounded-full" style={{ backgroundColor: "rgba(255,255,255,0.15)", color: "#bbf7d0" }}>
            Athlete
          </span>
        </div>
      </div>

      <div className="px-4 py-6 space-y-5">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Your name</p>
          <div className="bg-white rounded-xl border border-gray-200 px-4 py-3.5">
            <input
              type="text"
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              placeholder="Full name"
              className="w-full text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
            />
          </div>
          <div className="mt-2 flex items-center gap-3">
            <button
              onClick={handleSaveName}
              disabled={savingName || !nameInput.trim()}
              className="h-9 px-4 rounded-xl text-sm font-semibold text-white transition disabled:opacity-40"
              style={{ backgroundColor: "#001c48" }}
            >
              {savingName ? "Saving…" : "Save"}
            </button>
            {nameMsg && (
              <span className={`text-xs ${nameMsg.ok ? "text-green-600" : "text-red-600"}`}>{nameMsg.text}</span>
            )}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Choose your avatar</p>
          <div className="grid grid-cols-4 gap-3">
            {avatarCells.map(cell => {
              const isSelected = avatarId === cell.id;
              return (
                <button
                  key={cell.id || "__initials__"}
                  onClick={() => handleAvatarSelect(cell.id)}
                  className="flex flex-col items-center gap-1.5"
                >
                  <div
                    className="rounded-full"
                    style={isSelected ? { boxShadow: "0 0 0 3px #001c48" } : undefined}
                  >
                    <InitialsAvatar
                      name={displayName}
                      id={uid}
                      size={52}
                      variant="student"
                      avatarId={cell.id || undefined}
                    />
                  </div>
                  <span className="text-xs text-gray-500 leading-none">{cell.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Account</p>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 bg-white rounded-xl border border-gray-200 px-4 py-3.5 text-sm font-medium text-red-600 hover:bg-red-50 transition"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            Sign out
          </button>
        </div>

        <div>
          <p className="text-xs font-semibold text-red-400 uppercase tracking-wider mb-2">Danger Zone</p>
          <button
            onClick={() => { setShowDeleteConfirm(true); setDeleteConfirmText(""); setDeleteError(""); setTimeout(() => deleteInputRef.current?.focus(), 50); }}
            className="w-full flex items-center gap-3 bg-white rounded-xl border border-red-200 px-4 py-3.5 text-sm font-medium text-red-600 hover:bg-red-50 transition"
          >
            <svg className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete My Account
          </button>
        </div>
      </div>

      {/* Delete Account Confirm Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 shadow-2xl">
            <div className="flex items-center gap-3 mb-4">
              <div className="h-10 w-10 rounded-full bg-red-100 flex items-center justify-center shrink-0">
                <svg className="h-5 w-5 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                </svg>
              </div>
              <h2 className="text-lg font-bold text-gray-900">Delete Your Account?</h2>
            </div>
            <p className="text-sm text-gray-600 mb-4">
              This permanently deletes your account, your messages, and removes you from your videos and sessions. <span className="font-semibold">This cannot be undone.</span>
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
                onClick={handleDeleteAccount}
                disabled={deleteConfirmText !== "DELETE" || deletingAccount}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition disabled:opacity-40"
                style={{ backgroundColor: "#dc2626" }}
              >
                {deletingAccount ? "Deleting…" : "Delete Account"}
              </button>
            </div>
          </div>
        </div>
      )}

      <nav className="fixed bottom-0 inset-x-0 bg-gray-900 border-t border-gray-800 flex" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        {NAV_ITEMS.map(item => {
          const isActive = pathname === item.href;
          const badge =
            item.href === "/student/videos" ? newVideo :
            item.href === "/student/messages" ? newMessage : 0;
          return (
            <Link key={item.href} href={item.href} className="flex-1 flex flex-col items-center py-2.5 gap-0.5 transition" style={isActive ? { color: "#01fff9" } : undefined}>
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
