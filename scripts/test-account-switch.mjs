// Switching accounts on one phone must land each person on THEIR OWN screens
// (Build 1.1 step 9, problem 1). Sentry JAVASCRIPT-NEXTJS-5: a student signed
// out, an admin signed in, the profile read said role=admin, and the app went
// to the STUDENT dashboard six milliseconds later with no network request,
// because the Next.js client router reused the "/dashboard -> /student/dashboard"
// redirect it had cached during the student's session.
//
// Real WebKit with the iPhone 14 profile, local emulators, fake data. One
// continuous browser session, repeated N times (default 10):
//   student signs in -> taps through a few student screens (client-side) ->
//   signs out -> admin signs in -> must land on /coach/dashboard and stay there
//   (cookie says admin, coach screens shown) -> admin signs out.
//
// Needs: npm i --no-save playwright && npx playwright install webkit; Java; Firebase CLI.
// Run:  N=10 node scripts/test-account-switch.mjs      Ports: 9099, 8080, 3122

import assert from "node:assert/strict";
import { startStack, signedInPage } from "./fixtures/local-stack.mjs";
import { authUser, put } from "./fixtures/seed-coach-videos.mjs";

let playwright;
try {
  playwright = await import("playwright");
} catch {
  console.log("Playwright isn't installed. Run: npm i --no-save playwright && npx playwright install webkit");
  process.exit(2);
}
const { webkit, devices } = playwright;

let stack;
try {
  stack = await startStack({ port: 3122 });
} catch (err) {
  console.log(err.message);
  process.exit(2);
}
const { BASE, COACH, stop } = stack;
const N = Number(process.env.N ?? 10);

const ADMIN = { email: "admin@example.test", password: "password1" };
const ALICE = { email: "alice@example.test", password: "password1" };
{
  const uid = await authUser(ADMIN.email, ADMIN.password);
  await put(`users/${uid}`, { uid, email: ADMIN.email, fullName: "Admin Ada", role: "admin", age: 40 });
}

const browser = await webkit.launch();
const makeContext = async () => {
  const ctx = await browser.newContext({ ...devices["iPhone 14"] });
  await ctx.route(/sentry\.io/, r => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  return ctx;
};

// Warm the compile of every page the cycles use (and get past the first-login flake).
for (const [who, landing] of [[COACH, /\/coach\//], [ALICE, /\/student\//]]) {
  const warm = await signedInPage(makeContext, BASE, who, landing);
  if (!warm) throw new Error("could not sign in to the local app");
  await warm.page.waitForTimeout(2000);
  await warm.ctx.close();
}

async function signIn(page, who) {
  await page.waitForSelector('button[type="submit"]', { timeout: 120000 });
  await page.waitForTimeout(2000); // let React hydrate
  await page.fill('input[type="email"]', who.email);
  await page.fill('input[type="password"]', who.password);
  await page.click('button[type="submit"]');
}
const path = page => new URL(page.url()).pathname;
// A client-side navigation through the bottom menu. (The element's own click(): Playwright's
// scroll-into-view for a fixed bottom bar can spin in mobile emulation, and the app cares only
// that the Link's click handler runs.)
async function tap(page, name, expected) {
  await page.getByRole("link", { name, exact: true }).first().evaluate(el => el.click());
  await page.waitForURL(expected, { timeout: 30000 });
}

const ctx = await makeContext();
const page = await ctx.newPage();
await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 180000 });

const landed = [];
const problems = [];
for (let i = 1; i <= N; i++) {
  try {
    // --- the student ---
    await signIn(page, ALICE);
    await page.waitForURL(/\/student\/dashboard/, { timeout: 60000 });
    await page.waitForTimeout(1500);
    await tap(page, "My Videos", /\/student\/videos/);
    await tap(page, "Profile", /\/student\/profile/);
    await tap(page, "Home", /\/student\/dashboard/);
    await tap(page, "Profile", /\/student\/profile/);
    await page.getByRole("button", { name: /sign out/i }).first().click();
    await page.waitForURL(/\/login/, { timeout: 30000 });

    // --- the admin, on the same phone ---
    await signIn(page, ADMIN);
    const ok = await page.waitForURL(/\/coach\/dashboard/, { timeout: 30000 }).then(() => true, () => false);
    await page.waitForTimeout(2500); // it must STAY there
    const finalPath = path(page);
    const cookie = await page.evaluate(() => document.cookie.match(/ballmasters_role=([^;]*)/)?.[1] ?? "none");
    landed.push(`${i}: ${finalPath} (cookie ${cookie})`);
    if (!ok || finalPath !== "/coach/dashboard" || cookie !== "admin") problems.push(`cycle ${i}: the admin ended on ${finalPath} (role cookie ${cookie})`);

    // --- the admin signs out (from wherever they ended up) ---
    const signOut = page.getByRole("button", { name: /sign out/i }).first();
    if (await signOut.isVisible().catch(() => false)) await signOut.click();
    else { await page.goto(`${BASE}/student/profile`, { waitUntil: "domcontentloaded" }); await page.getByRole("button", { name: /sign out/i }).first().click(); }
    await page.waitForURL(/\/login/, { timeout: 30000 });
  } catch (err) {
    problems.push(`cycle ${i}: ${String(err.message).split("\n").slice(0, 8).join(" | ")} (at ${path(page)})`);
    // Start the next cycle from a clean login screen.
    await page.context().clearCookies();
    await page.evaluate(() => { try { localStorage.clear(); } catch {} }).catch(() => {});
    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" }).catch(() => {});
  }
}

await browser.close();
stop();
console.log(landed.join("\n"));
console.log(`\n${N - problems.length} of ${N} account switches landed the admin on /coach/dashboard`);
for (const p of problems) console.log(`  PROBLEM ${p}`);
process.exit(problems.length ? 1 : 0);
