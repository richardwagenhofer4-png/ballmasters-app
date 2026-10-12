// The app's login tracer: lib/loginDiagnostics.core.ts wired to Sentry (already
// set up in instrumentation-client.ts), localStorage and real timers.
// See the core file for what is recorded and what is deliberately not.

import * as Sentry from "@sentry/nextjs";
import { createLoginDiagnostics, type LoginDiagnostics } from "@/lib/loginDiagnostics.core";

const STORE_KEY = "bm_login_trace";

function store() {
  return {
    get: () => { try { return localStorage.getItem(STORE_KEY); } catch { return null; } },
    set: (v: string) => { try { localStorage.setItem(STORE_KEY, v); } catch { /* storage unavailable */ } },
    remove: () => { try { localStorage.removeItem(STORE_KEY); } catch { /* storage unavailable */ } },
  };
}

export const loginTrace: LoginDiagnostics = createLoginDiagnostics({
  sink: {
    breadcrumb: b => Sentry.addBreadcrumb({ category: b.category, message: b.message, level: b.level, data: b.data }),
    message: (text, ctx) =>
      Sentry.withScope(scope => {
        scope.setLevel(ctx.level);
        scope.setTags(ctx.tags);
        scope.setExtras(ctx.extra);
        scope.setFingerprint(ctx.fingerprint);
        Sentry.captureMessage(text);
      }),
  },
  store: store(),
  now: () => Date.now(),
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: h => clearTimeout(h as ReturnType<typeof setTimeout>),
  route: () => (typeof window === "undefined" ? "" : window.location.pathname),
});
