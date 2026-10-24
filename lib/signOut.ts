// The one way to sign out. Every sign-out button calls this instead of
// signOut(auth) + clearAuthCookies(): it first removes this account's push
// token from its profile (best effort, never blocks sign-out), then signs out,
// then clears the role cookies and cached role. See lib/signOut.core.ts.

import { signOut } from "firebase/auth";
import { deleteField, doc, updateDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { clearAuthCookies } from "@/lib/cookies";
import { forgetSavedPushToken } from "@/lib/push";
import { createSignOut } from "@/lib/signOut.core";

export const signOutUser = createSignOut({
  currentUid: () => auth.currentUser?.uid ?? null,
  removePushToken: uid => updateDoc(doc(db, "users", uid), { fcmToken: deleteField(), fcmTokenSource: deleteField() }),
  forgetSavedToken: forgetSavedPushToken,
  signOut: () => signOut(auth),
  clearAuthCookies,
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: h => clearTimeout(h as ReturnType<typeof setTimeout>),
  onError: err => console.error("[signOut] couldn't remove the push token", err),
});
