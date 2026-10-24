// End-to-end check of the login tracer (Build 1.1 bug 2 diagnostics) in a real
// browser: WebKit with Playwright's iPhone 14 profile, against the LOCAL
// emulators with fake data. Sentry is intercepted: every envelope the page
// would send is captured here and answered 200, nothing leaves the machine.
//
//   A. a healthy sign-in reaches the dashboard, leaves an ordered trail of
//      "login" breadcrumbs with no personal data, and sends NO stall event;
//   B. a sign-in whose Firestore calls hang sends ONE Sentry event within ~12 s
//      ("Login did not finish within 10 seconds") with the trace attached;
//   C. a login that is cut off (page closed at 4 s) is reported by the NEXT
//      launch as "Previous login never finished".
//
// Needs (none of it is in package.json):
//   npm i --no-save playwright && npx playwright install webkit
//   Java 11+ and the Firebase CLI on PATH
// Run:  node scripts/test-login-trace.mjs     Ports: 9099, 8080, 3116
//       SHOW_EVENTS=1 node scripts/test-login-trace.mjs   also prints an example stall event

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
  stack = await startStack({ port: 3116 });
} catch (err) {
  console.log(err.message);
  process.exit(2);
}
const { BASE, COACH, seeded, stop } = stack;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await webkit.launch();
let passed = 0;
const failed = [];
async function check(name, fn) {
  try { await fn(); passed++; } catch (err) { failed.push(`${name}: ${err.message.split("\n")[0]}`); }
}

/** A fresh browser context whose Sentry traffic is captured instead of sent. */
async function newContext() {
  const ctx = await browser.newContext({ ...devices["iPhone 14"] });
  const events = [];
  await ctx.route(/sentry\.io/, async route => {
    const body = route.request().postData() ?? "";
    for (const line of body.split("\n")) {
      try {
        const j = JSON.parse(line);
        if (j && (j.message || j.logentry || j.exception || j.breadcrumbs)) events.push(j);
      } catch { /* not a JSON line */ }
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  return { ctx, events };
}
const eventText = e => (e.message?.formatted ?? e.message ?? e.logentry?.formatted ?? e.logentry?.message ?? "");
const loginCrumbs = e => (Array.isArray(e.breadcrumbs) ? e.breadcrumbs : e.breadcrumbs?.values ?? []).filter(b => b.category === "login");

async function openLogin(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForSelector('button[type="submit"]', { timeout: 180000 });
  await page.waitForTimeout(2500); // let React hydrate
}
async function submitLogin(page) {
  await page.fill('input[type="email"]', COACH.email);
  await page.fill('input[type="password"]', COACH.password);
  await page.click('button[type="submit"]');
}

// Warm the compile of the pages used below (and get past the first-login-after-cold-start
// flake, see signedInPage), so the timed scenarios aren't skewed by it.
{
  const warm = await signedInPage(async () => (await newContext()).ctx, BASE, COACH);
  if (!warm) throw new Error("could not sign in to the local app");
  await warm.page.waitForTimeout(3000);
  await warm.ctx.close();
}

// ---- A. healthy login ------------------------------------------------------
{
  const { ctx, events } = await newContext();
  const page = await ctx.newPage();
  await openLogin(page);
  await submitLogin(page);
  await page.waitForURL(/\/coach\/dashboard/, { timeout: 120000 });
  await page.waitForSelector("text=Coach Carter", { timeout: 60000 }).catch(() => {});
  await sleep(13000); // longer than the 10 s watchdog

  await check("A: no stall event for a healthy sign-in", async () => {
    assert.deepEqual(events.filter(e => /did not finish|never finished/i.test(eventText(e))).map(eventText), []);
  });
  await check("A: the saved trace is cleared once login completes", async () => {
    assert.equal(await page.evaluate(() => localStorage.getItem("bm_login_trace")), null);
  });

  // Make Sentry send an event so the breadcrumb trail can be inspected.
  await page.evaluate(() => { setTimeout(() => { throw new Error("trace-probe"); }, 0); });
  await sleep(2500);
  const probe = events.find(e => JSON.stringify(e).includes("trace-probe"));
  await check("A: the probe event arrived", async () => assert.ok(probe, "no probe event captured"));
  if (probe) {
    const names = loginCrumbs(probe).map(b => b.message);
    await check("A: breadcrumbs cover sign-in → auth state → profile → first query → complete, in order", async () => {
      // afterLogin is single-flight now: the auth listener's run starts it, the submit handler's run
      // joins it ("after_login_joined_in_flight"), so "after_login" itself appears once, early.
      const want = ["begin", "signin_start", "signin_ok", "route", "coach_layout_profile_ok", "profile_loaded", "coach_dash_videos_query_ok", "first_query_loaded", "complete"];
      assert.ok(names.includes("after_login"), names.join(", "));
      let from = 0;
      for (const w of want) {
        const at = names.indexOf(w, from);
        assert.ok(at >= 0, `missing "${w}" after position ${from}; got: ${names.join(", ")}`);
        from = at + 1;
      }
      assert.ok(names.includes("auth_state"));
    });
    await check("A: steps carry timings", async () => {
      assert.ok(loginCrumbs(probe).filter(b => !["begin", "complete"].includes(b.message)).every(b => typeof b.data?.t === "number"));
    });
    await check("A: login breadcrumbs hold no email, name or raw uid", async () => {
      const text = JSON.stringify(loginCrumbs(probe));
      for (const bad of [COACH.email, "Coach Carter", "coach@", seeded.coachUid]) assert.ok(!text.includes(bad), `found ${bad}`);
    });
  }
  await ctx.close();
}

// ---- B. Firestore hangs after sign-in → stall event ---------------------------
{
  const { ctx, events } = await newContext();
  await ctx.route(/127\.0\.0\.1:8080/, () => { /* never answered: the call just hangs */ });
  const page = await ctx.newPage();
  await openLogin(page);
  await submitLogin(page);
  await sleep(16000);

  const stall = events.filter(e => /did not finish within 10 seconds/.test(eventText(e)));
  await check("B: exactly one stall event, sent about 10 s after sign-in", async () => assert.equal(stall.length, 1, `got ${stall.length}`));
  if (stall[0] && process.env.SHOW_EVENTS) console.log(`\nExample Sentry event (scenario B):\n  message: ${eventText(stall[0])}\n  tags: ${JSON.stringify(stall[0].tags)}\n${String(stall[0].extra?.trace).split("\n").map(l => "  | " + l).join("\n")}\n`);
  if (stall[0]) {
    const e = stall[0];
    await check("B: it names what is missing", async () => assert.equal(e.tags?.["login.missing"], "profile+first_query"));
    await check("B: it carries the step trace (sign-in ok, profile read started)", async () => {
      const trace = String(e.extra?.trace ?? "");
      for (const w of ["begin", "signin_ok", "after_login"]) assert.ok(trace.includes(w), `missing ${w}; got ${trace.slice(0, 300)}`);
    });
    await check("B: the trace holds no email, name or raw uid", async () => {
      const text = JSON.stringify(e);
      for (const bad of [COACH.email, "Coach Carter", seeded.coachUid]) assert.ok(!text.includes(bad), `found ${bad}`);
    });
  }
  await ctx.close();
}

// ---- C. login cut off → next launch reports it --------------------------------
{
  const { ctx, events } = await newContext();
  await ctx.route(/127\.0\.0\.1:8080/, () => { /* hang */ });
  const first = await ctx.newPage();
  await openLogin(first);
  await submitLogin(first);
  await sleep(4000);
  await first.close(); // the app is closed / killed mid-login: its 10 s timer never fires
  await sleep(9000);   // the saved trace is now older than the 12 s the next launch waits for
  await ctx.unroute(/127\.0\.0\.1:8080/);
  const second = await ctx.newPage();
  await second.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await sleep(6000);

  const prev = events.filter(e => /never finished/.test(eventText(e)));
  await check("C: the next launch reports the unfinished login once", async () => assert.equal(prev.length, 1, `got ${prev.length}`));
  if (prev[0]) {
    await check("C: tagged previous-launch, trace ends at the cut-off", async () => {
      assert.equal(prev[0].tags?.["login.stage"], "previous-launch");
      assert.ok(String(prev[0].extra.trace).trim().split("\n").at(-1).includes("previous_launch_ended_here"));
    });
  }
  await ctx.close();
}

await browser.close();
stop();
console.log(`${passed} passed, ${failed.length} failed (WebKit, iPhone 14 profile, local emulators, Sentry intercepted)`);
for (const f of failed) console.log(`  FAIL ${f}`);
process.exit(failed.length ? 1 : 0);
