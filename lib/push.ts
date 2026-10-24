// Native push notifications for the iPhone app (1.1+, when the
// @capacitor-firebase/messaging plugin is in the binary — lib/nativeApp.ts).
// On the web and in older app builds every function here is a no-op; the
// existing web-push code in lib/notifications.ts is untouched.
//
// The FCM token is stored where the web path stores it — users/{uid}.fcmToken,
// an update of the user's own doc (allowed by the rules) — plus
// fcmTokenSource: "ios" so the server knows it can reach the iPhone app.
// users/{uid}.notificationsEnabled === false (the toggle on the profile /
// settings screens) makes the server skip that person.
//
// The token is only ever saved on a profile that already exists with a valid
// role, and with updateDoc, never setDoc: a token write must not be what
// creates users/{uid}. (It used to be, with setDoc merge, which gave an Apple
// sign-in with no Ball Masters account a document holding only the token, so
// the login mistook it for a profile.) lib/signOut.ts removes the token again
// at sign-out.

import { useSyncExternalStore } from "react";
import { doc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { hasNativePlugin } from "@/lib/nativeApp";
import { hasUsableProfile } from "@/lib/ownProfile";

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

/** Forget that this device saved its token for `uid` (called at sign-out, so the next sign-in saves it again). */
export function forgetSavedPushToken(uid: string): void {
  try {
    localStorage.removeItem(savedKey(uid));
  } catch {
    // no storage
  }
}

/**
 * "saved": written now. "unchanged": this device already saved this token for
 * this account. "unavailable": not the 1.1 app, or no token to save.
 * "not_ready": the account has no usable profile yet (or it can't be reached),
 * so nothing was written: try again later.
 */
export type SaveTokenResult = "saved" | "unchanged" | "unavailable" | "not_ready";

/** Store this device's FCM token on the user's doc (skipped when unchanged). Never creates the doc. */
export async function saveNativePushToken(uid: string, token?: string): Promise<SaveTokenResult> {
  if (!nativePushAvailable()) return "unavailable";
  const { FirebaseMessaging } = await loadMessaging();
  const t = token ?? (await FirebaseMessaging.getToken()).token;
  if (!t) return "unavailable";
  try {
    if (localStorage.getItem(savedKey(uid)) === t) return "unchanged";
  } catch {
    // no storage — just write
  }
  // Only a profile that is really there, with a valid role, may carry a token.
  if (!(await hasUsableProfile(uid))) return "not_ready";
  // updateDoc: fails (not-found) rather than creating the document.
  await updateDoc(doc(db, "users", uid), { fcmToken: t, fcmTokenSource: "ios" });
  try {
    localStorage.setItem(savedKey(uid), t);
  } catch {
    // ignore
  }
  return "saved";
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
