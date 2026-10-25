// In a conversation, the header stays pinned at the top and the typing bar
// stays pinned above the bottom menu while the messages scroll (Build 1.1 step
// 10). Both screens: the athlete's (/student/messages) and the coach's
// (/coach/messages, thread open). Real WebKit, iPhone 14 profile with a
// 390 x 844 viewport, local emulators, a 70-message conversation of fake data.
//
// Checked on each screen: the conversation is long; the page itself does not
// scroll; scrolling the messages up leaves the header exactly where it was and
// fully visible (top of the screen, never above it); the typing bar stays put,
// below the header and above the bottom menu; the header's safe-area padding is
// INLINE on the element (env(safe-area-inset-top)) and its padding is at least
// the 3rem it always had (safe-area insets are 0 in desktop WebKit, so only the
// declaration can be checked here, not a real notch).
//
// Needs: npm i --no-save playwright && npx playwright install webkit; Java; Firebase CLI.
// Run:  node scripts/test-message-header.mjs      Ports: 9099, 8080, 3125
//       SHOT_DIR=/some/dir node scripts/test-message-header.mjs   also saves a screenshot of each screen scrolled up

import assert from "node:assert/strict";
import { startStack, signedInPage } from "./fixtures/local-stack.mjs";
import { seedConversation } from "./fixtures/seed-conversation.mjs";

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
  stack = await startStack({ port: 3125 });
} catch (err) {
  console.log(err.message);
  process.exit(2);
}
const { BASE, COACH, seeded, stop } = stack;
const ALICE = { email: "alice@example.test", password: "password1" };

const MESSAGES = 70;
await seedConversation(seeded, MESSAGES);

const browser = await webkit.launch();
const makeContext = async () => {
  const ctx = await browser.newContext({ ...devices["iPhone 14"], viewport: { width: 390, height: 844 } });
  await ctx.route(/sentry\.io/, r => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  return ctx;
};
let passed = 0;
const failed = [];
async function check(name, fn) {
  try { await fn(); passed++; } catch (err) { failed.push(`${name}: ${err.message.split("\n")[0]}`); }
}

const metrics = page => page.evaluate(() => {
  const q = id => document.querySelector(`[data-testid="${id}"]`);
  const header = q("thread-header"), scroller = q("thread-messages"), input = q("thread-input");
  const nav = document.querySelector("nav.fixed");
  const r = el => { const b = el.getBoundingClientRect(); return { top: Math.round(b.top * 10) / 10, bottom: Math.round(b.bottom * 10) / 10, height: b.height }; };
  const ta = input.querySelector("textarea");
  return {
    innerHeight: window.innerHeight,
    pageScrollY: window.scrollY,
    docScrollHeight: document.scrollingElement.scrollHeight,
    header: r(header),
    headerStyle: header.getAttribute("style") ?? "",
    headerPaddingTop: parseFloat(getComputedStyle(header).paddingTop),
    input: r(input),
    textarea: r(ta),
    nav: nav ? r(nav) : null,
    scrollTop: scroller.scrollTop,
    scrollClient: scroller.clientHeight,
    scrollHeight: scroller.scrollHeight,
  };
});

async function checksFor(who, page) {
  await page.waitForSelector('[data-testid="thread-messages"]', { timeout: 60000 });
  await page.waitForSelector("text=Message 70:", { timeout: 60000 });
  await page.waitForTimeout(2500); // the smooth scroll to the newest message finishes
  const before = await metrics(page);

  await check(`${who}: the conversation is long (more than two screens of messages)`, async () => {
    assert.ok(before.scrollHeight > before.scrollClient * 2, `scrollHeight ${before.scrollHeight}, visible ${before.scrollClient}`);
  });
  await check(`${who}: the page itself does not scroll (only the messages do)`, async () => {
    assert.ok(before.docScrollHeight <= before.innerHeight + 1, `page is ${before.docScrollHeight}px tall in a ${before.innerHeight}px window`);
    assert.equal(before.pageScrollY, 0);
  });
  await check(`${who}: the header's safe-area padding is inline on the header, and it keeps its 3rem`, async () => {
    assert.match(before.headerStyle, /env\(safe-area-inset-top\)/);
    assert.ok(before.headerPaddingTop >= 48, `padding-top ${before.headerPaddingTop}`);
  });
  await check(`${who}: the header is at the very top of the screen`, async () => assert.equal(before.header.top, 0));
  await check(`${who}: the typing bar is below the header and above the bottom menu, inside the screen`, async () => {
    assert.ok(before.input.top > before.header.bottom, "typing bar overlaps the header");
    assert.ok(before.nav, "no bottom menu found");
    assert.ok(before.textarea.bottom <= before.nav.top + 0.5, `textarea bottom ${before.textarea.bottom} vs menu top ${before.nav.top}`);
    assert.ok(before.nav.bottom <= before.innerHeight + 1, "bottom menu is off screen");
  });

  // Scroll the conversation up, far. (Mobile WebKit has no mouse wheel, so this scrolls the
  // way a swipe would, by script: the messages area, and the window too in case it is the
  // thing that scrolls on a screen that is not built to stay put.)
  const scrollBy = async dy => {
    await page.evaluate(delta => {
      document.querySelector('[data-testid="thread-messages"]')?.scrollBy({ top: delta, behavior: "instant" });
      window.scrollBy({ top: delta, behavior: "instant" });
    }, dy);
    await page.waitForTimeout(300);
  };
  await scrollBy(-6000);
  if (process.env.SHOT_DIR) await page.screenshot({ path: `${process.env.SHOT_DIR}/${who}-scrolled-up.png` });
  const up = await metrics(page);
  await check(`${who}: scrolling really moved the messages (scrolled up by at least 1000 px)`, async () => {
    assert.ok(before.scrollTop - up.scrollTop > 1000, `scrollTop ${before.scrollTop} -> ${up.scrollTop}`);
  });
  await check(`${who}: ...and the header did not move: still at the top, fully visible, page not scrolled`, async () => {
    assert.equal(up.header.top, 0, `header top is ${up.header.top}`);
    assert.equal(up.header.bottom, before.header.bottom);
    assert.equal(up.pageScrollY, 0);
  });
  await check(`${who}: ...and the typing bar did not move either`, async () => {
    assert.equal(up.input.top, before.input.top);
    assert.equal(up.input.bottom, before.input.bottom);
    assert.equal(up.textarea.bottom, before.textarea.bottom);
  });

  // and back down to the end
  await scrollBy(12000);
  const down = await metrics(page);
  await check(`${who}: scrolled back to the newest message, header and typing bar still in place`, async () => {
    assert.ok(down.scrollTop + down.scrollClient >= down.scrollHeight - 2, "not at the end");
    assert.equal(down.header.top, 0);
    assert.equal(down.input.bottom, before.input.bottom);
  });
  return up;
}

// ---- the athlete -----------------------------------------------------------------------------
{
  const signed = await signedInPage(makeContext, BASE, ALICE, /\/student\//);
  if (!signed) throw new Error("could not sign in as the athlete");
  const { ctx, page } = signed;
  await page.goto(`${BASE}/student/messages`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await checksFor("athlete", page);
  await ctx.close();
}

// ---- the coach -------------------------------------------------------------------------------
{
  const signed = await signedInPage(makeContext, BASE, COACH);
  if (!signed) throw new Error("could not sign in as the coach");
  const { ctx, page } = signed;
  await page.goto(`${BASE}/coach/messages`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.getByRole("button", { name: /Alice Adams/ }).first().click({ timeout: 60000 });
  await checksFor("coach", page);
  await check("coach: the back arrow in the pinned header still works after scrolling", async () => {
    await page.locator('[data-testid="thread-header"] button').first().click();
    await page.waitForSelector("text=/\\d+ conversations?/", { timeout: 15000 });
  });
  await check("coach: the conversation list (header and all) is back to normal page scrolling", async () => {
    const list = await page.evaluate(() => ({ hasThreadHeader: !!document.querySelector('[data-testid="thread-header"]'), mainClass: document.querySelector("main")?.className ?? "" }));
    assert.equal(list.hasThreadHeader, false);
    assert.ok(!/overflow-hidden/.test(list.mainClass), list.mainClass);
  });
  await ctx.close();
}

await browser.close();
stop();
console.log(`${passed} passed, ${failed.length} failed (WebKit, iPhone 14 profile at 390x844, local emulators)`);
for (const f of failed) console.log(`  FAIL ${f}`);
process.exit(failed.length ? 1 : 0);
