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
// INLINE on the element (env(safe-area-inset-top)) (safe-area insets are 0 in
// desktop WebKit, so only the declaration can be checked here, not a real notch).
// The coach's header keeps the 3rem it always had. The athlete's header is ONE
// slim bar (Build 1.1 step 12): coach avatar + coach name + a small "Messages"
// label, no logo, no big title, no taller than 64 px plus the safe area.
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
const HEADER_MAX_PX = 64; // the athlete's slim header, not counting the safe area
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
    headerText: header.textContent.replace(/\s+/g, " ").trim(), // textContent: innerText would give the CSS-uppercased "MESSAGES"
    headerImages: header.querySelectorAll("img").length,
    headerHeadings: [...header.querySelectorAll("h1,h2,h3")].map(h => ({ text: h.innerText.trim(), fontSize: parseFloat(getComputedStyle(h).fontSize) })),
    input: r(input),
    textarea: r(ta),
    nav: nav ? r(nav) : null,
    scrollTop: scroller.scrollTop,
    scrollClient: scroller.clientHeight,
    scrollHeight: scroller.scrollHeight,
  };
});

async function checksFor(who, page, { slimHeader }) {
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
  await check(`${who}: the header's safe-area padding is inline on the header`, async () => {
    assert.match(before.headerStyle, /env\(safe-area-inset-top\)/);
  });
  if (!slimHeader) {
    await check(`${who}: the header keeps its 3rem of top padding`, async () => {
      assert.ok(before.headerPaddingTop >= 48, `padding-top ${before.headerPaddingTop}`);
    });
  } else {
    await check(`${who}: the header is no taller than 64 px plus the safe area (${HEADER_MAX_PX} px at inset 0)`, async () => {
      const height = before.header.height - before.headerPaddingTop; // the bar itself; padding-top is the safe area (0 in desktop WebKit)
      assert.ok(height <= HEADER_MAX_PX, `header bar is ${height}px tall (header ${before.header.height}px, padding-top ${before.headerPaddingTop}px)`);
      assert.ok(before.header.height <= HEADER_MAX_PX + before.headerPaddingTop, `header is ${before.header.height}px`);
    });
    await check(`${who}: ...and it is still a real bar, not collapsed (at least 48 px)`, async () => {
      assert.ok(before.header.height - before.headerPaddingTop >= 48, `header bar is ${before.header.height - before.headerPaddingTop}px`);
    });
    await check(`${who}: the header takes well under a quarter of the screen (less than 10%)`, async () => {
      assert.ok(before.header.height < before.innerHeight * 0.1, `header is ${before.header.height}px of ${before.innerHeight}px`);
    });
    await check(`${who}: the header is coach avatar + coach name + a small "Messages" label: no logo, no big title`, async () => {
      assert.equal(before.headerImages, 0, "the header still has an image (the logo)");
      assert.match(before.headerText, /Coach Carter/, before.headerText);
      assert.match(before.headerText, /Messages/, before.headerText);
      assert.doesNotMatch(before.headerText, /\bwith\b/i, `old "with Coach ..." line is still there: ${before.headerText}`);
      const big = before.headerHeadings.filter(h => h.fontSize > 16);
      assert.equal(big.length, 0, `heading too big: ${JSON.stringify(big)}`);
    });
    await check(`${who}: avatar, name and label are on one line`, async () => {
      const row = await page.evaluate(() => {
        const header = document.querySelector('[data-testid="thread-header"]');
        const mid = el => { const b = el.getBoundingClientRect(); return { cy: b.top + b.height / 2, h: b.height }; };
        const name = [...header.querySelectorAll("p")].find(p => /Coach Carter/.test(p.innerText));
        const label = header.querySelector("h1");
        const avatar = name?.previousElementSibling ?? null; // the avatar is rendered just before the name
        return { name: name ? mid(name) : null, label: label ? mid(label) : null, avatar: avatar ? mid(avatar) : null };
      });
      assert.ok(row.name && row.label && row.avatar, `missing: ${JSON.stringify(row)}`);
      assert.ok(Math.abs(row.name.cy - row.label.cy) <= 4, `name and label centres differ: ${row.name.cy} vs ${row.label.cy}`);
      assert.ok(Math.abs(row.name.cy - row.avatar.cy) <= 4, `avatar and name centres differ: ${row.avatar.cy} vs ${row.name.cy}`);
      assert.ok(row.name.h < 26, `name is ${row.name.h}px tall: it wrapped`);
    });
    await check(`${who}: a very long coach name stays on one line and the header does not grow`, async () => {
      const grown = await page.evaluate(() => {
        const header = document.querySelector('[data-testid="thread-header"]');
        const name = [...header.querySelectorAll("p")].find(p => /Coach Carter/.test(p.innerText));
        const h0 = header.getBoundingClientRect().height;
        const original = name.textContent;
        name.textContent = "Coach Maximilian Alexander Bartholomew Featherstonehaugh-Montgomery the Third";
        const out = { h0, h1: header.getBoundingClientRect().height, nameH: name.getBoundingClientRect().height, headerScroll: header.scrollWidth - header.clientWidth };
        name.textContent = original;
        return out;
      });
      assert.equal(grown.h1, grown.h0, `header grew from ${grown.h0} to ${grown.h1}`);
      assert.ok(grown.nameH < 26, `name wrapped (${grown.nameH}px)`);
      assert.ok(grown.headerScroll <= 0, "the header overflows sideways");
    });
  }
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
  await checksFor("athlete", page, { slimHeader: true });
  await ctx.close();
}

// ---- the coach -------------------------------------------------------------------------------
{
  const signed = await signedInPage(makeContext, BASE, COACH);
  if (!signed) throw new Error("could not sign in as the coach");
  const { ctx, page } = signed;
  await page.goto(`${BASE}/coach/messages`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.getByRole("button", { name: /Alice Adams/ }).first().click({ timeout: 60000 });
  await checksFor("coach", page, { slimHeader: false });
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
