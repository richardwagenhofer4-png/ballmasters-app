// Reproduction harness for Build 1.1 bug 2 ("empty profile right after login"):
// signs the seeded coach in through the real login form on a FRESH local stack
// (emulators + dev server) N times and reports how often the first profile read
// comes back "missing" and the person is stranded on /login.
//
// Finding (see §11 of BUILD-1.1-STEP2-REPORT.md): against the local emulators in
// WebKit, about a quarter to a half of first sign-ins fail this way, and none do
// when AuthContext's sign-in "last active" write is suppressed (SUPPRESS=1).
// Nothing here fixes anything; it only measures.
//
// Needs: npm i --no-save playwright && npx playwright install webkit; Java; Firebase CLI.
// Run:  N=12 node scripts/repro-profile-missing-after-login.mjs
//       N=12 SUPPRESS=1 node scripts/repro-profile-missing-after-login.mjs
//       ENGINE=chrome ...   (Chrome with the iPhone profile instead of WebKit)

import { startStack } from "./fixtures/local-stack.mjs";

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
  await ctx.route(/sentry\.io/, r => r.fulfill({ status: 200, body: "{}" }));
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
  console.log(`${engine}${suppress ? " (last-active write suppressed)" : ""} run ${i}/${N}: ${ok ? "signed in" : `STRANDED on ${path}`} ${note}`);
  await browser.close();
  stop();
  await new Promise(r => setTimeout(r, 5000)); // let the ports free up
}
console.log(`\n${stranded} of ${N} first sign-ins ended stranded on the login flow`);
