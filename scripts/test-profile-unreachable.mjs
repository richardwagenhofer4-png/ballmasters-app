// A profile read that NEVER answers must not hang the app (Build 1.1 step 8,
// bug 2: after the phone sat idle, the login spun for about 8 minutes). Real
// WebKit with the iPhone profile against the local emulators with fake data;
// Sentry is intercepted, nothing leaves the machine.
//
// "Never answers" is simulated by holding every Firestore request open
// (Playwright answers none of them) until the test lets them through.
//
//   1. Login, the connection comes back once the app has given up on the read
//      (~5 s): the app resets its connection and the sign-in completes by
//      itself, and Sentry hears about the recovery.
//   2. Login, Firestore stays dead: within ~14 s the screen says "Couldn't reach
//      Ball Masters" with a Try again button. No endless spinner, no redirect to
//      /incomplete-profile or /student/dashboard, nothing written as the role.
//      After the connection returns, Try again signs in.
//   3. Coach screens (layout) with Firestore dead: the same message and button,
//      no redirect to /student/dashboard; Try again then works.
//   4. A student screen (student dashboard): the same.
//   5. A healthy sign-in reads the profile ONCE even though the auth listener and
//      the submit handler both run afterLogin (they share one run).
//
// Needs: npm i --no-save playwright && npx playwright install webkit; Java; Firebase CLI.
// Run:  node scripts/test-profile-unreachable.mjs      Ports: 9099, 8080, 3118

import assert from "node:assert/strict";
import { startStack, signedInPage } from "./fixtures/local-stack.mjs";

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
  stack = await startStack({ port: 3118 });
} catch (err) {
  console.log(err.message);
  process.exit(2);
}
const { BASE, COACH, stop } = stack;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await webkit.launch();
let passed = 0;
const failed = [];
async function check(name, fn) {
  try { await fn(); passed++; } catch (err) { failed.push(`${name}: ${err.message.split("\n")[0]}`); }
}

/** A fresh iPhone context. Firestore requests are held open while `net.blocked` is true. Sentry is captured. */
async function newContext() {
  const ctx = await browser.newContext({ ...devices["iPhone 14"] });
  const net = { blocked: false };
  const events = [];
  await ctx.route(/127\.0\.0\.1:8080/, route => (net.blocked ? undefined /* never answered */ : route.continue()));
  await ctx.route(/sentry\.io/, async route => {
    for (const line of (route.request().postData() ?? "").split("\n")) {
      try { const j = JSON.parse(line); if (j && (j.message || j.logentry || j.exception)) events.push(j); } catch { /* not JSON */ }
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  return { ctx, net, events };
}
const eventText = e => (e.message?.formatted ?? e.message ?? e.logentry?.formatted ?? e.logentry?.message ?? "");
const loginCrumbs = e => (Array.isArray(e.breadcrumbs) ? e.breadcrumbs : e.breadcrumbs?.values ?? []).filter(b => b.category === "login");

async function openLogin(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForSelector('button[type="submit"]', { timeout: 180000 });
  await page.waitForTimeout(2500); // let React hydrate
}
async function submit(page, who) {
  await page.fill('input[type="email"]', who.email);
  await page.fill('input[type="password"]', who.password);
  await page.click('button[type="submit"]');
}
const traceSteps = page => page.evaluate(() => {
  try { return JSON.parse(localStorage.getItem("bm_login_trace") ?? "null")?.steps?.map(s => s.s) ?? []; } catch { return []; }
});
const roleLeak = page => page.evaluate(() => [localStorage.getItem("ballmasters_role"), document.cookie]);

// (Short timeout, errors ignored: if the message never appeared, the check above has already failed.)
const pressTryAgain = banner => banner.getByRole("button", { name: /try again/i }).click({ timeout: 3000 }).catch(() => {});

const ALICE = { email: "alice@example.test", password: "password1" };

// Warm the compile of the pages used below, and get past the first-login flake.
{
  const warm = await signedInPage(async () => (await newContext()).ctx, BASE, COACH);
  if (!warm) throw new Error("could not sign in to the local app");
  await warm.page.goto(`${BASE}/coach/videos`, { waitUntil: "domcontentloaded", timeout: 180000 }).catch(() => {});
  await warm.page.waitForTimeout(2000);
  await warm.ctx.close();
  const warmStudent = await signedInPage(async () => (await newContext()).ctx, BASE, ALICE, /\/student\//);
  if (warmStudent) { await warmStudent.page.waitForTimeout(2000); await warmStudent.ctx.close(); }
}

// ---- 1. the connection comes back after the app resets it -------------------------
{
  const { ctx, net, events } = await newContext();
  const page = await ctx.newPage();
  // "The network comes back" at the moment the app drops its stuck connection: the first request
  // it abandons (cancelled by the reset) lifts the hold, so the request of the new connection,
  // which follows at once, gets through.
  page.on("requestfailed", r => { if (/127\.0\.0\.1:8080/.test(r.url()) && net.blocked) net.blocked = false; });
  await openLogin(page);
  net.blocked = true;
  const t0 = Date.now();
  await submit(page, COACH);
  let stuckAt = null;
  for (let i = 0; i < 160 && stuckAt === null; i++) {
    if ((await traceSteps(page)).includes("profile_read_stuck")) stuckAt = Date.now() - t0;
    else await sleep(100);
  }
  await check("1: after ~5 s of silence the app gives up on the read (not before 4 s, not after 9 s)", async () => {
    assert.ok(stuckAt !== null, "the read was never declared stuck");
    assert.ok(stuckAt >= 4000 && stuckAt <= 9000, `declared stuck at ${stuckAt} ms`);
  });
  await check("1: ...and it dropped and re-opened the connection once", async () => {
    assert.equal(net.blocked, false, "the app never abandoned the stuck connection");
  });
  const landed = await page.waitForURL(/\/coach\//, { timeout: 30000 }).then(() => Date.now() - t0, () => null);
  await check("1: ...and the sign-in then completes by itself, well inside 15 s", async () => {
    assert.ok(landed !== null, "never reached the coach screens");
    assert.ok(landed <= 15000, `took ${landed} ms`);
  });
  await page.waitForTimeout(1500);
  await check("1: Sentry hears the connection reset saved the sign-in (warning)", async () => {
    const e = events.find(x => /profile_read_recovered_after_reset/.test(eventText(x)));
    assert.ok(e, `events: ${events.map(eventText).join(" | ")}`);
    assert.equal(e.level, "warning");
  });
  await ctx.close();
}

// ---- 2. Firestore stays dead: a clear message and a Try again button -----------------
{
  const { ctx, net, events } = await newContext();
  const page = await ctx.newPage();
  await openLogin(page);
  net.blocked = true;
  const t0 = Date.now();
  await submit(page, COACH);
  const banner = page.getByTestId("profile-unreachable");
  const shownAfter = await banner.waitFor({ state: "visible", timeout: 25000 }).then(() => Date.now() - t0, () => null);
  await check("2: within ~14 s the screen says it couldn't reach Ball Masters", async () => {
    assert.ok(shownAfter !== null, "no message appeared (endless spinner?)");
    assert.ok(shownAfter <= 14000, `took ${shownAfter} ms`);
    assert.match(await banner.innerText(), /Couldn.t reach Ball Masters/);
  });
  await check("2: it has a Try again button, and the sign-in form is back (no endless spinner)", async () => {
    assert.ok(await banner.getByRole("button", { name: /try again/i }).isVisible());
    assert.ok(await page.locator('button[type="submit"]').isVisible());
  });
  await check("2: nobody was redirected, and no role was invented", async () => {
    assert.match(new URL(page.url()).pathname, /^\/login/);
    const [cached, cookies] = await roleLeak(page);
    assert.equal(cached, null);
    assert.ok(!/ballmasters_role/.test(cookies), cookies);
  });
  await check("2: Sentry hears 'profile_unreachable' (warning)", async () => {
    await page.waitForTimeout(1000);
    const e = events.find(x => /Login: profile_unreachable/.test(eventText(x)));
    assert.ok(e, `events: ${events.map(eventText).join(" | ")}`);
    assert.equal(e.level, "warning");
  });
  net.blocked = false;
  await pressTryAgain(banner);
  await check("2: once the connection is back, Try again signs in", async () => {
    await page.waitForURL(/\/coach\//, { timeout: 30000 });
  });
  await ctx.close();
}

// ---- 3. coach screens (the coach layout) -------------------------------------------
{
  const signed = await signedInPage(async () => (await newContext()).ctx, BASE, COACH);
  if (!signed) throw new Error("could not sign in");
  const { ctx, page } = signed;
  await page.waitForTimeout(2500);
  // The context's Firestore routing comes from newContext()'s own `net`; get a handle by re-routing here.
  const net = { blocked: false };
  await ctx.unroute(/127\.0\.0\.1:8080/);
  await ctx.route(/127\.0\.0\.1:8080/, route => (net.blocked ? undefined : route.continue()));
  net.blocked = true;
  await page.goto(`${BASE}/coach/videos`, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  const t0 = Date.now();
  const banner = page.getByTestId("profile-unreachable");
  const shownAfter = await banner.waitFor({ state: "visible", timeout: 30000 }).then(() => Date.now() - t0, () => null);
  await check("3: the coach screens say they couldn't reach Ball Masters, with Try again", async () => {
    assert.ok(shownAfter !== null, "no message appeared");
    assert.ok(shownAfter <= 14000, `took ${shownAfter} ms`);
    assert.ok(await banner.getByRole("button", { name: /try again/i }).isVisible());
  });
  await check("3: it did NOT send the coach to the student screens", async () => {
    assert.ok(!/\/student\//.test(new URL(page.url()).pathname), page.url());
  });
  net.blocked = false;
  await pressTryAgain(banner);
  await check("3: Try again then shows the coach's videos", async () => {
    await page.waitForSelector("text=/\\d+ results?/", { timeout: 40000 });
    assert.ok(/\/coach\/videos/.test(page.url()));
  });
  await ctx.close();
}

// ---- 4. a student screen (the student dashboard) ----------------------------------------
{
  const signed = await signedInPage(async () => (await newContext()).ctx, BASE, ALICE, /\/student\//);
  if (!signed) throw new Error("could not sign in as the student");
  const { ctx, page } = signed;
  await page.waitForTimeout(2500);
  const net = { blocked: false };
  await ctx.unroute(/127\.0\.0\.1:8080/);
  await ctx.route(/127\.0\.0\.1:8080/, route => (net.blocked ? undefined : route.continue()));
  net.blocked = true;
  await page.goto(`${BASE}/student/dashboard`, { waitUntil: "domcontentloaded", timeout: 60000 }).catch(() => {});
  const banner = page.getByTestId("profile-unreachable");
  const shown = await banner.waitFor({ state: "visible", timeout: 30000 }).then(() => true, () => false);
  await check("4: the student dashboard says it couldn't reach Ball Masters, with Try again", async () => {
    assert.ok(shown, "no message appeared");
    assert.ok(await banner.getByRole("button", { name: /try again/i }).isVisible());
  });
  net.blocked = false;
  await pressTryAgain(banner);
  await check("4: Try again then shows the dashboard", async () => {
    await page.waitForSelector("text=Alice", { timeout: 40000 });
  });
  await ctx.close();
}

// ---- 5. one sign-in = one profile read -----------------------------------------------
{
  const { ctx, events } = await newContext();
  const page = await ctx.newPage();
  await openLogin(page);
  await submit(page, COACH);
  await page.waitForURL(/\/coach\/dashboard/, { timeout: 120000 });
  await page.waitForTimeout(2500);
  await page.evaluate(() => { setTimeout(() => { throw new Error("trace-probe"); }, 0); });
  await sleep(2500);
  const probe = events.find(e => JSON.stringify(e).includes("trace-probe"));
  await check("5: the probe event arrived", async () => assert.ok(probe));
  if (probe) {
    const names = loginCrumbs(probe).map(b => b.message);
    await check("5: afterLogin ran twice (listener + handler) but they shared ONE run: one profile read", async () => {
      assert.equal(names.filter(n => n === "login_profile_read_start").length, 1, names.join(", "));
      assert.ok(names.includes("after_login_joined_in_flight"), names.join(", "));
      assert.equal(names.filter(n => n === "route").length, 1, "routed more than once");
    });
  }
  await ctx.close();
}

await browser.close();
stop();
console.log(`${passed} passed, ${failed.length} failed (WebKit, iPhone 14 profile, local emulators)`);
for (const f of failed) console.log(`  FAIL ${f}`);
process.exit(failed.length ? 1 : 0);
