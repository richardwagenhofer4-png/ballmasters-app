// Browser check for the coach Videos tab athlete filter (Build 1.1 bug 3:
// "the athlete filter does not react" on iPhone).
//
// Drives app/coach/videos/page.tsx in WebKit with Playwright's iPhone 14 profile
// (390 x 844, touch) against the LOCAL Firebase emulators with fake seeded data
// (scripts/fixtures/seed-coach-videos.mjs). It never touches a real project and
// blocks Sentry. Checks that choosing an athlete changes the list in every view
// mode, that a tap reaches the select, that nothing covers the filter row at
// 390px, and that the page doesn't overflow sideways.
//
// Needs (none of it is in package.json):
//   npm i --no-save playwright && npx playwright install webkit
//   Java 11+ and the Firebase CLI on PATH (same as the rules test)
// Run:  node scripts/test-videos-filter.mjs
// Ports used: 9099 (Auth), 8080 (Firestore), 3115 (next dev). Stops what it starts.

import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import net from "node:net";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 3115;
const BASE = `http://localhost:${PORT}`;

let playwright;
try {
  playwright = await import("playwright");
} catch {
  console.log("Playwright isn't installed. Run: npm i --no-save playwright && npx playwright install webkit");
  process.exit(2);
}
const { webkit, devices } = playwright;

const portFree = port => new Promise(res => {
  const s = net.createServer().once("error", () => res(false)).once("listening", () => s.close(() => res(true)));
  s.listen(port, "127.0.0.1");
});
for (const port of [9099, 8080, PORT]) {
  if (!(await portFree(port))) { console.log(`Port ${port} is in use; stop whatever is using it first.`); process.exit(2); }
}

const procs = [];
// Children run in their own process group so stopping them also stops what they
// spawn (the emulator's Java process, next's server).
const stopAll = () => { for (const p of procs) { try { process.kill(-p.pid, "SIGTERM"); } catch { /* gone */ } } };
process.on("exit", stopAll);
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, what, tries = 120) {
  for (let i = 0; i < tries; i++) { try { if (await fn()) return; } catch { /* not yet */ } await sleep(1000); }
  throw new Error(`timed out waiting for ${what}`);
}

// 1. Emulators: Auth + Firestore, with the repo's real rules.
const dir = mkdtempSync(join(tmpdir(), "bm-emu-"));
writeFileSync(join(dir, "firebase.json"), JSON.stringify({
  firestore: { rules: join(root, "firestore.rules") },
  emulators: { auth: { host: "127.0.0.1", port: 9099 }, firestore: { host: "127.0.0.1", port: 8080 }, ui: { enabled: false } },
}));
procs.push(spawn("firebase", ["emulators:start", "--config", join(dir, "firebase.json"), "--only", "auth,firestore", "--project", "demo-ballmasters"], { cwd: dir, stdio: "ignore", detached: true }));
await waitFor(async () => (await fetch("http://127.0.0.1:9099")).ok && (await fetch("http://127.0.0.1:8080")).ok, "the emulators");

// 2. Fake data.
const { seed, COACH } = await import("./fixtures/seed-coach-videos.mjs");
await seed();

// 3. The app, pointed at the emulators.
procs.push(spawn("npx", ["next", "dev", "-p", String(PORT)], {
  cwd: root,
  stdio: "ignore",
  detached: true,
  env: {
    ...process.env,
    NODE_OPTIONS: `--require ${join(root, "scripts/fixtures/block-sentry.cjs")}`,
    NEXT_PUBLIC_FIREBASE_EMULATOR: "true",
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-ballmasters",
    NEXT_PUBLIC_FIREBASE_API_KEY: "fake",
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "localhost",
    NEXT_PUBLIC_FIREBASE_APP_ID: "1:1:web:1",
  },
}));
await waitFor(async () => (await fetch(`${BASE}/login`)).ok, "next dev");

// 4. The checks.
const browser = await webkit.launch();
const ctx = await browser.newContext({ ...devices["iPhone 14"] });
await ctx.route(/sentry\.io/, r => r.abort());
const page = await ctx.newPage();

let passed = 0;
const failed = [];
async function check(name, fn) {
  try { await fn(); passed++; } catch (err) { failed.push(`${name}: ${err.message.split("\n")[0]}`); }
}

// A freshly started dev server compiles each page the first time it is asked
// for (the dashboard can take a minute), and a click before React has hydrated
// would submit the form natively. So: wait for hydration, sign in, allow the
// compile, and only retry if the page is still on /login.
let signedIn = false;
for (let attempt = 0; attempt < 3 && !signedIn; attempt++) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForSelector('button[type="submit"]', { timeout: 180000 });
  await page.waitForTimeout(2500); // let React hydrate
  await page.fill('input[type="email"]', COACH.email);
  await page.fill('input[type="password"]', COACH.password);
  await page.click('button[type="submit"]');
  signedIn = await page.waitForURL(/\/coach\//, { timeout: 240000 }).then(() => true, () => false);
}
if (!signedIn) throw new Error("could not sign in to the local app");

const resultsText = async () => (await page.textContent("text=/\\d+ results?/")).trim();
const EXPECTED = { "All Athletes": 5, "Alice Adams": 2, "Ben Brown": 2, "Cara Cole": 1 };

for (const mode of ["cards", "list", "grid"]) {
  await page.evaluate(m => localStorage.setItem("viewmode_coach-videos", m), mode);
  await page.goto(`${BASE}/coach/videos`);
  await page.waitForSelector("text=/\\d+ results?/");
  const athleteSelect = page.locator("select").nth(4);

  for (const [name, n] of Object.entries(EXPECTED)) {
    await check(`${mode} view: choosing "${name}" shows ${n} video(s)`, async () => {
      await athleteSelect.tap();
      await athleteSelect.selectOption({ label: name });
      await page.waitForFunction(count => new RegExp(`^${count} results?$`).test(
        document.body.innerText.match(/\d+ results?/)?.[0] ?? ""), n, { timeout: 3000 });
      assert.match(await resultsText(), new RegExp(`^${n} results?$`));
    });
  }

  // The cards on screen are the right ones, not just the right number.
  await check(`${mode} view: Alice's list holds exactly her videos`, async () => {
    await athleteSelect.selectOption({ label: "Alice Adams" });
    await page.waitForTimeout(200);
    const text = await page.evaluate(() => document.body.innerText);
    for (const t of ["Footwork basics", "Team drill"]) assert.ok(text.includes(t), `missing ${t}`);
    for (const t of ["Dribbling series", "Shooting form", "Unassigned clip"]) assert.ok(!text.includes(t), `should be hidden: ${t}`);
  });
}

await page.goto(`${BASE}/coach/videos`);
await page.waitForSelector("text=/\\d+ results?/");

await check("a tap on the athlete select reaches it (it takes focus)", async () => {
  const sel = page.locator("select").nth(4);
  await sel.tap();
  assert.equal(await page.evaluate(() => [...document.querySelectorAll("select")].indexOf(document.activeElement)), 4);
});

await check("nothing covers any of the six filter selects (centre and corners)", async () => {
  const bad = await page.evaluate(() => [...document.querySelectorAll("select")].flatMap((s, i) => {
    const r = s.getBoundingClientRect();
    return [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 3, r.top + 3], [r.right - 3, r.bottom - 3]]
      .filter(([x, y]) => document.elementFromPoint(x, y) !== s).map(() => i);
  }));
  assert.deepEqual(bad, [], `covered selects: ${bad}`);
});

await check("the page is no wider than the 390px screen", async () => {
  const w = await page.evaluate(() => [innerWidth, document.documentElement.scrollWidth]);
  assert.equal(w[0], 390);
  assert.ok(w[1] <= 390, `scrollWidth ${w[1]}`);
});

await browser.close();
stopAll();
console.log(`${passed} passed, ${failed.length} failed (WebKit, iPhone 14 profile, local emulators)`);
for (const f of failed) console.log(`  FAIL ${f}`);
process.exit(failed.length ? 1 : 0);
