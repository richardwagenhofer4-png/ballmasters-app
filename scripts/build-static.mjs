// SPIKE ONLY (spike/local-bundle). Produces the static export bundle for the
// Capacitor iOS shell. Proof-of-concept — not production hardened.
//
// Why a script: `output: "export"` cannot coexist with route handlers
// (app/api) or middleware in the same build — export treats every route
// handler as a page needing generateStaticParams and errors out. So we move
// app/api and middleware.ts OUT of the tree for the duration of the export
// build, then restore them. The normal Vercel build never runs this script,
// so its source tree is untouched.
//
// Run: node scripts/build-static.mjs   (or: npm run build:static)

import { spawnSync } from "node:child_process";
import { existsSync, renameSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const HOLD = join(root, ".static-build-hold");

// [source, heldName] pairs to move aside during the export build.
const RELOCATE = [
  [join(root, "app", "api"), join(HOLD, "api")],
  [join(root, "middleware.ts"), join(HOLD, "middleware.ts")],
];

function moveAside() {
  mkdirSync(HOLD, { recursive: true });
  for (const [src, held] of RELOCATE) {
    if (existsSync(src)) {
      renameSync(src, held);
      console.log(`  moved ${src} -> ${held}`);
    }
  }
}

function restore() {
  for (const [src, held] of RELOCATE) {
    if (existsSync(held)) {
      renameSync(held, src);
      console.log(`  restored ${src}`);
    }
  }
  rmSync(HOLD, { recursive: true, force: true });
}

console.log("[build-static] relocating server-only files…");
moveAside();

let code = 1;
try {
  console.log("[build-static] running static export build (STATIC_EXPORT=1)…");
  const res = spawnSync("npx", ["next", "build"], {
    stdio: "inherit",
    env: { ...process.env, STATIC_EXPORT: "1" },
    shell: false,
  });
  code = res.status ?? 1;
} finally {
  console.log("[build-static] restoring server-only files…");
  restore();
}

if (code === 0) {
  console.log("[build-static] done. Static bundle is in out-static/.");
} else {
  console.log(`[build-static] build FAILED (exit ${code}). Files restored.`);
}
process.exit(code);
