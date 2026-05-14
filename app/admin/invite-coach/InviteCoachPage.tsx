"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { createCoachInvite } from "@/lib/coachInvites";

interface Invite {
  email: string;
  link: string;
}

export default function InviteCoachPage() {
  const router = useRouter();
  const [authLoading, setAuthLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminUid, setAdminUid] = useState("");

  const [email, setEmail] = useState("");
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState("");
  const [invites, setInvites] = useState<Invite[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (!user) { router.push("/login"); return; }
      const snap = await getDoc(doc(db, "users", user.uid));
      const role = snap.data()?.role as string | undefined;
      if (role !== "admin") {
        setAuthLoading(false);
        setIsAdmin(false);
        return;
      }
      setAdminUid(user.uid);
      setIsAdmin(true);
      setAuthLoading(false);
    });
    return unsub;
  }, [router]);

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setError("Please enter a valid email address.");
      return;
    }
    setError("");
    setGenerating(true);
    try {
      const token = await createCoachInvite(adminUid, trimmed);
      const link = `${window.location.origin}/register?coachInvite=${token}`;
      setInvites(prev => [{ email: trimmed, link }, ...prev]);
      setEmail("");
    } catch (err: unknown) {
      setError((err as Error).message ?? "Failed to generate invite.");
    } finally {
      setGenerating(false);
    }
  }

  async function copyLink(link: string) {
    await navigator.clipboard.writeText(link).catch(() => {});
    setCopied(link);
    setTimeout(() => setCopied(null), 2500);
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

  if (!isAdmin) {
    return (
      <main className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
        <div className="text-center">
          <div className="h-14 w-14 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
            <svg className="h-7 w-7 text-red-600" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
          </div>
          <h1 className="text-lg font-bold text-gray-900 mb-1">Access Denied</h1>
          <p className="text-sm text-gray-500">You need admin privileges to access this page.</p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50">
      {/* Header */}
      <div style={{ backgroundColor: "#1A6B45" }} className="pt-12 pb-5 px-4">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-lg">⚽</span>
          <span className="text-sm font-bold text-white tracking-wide">Ballmasters</span>
          <span className="ml-2 text-xs font-semibold px-2 py-0.5 rounded-full bg-white/20 text-white">Admin</span>
        </div>
        <h1 className="text-2xl font-extrabold text-white">Invite Coach</h1>
        <p className="text-green-300 text-xs mt-1">Generate one-time coach registration links</p>
      </div>

      <div className="px-4 py-6 max-w-lg mx-auto space-y-6">
        {/* Generate form */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-bold text-gray-800 mb-4">Generate invite link</h2>
          <form onSubmit={handleGenerate} className="space-y-4">
            {error && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Coach email address
              </label>
              <input
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="coach@example.com"
                className="w-full rounded-lg border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:outline-none"
                onFocus={e => (e.target.style.boxShadow = "0 0 0 2px #1A6B45")}
                onBlur={e => (e.target.style.boxShadow = "")}
              />
              <p className="mt-1 text-xs text-gray-400">
                The link is one-time use. The coach must register with any email — this is just for your records.
              </p>
            </div>
            <button
              type="submit"
              disabled={generating}
              className="w-full rounded-lg py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-60 transition"
              style={{ backgroundColor: "#1A6B45" }}
            >
              {generating ? "Generating…" : "Generate invite link"}
            </button>
          </form>
        </div>

        {/* Generated links */}
        {invites.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Generated this session
            </p>
            {invites.map((inv, i) => (
              <div key={i} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-gray-800 truncate">{inv.email}</span>
                  <span
                    className="text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ml-2"
                    style={{ backgroundColor: "#dcfce7", color: "#15803d" }}
                  >
                    One-time
                  </span>
                </div>
                <div
                  className="text-xs font-mono text-gray-500 bg-gray-50 rounded-lg px-3 py-2 mb-3 break-all"
                >
                  {inv.link}
                </div>
                <button
                  onClick={() => copyLink(inv.link)}
                  className="w-full rounded-lg py-2 text-sm font-semibold transition"
                  style={
                    copied === inv.link
                      ? { backgroundColor: "#f0faf5", color: "#1A6B45", border: "1px solid #86efac" }
                      : { backgroundColor: "#f3f4f6", color: "#374151", border: "1px solid transparent" }
                  }
                >
                  {copied === inv.link ? "Copied!" : "Copy link"}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Instructions */}
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h2 className="text-sm font-bold text-gray-800 mb-3">How it works</h2>
          <ol className="space-y-2 text-sm text-gray-600">
            <li className="flex gap-2">
              <span className="font-bold text-gray-400 shrink-0">1.</span>
              Enter the coach&rsquo;s email and generate a link.
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-gray-400 shrink-0">2.</span>
              Send the link to the coach — they can use any email to register.
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-gray-400 shrink-0">3.</span>
              The link is one-time use. Once clicked and registered, it expires automatically.
            </li>
            <li className="flex gap-2">
              <span className="font-bold text-gray-400 shrink-0">4.</span>
              The coach&rsquo;s account is created with role <span className="font-mono font-semibold">coach</span> automatically.
            </li>
          </ol>
        </div>
      </div>
    </main>
  );
}
