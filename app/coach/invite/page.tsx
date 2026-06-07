"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { createInviteCode, getInviteCode, type InviteCode } from "@/lib/inviteCodes";

type Status = "loading" | "ready" | "generating" | "error";

export default function CoachInvitePage() {
  const { user, loading: authLoading } = useAuth();
  const [coachUid, setCoachUid] = useState<string | null>(null);
  const [inviteCode, setInviteCode] = useState<InviteCode | null>(null);
  const [status, setStatus] = useState<Status>("loading");
  const [copied, setCopied] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const inviteLink = inviteCode
    ? `${typeof window !== "undefined" ? window.location.origin : ""}/register?code=${inviteCode.code}`
    : "";

  useEffect(() => {
    if (authLoading) return;
    if (!user) return;
    setCoachUid(user.uid);
    (async () => {
      try {
        const profileSnap = await getDoc(doc(db, "users", user.uid));
        const currentCode = profileSnap.data()?.currentInviteCode as string | undefined;
        if (currentCode) {
          const data = await getInviteCode(currentCode);
          setInviteCode(data);
        }
      } catch (err) {
        console.error("[invite] failed to load invite code:", err);
        setErrorMsg("Failed to load your invite code.");
      } finally {
        setStatus("ready");
      }
    })();
  }, [authLoading, user]);

  async function handleGenerate() {
    if (!coachUid) return;
    setStatus("generating");
    setErrorMsg("");
    try {
      const code = await createInviteCode(coachUid);
      const data = await getInviteCode(code);
      setInviteCode(data);
    } catch (err) {
      console.error("[invite] failed to generate:", err);
      setErrorMsg("Failed to generate invite code. Check Firestore permissions.");
    } finally {
      setStatus("ready");
    }
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(inviteLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for browsers without clipboard API
      const el = document.createElement("textarea");
      el.value = inviteLink;
      document.body.appendChild(el);
      el.select();
      document.execCommand("copy");
      document.body.removeChild(el);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <main className="min-h-screen bg-gray-50 px-4 py-12">
      <div className="mx-auto max-w-lg">
        {/* Back button */}
        <Link href="/coach/dashboard" className="inline-flex items-center gap-1 text-sm text-gray-400 hover:text-gray-600 mb-6">
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M11.78 5.22a.75.75 0 010 1.06L8.06 10l3.72 3.72a.75.75 0 11-1.06 1.06l-4.25-4.25a.75.75 0 010-1.06l4.25-4.25a.75.75 0 011.06 0z" clipRule="evenodd" />
          </svg>
          Back
        </Link>

        {/* Header */}
        <div className="text-center mb-8">
          <img
            src="/logo-dark.png"
            alt="Ball Masters Florida"
            style={{ width: 120, height: "auto", margin: "0 auto 12px" }}
          />
          <p className="mt-1 text-gray-500 text-sm">Invite students to your team</p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8 space-y-6">
          {/* Error banner */}
          {errorMsg && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              <svg className="mt-0.5 h-4 w-4 shrink-0" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm-.75-11.25a.75.75 0 011.5 0v4.5a.75.75 0 01-1.5 0v-4.5zm.75 7.5a.75.75 0 100-1.5.75.75 0 000 1.5z" clipRule="evenodd" />
              </svg>
              {errorMsg}
            </div>
          )}

          {status === "loading" ? (
            <div className="flex justify-center py-8">
              <svg className="h-8 w-8 animate-spin" style={{ color: "#001c48" }} viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
              </svg>
            </div>
          ) : inviteCode ? (
            <>
              {/* Active code display */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">
                  Your active invite code
                </p>
                <div
                  className="flex items-center justify-center rounded-xl py-5 px-4"
                  style={{ backgroundColor: "rgba(1,255,249,0.08)" }}
                >
                  <span
                    className="text-4xl font-extrabold tracking-[0.2em] font-mono"
                    style={{ color: "#001c48" }}
                  >
                    {inviteCode.code}
                  </span>
                </div>
                <p className="mt-2 text-center text-xs text-gray-400">
                  {inviteCode.usedBy.length} / {inviteCode.maxUses} uses
                </p>
              </div>

              {/* Invite link */}
              <div>
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">
                  Shareable invite link
                </p>
                <div className="flex items-center gap-2">
                  <div className="flex-1 min-w-0 rounded-lg border border-gray-200 bg-gray-50 px-3.5 py-2.5">
                    <p className="text-sm text-gray-600 truncate font-mono">{inviteLink}</p>
                  </div>
                  <button
                    onClick={handleCopy}
                    className="shrink-0 flex items-center gap-1.5 rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 active:opacity-80"
                    style={{ backgroundColor: "#001c48" }}
                  >
                    {copied ? (
                      <>
                        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414L8.414 15l-4.121-4.121a1 1 0 011.414-1.414L8.414 12.172l6.879-6.879a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        Copied!
                      </>
                    ) : (
                      <>
                        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                          <path d="M8 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0017.414 6L14 2.586A2 2 0 0012.586 2H8z" />
                          <path d="M4 6a2 2 0 00-2 2v8a2 2 0 002 2h6v-2H4V8h2V6H4z" />
                        </svg>
                        Copy
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-gray-100" />

              {/* Generate new code */}
              <div>
                <p className="text-sm text-gray-500 mb-3">
                  Generating a new code will deactivate the current one.
                </p>
                <button
                  onClick={handleGenerate}
                  disabled={status === "generating"}
                  className="w-full rounded-lg border-2 py-2.5 text-sm font-semibold transition hover:opacity-80 disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ borderColor: "#001c48", color: "#001c48" }}
                >
                  {status === "generating" ? "Generating…" : "Generate new code"}
                </button>
              </div>
            </>
          ) : (
            /* No code yet */
            <div className="text-center py-4">
              <p className="text-gray-500 text-sm mb-6">
                You don&apos;t have an active invite code yet. Generate one to start inviting students.
              </p>
              <button
                onClick={handleGenerate}
                disabled={status === "generating"}
                className="rounded-lg px-6 py-2.5 text-sm font-semibold text-white transition hover:opacity-90 active:opacity-80 disabled:opacity-60 disabled:cursor-not-allowed"
                style={{ backgroundColor: "#001c48" }}
              >
                {status === "generating" ? (
                  <span className="flex items-center gap-2">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                    </svg>
                    Generating…
                  </span>
                ) : (
                  "Generate invite code"
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
