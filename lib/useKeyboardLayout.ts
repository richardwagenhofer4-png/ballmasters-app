"use client";

// Message screens while the on-screen keyboard is open.
//
// Without help, iOS handles the keyboard its own way: the page scrolls up to
// keep the focused field visible, so the header scrolls off the top, and the
// bottom tab menu stays glued above the keyboard wasting space. This hook gives
// a conversation screen what it needs to look right:
//
//   keyboardOpen    true while the message field has focus (or the visible area
//                   has shrunk by more than a keyboard's worth). Hide the tab
//                   menu and shrink the typing bar's bottom padding when true.
//   containerStyle  while the keyboard is open: pin the screen to exactly the
//                   area you can see (window.visualViewport: its height and how
//                   far it has been panned down). The header stays at the top
//                   of that area, the typing bar sits directly above the
//                   keyboard, and the page itself can't scroll under it.
//                   undefined otherwise, so the normal layout applies.
//
// It works with no help from the native app: the 1.0 App Store app has no
// keyboard plugin and iOS reports the shrunken, panned visible area through
// visualViewport. With the 1.1 keyboard plugin in "native" resize mode, the web
// view itself shrinks above the keyboard (so the visible area is simply the
// whole, smaller view and offsetTop is 0); the same code gives the same result.
// Where visualViewport doesn't exist, containerStyle stays undefined and the
// screen just uses its normal full-height layout.
//
// useStickToBottom keeps the newest message in view when the messages area
// changes height (keyboard opening or closing, the typing bar growing) while
// the reader was at the bottom.

import { useEffect, useRef, useSyncExternalStore, type CSSProperties, type RefObject } from "react";

/** The visible area has to shrink by at least this much (px) to count as a keyboard. */
const KEYBOARD_MIN_PX = 100;

interface Visible {
  height: number;
  offsetTop: number;
  /** How much shorter the visible area is than the layout viewport. */
  shrink: number;
}

// ---- the visible area (window.visualViewport) -------------------------------------------
let visible: Visible | null = null;

function readVisible(): Visible | null {
  const v = typeof window === "undefined" ? null : window.visualViewport;
  if (!v) return null;
  const next = {
    height: Math.round(v.height),
    offsetTop: Math.round(v.offsetTop),
    shrink: Math.round(window.innerHeight - v.height),
  };
  // Same numbers: hand back the same object, so React sees "nothing changed".
  if (visible && visible.height === next.height && visible.offsetTop === next.offsetTop && visible.shrink === next.shrink) return visible;
  visible = next;
  return visible;
}

function subscribeVisible(onChange: () => void): () => void {
  const v = window.visualViewport;
  if (!v) return () => {};
  v.addEventListener("resize", onChange);
  v.addEventListener("scroll", onChange);
  window.addEventListener("resize", onChange);
  return () => {
    v.removeEventListener("resize", onChange);
    v.removeEventListener("scroll", onChange);
    window.removeEventListener("resize", onChange);
  };
}

// ---- is the message field focused? ------------------------------------------------------
// Read from the document itself rather than kept as state: if the field is
// removed while focused (leaving a conversation), nothing is left stale.
export const KEYBOARD_INPUT_ATTR = "data-keyboard-input";

function readFocused(): boolean {
  const el = typeof document === "undefined" ? null : document.activeElement;
  return !!el && el.hasAttribute(KEYBOARD_INPUT_ATTR);
}

function subscribeFocused(onChange: () => void): () => void {
  document.addEventListener("focusin", onChange);
  document.addEventListener("focusout", onChange);
  return () => {
    document.removeEventListener("focusin", onChange);
    document.removeEventListener("focusout", onChange);
  };
}

/**
 * `enabled`: only the conversation screen turns this on (the coach's thread
 * list does not). Put `data-keyboard-input` on the message field.
 */
export function useKeyboardLayout(enabled: boolean): { keyboardOpen: boolean; containerStyle: CSSProperties | undefined } {
  const vis = useSyncExternalStore(subscribeVisible, readVisible, () => null);
  const focused = useSyncExternalStore(subscribeFocused, readFocused, () => false);

  const keyboardOpen = enabled && (focused || (vis !== null && vis.shrink > KEYBOARD_MIN_PX));

  // The page itself must not scroll under the keyboard.
  useEffect(() => {
    if (!keyboardOpen) return;
    const html = document.documentElement;
    const body = document.body;
    const before = { html: html.style.overflow, body: body.style.overflow };
    html.style.overflow = "hidden";
    body.style.overflow = "hidden";
    return () => {
      html.style.overflow = before.html;
      body.style.overflow = before.body;
    };
  }, [keyboardOpen]);

  const containerStyle: CSSProperties | undefined =
    keyboardOpen && vis
      ? { position: "fixed", left: 0, right: 0, top: vis.offsetTop, height: vis.height }
      : undefined;

  return { keyboardOpen, containerStyle };
}

/** Keep a scroller pinned to its end while it resizes, if its reader was at the end. */
export function useStickToBottom(ref: RefObject<HTMLElement | null>, ready: boolean): void {
  const atBottom = useRef(true);
  useEffect(() => {
    const el = ref.current;
    if (!ready || !el) return;
    const onScroll = () => { atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24; };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(() => {
        if (atBottom.current) el.scrollTop = el.scrollHeight;
      });
      observer.observe(el);
    }
    return () => {
      el.removeEventListener("scroll", onScroll);
      observer?.disconnect();
    };
  }, [ref, ready]);
}
