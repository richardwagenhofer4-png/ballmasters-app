"use client";

import { doc, getDoc, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

async function getMessagingModule() {
  const { getMessaging, getToken, isSupported } = await import("firebase/messaging");
  const { getApp } = await import("firebase/app");
  return { getMessaging, getToken, isSupported, getApp };
}

export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof window === "undefined") return false;

  const { isSupported, getMessaging, getToken, getApp } = await getMessagingModule();
  const supported = await isSupported();
  if (!supported) return false;

  const permission = await Notification.requestPermission();
  if (permission !== "granted") return false;

  try {
    const messaging = getMessaging(getApp());
    const token = await getToken(messaging, {
      vapidKey: process.env.NEXT_PUBLIC_FIREBASE_VAPID_KEY,
      serviceWorkerRegistration: await navigator.serviceWorker.register(
        "/firebase-messaging-sw.js"
      ),
    });

    const user = auth.currentUser;
    if (user && token) {
      await setDoc(doc(db, "users", user.uid), { fcmToken: token }, { merge: true });
    }
    return true;
  } catch (err) {
    console.error("[notifications] Failed to get FCM token:", err);
    return false;
  }
}

export async function sendVideoNotification(
  studentIds: string[],
  videoTitle: string,
  videoId: string
): Promise<void> {
  if (!studentIds.length) return;

  const user = auth.currentUser;
  if (!user) return;

  const tokens: string[] = [];
  await Promise.all(
    studentIds.map(async (sid) => {
      const snap = await getDoc(doc(db, "users", sid));
      const token = snap.data()?.fcmToken as string | undefined;
      if (token) tokens.push(token);
    })
  );

  if (!tokens.length) return;

  const idToken = await user.getIdToken();
  await fetch("/api/notifications/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${idToken}`,
    },
    body: JSON.stringify({
      tokens,
      title: "New video from your coach",
      body: `${videoTitle} is ready to watch`,
      url: `/student/videos/${videoId}`,
    }),
  });
}
