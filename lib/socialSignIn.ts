// Native Sign in with Apple / Google for the iPhone app (1.1+ only — callers
// check nativeSocialSignInAvailable() from lib/nativeApp.ts first; the web
// offers email and password only).
//
// The plugin shows Apple's / Google's native sheet and returns a credential,
// which signs in the Firebase JS SDK — the session the rest of the app reads.
// New accounts still get their profile from /api/register (the register
// form), which decides role and coachId server-side.

import { useSyncExternalStore } from "react";
import { FirebaseAuthentication } from "@capacitor-firebase/authentication";
import { GoogleAuthProvider, OAuthProvider, signInWithCredential, type UserCredential } from "firebase/auth";
import { auth } from "@/lib/firebase";
import { nativeSocialSignInAvailable } from "@/lib/nativeApp";

export type SocialProvider = "apple" | "google";

export async function nativeSocialSignIn(provider: SocialProvider): Promise<UserCredential> {
  if (provider === "apple") {
    // skipNativeAuth: the Apple ID token's one-time nonce is consumed once,
    // by the JS SDK, rather than also by a native Firebase sign-in.
    const result = await FirebaseAuthentication.signInWithApple({ skipNativeAuth: true });
    const idToken = result.credential?.idToken;
    const rawNonce = result.credential?.nonce;
    if (!idToken || !rawNonce) throw new Error("Apple sign-in did not return a credential.");
    return signInWithCredential(auth, new OAuthProvider("apple.com").credential({ idToken, rawNonce }));
  }
  // Google: the same path build 3 used before Google was taken out.
  const result = await FirebaseAuthentication.signInWithGoogle();
  const idToken = result.credential?.idToken;
  if (!idToken) throw new Error("Google sign-in did not return an idToken.");
  return signInWithCredential(auth, GoogleAuthProvider.credential(idToken));
}

/** The person closed Apple's / Google's sheet — not an error worth showing. */
export function isSocialSignInCancel(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown };
  const text = `${String(e?.code ?? "")} ${String(e?.message ?? "")}`;
  // Apple: ASAuthorizationError.canceled (1001). Google: "The user canceled the sign-in flow."
  return /cancel|\b1001\b/i.test(text);
}

const noopSubscribe = () => () => {};

/** SSR-safe: true only in the 1.1+ iPhone app. */
export function useNativeSocialSignIn(): boolean {
  return useSyncExternalStore(noopSubscribe, nativeSocialSignInAvailable, () => false);
}
