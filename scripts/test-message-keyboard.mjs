// The message screens while the on-screen keyboard is open (Build 1.1 step 11).
// Real WebKit, iPhone 14 profile at 390 x 844, local emulators, a 70-message
// conversation of fake data. Both screens: the athlete's (/student/messages)
// and the coach's (/coach/messages, a conversation open).
//
// A browser on a laptop has no keyboard, so it is simulated two ways that
// match what a phone does:
//   "visible area shrinks, page pans" (the 1.0 App Store app, which has no
//     keyboard plugin; iOS reports the keyboard through window.visualViewport):
//     a stand-in visualViewport is installed, set to 500 px high, and then
//     panned down 200 px.
//   "the whole view shrinks" (the 1.1 app with the keyboard plugin in "native"
//     resize mode): the real viewport is resized to 390 x 500.
//
// While the keyboard is open: the header is visible at the top of the visible
// area, the bottom tab menu is hidden, the typing bar is inside the visible
// area directly above where the keyboard is, the newest message is in view
// (also after typing several lines), and the page itself does not scroll.
// When the keyboard closes everything is back exactly as before.
//
// Also: the keyboard plugin is optional. With it (a later 1.1 build) the web
// code hides iOS's accessory bar; without it (1.0 app, older test builds, a
// plain browser) it does nothing and raises no errors.
//
// Needs: npm i --no-save playwright && npx playwright install webkit; Java; Firebase CLI.
// Run:  node scripts/test-message-keyboard.mjs      Ports: 9099, 8080, 3126

import assert from "node:assert/strict";
import { startStack, signedInPage } from "./fixtures/local-stack.mjs";
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
  stack = await startStack({ port: 3126 });
} catch (err) {
  console.log(err.message);
  process.exit(2);
}
const { BASE, COACH, seeded, stop } = stack;
const ALICE = { email: "alice@example.test", password: "password1" };
await seedConversation(seeded, 70);

const browser = await webkit.launch();
let passed = 0;
const failed = [];
async function check(name, fn) {
  try { await fn(); passed++; } catch (err) { failed.push(`${name}: ${err.message.split("\n")[0]}`); }
}

/** A stand-in for window.visualViewport that the test can shrink and pan (the layout viewport stays 844 tall). */
function installFakeVisualViewport() {
  const listeners = {};
  let override = null; // null: no keyboard, the visible area is the whole window (as in a real browser)
  const vv = {
    width: 390, offsetTop: 0, offsetLeft: 0, scale: 1, pageTop: 0, pageLeft: 0,
    get height() { return override ?? window.innerHeight; },
    addEventListener(type, fn) { (listeners[type] ??= new Set()).add(fn); },
    removeEventListener(type, fn) { listeners[type]?.delete(fn); },
    dispatchEvent() { return true; },
  };
  Object.defineProperty(window, "visualViewport", { value: vv, configurable: true });
  window.__setVisualViewport = (height, offsetTop = 0) => {
    override = height >= window.innerHeight ? null : height;
    vv.offsetTop = offsetTop;
    for (const type of ["resize", "scroll"]) for (const fn of listeners[type] ?? []) fn(new Event(type));
  };
}

const pageErrors = [];
const makeContext = fake => async () => {
  const ctx = await browser.newContext({ ...devices["iPhone 14"], viewport: { width: 390, height: 844 } });
  await ctx.route(/sentry\.io/, r => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  if (fake) await ctx.addInitScript(installFakeVisualViewport);
  return ctx;
};

const metrics = page => page.evaluate(() => {
  const q = id => document.querySelector(`[data-testid="${id}"]`);
  const rect = el => { const b = el.getBoundingClientRect(); return { top: Math.round(b.top * 10) / 10, bottom: Math.round(b.bottom * 10) / 10, height: b.height }; };
  const header = q("thread-header"), scroller = q("thread-messages"), input = q("thread-input");
  const main = document.querySelector("main");
  const nav = document.querySelector("nav.fixed");
  const navVisible = !!nav && getComputedStyle(nav).display !== "none" && nav.getBoundingClientRect().height > 0;
  const newest = [...scroller.querySelectorAll("p")].find(p => p.textContent?.startsWith("Message 70:"));
  const ta = input.querySelector("textarea");
  return {
    header: rect(header), input: rect(input), textarea: rect(ta), scroller: rect(scroller), main: rect(main),
    newest: newest ? rect(newest) : null,
    navVisible,
    mainPosition: getComputedStyle(main).position,
    htmlOverflow: document.documentElement.style.overflow,
    scrollY: window.scrollY,
    scrollerAtEnd: scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 24,
    innerHeight: window.innerHeight,
    pad: parseFloat(getComputedStyle(input).paddingBottom),
  };
});

async function openThread(who, page) {
  if (who === "coach") {
    await page.goto(`${BASE}/coach/messages`, { waitUntil: "domcontentloaded", timeout: 180000 });
    await page.getByRole("button", { name: /Alice Adams/ }).first().click({ timeout: 60000 });
  } else {
    await page.goto(`${BASE}/student/messages`, { waitUntil: "domcontentloaded", timeout: 180000 });
  }
  await page.waitForSelector("text=Message 70:", { timeout: 60000 });
  await page.waitForTimeout(2500); // the smooth scroll to the newest message finishes
}

/**
 * `visible` = the area the person can actually see: { top, height }.
 * `open`/`close` put the (simulated) keyboard up or down.
 */
async function keyboardChecks(label, page, { open, close, visibleOpen, pan }) {
  const before = await metrics(page);
  await check(`${label}: starts with the bottom menu showing and the page in its normal layout`, async () => {
    assert.equal(before.navVisible, true);
    assert.notEqual(before.mainPosition, "fixed");
    assert.equal(before.header.top, 0);
    assert.equal(before.scrollerAtEnd, true);
  });

  await page.locator("[data-keyboard-input]").click();
  await open();
  await page.waitForTimeout(700);
  const kb = await metrics(page);
  const bottomOfVisible = visibleOpen.top + visibleOpen.height;

  await check(`${label}: keyboard open: the header is visible, at the top of the visible area`, async () => {
    assert.ok(Math.abs(kb.header.top - visibleOpen.top) <= 1, `header top ${kb.header.top}, visible area starts at ${visibleOpen.top}`);
    assert.ok(kb.header.bottom <= bottomOfVisible, "header runs past the visible area");
    assert.equal(kb.header.height, before.header.height, "header changed size");
  });
  if (label.startsWith("athlete")) {
    // Build 1.1 step 12: the athlete's header is one slim bar, so with the keyboard up
    // the conversation gets most of the 500 px that are left (it was about 205 px of header).
    await check(`${label}: keyboard open: the slim header (64 px or less) leaves the messages at least 330 px`, async () => {
      assert.ok(kb.header.height <= 64, `header is ${kb.header.height}px tall`);
      assert.ok(kb.scroller.height >= 330, `messages area is ${kb.scroller.height}px tall in a ${visibleOpen.height}px visible area`);
    });
  }
  await check(`${label}: keyboard open: the bottom tab menu is hidden`, async () => assert.equal(kb.navVisible, false));
  await check(`${label}: keyboard open: the typing bar is inside the visible area, directly above the keyboard`, async () => {
    assert.ok(kb.input.top > kb.header.bottom, "typing bar overlaps the header");
    assert.ok(Math.abs(kb.input.bottom - bottomOfVisible) <= 1.5, `typing bar ends at ${kb.input.bottom}, keyboard starts at ${bottomOfVisible}`);
    assert.ok(kb.textarea.bottom <= bottomOfVisible && kb.textarea.top >= kb.header.bottom, "the text field is not fully visible");
  });
  await check(`${label}: keyboard open: the newest message is still in view`, async () => {
    assert.ok(kb.newest, "newest message not found");
    assert.ok(kb.newest.top >= kb.scroller.top - 1 && kb.newest.bottom <= kb.scroller.bottom + 1, `newest ${kb.newest.top}-${kb.newest.bottom} vs messages area ${kb.scroller.top}-${kb.scroller.bottom}`);
    assert.ok(kb.newest.bottom <= kb.input.top + 1, "newest message is hidden behind the typing bar");
  });
  await check(`${label}: keyboard open: the screen is exactly the visible area tall, and the page can't scroll under it`, async () => {
    assert.ok(Math.abs(kb.main.height - visibleOpen.height) <= 1, `screen ${kb.main.height} tall, visible area ${visibleOpen.height}`);
    assert.equal(kb.htmlOverflow, "hidden");
    assert.equal(kb.scrollY, 0);
  });

  // Typing several lines makes the typing bar taller; the newest message must stay in view.
  await page.locator("[data-keyboard-input]").fill("one\ntwo\nthree\nfour\nfive\nsix");
  await page.waitForTimeout(500);
  const typed = await metrics(page);
  await check(`${label}: keyboard open: typing several lines grows the bar upwards, header and newest message stay in view`, async () => {
    assert.ok(typed.input.height > kb.input.height + 20, `typing bar ${kb.input.height} -> ${typed.input.height}`);
    assert.ok(Math.abs(typed.input.bottom - bottomOfVisible) <= 1.5);
    assert.ok(Math.abs(typed.header.top - visibleOpen.top) <= 1);
    assert.ok(typed.newest.bottom <= typed.input.top + 1 && typed.newest.top >= typed.scroller.top - 1, "newest message scrolled out of view");
  });
  await page.locator("[data-keyboard-input]").fill("");

  if (pan) {
    await pan();
    await page.waitForTimeout(500);
    const panned = await metrics(page);
    await check(`${label}: the page panned down by iOS: the header still sits at the top of what you see`, async () => {
      assert.ok(Math.abs(panned.header.top - pan.top) <= 1, `header top ${panned.header.top}, expected ${pan.top}`);
      assert.ok(Math.abs(panned.input.bottom - (pan.top + pan.height)) <= 1.5);
    });
  }

  await page.evaluate(() => document.activeElement instanceof HTMLElement && document.activeElement.blur());
  await close();
  await page.waitForTimeout(700);
  const after = await metrics(page);
  await check(`${label}: keyboard closed: bottom menu back, header and typing bar back where they were`, async () => {
    assert.equal(after.navVisible, true);
    assert.equal(after.header.top, before.header.top);
    assert.equal(after.input.bottom, before.input.bottom);
    assert.equal(after.pad, before.pad);
  });
  await check(`${label}: keyboard closed: normal layout again (not pinned, page scroll lock off) and the newest message in view`, async () => {
    assert.notEqual(after.mainPosition, "fixed");
    assert.equal(after.htmlOverflow, "");
    assert.equal(after.scrollerAtEnd, true);
    assert.ok(after.newest.bottom <= after.input.top + 1);
  });
}

// ---- "the visible area shrinks and the page pans" (no keyboard plugin) ---------------------------
for (const who of ["athlete", "coach"]) {
  const signed = await signedInPage(makeContext(true), BASE, who === "coach" ? COACH : ALICE, who === "coach" ? /\/coach\// : /\/student\//);
  if (!signed) throw new Error(`could not sign in as the ${who}`);
  const { ctx, page } = signed;
  page.on("pageerror", e => pageErrors.push(`${who}: ${e.message}`));
  await openThread(who, page);
  await keyboardChecks(`${who} (visible area 500 px, panned)`, page, {
    open: () => page.evaluate(() => window.__setVisualViewport(500, 0)),
    close: () => page.evaluate(() => window.__setVisualViewport(window.innerHeight, 0)),
    visibleOpen: { top: 0, height: 500 },
    pan: Object.assign(() => page.evaluate(() => window.__setVisualViewport(500, 200)), { top: 200, height: 500 }),
  });
  await ctx.close();
}

// ---- "the whole view shrinks" (keyboard plugin, native resize mode) -------------------------------
for (const who of ["athlete", "coach"]) {
  const signed = await signedInPage(makeContext(false), BASE, who === "coach" ? COACH : ALICE, who === "coach" ? /\/coach\// : /\/student\//);
  if (!signed) throw new Error(`could not sign in as the ${who}`);
  const { ctx, page } = signed;
  page.on("pageerror", e => pageErrors.push(`${who}: ${e.message}`));
  await openThread(who, page);
  await keyboardChecks(`${who} (view resized to 390x500)`, page, {
    open: () => page.setViewportSize({ width: 390, height: 500 }),
    close: () => page.setViewportSize({ width: 390, height: 844 }),
    visibleOpen: { top: 0, height: 500 },
  });
  await ctx.close();
}

// ---- the keyboard plugin is optional -------------------------------------------------------------
async function nativeCalls(page) { return page.evaluate(() => window.__nativeCalls ?? null); }
{
  // A later 1.1 build: the plugin is there, so the accessory bar gets hidden.
  const ctx = await browser.newContext({ ...devices["iPhone 14"], viewport: { width: 390, height: 844 } });
  await ctx.route(/sentry\.io/, r => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await ctx.addInitScript(installNativeApp, { keyboard: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForTimeout(4000);
  const calls = await nativeCalls(page);
  await check("plugin present: the accessory bar is hidden (Keyboard.setAccessoryBarVisible isVisible false)", async () => {
    const call = (calls ?? []).find(c => c[0] === "Keyboard" && c[1] === "setAccessoryBarVisible");
    assert.ok(call, `native calls: ${JSON.stringify(calls)}`);
    assert.equal(call[2].isVisible, false);
  });
  await check("plugin present: no errors from the keyboard code", async () => assert.deepEqual(errors.filter(e => /keyboard/i.test(e)), []));
  await ctx.close();
}
{
  // The 1.0 app / older 1.1 test builds: native shell, no keyboard plugin.
  const ctx = await browser.newContext({ ...devices["iPhone 14"], viewport: { width: 390, height: 844 } });
  await ctx.route(/sentry\.io/, r => r.fulfill({ status: 200, contentType: "application/json", body: "{}" }));
  await ctx.addInitScript(installNativeApp, {});
  const page = await ctx.newPage();
  const errors = [];
  page.on("pageerror", e => errors.push(e.message));
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 180000 });
  await page.waitForTimeout(4000);
  const calls = await nativeCalls(page);
  await check("plugin missing (1.0 app, older builds): nothing is asked of it, and no errors", async () => {
    assert.deepEqual((calls ?? []).filter(c => c[0] === "Keyboard"), []);
    assert.deepEqual(errors.filter(e => /keyboard/i.test(e)), []);
  });
  await ctx.close();
}
await check("no page errors at all while any of the keyboard checks ran", async () => assert.deepEqual(pageErrors.filter(e => /keyboard|visualViewport/i.test(e)), []));

await browser.close();
stop();
console.log(`${passed} passed, ${failed.length} failed (WebKit, iPhone 14 profile at 390x844, local emulators)`);
for (const f of failed) console.log(`  FAIL ${f}`);
process.exit(failed.length ? 1 : 0);
