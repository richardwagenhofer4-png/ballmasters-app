"use client";

// Push notifications inside the iPhone app (1.1+). Renders nothing, and does
// nothing at all on the web or in older app builds.
//
// - Keeps users/{uid}.fcmToken current: on sign-in when permission is already
//   granted, and whenever FCM rotates the token (tokenReceived).
// - Asks for permission the first time a student opens the app after login
//   (a /student screen), never at launch and never again after that.
// - A tapped notification opens its data.url (a video or a message thread).

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/AuthContext";
import {
  enableNativePush,
  loadMessaging,
  nativePushAvailable,
  notificationLink,
  pushPermission,
  saveNativePushToken,
} from "@/lib/push";

function isStudentCookie(): boolean {
  return /(?:^|; )ballmasters_role=student(?:;|$)/.test(document.cookie);
}

export default function NativePushBridge() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const uid = user?.uid ?? null;
  const uidRef = useRef<string | null>(uid);

  useEffect(() => {
    uidRef.current = uid;
  }, [uid]);

  // Listeners, once per launch. Taps are retained by the plugin until a
  // listener takes them, so a tap that cold-launched the app still routes.
  useEffect(() => {
    if (!nativePushAvailable()) return;
    let cancelled = false;
    const handles: Array<{ remove: () => Promise<void> }> = [];
    (async () => {
      const { FirebaseMessaging } = await loadMessaging();
      const onToken = await FirebaseMessaging.addListener("tokenReceived", ({ token }) => {
        if (uidRef.current) void saveNativePushToken(uidRef.current, token).catch(console.error);
      });
      const onTap = await FirebaseMessaging.addListener("notificationActionPerformed", ({ notification }) => {
        const url = notificationLink(notification.data);
        if (url) router.push(url);
      });
      handles.push(onToken, onTap);
      if (cancelled) handles.forEach(h => void h.remove());
    })().catch(err => console.error("[push] listener setup failed", err));
    return () => {
      cancelled = true;
      handles.forEach(h => void h.remove());
    };
  }, [router]);

  // Signed in with permission already granted: make sure the token is stored.
  useEffect(() => {
    if (!uid || !nativePushAvailable()) return;
    pushPermission()
      .then(permission => (permission === "granted" ? saveNativePushToken(uid) : undefined))
      .catch(err => console.error("[push] token sync failed", err));
  }, [uid]);

  // First time a student opens the app after logging in: ask once.
  const inStudentArea = pathname?.startsWith("/student") ?? false;
  useEffect(() => {
    if (!uid || !inStudentArea || !nativePushAvailable() || !isStudentCookie()) return;
    const key = `ballmasters_push_asked:${uid}`;
    try {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, new Date().toISOString());
    } catch {
      return; // can't remember that we asked — don't risk asking every time
    }
    pushPermission()
      .then(permission => (permission === "prompt" ? enableNativePush(uid) : undefined))
      .catch(err => console.error("[push] permission request failed", err));
  }, [uid, inStudentArea]);

  return null;
}
