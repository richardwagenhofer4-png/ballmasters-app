// Starts the pieces the browser tests need, all local and fake:
//   - Firebase Auth + Firestore emulators (project demo-ballmasters, the repo's real rules)
//   - fake data (scripts/fixtures/seed-coach-videos.mjs)
//   - `next dev` pointed at the emulators, with Sentry blocked on the server
// Needs Java 11+ and the Firebase CLI on PATH. Ports: 9099 (Auth), 8080
// (Firestore), and the one you pass for the app. stop() shuts everything down.

import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, openSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const sleep = ms => new Promise(r => setTimeout(r, ms));

const portFree = port => new Promise(res => {
  const s = net.createServer().once("error", () => res(false)).once("listening", () => s.close(() => res(true)));
  s.listen(port, "127.0.0.1");
});

async function waitFor(fn, what, tries = 150) {
  for (let i = 0; i < tries; i++) { try { if (await fn()) return; } catch { /* not yet */ } await sleep(1000); }
  throw new Error(`timed out waiting for ${what}`);
}

// BM_STACK_LOGS=/some/dir keeps the emulator and dev-server output in that directory.
const logTo = name => (process.env.BM_STACK_LOGS ? ["ignore", openSync(join(process.env.BM_STACK_LOGS, name), "w"), openSync(join(process.env.BM_STACK_LOGS, name), "a")] : "ignore");

export async function startStack({ port }) {
  for (const p of [9099, 8080, port]) {
    // A stack that was stopped a moment ago may still be letting go of its ports.
    for (let i = 0; i < 20 && !(await portFree(p)); i++) await sleep(1000);
    if (!(await portFree(p))) throw new Error(`Port ${p} is in use; stop whatever is using it first.`);
  }
  const procs = [];
  // Own process group each, so stopping them also stops what they spawn
  // (the emulator's Java process, next's server).
  const stop = () => { for (const p of procs) { try { process.kill(-p.pid, "SIGTERM"); } catch { /* gone */ } } };
  process.on("exit", stop);

  const dir = mkdtempSync(join(tmpdir(), "bm-emu-"));
  writeFileSync(join(dir, "firebase.json"), JSON.stringify({
    // RULES_FILE=<path> tests against other rules (e.g. the ones live in production).
    firestore: { rules: process.env.RULES_FILE ?? join(root, "firestore.rules") },
    emulators: { auth: { host: "127.0.0.1", port: 9099 }, firestore: { host: "127.0.0.1", port: 8080 }, ui: { enabled: false } },
  }));
  procs.push(spawn("firebase", ["emulators:start", "--config", join(dir, "firebase.json"), "--only", "auth,firestore", "--project", "demo-ballmasters"], { cwd: dir, stdio: logTo("emulators.log"), detached: true }));
  await waitFor(async () => (await fetch("http://127.0.0.1:9099")).ok && (await fetch("http://127.0.0.1:8080")).ok, "the emulators");

  const { seed, COACH } = await import("./seed-coach-videos.mjs");
  const seeded = await seed();

  const appEnv = {
    ...process.env,
    NODE_OPTIONS: `--require ${join(root, "scripts/fixtures/block-sentry.cjs")}`,
    NEXT_PUBLIC_FIREBASE_EMULATOR: "true",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-ballmasters",
    NEXT_PUBLIC_FIREBASE_API_KEY: "fake",
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "localhost",
    NEXT_PUBLIC_FIREBASE_APP_ID: "1:1:web:1",
  };
  // BM_PRODUCTION=1: a production build served with `next start`, as Vercel serves it
  // (the client router caches differently from `next dev`). Takes a minute to build.
  const production = process.env.BM_PRODUCTION === "1";
  if (production) execFileSync("npx", ["next", "build"], { cwd: root, env: appEnv, stdio: "ignore" });
  procs.push(spawn("npx", ["next", production ? "start" : "dev", "-p", String(port)], {
    cwd: root,
    stdio: logTo("next-dev.log"),
    detached: true,
    env: appEnv,
  }));
  const BASE = `http://localhost:${port}`;
  await waitFor(async () => (await fetch(`${BASE}/login`)).ok, "next dev");
  return { BASE, COACH, seeded, stop };
}

/**
 * Signs the coach in through the real login form, each attempt in a FRESH
 * browser context (so a half-finished attempt can't leave a signed-in session
 * behind). `makeContext()` builds the context (device profile, routes).
 *
 * Why attempts: a freshly started dev server compiles each page the first time
 * it is asked for (the dashboard can take a minute); a click before React has
 * hydrated would submit the form natively; and the FIRST login after a cold
 * start sometimes reads the profile as missing (see §11 of the Step 2 report),
 * which lands on /incomplete-profile. A later attempt succeeds.
 * Returns { ctx, page } on success, or null.
 */
export async function signedInPage(makeContext, BASE, COACH, landing = /\/coach\//) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const ctx = await makeContext();
    const page = await ctx.newPage();
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await page.waitForSelector('button[type="submit"]', { timeout: 180000 });
    await page.waitForTimeout(2500); // let React hydrate
    await page.fill('input[type="email"]', COACH.email);
    await page.fill('input[type="password"]', COACH.password);
    await page.click('button[type="submit"]');
    if (await page.waitForURL(landing, { timeout: 60000 }).then(() => true, () => false)) return { ctx, page };
    await ctx.close();
  }
  return null;
}
