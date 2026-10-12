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
// (The emulators, data and dev server come from scripts/fixtures/local-stack.mjs.)

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
  stack = await startStack({ port: 3115 });
} catch (err) {
  console.log(err.message);
  process.exit(2);
}
const { BASE, COACH, stop: stopAll } = stack;

// The checks.
const browser = await webkit.launch();
const makeContext = async () => {
  const ctx = await browser.newContext({ ...devices["iPhone 14"] });
  await ctx.route(/sentry\.io/, r => r.abort());
  return ctx;
};
const signedIn = await signedInPage(makeContext, BASE, COACH);
if (!signedIn) throw new Error("could not sign in to the local app");
const { page } = signedIn;

let passed = 0;
const failed = [];
async function check(name, fn) {
  try { await fn(); passed++; } catch (err) { failed.push(`${name}: ${err.message.split("\n")[0]}`); }
}

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
