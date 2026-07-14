import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg", "fluent-ffmpeg"],
};

export default withSentryConfig(nextConfig, {
  // No SENTRY_AUTH_TOKEN — skip source map upload entirely so the build
  // doesn't require Sentry auth credentials.
  sourcemaps: { disable: true },
  silent: true,
  // disableLogger and automaticVercelMonitors are webpack-only in v10;
  // Next 16 defaults to Turbopack, so they'd be no-ops (and emit
  // deprecation warnings) — omitted.
});
