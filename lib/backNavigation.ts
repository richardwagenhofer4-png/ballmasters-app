// "Back" that goes back to where the person came from, or somewhere sensible.
//
// A back arrow on a video screen should return to the in-app screen the person
// came from (Videos tab, an athlete's profile, the dashboard, Home, Messages...),
// but only when there IS one. With no earlier screen inside the app (the link was
// opened directly, a push notification started the app on it, or the page was
// reloaded) history.back() would do nothing or leave the app, so those cases go
// to a fixed fallback screen instead.
//
// The browser does not say what the previous history entry is, so we keep our own
// position: every entry the app writes to history is tagged with how many in-app
// steps it is from the first entry of THIS page load (0 = the first one). A push
// is one step further, a replace keeps the position, going back or forward just
// lands on an entry that already has its tag. "Is there an in-app screen behind
// me?" is then "is my position above 0?". The tag is stamped on this page load's
// own random id, so entries left over from before a reload read as position 0.
//
// Next.js's router writes history through window.history.pushState/replaceState
// (looked up at call time), so wrapping those two sees every navigation: <Link>,
// router.push/replace, and Next's own refresh bookkeeping (which replaces the
// state object, so the wrapper carries the tag over).

const PAGE_LOAD_ID = Math.random().toString(36).slice(2);

interface Tag {
  d: string;
  p: number;
}

function positionOf(state: unknown): number {
  const tag = (state as { __bm?: Tag } | null)?.__bm;
  return tag && tag.d === PAGE_LOAD_ID && Number.isInteger(tag.p) && tag.p > 0 ? tag.p : 0;
}

/** True when the entry behind the current one is a screen of this app, from this page load. */
export function hasInAppHistory(): boolean {
  return typeof window !== "undefined" && positionOf(window.history.state) > 0;
}

function tagged(data: unknown, position: number): unknown {
  if (data !== null && data !== undefined && typeof data !== "object") return data; // not ours to change
  return { ...(data as object | null | undefined), __bm: { d: PAGE_LOAD_ID, p: position } satisfies Tag };
}

// A navigation that should count as the first screen, not a step from the one
// before it (see openAsEntryPoint). Applies to the next push to that path only.
let entryPoint: { path: string; until: number } | null = null;

function pathOf(url: string | URL | null | undefined): string | null {
  if (url === null || url === undefined) return null;
  try {
    return new URL(url, window.location.href).pathname;
  } catch {
    return null;
  }
}

let installed = false;

/** Start tagging history entries. Idempotent; call once, as early as possible (components/BackNavigationTracker.tsx). */
export function trackInAppHistory(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  const history = window.history;
  const push = history.pushState;
  const replace = history.replaceState;

  history.pushState = function pushState(data: unknown, unused: string, url?: string | URL | null) {
    let position = positionOf(history.state) + 1;
    if (entryPoint && Date.now() >= entryPoint.until) entryPoint = null;
    if (entryPoint && pathOf(url) === entryPoint.path) {
      position = 0;
      entryPoint = null;
    }
    return push.call(history, tagged(data, position), unused, url);
  };
  history.replaceState = function replaceState(data: unknown, unused: string, url?: string | URL | null) {
    return replace.call(history, tagged(data, positionOf(history.state)), unused, url);
  };
}

/**
 * Open `href` as a first screen: Back from it goes to the fallback, not to the
 * screen the person happened to be on. For things that come from outside the
 * app's own navigation, like tapping a push notification.
 */
export function openAsEntryPoint(router: { push: (href: string) => void }, href: string): void {
  entryPoint = { path: pathOf(href) ?? href, until: Date.now() + 15000 };
  router.push(href);
}
