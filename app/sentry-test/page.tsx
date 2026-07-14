"use client";

// Temporary — verifies Sentry error reporting end to end. Remove after testing.

export default function SentryTestPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-gray-200 p-8 text-center">
        <h1 className="text-xl font-extrabold mb-2" style={{ color: "#001c48" }}>
          Sentry test
        </h1>
        <p className="text-sm text-gray-500 mb-6">
          Clicking the button below throws an uncaught error that Sentry should
          capture and forward to the dashboard.
        </p>
        <button
          type="button"
          onClick={() => {
            throw new Error("Sentry test: manual client-side error");
          }}
          className="w-full rounded-lg py-2.5 text-sm font-semibold text-white transition hover:opacity-90"
          style={{ backgroundColor: "#001c48" }}
        >
          Throw a test error
        </button>
      </div>
    </main>
  );
}
