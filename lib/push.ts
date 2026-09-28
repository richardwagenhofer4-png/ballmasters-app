// Native push notifications for the iPhone app (1.1+, when the
// @capacitor-firebase/messaging plugin is in the binary — lib/nativeApp.ts).
// On the web and in older app builds every function here is a no-op; the
// existing web-push code in lib/notifications.ts is untouched.
//
// The FCM token is stored where the web path stores it — users/{uid}.fcmToken,
// with a merge write on the user's own doc (allowed by the rules) — plus
// fcmTokenSource: "ios" so the server knows it can reach the iPhone app.
// users/{uid}.notificationsEnabled === false (the toggle on the profile /
// settings screens) makes the server skip that person.

import { useSyncExternalStore } from "react";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { hasNativePlugin } from "@/lib/nativeApp";

export type PushPermission = "granted" | "denied" | "prompt" | "unavailable";

type MessagingModule = typeof import("@capacitor-firebase/messaging");
let modulePromise: Promise<MessagingModule> | null = null;
export function loadMessaging(): Promise<MessagingModule> {
  return (modulePromise ??= import("@capacitor-firebase/messaging"));
}

export function nativePushAvailable(): boolean {
  return hasNativePlugin("FirebaseMessaging");
}

const noopSubscribe = () => () => {};
export function useNativePushAvailable(): boolean {
  return useSyncExternalStore(noopSubscribe, nativePushAvailable, () => false);
}

function toPermission(receive: string): PushPermission {
  if (receive === "granted") return "granted";
  if (receive === "denied") return "denied";
  return "prompt";
}

export async function pushPermission(): Promise<PushPermission> {
  if (!nativePushAvailable()) return "unavailable";
  const { FirebaseMessaging } = await loadMessaging();
  return toPermission((await FirebaseMessaging.checkPermissions()).receive);
}

const savedKey = (uid: string) => `ballmasters_fcm_saved:${uid}`;

/** Store this device's FCM token on the user's doc (skipped when unchanged). */
export async function saveNativePushToken(uid: string, token?: string): Promise<void> {
  if (!nativePushAvailable()) return;
  const { FirebaseMessaging } = await loadMessaging();
  const t = token ?? (await FirebaseMessaging.getToken()).token;
  if (!t) return;
  try {
    if (localStorage.getItem(savedKey(uid)) === t) return;
  } catch {
    // no storage — just write
  }
  await setDoc(doc(db, "users", uid), { fcmToken: t, fcmTokenSource: "ios" }, { merge: true });
  try {
    localStorage.setItem(savedKey(uid), t);
  } catch {
    // ignore
  }
}

/** Shows iOS's permission prompt (once per install), then registers the token. */
export async function enableNativePush(uid: string): Promise<PushPermission> {
  if (!nativePushAvailable()) return "unavailable";
  const { FirebaseMessaging } = await loadMessaging();
  const permission = toPermission((await FirebaseMessaging.requestPermissions()).receive);
  if (permission === "granted") await saveNativePushToken(uid);
  return permission;
}

/** In-app path a tapped notification should open: data.url (or .link), same-origin paths only. */
export function notificationLink(data: unknown): string | null {
  const d = (data ?? {}) as { url?: unknown; link?: unknown };
  const url = typeof d.url === "string" ? d.url : typeof d.link === "string" ? d.link : null;
  if (!url || !url.startsWith("/") || url.startsWith("//")) return null;
  return url;
}
