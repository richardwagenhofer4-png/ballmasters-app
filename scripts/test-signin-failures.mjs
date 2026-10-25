// What a failed sign-in shows and what Sentry hears (Build 1.1 step 9, problems
// 2 and 3). Real WebKit with the iPhone 14 profile, local emulators, fake data;
// Sentry is intercepted, nothing leaves the machine. (Evidence only: nothing is
// retried; the checks are about the message and the report.)
//
//   Email
//     - wrong password: "Incorrect password." / "Invalid email or password.", and Sentry hears NOTHING
//       (a credential answer is the person's own answer).
//     - the network fails (the Auth server can't be reached): "Couldn't reach
//       Ball Masters. Check your connection and try again." and never
//       "unexpected"; Sentry gets "Login: signin_failed" with the code, the
//       elapsed ms and whether the phone thought it was online.
//     - the server answers with an internal error: the generic message, and the
//       same Sentry event with that code.
//   Apple/Google (the 1.1 app, faked: scripts/fixtures/native-app.mjs)
//     - the sheet fails with a network error: the same message and event.
//     - the person closes the sheet: nothing shown, nothing reported.
//     - the person spends 12 s on the sheet, then signs in with an account that
//       has no profile: NO "Login did not finish within 10 seconds" event (the
//       10 s timer starts when the sheet hands back an account); the "no Ball
//       Masters account" message appears.
//
// Needs: npm i --no-save playwright && npx playwright install webkit; Java; Firebase CLI.
// Run:  node scripts/test-signin-failures.mjs      Ports: 9099, 8080, 3123

import assert from "node:assert/strict";
import { startStack, signedInPage } from "./fixtures/local-stack.mjs";
import { installNativeApp } from "./fixtures/native-app.mjs";

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
  stack = await startStack({ port: 3123 });
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

async function newContext(nativeConfig) {
  const ctx = await browser.newContext({ ...devices["iPhone 14"] });
  const events = [];
  await ctx.route(/sentry\.io/, async route => {
    for (const line of (route.request().postData() ?? "").split("\n")) {
      try { const j = JSON.parse(line); if (j && (j.message || j.logentry)) events.push(j); } catch { /* not JSON */ }
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  if (nativeConfig) await ctx.addInitScript(installNativeApp, nativeConfig);
  return { ctx, events };
}
const eventText = e => (e.message?.formatted ?? e.message ?? e.logentry?.formatted ?? e.logentry?.message ?? "");
const loginEvents = events => events.filter(e => /^Login/.test(eventText(e)));

async function openLogin(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForSelector('button[type="submit"]', { timeout: 180000 });
  await page.waitForTimeout(2500);
}
async function submitEmail(page, email, password) {
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
}
const bannerText = page => page.locator("div.bg-red-50").first().innerText({ timeout: 8000 }).catch(() => "");

const NETWORK = "Couldn’t reach Ball Masters. Check your connection and try again.";

// Warm the compile and get past the first-login flake.
{
  const warm = await signedInPage(async () => (await newContext()).ctx, BASE, COACH);
  if (!warm) throw new Error("could not sign in to the local app");
  await warm.ctx.close();
}

// ---- Email ----------------------------------------------------------------------------
{
  const { ctx, events } = await newContext();
  const page = await ctx.newPage();
  await openLogin(page);
  await submitEmail(page, COACH.email, "not-the-password");
  const text = await bannerText(page);
  await page.waitForTimeout(1500);
  await check("email: wrong password -> the credential message (the emulator says 'Incorrect password.')", async () => assert.match(text, /Incorrect password\.|Invalid email or password\./));
  await check("email: ...and Sentry hears nothing (it is the person's own answer)", async () => assert.deepEqual(loginEvents(events).map(eventText), []));
  await ctx.close();
}
{
  const { ctx, events } = await newContext();
  await ctx.route(/127\.0\.0\.1:9099/, route => route.abort());
  const page = await ctx.newPage();
  await openLogin(page);
  await submitEmail(page, COACH.email, COACH.password);
  const text = await bannerText(page);
  await page.waitForTimeout(2000);
  await check("email: network failure -> 'Couldn't reach Ball Masters…', not 'unexpected'", async () => {
    assert.ok(text.includes(NETWORK), text);
    assert.ok(!/unexpected/i.test(text), text);
  });
  const e = loginEvents(events).find(x => /signin_failed/.test(eventText(x)));
  await check("email: network failure -> Sentry hears 'signin_failed' (warning)", async () => {
    assert.ok(e, `events: ${events.map(eventText).join(" | ")}`);
    assert.equal(e.level, "warning");
  });
  await check("email: ...with the code, the elapsed ms and navigator.onLine", async () => {
    const trace = String(e?.extra?.trace ?? "");
    assert.match(trace, /code=auth\/network-request-failed/);
    assert.match(trace, /elapsedMs=\d+/);
    assert.match(trace, /online=true/);
  });
  await ctx.close();
}
{
  const { ctx, events } = await newContext();
  await ctx.route(/127\.0\.0\.1:9099.*accounts:signInWithPassword/, route =>
    route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: { code: 500, message: "INTERNAL_ERROR", errors: [{ message: "INTERNAL_ERROR" }] } }) }));
  const page = await ctx.newPage();
  await openLogin(page);
  await submitEmail(page, COACH.email, COACH.password);
  const text = await bannerText(page);
  await page.waitForTimeout(2000);
  await check("email: an internal error -> the generic message", async () => assert.match(text, /An unexpected error occurred/));
  await check("email: ...and Sentry hears it with the code (auth/internal-error)", async () => {
    const e = loginEvents(events).find(x => /signin_failed/.test(eventText(x)));
    assert.ok(e, `events: ${events.map(eventText).join(" | ")}`);
    assert.match(String(e.extra.trace), /code=auth\/internal-error/);
  });
  await ctx.close();
}

// ---- Apple/Google ------------------------------------------------------------------------
const GOOGLE = { googleSub: "google-fail-1", googleEmail: "failgoogle@example.test" };
async function googleButton(page) {
  const b = page.getByRole("button", { name: /google/i }).first();
  await b.waitFor({ state: "visible", timeout: 15000 });
  return b;
}
{
  const { ctx, events } = await newContext({ ...GOOGLE, googleError: "auth/network-request-failed" });
  const page = await ctx.newPage();
  await openLogin(page);
  await (await googleButton(page)).click();
  const text = await bannerText(page);
  await page.waitForTimeout(2000);
  await check("social: the sheet fails on the network -> 'Couldn't reach Ball Masters…'", async () => assert.ok(text.includes(NETWORK), text));
  await check("social: ...and Sentry hears 'social_signin_failed' with the code", async () => {
    const e = loginEvents(events).find(x => /social_signin_failed/.test(eventText(x)));
    assert.ok(e, `events: ${events.map(eventText).join(" | ")}`);
    assert.match(String(e.extra.trace), /code=auth\/network-request-failed/);
  });
  await ctx.close();
}
{
  const { ctx, events } = await newContext({ ...GOOGLE, googleCancel: true });
  const page = await ctx.newPage();
  await openLogin(page);
  await (await googleButton(page)).click();
  await page.waitForTimeout(3000);
  await check("social: closing the sheet shows nothing and reports nothing", async () => {
    assert.equal(await page.locator("div.bg-red-50").count(), 0);
    assert.deepEqual(loginEvents(events).map(eventText), []);
  });
  await ctx.close();
}
{
  const { ctx, events } = await newContext({ ...GOOGLE, googleDelayMs: 12000 });
  const page = await ctx.newPage();
  await openLogin(page);
  await (await googleButton(page)).click();
  await sleep(11000); // past the old 10 s stall timer, sheet still open
  const during = loginEvents(events).map(eventText);
  await page.waitForSelector("text=/no Ball Masters account for this Google account/i", { timeout: 30000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await check("social: 12 s on the sheet raises no 'Login did not finish within 10 seconds'", async () => {
    assert.deepEqual(during, []);
    assert.deepEqual(loginEvents(events).filter(e => /did not finish/.test(eventText(e))).map(eventText), []);
  });
  await check("social: ...and when the sheet hands back an account with no profile, the usual message appears", async () => {
    assert.ok(await page.isVisible("text=/no Ball Masters account for this Google account/i"));
  });
  await ctx.close();
}

await browser.close();
stop();
console.log(`${passed} passed, ${failed.length} failed (WebKit, iPhone 14 profile, local emulators)`);
for (const f of failed) console.log(`  FAIL ${f}`);
process.exit(failed.length ? 1 : 0);
