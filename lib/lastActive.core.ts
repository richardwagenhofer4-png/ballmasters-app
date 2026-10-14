// When users/{uid}.lastActiveAt gets written, so that the write can never be
// in flight while the person's profile is being read (Build 1.1 bug 2).
//
// The problem it removes: AuthContext used to fire the "last active" update at
// the instant of sign-in, the same instant as the first read of the same
// document. With a write pending on users/{uid}, that first read could come
// back "missing" (exists: false) although the profile is there, which stranded
// people on the login screen. Against the emulators in WebKit it happened in
// roughly a quarter to a half of first sign-ins, and in none when the write was
// held back (report §11 / §12).
//
// How it is held back. Whoever wants the write calls request(); the write only
// goes out once
//   - at least one profile read for that user has finished,
//   - none is still in flight, and
//   - the profile reads have been quiet for QUIET_MS (so the destination
//     page's own first read after login, which starts a moment after the
//     login page's read ends, is also done),
// or MAX_WAIT_MS has passed (so the write still happens if nothing ever reads
// the profile, or the network is very slow). It is still once a day per
// device (dueToday / markWritten) and still fire-and-forget. Several requests
// for the same login collapse into ONE write: a request while a write is
// pending, in flight, or was sent in the last DEDUPE_MS is dropped. And the
// other direction: a profile read that starts while the write is in flight
// waits for it (at most READ_WAIT_MS).
//
// Pure logic with injected clock, timers and storage, so scripts/
// test-profile-read.mjs can drive it with a fake clock. The real wiring is
// lib/lastActive.ts.

export const QUIET_MS = 1500;
export const MAX_WAIT_MS = 8000;
export const READ_WAIT_MS = 2000;
export const DEDUPE_MS = 60_000;
const POLL_MS = 250;

export interface GateDeps {
  now(): number;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  /** The actual users/{uid}.lastActiveAt update. */
  write(uid: string): Promise<void>;
  /** Once-a-day throttle: has today's write not happened yet on this device? */
  dueToday(uid: string): boolean;
  markWritten(uid: string): void;
  onError?(err: unknown): void;
  trace?(step: string, detail?: Record<string, string | number | boolean>): void;
}

interface Pending { force: boolean; since: number; timer: unknown }
interface Reads { inFlight: number; settledAt: number | null }

export function createLastActiveGate(deps: GateDeps) {
  const pending = new Map<string, Pending>();
  const reads = new Map<string, Reads>();
  const writing = new Map<string, Promise<void>>();
  const lastWrite = new Map<string, number>();

  const trace: NonNullable<GateDeps["trace"]> = (s, d) => { try { deps.trace?.(s, d); } catch { /* diagnostics only */ } };

  function start(uid: string, waitedMs: number, why: "reads_done" | "max_wait") {
    lastWrite.set(uid, deps.now());
    trace("last_active_write_start", { waitedMs, why });
    const run = (async () => {
      try {
        await deps.write(uid);
        deps.markWritten(uid);
        trace("last_active_write_ok", { ms: deps.now() - (lastWrite.get(uid) ?? deps.now()) });
      } catch (err) {
        try { deps.onError?.(err); } catch { /* ignore */ }
        trace("last_active_write_failed");
      } finally {
        writing.delete(uid);
      }
    })();
    writing.set(uid, run);
  }

  function check(uid: string) {
    const p = pending.get(uid);
    if (!p) return;
    const r = reads.get(uid);
    const waited = deps.now() - p.since;
    const quiet = r !== undefined && r.settledAt !== null && r.inFlight === 0 && deps.now() - r.settledAt >= QUIET_MS;
    if (quiet || waited >= MAX_WAIT_MS) {
      pending.delete(uid);
      start(uid, waited, quiet ? "reads_done" : "max_wait");
    } else {
      p.timer = deps.setTimer(() => check(uid), POLL_MS);
    }
  }

  /** Ask for the lastActiveAt write. `force` skips the once-a-day throttle (the login page does). */
  function request(uid: string, opts: { force?: boolean } = {}) {
    const force = opts.force === true;
    const existing = pending.get(uid);
    if (existing) { existing.force = existing.force || force; return; }
    if (writing.has(uid)) { trace("last_active_skipped", { why: "in_flight" }); return; }
    const last = lastWrite.get(uid);
    if (last !== undefined && deps.now() - last < DEDUPE_MS) { trace("last_active_skipped", { why: "just_written" }); return; }
    if (!force && !deps.dueToday(uid)) { trace("last_active_skipped", { why: "done_today" }); return; }
    pending.set(uid, { force, since: deps.now(), timer: null });
    trace("last_active_requested", { force });
    check(uid);
  }

  /** Call when a read of users/{uid} starts; call the returned function when it ends (success or failure). */
  function readStarted(uid: string): () => void {
    const r = reads.get(uid) ?? { inFlight: 0, settledAt: null };
    r.inFlight++;
    reads.set(uid, r);
    let done = false;
    return () => {
      if (done) return;
      done = true;
      r.inFlight--;
      r.settledAt = deps.now();
    };
  }

  /** Await before reading users/{uid}: resolves at once unless the lastActiveAt write is in flight. */
  function beforeRead(uid: string): Promise<void> {
    const w = writing.get(uid);
    if (!w) return Promise.resolve();
    trace("profile_read_waits_for_last_active_write");
    return new Promise<void>(resolve => {
      const t = deps.setTimer(resolve, READ_WAIT_MS);
      void w.then(() => { deps.clearTimer(t); resolve(); });
    });
  }

  return { request, readStarted, beforeRead };
}

export type LastActiveGate = ReturnType<typeof createLastActiveGate>;
