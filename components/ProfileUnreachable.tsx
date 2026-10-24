// "Couldn't reach Ball Masters. Try again." Shown when the signed-in person's
// profile could not be read at all (the connection is stuck even after being
// reset: lib/ownProfile.ts throws ProfileUnreachableError). It is never "your
// account is missing": the person is not redirected anywhere, just offered a
// retry.

export const UNREACHABLE_TITLE = "Couldn’t reach Ball Masters";
export const UNREACHABLE_HELP = "Check your connection, then try again.";

/** Full-page version, for screens that can't show anything without the profile. */
export default function ProfileUnreachable({ onRetry }: { onRetry?: () => void }) {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4" data-testid="profile-unreachable">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 text-center shadow-lg">
        <h1 className="text-lg font-bold" style={{ color: "#001c48" }}>{UNREACHABLE_TITLE}</h1>
        <p className="mt-2 text-sm text-gray-600">{UNREACHABLE_HELP}</p>
        <button
          type="button"
          onClick={onRetry ?? (() => window.location.reload())}
          className="mt-5 inline-flex min-h-11 w-full items-center justify-center rounded-lg px-5 text-sm font-semibold text-white transition active:opacity-80"
          style={{ backgroundColor: "#001c48" }}
        >
          Try again
        </button>
      </div>
    </main>
  );
}

/** Inline version, for screens that must stay usable (sign-out, settings) when the profile can't be read. */
export function ProfileUnreachableBanner({ onRetry }: { onRetry?: () => void }) {
  return (
    <div
      role="alert"
      data-testid="profile-unreachable"
      className="mx-4 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
    >
      <p className="font-semibold">{UNREACHABLE_TITLE}</p>
      <p className="mt-0.5">{UNREACHABLE_HELP}</p>
      <button
        type="button"
        onClick={onRetry ?? (() => window.location.reload())}
        className="mt-2 inline-flex min-h-11 items-center justify-center rounded-lg px-5 text-sm font-semibold text-white"
        style={{ backgroundColor: "#001c48" }}
      >
        Try again
      </button>
    </div>
  );
}
