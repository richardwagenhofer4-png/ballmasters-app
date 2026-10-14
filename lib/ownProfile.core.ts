// "Missing" is only believed after a second look (Build 1.1 bug 2).
//
// The first read of a person's own users/{uid} document can answer
// exists: false although the profile is there (see lib/lastActive.core.ts).
// Wherever "no profile" sends the person somewhere else or leaves them with an
// empty view, the read goes through this: if the first answer is "missing",
// wait RETRY_WAIT_MS, ask the SERVER once more, and only treat the profile as
// missing if that also says it does not exist.
//   - first read finds it            -> returned at once, nothing else happens
//   - first "missing", retry finds it -> the retry's answer is returned; a
//                                        Sentry info event records that the
//                                        retry saved the day
//   - both "missing"                  -> the retry's (missing) answer is
//                                        returned: a truly missing profile
//                                        behaves exactly as before, ~1 s later
//   - the retry itself fails          -> the error is thrown, as any failed
//                                        profile read is; the person is not
//                                        told their account doesn't exist on
//                                        the strength of an unconfirmed read
//
// Pure logic (reads, sleep and tracing are injected) so scripts/
// test-profile-read.mjs can test it. The real wiring is lib/ownProfile.ts.

export const RETRY_WAIT_MS = 1000;

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
  /** Sends one Sentry info event: the retry rescued a false "missing". */
  flag(name: string, detail?: Detail): void;
}

export async function readWithMissingRetry<S extends SnapLike>(
  deps: RetryDeps<S>,
  onFirstRead?: (meta: { exists: boolean; fromCache: boolean }) => void
): Promise<S> {
  const first = await deps.first();
  try { onFirstRead?.({ exists: first.exists(), fromCache: first.metadata.fromCache }); } catch { /* diagnostics only */ }
  if (first.exists()) return first;

  const base = { firstFromCache: first.metadata.fromCache, waitMs: RETRY_WAIT_MS };
  deps.trace("profile_retry_start", base, "warning");
  await deps.sleep(RETRY_WAIT_MS);

  let second: S;
  try {
    second = await deps.fromServer();
  } catch (err) {
    deps.fail("profile_retry_failed", err, base);
    throw err;
  }
  const found = second.exists();
  deps.trace("profile_retry", { ...base, retryExists: found, retryFromCache: second.metadata.fromCache }, found ? "error" : "warning");
  if (found) deps.flag("profile_retry_rescued", { ...base, retryFromCache: second.metadata.fromCache });
  return second;
}
