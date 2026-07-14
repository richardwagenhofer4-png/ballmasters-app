import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://e15aff4e0402342b39d63b79233c1d0d@o4511731337003008.ingest.us.sentry.io/4511731343097856",
  tracesSampleRate: 0.1,
});
