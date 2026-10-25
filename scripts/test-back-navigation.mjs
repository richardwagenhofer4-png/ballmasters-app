// The back arrow on the video screens goes back to where you came from (Build
// 1.1 step 13). Real WebKit, iPhone 14 profile at 390 x 844, local emulators,
// fake data. The video API (/api/videos/<id>, which needs real storage keys) is
// answered by the test with fake links, so the screens render their headers.
//
// COACH (annotate, clips and drill screens): open a video from (a) the Videos
// tab, (b) an athlete's profile, (c) the dashboard, (d) directly by URL, and
// press Back: it lands on (a) the Videos tab, (b) that athlete's profile, (c) the
// dashboard, (d) /coach/videos. Also: after a reload, and after a push
// notification tap (both have no earlier screen in the app: /coach/videos); a
// drill and the clips screen; annotate -> clips -> Back -> Back walks back one
// screen at a time and does not loop; annotate redirecting a drill to its own
// screen does not trap Back; Back is labelled "Back" (aria-label), is still a
// link to the fallback, and going back does not add history entries.
// ATHLETE: open a video from Home, My Videos, a message link and directly by
// URL: Back lands on Home, My Videos, Messages, and /student/videos. "All videos"
// is now "Back".
//
// Needs: npm i --no-save playwright && npx playwright install webkit; Java; Firebase CLI.
// Run:  node scripts/test-back-navigation.mjs      Ports: 9099, 8080, 3127
//       BM_PRODUCTION=1 node scripts/test-back-navigation.mjs   against a production build

import assert from "node:assert/strict";
import { startStack, signedInPage } from "./fixtures/local-stack.mjs";
import { put } from "./fixtures/seed-coach-videos.mjs";
import { seedConversation } from "./fixtures/seed-conversation.mjs";
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
  stack = await startStack({ port: 3127 });
} catch (err) {
  console.log(err.message);
  process.exit(2);
}
const { BASE, COACH, seeded, stop } = stack;
const ALICE = { email: "alice@example.test", password: "password1" };
const aliceUid = seeded.athletes["Alice Adams"];

// A drill comparison for Alice (the seed has only ordinary videos).
await put("videos/vd", {
  coachId: seeded.coachUid, coachName: "Coach Carter", status: "published", downloadAllowed: false, type: "drill_comparison",
  title: "Drill: closeouts", studentIds: [aliceUid], viewedBy: [], createdAt: "2026-09-06T12:00:00.000Z",
  coachVideoKey: "c.mp4", studentVideoKey: "s.mp4", fileName: "x.mp4", layout: "side_by_side", syncPlayback: true,
});
await seedConversation(seeded, 3, { videoMessage: { id: "v1", title: "Footwork basics" } });

const STUB_VIDEO = "http://127.0.0.1:9/none.mp4"; // nothing listens there: the player just shows its error
const browser = await webkit.launch();
const makeContext = native => async () => {
  const ctx = await browser.newContext({ ...devices["iPhone 14"], viewport: { width: 390, height: 844 } });
  await ctx.route(/sentry\.io/, r => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await ctx.route(/\/api\/videos\/[^/?]+$/, route => {
    if (route.request().method() !== "GET") return route.continue();
    const id = new URL(route.request().url()).pathname.split("/").pop();
    const drill = id === "vd";
    return route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        id, title: drill ? "Drill: closeouts" : "Footwork basics", coachId: seeded.coachUid, coachName: "Coach Carter", status: "published",
        studentIds: [aliceUid], viewedBy: [], downloadAllowed: false, createdAt: "2026-09-01T12:00:00.000Z", fileName: "x.mp4", hasBreakdown: false,
        ...(drill ? { type: "drill_comparison", coachVideoUrl: STUB_VIDEO, studentVideoUrl: STUB_VIDEO } : { type: "standard", videoUrl: STUB_VIDEO }),
      }),
    });
  });
  if (native) await ctx.addInitScript(installNativeApp, native);
  return ctx;
};

let passed = 0;
const failed = [];
async function check(name, fn) {
  try { await fn(); passed++; } catch (err) { failed.push(`${name}: ${err.message.split("\n")[0]}`); }
}

const pathOf = page => new URL(page.url()).pathname;
const historyLength = page => page.evaluate(() => history.length);
const BACK = page => page.locator("main a").first(); // the first link in the top bar of every video screen
// The visible element showing a video's title (a title can also sit in a hidden element, such as a menu option).
const titleSel = title => `text="${title}" >> visible=true`;
const TITLE = (page, title) => page.locator(titleSel(title)).first();

/** Opens `start`, waits until the video titled `title` shows and React is hydrated (a link click before that is a full page load). */
async function open(page, start, title) {
  await page.goto(`${BASE}${start}`, { waitUntil: "domcontentloaded", timeout: 180000 });
  try {
    await TITLE(page, title).waitFor({ timeout: 60000 });
  } catch (err) {
    const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, " ").slice(0, 300)).catch(() => "?");
    throw new Error(`"${title}" never showed on ${start}: the page is at ${page.url()} and says: ${text}`);
  }
  await page.waitForTimeout(2500);
}

/** Presses Back on a video screen and returns where the app ended up, once it has left that screen. */
async function pressBack(page) {
  const videoPath = pathOf(page);
  await BACK(page).waitFor({ timeout: 120000 });
  await page.waitForTimeout(800); // the screen has finished loading
  await BACK(page).click();
  await page.waitForFunction(p => location.pathname !== p, videoPath, { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(500);
  return pathOf(page);
}

/** Opens `start`, taps the video titled `title` (a card or a link, as on that screen), checks it arrived at `videoHref`, presses Back, returns the result. */
async function openThenBack(page, start, title, videoHref) {
  await open(page, start, title);
  const before = await historyLength(page);
  await TITLE(page, title).click();
  await page.waitForURL(url => new URL(url).pathname === videoHref, { timeout: 180000 });
  const opened = await historyLength(page);
  const landed = await pressBack(page);
  return { landed, before, opened, after: await historyLength(page) };
}

// ---- the coach -------------------------------------------------------------------------------
{
  const signed = await signedInPage(makeContext(), BASE, COACH);
  if (!signed) throw new Error("could not sign in as the coach");
  const { ctx } = signed;
  const V1 = "Footwork basics";
  const V4 = "Team drill";
  const DRILL = "Drill: closeouts";

  const scenarios = [
    ["the Videos tab", "/coach/videos", V1, "/coach/videos/v1/annotate", "/coach/videos"],
    ["an athlete's profile", `/coach/students/${aliceUid}`, V1, "/coach/videos/v1/annotate", `/coach/students/${aliceUid}`],
    ["the dashboard", "/coach/dashboard", V4, "/coach/videos/v4/annotate", "/coach/dashboard"], // the dashboard lists only the five newest videos
    ["the Videos tab (a drill)", "/coach/videos", DRILL, "/coach/videos/vd/drill", "/coach/videos"],
    ["an athlete's profile (a drill)", `/coach/students/${aliceUid}`, DRILL, "/coach/videos/vd/drill", `/coach/students/${aliceUid}`],
  ];
  for (const [from, start, title, videoHref, expected] of scenarios) {
    const page = await ctx.newPage();
    const r = await openThenBack(page, start, title, videoHref);
    await check(`coach: video opened from ${from}: Back lands on ${expected}`, async () => assert.equal(r.landed, expected));
    await check(`coach: video opened from ${from}: Back goes back (it adds no history entry)`, async () => {
      assert.equal(r.opened, r.before + 1, "opening the video should add one entry");
      assert.equal(r.after, r.opened, `history grew from ${r.opened} to ${r.after}: Back pushed a new screen`);
    });
    await page.close();
  }

  // (d) directly by URL: no earlier screen in the app
  for (const [what, url, ready] of [
    ["annotate", "/coach/videos/v1/annotate", "main a"],
    ["drill", "/coach/videos/vd/drill", "main a"],
    ["clips", "/coach/videos/v1/clips", "main a"],
  ]) {
    const page = await ctx.newPage();
    await page.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await page.waitForSelector(ready, { timeout: 180000 });
    await page.waitForTimeout(2500);
    const landed = await pressBack(page);
    await check(`coach: ${what} opened directly by URL: Back lands on /coach/videos`, async () => assert.equal(landed, "/coach/videos"));
    await page.close();
  }

  // After a reload there is no earlier screen in the app, even though there is one in the browser's history.
  {
    const page = await ctx.newPage();
    await open(page, "/coach/dashboard", V4);
    await TITLE(page, V4).click();
    await page.waitForURL(/\/annotate$/, { timeout: 180000 });
    await page.waitForTimeout(2000);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForTimeout(2500);
    const landed = await pressBack(page);
    await check("coach: after a reload of the video screen, Back lands on /coach/videos (not the dashboard it came from)", async () => assert.equal(landed, "/coach/videos"));
    await page.close();
  }

  // Back stays a link to the fallback and is labelled "Back".
  for (const [what, url] of [["annotate", "/coach/videos/v1/annotate"], ["clips", "/coach/videos/v1/clips"], ["drill", "/coach/videos/vd/drill"]]) {
    const page = await ctx.newPage();
    await page.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await BACK(page).waitFor({ timeout: 180000 });
    const info = await BACK(page).evaluate(a => ({ label: a.getAttribute("aria-label"), text: a.textContent.trim(), href: a.getAttribute("href") }));
    await check(`coach: the ${what} arrow is labelled "Back" and its link target is /coach/videos`, async () => {
      assert.equal(info.label, "Back");
      assert.equal(info.text, "Back");
      assert.equal(info.href, "/coach/videos");
    });
    await page.close();
  }

  // Moving between one video's own screens: walks back one screen at a time, no loop.
  {
    const page = await ctx.newPage();
    await open(page, "/coach/videos", V1);
    await TITLE(page, V1).click();
    await page.waitForURL(/\/v1\/annotate$/, { timeout: 180000 });
    await BACK(page).waitFor({ timeout: 120000 });
    await page.waitForTimeout(1500);
    await page.evaluate(() => window.next.router.push("/coach/videos/v1/clips")); // annotate -> clips, inside the app
    await page.waitForURL(/\/v1\/clips$/, { timeout: 180000 });
    const fromClips = await pressBack(page);
    await check("coach: annotate -> clips -> Back returns to annotate (the screen before it)", async () => assert.equal(fromClips, "/coach/videos/v1/annotate"));
    const fromAnnotate = await pressBack(page);
    await check("coach: ...and Back again leaves the video for the Videos tab: no loop between the two", async () => assert.equal(fromAnnotate, "/coach/videos"));
    await page.close();
  }
  {
    // annotate sends a drill to its own screen with a replace, so Back from there is not sent into annotate again
    const page = await ctx.newPage();
    await open(page, "/coach/videos", V1);
    await page.evaluate(() => window.next.router.push("/coach/videos/vd/annotate"));
    await page.waitForURL(/\/vd\/drill$/, { timeout: 180000 });
    const landed = await pressBack(page);
    await check("coach: a drill opened through its annotate link: Back skips the redirect and lands on the Videos tab", async () => assert.equal(landed, "/coach/videos"));
    await page.close();
  }
  {
    // the clips screen opened from the Videos tab
    const page = await ctx.newPage();
    await open(page, `/coach/students/${aliceUid}`, V1);
    await page.evaluate(() => window.next.router.push("/coach/videos/v1/clips"));
    await page.waitForURL(/\/v1\/clips$/, { timeout: 180000 });
    const landed = await pressBack(page);
    await check("coach: clips opened from an athlete's profile: Back lands on that profile", async () => assert.equal(landed, `/coach/students/${aliceUid}`));
    await page.close();
  }
  await ctx.close();
}

// ---- the coach, in the iPhone app: a tapped push notification ---------------------------------
{
  const signed = await signedInPage(makeContext({ pushToken: "test-token", pushTaps: true }), BASE, COACH);
  if (!signed) throw new Error("could not sign in as the coach (native)");
  const { ctx, page } = signed;
  await page.goto(`${BASE}/coach/dashboard`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await TITLE(page, "Team drill").waitFor({ timeout: 180000 });
  await page.waitForTimeout(3000);
  const listening = await page.evaluate(() => (window.__nativeListeners?.notificationActionPerformed ?? []).length);
  await check("push: the app is listening for notification taps (test set-up)", async () => assert.ok(listening > 0, "no tap listener registered"));
  await page.evaluate(() => window.__fireNative("notificationActionPerformed", { notification: { data: { url: "/coach/videos/v4/annotate" } } }));
  await page.waitForURL(/\/v4\/annotate$/, { timeout: 180000 });
  const landed = await pressBack(page);
  await check("coach: video opened by tapping a push notification: Back lands on /coach/videos (not the dashboard under it)", async () => assert.equal(landed, "/coach/videos"));
  await ctx.close();
}

// ---- the athlete -----------------------------------------------------------------------------
{
  const signed = await signedInPage(makeContext(), BASE, ALICE, /\/student\//);
  if (!signed) throw new Error("could not sign in as the athlete");
  const { ctx } = signed;
  const scenarios = [
    ["Home", "/student/dashboard", "Footwork basics", "/student/videos/v1", "/student/dashboard"],
    ["My Videos", "/student/videos", "Footwork basics", "/student/videos/v1", "/student/videos"],
    ["a message link", "/student/messages", "Footwork basics", "/student/videos/v1", "/student/messages"],
    ["Home (a drill)", "/student/dashboard", "Drill: closeouts", "/student/videos/vd", "/student/dashboard"],
    ["My Videos (a drill)", "/student/videos", "Drill: closeouts", "/student/videos/vd", "/student/videos"],
  ];
  for (const [from, start, title, videoHref, expected] of scenarios) {
    const page = await ctx.newPage();
    const r = await openThenBack(page, start, title, videoHref);
    await check(`athlete: video opened from ${from}: Back lands on ${expected}`, async () => assert.equal(r.landed, expected));
    await check(`athlete: video opened from ${from}: Back goes back (it adds no history entry)`, async () => {
      assert.equal(r.after, r.opened, `history grew from ${r.opened} to ${r.after}: Back pushed a new screen`);
    });
    await page.close();
  }
  for (const [what, url] of [["a video", "/student/videos/v1"], ["a drill", "/student/videos/vd"]]) {
    const page = await ctx.newPage();
    await page.goto(`${BASE}${url}`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await BACK(page).waitFor({ timeout: 180000 });
    const info = await BACK(page).evaluate(a => ({ text: a.textContent.trim(), href: a.getAttribute("href") }));
    await check(`athlete: ${what} opened directly by URL: the arrow reads "Back" (not "All videos") and links to /student/videos`, async () => {
      assert.equal(info.text, "Back");
      assert.equal(info.href, "/student/videos");
    });
    const landed = await pressBack(page);
    await check(`athlete: ${what} opened directly by URL: Back lands on /student/videos`, async () => assert.equal(landed, "/student/videos"));
    await page.close();
  }
  await ctx.close();
}

await browser.close();
stop();
console.log(`${passed} passed, ${failed.length} failed (WebKit, iPhone 14 profile at 390x844, local emulators${process.env.BM_PRODUCTION ? ", production build" : ""})`);
for (const f of failed) console.log(`  FAIL ${f}`);
process.exit(failed.length ? 1 : 0);
