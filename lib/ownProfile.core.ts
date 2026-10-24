// Reading the signed-in person's own profile without ever hanging, and without
// believing "missing" too easily (Build 1.1 bug 2).
//
// Two ways a first read can go wrong, handled here:
//
// 1. It answers "missing" although the profile is there (a write pending on the
//    same document, see lib/lastActive.core.ts). So a first "missing" is
//    double-checked: wait RETRY_WAIT_MS, ask the SERVER once more, and only
//    treat the profile as missing if that also says it does not exist.
// 2. It never answers. After the phone sat idle for minutes, the Firestore
//    connection was dead and the first read after sign-in waited forever (Sentry
//    JAVASCRIPT-NEXTJS-4: the login screen spun for about 8 minutes). So every
//    read has a time limit (READ_TIMEOUT_MS). When it runs out, or Firestore
//    says it is unavailable, the connection is reset once (resetNetwork) and the
//    read is asked again from the server under the same limit. If that fails
//    too, ProfileUnreachableError is thrown. A timeout is never "missing": the
//    caller must show a "couldn't reach Ball Masters, try again" state, not send
//    the person anywhere.
//
// Outcomes:
//   - first read finds it                 -> returned at once, nothing else happens
//   - first "missing", retry finds it     -> the retry's answer; a Sentry info event
//   - both "missing"                      -> the (missing) answer, ~1 s later
//   - first read stuck, reset fixes it    -> the answer; a Sentry warning event
//   - stuck and still stuck after reset   -> ProfileUnreachableError (+ Sentry event)
//   - the "missing" re-check is stuck     -> ProfileUnreachableError, never "missing"
//   - any other failure (e.g. permission) -> thrown as before
//
// Pure logic (reads, timers, network reset, tracing all injected) so
// scripts/test-profile-read.mjs can test it. The real wiring is lib/ownProfile.ts.

export const RETRY_WAIT_MS = 1000;
/** How long one read may take before it is treated as stuck. */
export const READ_TIMEOUT_MS = 5000;

/** Rejected by withTimeout when a read did not answer in time. */
export class ReadTimeoutError extends Error {
  ms: number;
  constructor(ms: number) {
    super(`The profile read did not answer within ${ms} ms`);
    this.name = "ReadTimeoutError";
    this.ms = ms;
  }
}

/** The profile could not be read at all (stuck, even after a connection reset). Never means "missing". */
export class ProfileUnreachableError extends Error {
  detail?: unknown;
  constructor(detail?: unknown) {
    super("Couldn't reach Ball Masters");
    this.name = "ProfileUnreachableError";
    this.detail = detail;
  }
}

export function isProfileUnreachable(err: unknown): boolean {
  return err instanceof ProfileUnreachableError || (err as { name?: unknown } | null)?.name === "ProfileUnreachableError";
}

/** A read that is stuck or whose connection is down (Firestore's code for "client is offline" is "unavailable"). */
function isStuck(err: unknown): boolean {
  const e = err as { name?: unknown; code?: unknown } | null;
  return e?.name === "ReadTimeoutError" || e?.code === "unavailable";
}

export interface SnapLike {
  exists(): boolean;
  metadata: { fromCache: boolean };
}

type Detail = Record<string, string | number | boolean | null | undefined>;

export interface RetryDeps<S extends SnapLike> {
  /** The normal read (getDoc). */
  first(): Promise<S>;
  /** The second look, straight from the server (getDocFromServer). */
  fromServer(): Promise<S>;
  sleep(ms: number): Promise<void>;
  trace(step: string, detail?: Detail, level?: "info" | "warning" | "error"): void;
  fail(step: string, err: unknown, detail?: Detail): void;
  /** Sends one Sentry event right away (see loginTrace.flag). Default level is "info". */
  flag(name: string, detail?: Detail, level?: "info" | "warning"): void;
  /** Rejects with ReadTimeoutError if `p` has not settled after `ms`. Default: no time limit. */
  withTimeout?<T>(p: Promise<T>, ms: number): Promise<T>;
  /** Drops and re-opens the Firestore connection (disableNetwork, then enableNetwork). Default: nothing. */
  resetNetwork?(): Promise<void>;
}

export async function readWithMissingRetry<S extends SnapLike>(
  deps: RetryDeps<S>,
  onFirstRead?: (meta: { exists: boolean; fromCache: boolean }) => void
): Promise<S> {
  const limit = deps.withTimeout ?? (<T>(p: Promise<T>) => p);

  async function unreachable(step: string, err: unknown, detail?: Detail): Promise<never> {
    deps.fail(step, err, detail);
    deps.flag("profile_unreachable", detail, "warning");
    throw new ProfileUnreachableError(err);
  }

  let first: S;
  try {
    first = await limit(deps.first(), READ_TIMEOUT_MS);
  } catch (err) {
    if (!isStuck(err)) throw err;
    // Stuck. Reset the connection once, then ask the server again under the same limit.
    const why = { timeoutMs: READ_TIMEOUT_MS, code: String((err as { code?: unknown })?.code ?? "timeout") };
    deps.trace("profile_read_stuck", why, "error");
    try {
      await deps.resetNetwork?.();
      deps.trace("profile_network_reset", undefined, "warning");
    } catch (resetErr) {
      deps.fail("profile_network_reset_failed", resetErr);
    }
    try {
      first = await limit(deps.fromServer(), READ_TIMEOUT_MS);
    } catch (err2) {
      return unreachable("profile_read_unreachable", err2, why);
    }
    deps.trace("profile_read_recovered", { ...why, exists: first.exists() }, "warning");
    deps.flag("profile_read_recovered_after_reset", { ...why, exists: first.exists() }, "warning");
  }

  try { onFirstRead?.({ exists: first.exists(), fromCache: first.metadata.fromCache }); } catch { /* diagnostics only */ }
  if (first.exists()) return first;

  const base = { firstFromCache: first.metadata.fromCache, waitMs: RETRY_WAIT_MS };
  deps.trace("profile_retry_start", base, "warning");
  await deps.sleep(RETRY_WAIT_MS);

  let second: S;
  try {
    second = await limit(deps.fromServer(), READ_TIMEOUT_MS);
  } catch (err) {
    // A re-check that does not answer is NOT a second "missing".
    if (isStuck(err)) return unreachable("profile_retry_unreachable", err, base);
    deps.fail("profile_retry_failed", err, base);
    throw err;
  }
  const found = second.exists();
  deps.trace("profile_retry", { ...base, retryExists: found, retryFromCache: second.metadata.fromCache }, found ? "error" : "warning");
  if (found) deps.flag("profile_retry_rescued", { ...base, retryFromCache: second.metadata.fromCache });
  return second;
}
