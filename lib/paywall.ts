// The paywall switch — client side. Reads Firestore config/app:
//   paywallEnabled     boolean — THE switch. Absent or false = off: every gate,
//                      lock and paywall screen is a no-op.
//   planToolsEnabled   boolean — optional. Shows the coach-side plan tools
//                      (plan badges, Plan card) while the switch is still off,
//                      so pilot-family grants can be set up before launch.
//
// The value changes once (on launch day), so it is read from Firestore at most
// once per app session and remembered in localStorage so the next launch
// knows the answer before the network does. Any read failure (rules not yet
// deployed, offline) keeps the last known value, else "off".
//
// Server code must use lib/paywall.server.ts instead — this module pulls in
// the Firebase client SDK.

import { useSyncExternalStore } from "react";
import { doc, getDoc } from "firebase/firestore";
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

let current: AppConfig | null = null;
let fetched = false;
let inflight: Promise<AppConfig> | null = null;
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

/** Fetches config/app once per session; later calls return the cached value. */
export function loadAppConfig(): Promise<AppConfig> {
  if (fetched && current) return Promise.resolve(current);
  if (inflight) return inflight;
  inflight = getDoc(doc(db, "config", "app"))
    .then(snap => parseAppConfig(snap.exists() ? snap.data() : null))
    .catch(() => current ?? readPersisted() ?? PAYWALL_OFF)
    .then(value => {
      fetched = true;
      setCurrent(value);
      return value;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  void loadAppConfig();
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
