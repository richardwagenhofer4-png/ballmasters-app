// Evidence-gathering for the intermittent "empty profile / freeze right after
// login" report (Build 1.1 bug 2). It changes nothing about how login works:
// it only records what happened, so the next occurrence explains itself.
//
// One "login session" is traced from the moment the person signs in (or lands
// on /login already signed in) until BOTH the profile document and the first
// dashboard query have loaded. Each step becomes a Sentry breadcrumb with the
// time since sign-in. If the session is still unfinished 10 seconds after
// sign-in, one Sentry event is sent with the whole trace attached. The trace
// is also kept in localStorage, so if the app froze, was killed, or the person
// closed it, the NEXT launch reports "the previous login never finished" with
// that trace.
//
// Privacy: no names, emails or raw uids. The user is identified only by a short
// one-way fingerprint of the uid; step data is limited to short scalars (role,
// route, counts, milliseconds, Firebase error codes); error messages are
// scrubbed of anything that looks like an email.
//
// This file has no imports (Sentry, storage and timers are passed in), so it
// is unit-tested directly by scripts/test-login-diagnostics.mjs. The real
// wiring is lib/loginDiagnostics.ts.

export type Detail = Record<string, string | number | boolean | null | undefined>;
export type Level = "info" | "warning" | "error";

export interface Sink {
  breadcrumb(b: { category: string; message: string; level: Level; data?: Detail }): void;
  message(
    text: string,
    ctx: { level: "warning" | "info"; tags: Record<string, string>; extra: Record<string, unknown>; fingerprint: string[] }
  ): void;
}

export interface Store {
  get(): string | null;
  set(value: string): void;
  remove(): void;
}

export interface Deps {
  sink: Sink;
  store: Store;
  now(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  /** Current page path with no query string (e.g. "/coach/dashboard"). */
  route(): string;
}

export type Source = "email" | "apple" | "google" | "restored";
export type Milestone = "profile" | "first_query";

interface Entry { s: string; t: number; d?: Detail; lvl?: Level }
interface Session {
  id: string;
  t0: number;
  source: Source;
  user: string | null;
  steps: Entry[];
  profile: boolean;
  first_query: boolean;
  done: boolean;
  reported: boolean;
}

export const STALL_MS = 10_000;
const MAX_STEPS = 80;
/** A page load sends at most this many events for one flag name, so a frequent one can't flood Sentry. */
const MAX_FLAGS_PER_NAME = 3;

/** 8-hex-digit FNV-1a fingerprint: enough to tell accounts apart in a report, useless for finding the person. */
export function hashUid(uid: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < uid.length; i++) {
    h ^= uid.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Keeps only short scalars, so a step can't smuggle in a name or an object. */
function cleanDetail(d?: Detail): Detail | undefined {
  if (!d) return undefined;
  const out: Detail = {};
  for (const [k, v] of Object.entries(d)) {
    if (typeof v === "string") out[k] = scrub(v).slice(0, 60);
    else if (typeof v === "number" || typeof v === "boolean" || v === null) out[k] = v;
  }
  return out;
}

function scrub(text: string): string {
  return text.replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, "[email]");
}

/** Firebase errors carry a code like "permission-denied" or "auth/network-request-failed". */
function errorDetail(err: unknown): Detail {
  const e = err as { code?: unknown; message?: unknown } | null;
  const code = typeof e?.code === "string" ? e.code : "";
  const message = typeof e?.message === "string" ? scrub(e.message).slice(0, 120) : String(err ?? "").slice(0, 120);
  return { code: code || "none", message };
}

export function createLoginDiagnostics(deps: Deps) {
  let session: Session | null = null;
  let timer: unknown = null;

  const safe = (fn: () => void) => { try { fn(); } catch { /* diagnostics never break the app */ } };

  function persist() {
    safe(() => { if (session) deps.store.set(JSON.stringify(session)); });
  }

  function crumb(message: string, level: Level, data?: Detail) {
    safe(() => deps.sink.breadcrumb({ category: "login", message, level, data }));
  }

  // Sentry flattens `extra` beyond three levels ("[Object]"), so the trace goes
  // out as plain text, one step per line: "1234ms  coach_layout_profile_ok  ms=160".
  function traceText(s: Session): string {
    return s.steps
      .slice(-MAX_STEPS)
      .map(e => {
        const detail = Object.entries(e.d ?? {}).map(([k, v]) => `${k}=${v}`).join(" ");
        return `${String(e.t).padStart(6)}ms ${e.lvl === "error" ? "ERROR " : e.lvl === "warning" ? "warn  " : "      "}${e.s}${detail ? "  " + detail : ""}`;
      })
      .join("\n");
  }

  function report(s: Session, text: string, why: string) {
    if (s.reported) return;
    s.reported = true;
    safe(() => deps.store.set(JSON.stringify(s)));
    const missing = [!s.profile && "profile", !s.first_query && "first_query"].filter(Boolean) as string[];
    safe(() =>
      deps.sink.message(text, {
        level: "warning",
        tags: { "login.stage": why, "login.missing": missing.join("+") || "none", "login.source": s.source, route: deps.route() },
        extra: {
          trace: traceText(s),
          user: s.user,
          source: s.source,
          elapsedMs: deps.now() - s.t0,
          profileLoaded: s.profile,
          firstQueryLoaded: s.first_query,
        },
        fingerprint: ["login-diagnostics", why, missing.join("+")],
      })
    );
  }

  function stopTimer() {
    if (timer !== null) safe(() => deps.clearTimer(timer));
    timer = null;
  }

  function complete(s: Session) {
    s.done = true;
    stopTimer();
    crumb("complete", "info", { totalMs: deps.now() - s.t0 });
    // Clear the saved copy: nothing to report next launch.
    safe(() => deps.store.remove());
  }

  /**
   * The login ended on purpose without reaching a dashboard (wrong password,
   * the person closed the Apple/Google sheet, signed out): not a stall, so
   * nothing is reported.
   */
  function abandon(reason: string, detail?: Detail) {
    const s = session;
    if (!s || s.done) return;
    step(reason, detail);
    s.done = true;
    stopTimer();
    safe(() => deps.store.remove());
  }

  /** Start tracing a sign-in. Call at the moment the person signs in (or lands on /login already signed in). */
  function begin(source: Source, uid?: string | null) {
    reportPreviousIfUnfinished();
    stopTimer();
    const s: Session = {
      id: Math.floor(deps.now()).toString(36),
      t0: deps.now(),
      source,
      user: uid ? hashUid(uid) : null,
      steps: [],
      profile: false,
      first_query: false,
      done: false,
      reported: false,
    };
    session = s;
    crumb("begin", "info", { source });
    s.steps.push({ s: "begin", t: 0, d: { source } });
    persist();
    safe(() => {
      timer = deps.setTimer(() => {
        timer = null;
        if (session === s && !s.done) {
          crumb("stalled_10s", "warning", { profile: s.profile, firstQuery: s.first_query });
          s.steps.push({ s: "stalled_10s", t: deps.now() - s.t0, d: { profile: s.profile, firstQuery: s.first_query } });
          report(s, "Login did not finish within 10 seconds", "stalled");
        }
      }, STALL_MS);
    });
  }

  function active(): boolean {
    return session !== null && !session.done;
  }

  /** Record a step. Does nothing unless a login session is being traced. */
  function step(name: string, detail?: Detail, level: Level = "info") {
    const s = session;
    if (!s || s.done) return;
    const t = deps.now() - s.t0;
    const d = cleanDetail({ ...detail, t });
    crumb(name, level, d);
    if (s.steps.length < MAX_STEPS) s.steps.push({ s: name, t, d: cleanDetail(detail), lvl: level });
    persist();
  }

  const flagged = new Map<string, number>();

  /**
   * Something worth knowing about happened that would otherwise leave no trace
   * because the login still went on to succeed (e.g. the profile retry found a
   * profile the first read called missing). Adds a step to the trace if a login
   * is being traced, and sends ONE Sentry info event right away, with or
   * without a login session. At most MAX_FLAGS_PER_NAME per name per page load.
   */
  function flag(name: string, detail?: Detail, uid?: string | null) {
    step(name, detail, "warning");
    const count = flagged.get(name) ?? 0;
    if (count >= MAX_FLAGS_PER_NAME) return;
    flagged.set(name, count + 1);
    const s = session;
    safe(() => {
      const extraDetail = Object.entries(cleanDetail(detail) ?? {}).map(([k, v]) => `${k}=${v}`).join(" ");
      deps.sink.message(`Login: ${name}`, {
        level: "info",
        tags: { "login.flag": name, "login.source": s?.source ?? "none", route: deps.route() },
        extra: {
          trace: s ? traceText(s) : `${name}  ${extraDetail}`,
          user: s?.user ?? (uid ? hashUid(uid) : null),
          elapsedMs: s ? deps.now() - s.t0 : null,
        },
        fingerprint: ["login-diagnostics", "flag", name],
      });
    });
  }

  function setUser(uid: string) {
    if (session && !session.done) {
      session.user = hashUid(uid);
      persist();
    }
  }

  function fail(name: string, err: unknown, detail?: Detail) {
    step(name, { ...detail, ...errorDetail(err) }, "error");
  }

  function milestone(kind: Milestone) {
    const s = session;
    if (!s || s.done) return;
    s[kind] = true;
    step(`${kind}_loaded`);
    if (s.profile && s.first_query) complete(s);
  }

  /** Wraps a promise: records its duration and outcome, passes the result or error straight through. */
  function track<T>(name: string, promise: Promise<T>, reach?: Milestone, detail?: Detail): Promise<T> {
    const started = deps.now();
    step(`${name}_start`, detail);
    return promise.then(
      value => {
        step(`${name}_ok`, { ...detail, ms: deps.now() - started });
        if (reach) milestone(reach);
        return value;
      },
      err => {
        fail(`${name}_failed`, err, { ...detail, ms: deps.now() - started });
        throw err;
      }
    );
  }

  /** The trace saved by an earlier launch, if that login never finished. Reports it once. */
  function reportPreviousIfUnfinished() {
    safe(() => {
      const raw = deps.store.get();
      if (!raw) return;
      const old = JSON.parse(raw) as Session;
      // Not this session, never finished, never reported, and old enough that it is not still in progress.
      if (session && old.id === session.id) return;
      if (old.done || old.reported) { deps.store.remove(); return; }
      if (deps.now() - old.t0 < STALL_MS + 2000) return;
      old.steps.push({ s: "previous_launch_ended_here", t: deps.now() - old.t0 });
      report(old, "Previous login never finished (page closed, frozen or killed)", "previous-launch");
      deps.store.remove();
    });
  }

  return { begin, step, fail, flag, milestone, track, setUser, abandon, active, checkPrevious: reportPreviousIfUnfinished };
}

export type LoginDiagnostics = ReturnType<typeof createLoginDiagnostics>;
