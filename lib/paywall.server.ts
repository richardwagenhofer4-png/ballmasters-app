// The paywall switch — server side (route handlers, scripts). Same document
// and semantics as lib/paywall.ts, read with the Admin SDK. Cached per server
// instance for a minute: the switch flips once, and a short lag is harmless
// because firestore.rules read config/app live on every request anyway.

import { getAdminFirestore } from "@/lib/firebaseAdmin";
import type { AppConfig } from "@/lib/paywall";

const TTL_MS = 60_000;
let cache: { value: AppConfig; at: number } | null = null;

export async function getAppConfigServer(): Promise<AppConfig> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  let value: AppConfig;
  try {
    const snap = await getAdminFirestore().collection("config").doc("app").get();
    const data = snap.data();
    value = {
      paywallEnabled: data?.paywallEnabled === true,
      planToolsEnabled: data?.planToolsEnabled === true,
    };
  } catch (err) {
    console.error("[paywall.server] could not read config/app — treating paywall as off", err);
    value = { paywallEnabled: false, planToolsEnabled: false };
  }
  cache = { value, at: Date.now() };
  return value;
}

export async function isPaywallEnabledServer(): Promise<boolean> {
  return (await getAppConfigServer()).paywallEnabled;
}
