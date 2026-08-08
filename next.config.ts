import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

// SPIKE ONLY (spike/local-bundle): when STATIC_EXPORT=1 we produce a static
// bundle for the Capacitor iOS shell instead of the normal Vercel server build.
// The Vercel build never sets this env var, so its output is unchanged.
const isStaticExport = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@ffmpeg-installer/ffmpeg", "fluent-ffmpeg"],
  ...(isStaticExport
    ? {
        output: "export" as const,
        // Route handlers can't be pre-rendered; the static build script moves
        // app/api out of the tree before building. distDir keeps the static
        // output separate from the normal .next build.
        distDir: "out-static",
      }
    : {}),
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
