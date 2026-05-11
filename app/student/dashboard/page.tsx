"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, deleteUser } from "firebase/auth";
import { doc, deleteDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { clearAuthCookies } from "@/lib/cookies";
import DeleteAccountModal from "@/components/DeleteAccountModal";

export default function StudentDashboardPage() {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");

  async function handleLogout() {
    await signOut(auth);
    clearAuthCookies();
    router.push("/login");
  }

  async function handleDeleteAccount() {
    const user = auth.currentUser;
    if (!user) return;
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteDoc(doc(db, "users", user.uid));
      await deleteUser(user);
      clearAuthCookies();
      router.push("/login?deleted=true");
    } catch (err: unknown) {
      const code = (err as { code?: string }).code ?? "";
      if (code === "auth/requires-recent-login") {
        setDeleteError("For security, please sign out and sign back in before deleting your account.");
      } else {
        setDeleteError("Failed to delete account. Please try again.");
      }
      console.error("[deleteAccount]", err);
      setDeleting(false);
      setModalOpen(false);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="text-center">
        <span className="text-5xl">🎓</span>
        <h1 className="mt-4 text-2xl font-bold text-gray-800">Student Dashboard</h1>
        <p className="mt-1 text-gray-500">Coming soon</p>
        <button
          onClick={handleLogout}
          className="mt-6 rounded-lg px-5 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 active:opacity-80"
          style={{ backgroundColor: "#1A6B45" }}
        >
          Sign out
        </button>
      </div>

      {/* Delete account section */}
      <div className="mt-16 w-full max-w-sm">
        <div className="rounded-xl border border-red-200 bg-white p-5">
          <h2 className="text-sm font-semibold text-red-700 mb-1">Danger zone</h2>
          <p className="text-xs text-gray-500 mb-4">
            Permanently delete your account and all associated data.
          </p>
          {deleteError && (
            <p className="mb-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {deleteError}
            </p>
          )}
          <button
            onClick={() => setModalOpen(true)}
            className="w-full rounded-lg border border-red-300 py-2.5 text-sm font-semibold text-red-600 hover:bg-red-50 transition"
          >
            Delete my account
          </button>
        </div>
      </div>

      <DeleteAccountModal
        isOpen={modalOpen}
        loading={deleting}
        onClose={() => setModalOpen(false)}
        onConfirm={handleDeleteAccount}
      />
    </main>
  );
}
