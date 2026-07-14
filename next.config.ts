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
  disableLogger: true,
  automaticVercelMonitors: false,
});
