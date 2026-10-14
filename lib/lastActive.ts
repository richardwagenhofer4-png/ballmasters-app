// The app's lastActiveAt writer: lib/lastActive.core.ts wired to Firestore and
// localStorage. See the core file for WHEN the write is allowed to happen.
//
// The once-a-day marker is the same one AuthContext always used
// (localStorage "lastActiveWrite:{uid}" = local YYYY-MM-DD), so devices that
// already wrote today don't write again after an update.

import { doc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { createLastActiveGate } from "@/lib/lastActive.core";
import { loginTrace } from "@/lib/loginDiagnostics";

function today(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}
const markerKey = (uid: string) => `lastActiveWrite:${uid}`;

export const lastActive = createLastActiveGate({
  now: () => Date.now(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: h => clearTimeout(h as ReturnType<typeof setTimeout>),
  write: uid => updateDoc(doc(db, "users", uid), { lastActiveAt: serverTimestamp() }),
  dueToday: uid => {
    try {
      const last = localStorage.getItem(markerKey(uid));
      // YYYY-MM-DD sorts chronologically as a string: skip if already written today.
      return !(last && last >= today());
    } catch {
      return true; // localStorage unavailable: just write, and don't try to persist a marker
    }
  },
  markWritten: uid => {
    try { localStorage.setItem(markerKey(uid), today()); } catch { /* the write still succeeded */ }
  },
  onError: console.error,
  trace: (step, detail) => loginTrace.step(step, detail),
});
