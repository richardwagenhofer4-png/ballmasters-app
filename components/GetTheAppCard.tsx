"use client";

// "Get the Ball Masters app" card at the top of /register. Shown only on the
// web (never inside the iPhone app, where the person already has it). When the
// invite link carried a ?code=, the code is shown large with a Copy button so
// it can be typed into the app after installing it.

import { useState, useSyncExternalStore } from "react";
import { isNativeApp } from "@/lib/nativeApp";

export const APP_STORE_ID = "6800971758";
export const APP_STORE_URL = `https://apps.apple.com/app/id${APP_STORE_ID}`;

const noopSubscribe = () => () => {};

// Three states so the card never flashes inside the app: the server render and
// the first hydration pass know nothing (render nothing), then the client says
// which one it is.
function useWhereAmI(): "unknown" | "web" | "app" {
  return useSyncExternalStore(
    noopSubscribe,
    () => (isNativeApp() ? "app" : "web"),
    () => "unknown"
  );
}

// An invite code is 8 letters and digits; accept a little more so an older or
// hand-made code still shows, but never print arbitrary text from the URL.
function cleanCode(raw: string): string {
  const code = raw.trim().toUpperCase();
  return /^[A-Z0-9-]{1,32}$/.test(code) ? code : "";
}

export default function GetTheAppCard({ code: rawCode }: { code: string }) {
  const where = useWhereAmI();
  const [copied, setCopied] = useState(false);
  const code = cleanCode(rawCode);

  if (where !== "web") return null;

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
    } catch {
      // Older WebViews / blocked clipboard: select-and-copy fallback.
      try {
        const ta = document.createElement("textarea");
        ta.value = code;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      } catch {
        return;
      }
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="mb-6 rounded-2xl p-6 text-center shadow-lg" style={{ backgroundColor: "#001c48" }}>
      <h2 className="text-lg font-bold text-white">Get the Ball Masters app</h2>
      <p className="mt-1 text-sm" style={{ color: "#cbd5e1" }}>
        Watch your coach&rsquo;s videos and breakdowns on your iPhone.
      </p>

      <a
        href={APP_STORE_URL}
        className="mt-4 inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-6 text-sm font-bold transition active:opacity-80"
        style={{ backgroundColor: "#01fff9", color: "#001c48" }}
      >
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M16.37 1.43c0 1.14-.42 2.2-1.25 3.07-.9.94-1.98 1.49-3.16 1.4-.02-1.1.44-2.2 1.24-3.03.9-.93 2.07-1.48 3.17-1.44zM20.5 17.3c-.55 1.27-.82 1.84-1.52 2.96-.99 1.57-2.38 3.53-4.1 3.54-1.53.02-1.93-1-4.01-.99-2.08.01-2.52 1.01-4.05.99-1.72-.02-3.04-1.78-4.03-3.35C-.04 16.2-.33 11.2 1.37 8.57c1.2-1.86 3.1-2.95 4.88-2.95 1.82 0 2.96 1 4.46 1 1.46 0 2.35-1 4.45-1 1.58 0 3.26.86 4.46 2.35-3.92 2.15-3.28 7.75.88 9.33z" />
        </svg>
        Download on the App Store
      </a>

      {code && (
        <div className="mt-5 border-t pt-5" style={{ borderColor: "rgba(255,255,255,0.15)" }}>
          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#94a3b8" }}>
            Your invite code
          </p>
          <p
            className="mt-1 break-all font-mono text-3xl font-bold tracking-widest text-white"
            data-testid="invite-code"
          >
            {code}
          </p>
          <button
            type="button"
            onClick={copyCode}
            className="mt-3 inline-flex min-h-11 items-center justify-center rounded-lg border px-5 text-sm font-semibold text-white transition active:opacity-80"
            style={{ borderColor: "rgba(255,255,255,0.35)" }}
          >
            {copied ? "Copied ✓" : "Copy code"}
          </button>
          <p className="mt-3 text-sm" style={{ color: "#cbd5e1" }}>
            Open the app, tap Create one, and enter this code.
          </p>
        </div>
      )}
    </div>
  );
}
