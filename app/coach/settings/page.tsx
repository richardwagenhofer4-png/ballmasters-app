"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { clearAuthCookies } from "@/lib/cookies";
import { useNotificationCounts } from "@/lib/NotificationsContext";

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

export default function SettingsPage() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const { newComment, newMessage } = useNotificationCounts();

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
    getDoc(doc(db, "users", user.uid)).then(snap => {
      const data = snap.data();
      setNameInput(data?.fullName ?? data?.name ?? user.displayName ?? "");
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
      flashNameMsg({ ok: true, text: "Saved" });
    } catch {
      flashNameMsg({ ok: false, text: "Couldn't save — try again." });
    } finally {
      setSavingName(false);
    }
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
      // The API explains head-coach / last-admin refusals in the error text;
      // show it verbatim rather than a generic failure message.
      if (!res.ok) throw new Error(data.error ?? "Deletion failed");
      await signOut(auth);
      clearAuthCookies();
      router.push("/login?deleted=1");
    } catch (err: unknown) {
      setDeleteError(err instanceof Error ? err.message : "Something went wrong.");
      setDeletingAccount(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 pb-20">
      <div style={{ backgroundColor: "#001c48" }} className="pt-12 pb-5 px-4">
        <div className="flex items-center gap-2 mb-4">
          <img src="/logo-light.png" alt="Ball Masters Florida" style={{ height: "32px", width: "auto" }} />
        </div>
        <h1 className="text-2xl font-extrabold text-white">Settings</h1>
      </div>

      <div className="px-4 py-6 space-y-5">
        <div>
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Profile</p>
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
            <Link key={item.href} href={item.href} className="flex-1 flex flex-col items-center py-2.5 gap-0.5 transition" style={isActive ? { color: "#01fff9" } : undefined}>
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
