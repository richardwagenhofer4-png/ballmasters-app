"use client";

// "Push notifications" switch for the student profile and coach settings.
// Only rendered inside the iPhone app 1.1+ (where native push exists); on the
// web and in older builds it renders nothing, so those screens are unchanged.
//
// On = users/{uid}.notificationsEnabled true (the default when absent) and iOS
// permission granted. Off = notificationsEnabled false; the server sender
// skips that person. If iOS permission is denied, point to iPhone Settings.

import { useEffect, useState } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useAuth } from "@/lib/AuthContext";
import { enableNativePush, pushPermission, useNativePushAvailable, type PushPermission } from "@/lib/push";

export default function NotificationsToggle() {
  const { user } = useAuth();
  const available = useNativePushAvailable();
  const uid = user?.uid ?? null;
  const [loaded, setLoaded] = useState<{ uid: string; enabled: boolean; permission: PushPermission } | null>(null);
  const [saving, setSaving] = useState(false);
  const [hint, setHint] = useState("");

  useEffect(() => {
    if (!available || !uid) return;
    let cancelled = false;
    Promise.all([getDoc(doc(db, "users", uid)), pushPermission()])
      .then(([snap, permission]) => {
        if (!cancelled) setLoaded({ uid, enabled: snap.data()?.notificationsEnabled !== false, permission });
      })
      .catch(err => console.error("[notifications toggle]", err));
    return () => {
      cancelled = true;
    };
  }, [available, uid]);

  const state = loaded && loaded.uid === uid ? loaded : null;
  if (!available || !uid || !state) return null;
  const on = state.enabled && state.permission === "granted";

  async function toggle() {
    if (!uid || !state || saving) return;
    setSaving(true);
    setHint("");
    try {
      if (on) {
        await setDoc(doc(db, "users", uid), { notificationsEnabled: false }, { merge: true });
        setLoaded({ ...state, uid, enabled: false });
      } else {
        const permission = state.permission === "granted" ? "granted" : await enableNativePush(uid);
        await setDoc(doc(db, "users", uid), { notificationsEnabled: true }, { merge: true });
        setLoaded({ uid, enabled: true, permission });
        if (permission !== "granted") {
          setHint("Notifications are turned off for Ball Masters on this iPhone. Turn them on in Settings › Notifications › Ball Masters.");
        }
      }
    } catch (err) {
      console.error("[notifications toggle]", err);
      setHint("Couldn't save — try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Notifications</p>
      <div className="bg-white rounded-xl border border-gray-200 px-4 py-3.5 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-gray-900">Push notifications</p>
          <p className="text-xs text-gray-500 mt-0.5">New videos and messages</p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          aria-label="Push notifications"
          onClick={toggle}
          disabled={saving}
          className="relative h-7 w-12 shrink-0 rounded-full transition disabled:opacity-60"
          style={{ backgroundColor: on ? "#001c48" : "#d1d5db" }}
        >
          <span
            className="absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-all"
            style={{ left: on ? "calc(100% - 1.625rem)" : "0.125rem" }}
          />
        </button>
      </div>
      {hint && <p className="text-xs text-gray-500 mt-2">{hint}</p>}
    </div>
  );
}
