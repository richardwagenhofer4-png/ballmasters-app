// Push-token checks for Build 1.1 step 8, in real WebKit (iPhone 14 profile)
// against the local emulators with fake data. The page is made to believe it is
// the 1.1 iPhone app by a small stand-in for Capacitor's iOS bridge: Google
// sign-in answers with a fake token the Auth emulator accepts, and the push
// plugin reports permission granted and the device token "phone-token-1".
// Sentry is intercepted; nothing leaves the machine.
//
//   B. An Apple/Google sign-in with NO Ball Masters account: the push token is
//      never written, so no users/{uid} document is created (it used to be, by a
//      setDoc merge, which then looked like a profile with no role). The person
//      gets the "no Ball Masters account" message.
//      Control: a real coach's token is still saved (fcmToken + fcmTokenSource).
//   C. Signing out removes this account's token (and only the token) while still
//      signed in; signing in as someone else puts the phone's token on THEM only;
//      signing back in saves it again; and a dead connection can't stop sign-out.
//
// Needs: npm i --no-save playwright && npx playwright install webkit; Java; Firebase CLI.
// Run:  node scripts/test-push-token.mjs      Ports: 9099, 8080, 3120

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
  stack = await startStack({ port: 3120 });
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

const TOKEN = "phone-token-1";

/** The 1.1 iPhone app, as far as these checks need it. */
function nativeStub(token) {
  window.webkit = { messageHandlers: { bridge: { postMessage() {} } } };
  window.Capacitor = {
    PluginHeaders: [
      { name: "Purchases", methods: [] },
      { name: "FirebaseMessaging", methods: ["checkPermissions", "requestPermissions", "getToken", "addListener"].map(name => ({ name, rtype: "promise" })) },
      { name: "FirebaseAuthentication", methods: [{ name: "signInWithGoogle", rtype: "promise" }, { name: "signInWithApple", rtype: "promise" }] },
    ],
    nativePromise: async (plugin, method) => {
      if (plugin === "FirebaseAuthentication" && method === "signInWithGoogle") {
        return { credential: { idToken: JSON.stringify({ sub: "google-push-1", email: "pushgoogle@example.test", email_verified: true }) } };
      }
      if (plugin === "FirebaseMessaging") {
        if (method === "checkPermissions" || method === "requestPermissions") return { receive: "granted" };
        if (method === "getToken") return { token };
        if (method === "addListener") return { remove: async () => {} };
      }
      return {};
    },
  };
}

const net = { blocked: false };
async function newNativeContext() {
  const ctx = await browser.newContext({ ...devices["iPhone 14"] });
  await ctx.addInitScript(nativeStub, TOKEN);
  await ctx.route(/127\.0\.0\.1:8080/, route => (net.blocked ? undefined : route.continue()));
  await ctx.route(/sentry\.io/, route => route.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  return ctx;
}

// --- reading the emulator the way an admin would (bypasses the rules) --------------------
const FS = "http://127.0.0.1:8080/v1/projects/demo-ballmasters/databases/(default)/documents";
const OWNER = { headers: { Authorization: "Bearer owner" } };
async function userDoc(uid) {
  const res = await fetch(`${FS}/users/${uid}`, OWNER);
  if (res.status === 404) return null;
  const j = await res.json();
  return Object.fromEntries(Object.entries(j.fields ?? {}).map(([k, v]) => [k, Object.values(v)[0]]));
}
async function allUserDocs() {
  const res = await fetch(`${FS}/users?pageSize=300`, OWNER);
  const j = await res.json();
  return (j.documents ?? []).map(d => ({ id: d.name.split("/").pop(), ...Object.fromEntries(Object.entries(d.fields ?? {}).map(([k, v]) => [k, Object.values(v)[0]])) }));
}
async function waitForDoc(uid, predicate, ms = 25000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const d = await userDoc(uid);
    if (predicate(d)) return d;
    await sleep(500);
  }
  return userDoc(uid);
}

async function openLogin(page) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForSelector('button[type="submit"]', { timeout: 180000 });
  await page.waitForTimeout(2500);
}
async function emailLogin(page, who) {
  await openLogin(page);
  await page.fill('input[type="email"]', who.email);
  await page.fill('input[type="password"]', who.password);
  await page.click('button[type="submit"]');
}
async function clickSignOut(page) {
  await page.getByRole("button", { name: /sign out/i }).first().click();
}

const ALICE = { email: "alice@example.test", password: "password1" };
const aliceUid = seeded.athletes["Alice Adams"];

// Warm the compile of the pages used below.
{
  const warm = await signedInPage(async () => (await newNativeContext()), BASE, COACH);
  if (!warm) throw new Error("could not sign in to the local app");
  await warm.page.goto(`${BASE}/coach/videos`, { waitUntil: "domcontentloaded", timeout: 180000 }).catch(() => {});
  await warm.page.waitForTimeout(2000);
  await warm.ctx.close();
  // The warm-up may have saved the token; start every check from a clean slate.
  await fetch(`${FS}/users/${seeded.coachUid}?updateMask.fieldPaths=fcmToken&updateMask.fieldPaths=fcmTokenSource`, {
    method: "PATCH", headers: { ...OWNER.headers, "content-type": "application/json" }, body: JSON.stringify({ fields: {} }),
  });
}

// ---- B. Apple/Google with no Ball Masters account ----------------------------------------
{
  const before = (await allUserDocs()).length;
  const ctx = await newNativeContext();
  const page = await ctx.newPage();
  await openLogin(page);
  const google = page.getByRole("button", { name: /google/i }).first();
  await google.waitFor({ state: "visible", timeout: 15000 });
  await google.click();
  await page.waitForSelector("text=/no Ball Masters account for this Google account/i", { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(12000); // long enough for the push bridge to have tried (and for the retry second)

  await check("B: the person gets the 'no Ball Masters account' message", async () => {
    assert.ok(await page.isVisible("text=/no Ball Masters account for this Google account/i"));
  });
  await check("B: no users document was created for them", async () => {
    const docs = await allUserDocs();
    assert.equal(docs.length, before, `users docs went from ${before} to ${docs.length}`);
  });
  await check("B: no users document anywhere holds a token without a role", async () => {
    const bad = (await allUserDocs()).filter(d => d.fcmToken && !d.role);
    assert.deepEqual(bad.map(d => d.id), []);
  });
  await check("B: no 'undefined' role was stored on the device", async () => {
    const [cached, cookies] = await page.evaluate(() => [localStorage.getItem("ballmasters_role"), document.cookie]);
    assert.equal(cached, null);
    assert.ok(!/undefined/.test(cookies), cookies);
  });
  await ctx.close();
}

// ---- B (control) + C: a real coach ---------------------------------------------------
{
  const ctx = await newNativeContext();
  const page = await ctx.newPage();
  await emailLogin(page, COACH);
  await page.waitForURL(/\/coach\//, { timeout: 120000 });
  const saved = await waitForDoc(seeded.coachUid, d => d?.fcmToken === TOKEN);
  await check("B control: a real coach's token is still saved (fcmToken + fcmTokenSource ios)", async () => {
    assert.equal(saved?.fcmToken, TOKEN);
    assert.equal(saved?.fcmTokenSource, "ios");
  });

  await page.goto(`${BASE}/coach/videos`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector("text=/\\d+ results?/", { timeout: 60000 });
  await clickSignOut(page);
  await page.waitForURL(/\/login/, { timeout: 30000 });
  const afterOut = await userDoc(seeded.coachUid);
  await check("C: signing out removed the token AND its source from the coach's profile", async () => {
    assert.equal(afterOut.fcmToken, undefined);
    assert.equal(afterOut.fcmTokenSource, undefined);
  });
  await check("C: ...and nothing else on the profile (role, name, email stay)", async () => {
    assert.equal(afterOut.role, "coach");
    assert.equal(afterOut.fullName, "Coach Carter");
    assert.equal(afterOut.email, COACH.email);
  });
  await check("C: the role cookies and cached role are cleared too", async () => {
    const [cached, cookies] = await page.evaluate(() => [localStorage.getItem("ballmasters_role"), document.cookie]);
    assert.equal(cached, null);
    assert.ok(!/ballmasters_role=(coach|admin|student)/.test(cookies), cookies);
  });

  // The same phone, a different account.
  await page.waitForSelector('button[type="submit"]', { timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.fill('input[type="email"]', ALICE.email);
  await page.fill('input[type="password"]', ALICE.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/student\//, { timeout: 120000 });
  const aliceDoc = await waitForDoc(aliceUid, d => d?.fcmToken === TOKEN);
  await check("C: the phone's token now sits on the NEW account…", async () => assert.equal(aliceDoc?.fcmToken, TOKEN));
  await check("C: …and not on the previous one, so the previous account's notifications don't reach this phone", async () => {
    const coach = await userDoc(seeded.coachUid);
    assert.equal(coach.fcmToken, undefined);
  });

  // Back to the coach: the token is saved again (the "already saved" marker was cleared at sign-out).
  await page.goto(`${BASE}/student/profile`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await clickSignOut(page);
  await page.waitForURL(/\/login/, { timeout: 30000 });
  await check("C: signing the student out removed the token from the student", async () => {
    const a = await userDoc(aliceUid);
    assert.equal(a.fcmToken, undefined);
    assert.equal(a.fcmTokenSource, undefined);
  });
  await page.waitForSelector('button[type="submit"]', { timeout: 60000 });
  await page.waitForTimeout(2500);
  await page.fill('input[type="email"]', COACH.email);
  await page.fill('input[type="password"]', COACH.password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/coach\//, { timeout: 120000 });
  const again = await waitForDoc(seeded.coachUid, d => d?.fcmToken === TOKEN);
  await check("C: signing back in saves the token again", async () => assert.equal(again?.fcmToken, TOKEN));
  await ctx.close();
}

// ---- C: a dead connection can't stop a sign-out ---------------------------------------------
{
  const ctx = await newNativeContext();
  const page = await ctx.newPage();
  await emailLogin(page, COACH);
  await page.waitForURL(/\/coach\//, { timeout: 120000 });
  await page.goto(`${BASE}/coach/videos`, { waitUntil: "domcontentloaded", timeout: 120000 });
  await page.waitForSelector("text=/\\d+ results?/", { timeout: 60000 });
  net.blocked = true; // Firestore stops answering
  const t0 = Date.now();
  await clickSignOut(page);
  const out = await page.waitForURL(/\/login/, { timeout: 15000 }).then(() => Date.now() - t0, () => null);
  await check("C: with Firestore unreachable, sign-out still completes (within ~5 s)", async () => {
    assert.ok(out !== null, "never reached /login");
    assert.ok(out <= 6000, `took ${out} ms`);
  });
  net.blocked = false;
  await ctx.close();
}

await browser.close();
stop();
console.log(`${passed} passed, ${failed.length} failed (WebKit, iPhone 14 profile, local emulators)`);
for (const f of failed) console.log(`  FAIL ${f}`);
process.exit(failed.length ? 1 : 0);
