"use client";

import { useEffect } from "react";
import { trackInAppHistory } from "@/lib/backNavigation";

// Starts the history tagging that BackLink relies on (lib/backNavigation.ts). It
// has to run from the first screen of the page load, so it lives in the root
// layout, not on the screens that use BackLink. Renders nothing.
export default function BackNavigationTracker() {
  useEffect(() => {
    trackInAppHistory();
  }, []);
  return null;
}
