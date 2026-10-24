// A profile that is REALLY missing must behave as it always did, just about a
// second later (Build 1.1 bug 2: the app now looks twice before believing
// "missing"). Real WebKit, iPhone 14 profile, local emulators, fake data;
// Sentry is intercepted, nothing leaves the machine.
//
//   Email:  a signed-in account with no profile document is sent to
//           /incomplete-profile (the app's own navigation request to it is what
//           is observed), after the retry, and the trace says the retry also
//           found nothing.
//   Social: an Apple/Google account with no Ball Masters profile is signed out
//           and shown "There's no Ball Masters account for this Google account
//           yet…", after the retry. The native Google sheet is faked by a small
//           stand-in for Capacitor's iOS bridge (scripts/fixtures/native-app.mjs); the Auth
//           emulator accepts the fake Google ID token it hands back.
//
// Needs: npm i --no-save playwright && npx playwright install webkit; Java; Firebase CLI.
// Run:  node scripts/test-profile-missing.mjs      Ports: 9099, 8080, 3117

import assert from "node:assert/strict";
import { startStack } from "./fixtures/local-stack.mjs";
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
  stack = await startStack({ port: 3117 });
} catch (err) {
  console.log(err.message);
  process.exit(2);
}
const { BASE, stop } = stack;

const browser = await webkit.launch();
let passed = 0;
const failed = [];
async function check(name, fn) {
  try { await fn(); passed++; } catch (err) { failed.push(`${name}: ${err.message.split("\n")[0]}`); }
}

// An Auth account that has no users/{uid} document at all.
const NO_PROFILE = { email: "noprofile@example.test", password: "password1" };
{
  const res = await fetch("http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...NO_PROFILE, returnSecureToken: true }),
  });
  if (!res.ok) throw new Error(`could not create the no-profile account: ${await res.text()}`);
}

async function newContext(withNativeStub) {
  const ctx = await browser.newContext({ ...devices["iPhone 14"] });
  const events = [];
  await ctx.route(/sentry\.io/, async route => {
    for (const line of (route.request().postData() ?? "").split("\n")) {
      try { const j = JSON.parse(line); if (j && (j.message || j.logentry)) events.push(j); } catch { /* not JSON */ }
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: "{}" });
  });
  if (withNativeStub) await ctx.addInitScript(installNativeApp, { googleSub: "google-no-profile-1", googleEmail: "nogoogleprofile@example.test" });
  return { ctx, events };
}
const eventText = e => (e.message?.formatted ?? e.message ?? e.logentry?.formatted ?? e.logentry?.message ?? "");

// Warm the compile of /login and its neighbours so the timings below are about the app, not the dev server.
{
  const { ctx } = await newContext(false);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForSelector('button[type="submit"]', { timeout: 180000 });
  await page.goto(`${BASE}/incomplete-profile`, { waitUntil: "domcontentloaded", timeout: 180000 }).catch(() => {});
  await ctx.close();
}

// ---- Email -----------------------------------------------------------------
{
  const { ctx, events } = await newContext(false);
  const page = await ctx.newPage();
  const seen = [];
  page.on("request", r => { if (/\/incomplete-profile/.test(r.url())) seen.push(Date.now()); });
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForSelector('button[type="submit"]', { timeout: 180000 });
  await page.waitForTimeout(2500);
  await page.fill('input[type="email"]', NO_PROFILE.email);
  await page.fill('input[type="password"]', NO_PROFILE.password);
  const clickedAt = Date.now();
  await page.click('button[type="submit"]');
  await page.waitForTimeout(6000);

  await check("email: the app still navigates to /incomplete-profile", async () => assert.ok(seen.length > 0, "no navigation to /incomplete-profile"));
  await check("email: ...about a second later (it looked twice first), not at once and not much later", async () => {
    const waited = seen[0] - clickedAt;
    assert.ok(waited >= 900, `went after only ${waited} ms`);
    assert.ok(waited <= 5000, `took ${waited} ms`);
  });
  const trace = await page.evaluate(() => localStorage.getItem("bm_login_trace"));
  const steps = trace ? JSON.parse(trace).steps : [];
  await check("email: the trace shows the retry started and found nothing", async () => {
    const names = steps.map(s => s.s);
    assert.ok(names.includes("profile_retry_start"), names.join(", "));
    const r = steps.find(s => s.s === "profile_retry");
    assert.ok(r, "no profile_retry step");
    assert.equal(r.d.retryExists, false);
    assert.ok(names.includes("profile_missing_going_to_incomplete_profile"));
  });
  await check("email: a genuinely missing profile is not reported as 'rescued by the retry'", async () => {
    assert.deepEqual(events.filter(e => /profile_retry_rescued/.test(eventText(e))).map(eventText), []);
  });
  await ctx.close();
}

// ---- Social (Google, in the 1.1 app) --------------------------------------------
{
  const { ctx, events } = await newContext(true);
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(String(e.message)));
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForSelector('button[type="submit"]', { timeout: 180000 });
  await page.waitForTimeout(2500);
  const googleButton = page.getByRole("button", { name: /google/i }).first();
  await check("social: the Google button is offered (the page believes it is the 1.1 app)", async () => {
    await googleButton.waitFor({ state: "visible", timeout: 10000 });
  });
  const clickedAt = Date.now();
  await googleButton.click().catch(() => {});
  let shownAfter = null;
  try {
    await page.waitForSelector("text=/no Ball Masters account for this Google account/i", { timeout: 15000 });
    shownAfter = Date.now() - clickedAt;
  } catch { /* checked below */ }

  await check("social: still shows the 'no Ball Masters account' message", async () => assert.ok(shownAfter !== null, "message never appeared"));
  await check("social: ...about a second later, not at once", async () => assert.ok(shownAfter >= 900, `shown after ${shownAfter} ms`));
  await check("social: the account is signed out again, and the retry found nothing", async () => {
    const trace = await page.evaluate(() => localStorage.getItem("bm_login_trace"));
    const names = (trace ? JSON.parse(trace).steps : []).map(s => s.s);
    // abandon() ends the session on purpose, which clears the saved trace; read the live trail from the Sentry breadcrumbs instead.
    if (names.length) assert.ok(names.includes("social_no_account_signed_out"));
    const signedIn = await page.evaluate(() => new Promise(resolve => {
      const req = indexedDB.open("firebaseLocalStorageDb");
      req.onerror = () => resolve(false);
      req.onsuccess = () => {
        try {
          const tx = req.result.transaction("firebaseLocalStorage", "readonly");
          const all = tx.objectStore("firebaseLocalStorage").getAll();
          all.onsuccess = () => resolve(all.result.some(r => String(r.fbase_key).startsWith("firebase:authUser")));
          all.onerror = () => resolve(false);
        } catch { resolve(false); }
      };
    }));
    assert.equal(signedIn, false, "the Google account is still signed in");
  });
  await check("social: no 'rescued' report for a genuinely missing profile", async () => {
    assert.deepEqual(events.filter(e => /profile_retry_rescued/.test(eventText(e))).map(eventText), []);
  });
  await ctx.close();
}

await browser.close();
stop();
console.log(`${passed} passed, ${failed.length} failed (WebKit, iPhone 14 profile, local emulators)`);
for (const f of failed) console.log(`  FAIL ${f}`);
process.exit(failed.length ? 1 : 0);
