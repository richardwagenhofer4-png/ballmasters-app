// The paywall switch — client side. Reads Firestore config/app:
//   paywallEnabled     boolean — THE switch. Absent or false = off: every gate,
//                      lock and paywall screen is a no-op.
//   planToolsEnabled   boolean — optional. Shows the coach-side plan tools
//                      (plan badges, Plan card) while the switch is still off,
//                      so pilot-family grants can be set up before launch.
//
// The value changes once (on launch day). It is watched with a single
// onSnapshot listener per app session (one read to start, one when it flips)
// so an app left open in the background picks the flip up without a restart,
// and it is remembered in localStorage so the next launch knows the answer
// before the network does. Any read failure (rules not yet deployed, signed
// out) keeps the last known value, else "off", and is retried at most once a
// minute.
//
// Server code must use lib/paywall.server.ts instead — this module pulls in
// the Firebase client SDK.

import { useSyncExternalStore } from "react";
import { doc, getDoc, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface AppConfig {
  paywallEnabled: boolean;
  planToolsEnabled: boolean;
}

export const PAYWALL_OFF: AppConfig = { paywallEnabled: false, planToolsEnabled: false };

export function parseAppConfig(data: Record<string, unknown> | null | undefined): AppConfig {
  return {
    paywallEnabled: data?.paywallEnabled === true,
    planToolsEnabled: data?.planToolsEnabled === true,
  };
}

/** Coach-side plan UI is visible once the paywall is live, or when explicitly previewed. */
export function planToolsVisible(config: AppConfig | null): boolean {
  return !!config && (config.paywallEnabled || config.planToolsEnabled);
}

const STORAGE_KEY = "ballmasters_app_config";

const RETRY_AFTER_ERROR_MS = 60_000;

let current: AppConfig | null = null;
let live = false; // the listener has delivered a value and is still attached
let stopListening: (() => void) | null = null;
let lastErrorAt = 0;
const listeners = new Set<() => void>();

function readPersisted(): AppConfig | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? parseAppConfig(JSON.parse(raw) as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function setCurrent(next: AppConfig) {
  if (
    current &&
    current.paywallEnabled === next.paywallEnabled &&
    current.planToolsEnabled === next.planToolsEnabled
  ) {
    return;
  }
  current = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable — the in-memory value still applies this session
  }
  listeners.forEach(l => l());
}

function ensureListening() {
  if (stopListening) return;
  if (Date.now() - lastErrorAt < RETRY_AFTER_ERROR_MS) return;
  stopListening = onSnapshot(
    doc(db, "config", "app"),
    snap => {
      live = true;
      setCurrent(parseAppConfig(snap.exists() ? snap.data() : null));
    },
    () => {
      // The listener is dead after an error. Restart it in a minute while
      // anything is still watching (a long-open app must still see the flip);
      // otherwise the next subscriber restarts it.
      live = false;
      stopListening = null;
      lastErrorAt = Date.now();
      setCurrent(current ?? readPersisted() ?? PAYWALL_OFF);
      setTimeout(() => {
        if (listeners.size > 0) ensureListening();
      }, RETRY_AFTER_ERROR_MS + 100);
    }
  );
}

/** For non-React callers: the current config, read once if nothing is watching it yet. */
export async function loadAppConfig(): Promise<AppConfig> {
  if (live && current) return current;
  try {
    const snap = await getDoc(doc(db, "config", "app"));
    const value = parseAppConfig(snap.exists() ? snap.data() : null);
    setCurrent(value);
    return value;
  } catch {
    return current ?? readPersisted() ?? PAYWALL_OFF;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  ensureListening();
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): AppConfig | null {
  if (current === null) current = readPersisted();
  return current;
}

function getServerSnapshot(): AppConfig | null {
  return null;
}

/**
 * The app config, or null while it is still unknown (server render, or the
 * very first launch before Firestore answers). Treat null as "off".
 */
export function useAppConfig(): AppConfig | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
