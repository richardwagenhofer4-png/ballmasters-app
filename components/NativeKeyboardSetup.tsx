"use client";

// iPhone app only, and only in a build that contains the keyboard plugin
// (@capacitor/keyboard): hides iOS's form accessory bar (the up/down arrows and
// checkmark above the keyboard). The plugin hides it by default; this says so
// explicitly. In the 1.0 app, in older 1.1 test builds and on the web the plugin
// is not there: nothing is imported and nothing happens. Renders nothing.

import { useEffect } from "react";
import { hasNativePlugin } from "@/lib/nativeApp";

export default function NativeKeyboardSetup() {
  useEffect(() => {
    if (!hasNativePlugin("Keyboard")) return;
    import("@capacitor/keyboard")
      .then(({ Keyboard }) => Keyboard.setAccessoryBarVisible({ isVisible: false }))
      .catch(() => { /* cosmetic: never break the app over the accessory bar */ });
  }, []);
  return null;
}
