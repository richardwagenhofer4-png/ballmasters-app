"use client";
import { useState } from "react";

export type ViewMode = "list" | "grid" | "cards";

export function useViewMode(pageKey: string): [ViewMode, (m: ViewMode) => void] {
  const storageKey = `viewmode_${pageKey}`;

  const [mode, setModeState] = useState<ViewMode>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored === "list" || stored === "grid" || stored === "cards") return stored;
    } catch { /* ignore */ }
    return "cards";
  });

  function setMode(m: ViewMode) {
    setModeState(m);
    try { localStorage.setItem(storageKey, m); } catch { /* ignore */ }
  }

  return [mode, setMode];
}
