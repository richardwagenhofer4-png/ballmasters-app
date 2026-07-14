import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://e15aff4e0402342b39d63b79233c1d0d@o4511731337003008.ingest.us.sentry.io/4511731343097856",
  tracesSampleRate: 0.1,
  // Session Replay intentionally OFF — stay within free tier; error capture is the point.
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 0,
});
