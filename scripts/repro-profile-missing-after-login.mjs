// Reproduction harness for Build 1.1 bug 2 ("empty profile right after login"):
// signs the seeded coach in through the real login form on a FRESH local stack
// (emulators + dev server) N times and reports how often the first profile read
// comes back "missing" and the person is stranded on /login.
//
// History (BUILD-1.1-STEP2-REPORT.md §11, §12): before the fix, 6 of 20 first
// sign-ins ended stranded; with the fix, 0 of 20. The script only measures.
// "Suppress" simulates the old workaround of skipping AuthContext's write.
//
// Needs: npm i --no-save playwright && npx playwright install webkit; Java; Firebase CLI.
// Run:  N=12 node scripts/repro-profile-missing-after-login.mjs
//       N=12 SUPPRESS=1 node scripts/repro-profile-missing-after-login.mjs
//       NATIVE=1 ...        as the 1.1 iPhone app does it: with push permission granted, so the
//                           app also saves a push token at sign-in (the old code strands EVERY one)
//       ENGINE=chrome ...   (Chrome with the iPhone profile instead of WebKit)

import { startStack } from "./fixtures/local-stack.mjs";
import { installNativeApp } from "./fixtures/native-app.mjs";

let playwright;
try {
  playwright = await import("playwright");
} catch {
  console.log("Playwright isn't installed. Run: npm i --no-save playwright && npx playwright install webkit");
  process.exit(2);
}
const { webkit, chromium, devices } = playwright;
const engine = process.env.ENGINE ?? "webkit";
const N = Number(process.env.N ?? 6);
const suppress = Boolean(process.env.SUPPRESS);

let stranded = 0;
let rescued = 0; // sign-ins where the retry found a profile the first read called missing
for (let i = 1; i <= N; i++) {
  let stack;
  try {
    stack = await startStack({ port: 3116 });
  } catch (err) {
    console.log(err.message);
    process.exit(2);
  }
  const { BASE, COACH, stop, seeded } = stack;
  const browser = engine === "webkit" ? await webkit.launch() : await chromium.launch({ channel: "chrome" });
  const ctx = await browser.newContext({ ...devices["iPhone 14"] });
  let sawRescue = false;
  await ctx.route(/sentry\.io/, r => {
    // Sentry is answered here, nothing is sent. A "profile_retry_rescued" event means the retry saved this sign-in.
    if ((r.request().postData() ?? "").includes("profile_retry_rescued")) sawRescue = true;
    return r.fulfill({ status: 200, body: "{}" });
  });
  if (process.env.NATIVE) await ctx.addInitScript(installNativeApp, { pushToken: "repro-token" });
  if (suppress) {
    // Pretend AuthContext's once-a-day "last active" write already happened,
    // so it doesn't start at the moment of sign-in.
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    await ctx.addInitScript(([k, v]) => localStorage.setItem(k, v), [`lastActiveWrite:${seeded.coachUid}`, today]);
  }
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('button[type="submit"]', { timeout: 120000 });
  await page.waitForTimeout(2500);
  await page.fill('input[type="email"]', COACH.email);
  await page.fill('input[type="password"]', COACH.password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(14000);

  const path = new URL(page.url()).pathname;
  const ok = path.startsWith("/coach/");
  if (!ok) stranded++;
  const trace = await page.evaluate(() => localStorage.getItem("bm_login_trace")).catch(() => null);
  const note = !ok && trace
    ? JSON.parse(trace).steps.filter(s => /snapshot|recheck/.test(s.s)).map(s => `${s.s}${JSON.stringify(s.d)}`).join(" | ")
    : "";
  if (sawRescue) rescued++;
  console.log(`${engine}${suppress ? " (last-active write suppressed)" : ""} run ${i}/${N}: ${ok ? "signed in" : `STRANDED on ${path}`}${sawRescue ? " (the retry found the profile)" : ""} ${note}`);
  await browser.close();
  stop();
  await new Promise(r => setTimeout(r, 5000)); // let the ports free up
}
console.log(`\n${stranded} of ${N} first sign-ins ended stranded on the login flow`);
console.log(`${rescued} of ${N} first sign-ins were saved by the profile retry (only possible on code that has it)`);
