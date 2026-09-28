// Which native features does the app binary running this page actually have?
//
// The iOS app is a WebView over the live site, so every installed build runs
// the same web code — including 1.0 (build 3), which has the Firebase
// Authentication plugin (Google only) but none of the 1.1 plugins. So a
// feature added in 1.1 must light up only when its native code is really in
// the binary: check the plugin, never just Capacitor.isNativePlatform().
//
//   Purchases          @revenuecat/purchases-capacitor   (1.1+)
//   FirebaseMessaging  @capacitor-firebase/messaging     (1.1+)
//
// On the web every check is false.

import { Capacitor } from "@capacitor/core";

export type NativePlugin = "Purchases" | "FirebaseMessaging" | "FirebaseAuthentication";

export function isNativeApp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** True only inside the native app, and only if this binary contains the plugin. */
export function hasNativePlugin(name: NativePlugin): boolean {
  if (!isNativeApp()) return false;
  try {
    return Capacitor.isPluginAvailable(name);
  } catch {
    return false;
  }
}

/**
 * The 1.1+ binary: the first build with Sign in with Apple configured
 * natively. Both 1.1 plugins ship in that build, so their presence marks it;
 * the 1.0 build has neither.
 */
export function isAppBuild11OrLater(): boolean {
  return hasNativePlugin("Purchases") && hasNativePlugin("FirebaseMessaging");
}

/**
 * Native Sign in with Apple / Google on the login and register screens.
 * Never on the web (email and password only there) and never in the 1.0
 * binary — Google without Apple is what App Review rejected (4.8).
 */
export function nativeSocialSignInAvailable(): boolean {
  return isAppBuild11OrLater() && hasNativePlugin("FirebaseAuthentication");
}
