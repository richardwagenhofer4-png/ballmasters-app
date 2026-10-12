// Unit checks for lib/loginDiagnostics.core.ts: what the login tracer records,
// when it reports to Sentry, and that it never carries personal data or breaks
// the app. Uses a fake clock, fake timers and a fake Sentry.
//
// Run:  node scripts/test-login-diagnostics.mjs      (Node 22.6+ strips the types)

import assert from "node:assert/strict";
import { createLoginDiagnostics, hashUid, STALL_MS } from "../lib/loginDiagnostics.core.ts";

let passed = 0;
const failed = [];
const pending = [];
function test(name, fn) {
  const fail = err => failed.push(`${name}: ${err.message.split("\n")[0]}`);
  try {
    const out = fn();
    if (out && typeof out.then === "function") pending.push(out.then(() => { passed++; }, fail));
    else passed++;
  } catch (err) { fail(err); }
}

// A tiny harness: manual clock, manual timers, recorded Sentry calls, shared fake storage.
function world(sharedStore) {
  let now = 1_000_000;
  const timers = [];
  const crumbs = [];
  const events = [];
  const store = sharedStore ?? { value: null };
  const diag = createLoginDiagnostics({
    sink: { breadcrumb: b => crumbs.push(b), message: (text, ctx) => events.push({ text, ...ctx }) },
    store: { get: () => store.value, set: v => { store.value = v; }, remove: () => { store.value = null; } },
    now: () => now,
    setTimer: (fn, ms) => { const t = { fn, at: now + ms, live: true }; timers.push(t); return t; },
    clearTimer: t => { t.live = false; },
    route: () => "/coach/dashboard",
  });
  const advance = ms => {
    now += ms;
    for (const t of timers) if (t.live && t.at <= now) { t.live = false; t.fn(); }
  };
  return { diag, crumbs, events, advance, store, setNow: n => { now = n; }, getNow: () => now };
}

const UID = "uA9xK2mPqRs8TuVwXyZ01234abcd";
const EMAIL_ERR = Object.assign(new Error("Firebase: no user for jane.smith@example.com (auth/user-not-found)."), { code: "auth/user-not-found" });

test("steps become breadcrumbs with time since sign-in; nothing before begin()", () => {
  const w = world();
  w.diag.step("ignored_before_begin");
  assert.equal(w.crumbs.length, 0);
  w.diag.begin("email", UID);
  w.advance(250);
  w.diag.step("auth_state", { signedIn: true });
  assert.deepEqual(w.crumbs.map(c => c.message), ["begin", "auth_state"]);
  assert.equal(w.crumbs[1].data.t, 250);
  assert.equal(w.crumbs[1].category, "login");
});

test("both milestones finish the session: no stall event, even long after", () => {
  const w = world();
  w.diag.begin("email", UID);
  w.advance(1200); w.diag.milestone("profile");
  w.advance(1800); w.diag.milestone("first_query");
  w.advance(60_000);
  assert.equal(w.events.length, 0);
  assert.ok(w.crumbs.some(c => c.message === "complete" && c.data.totalMs === 3000));
  assert.equal(w.store.value, null, "saved trace is cleared");
  assert.equal(w.diag.active(), false);
});

test("profile loaded but first query not: stall event at 10s naming what's missing", () => {
  const w = world();
  w.diag.begin("email", UID);
  w.advance(900); w.diag.milestone("profile");
  w.advance(STALL_MS - 900 - 1);
  assert.equal(w.events.length, 0, "not yet");
  w.advance(1);
  assert.equal(w.events.length, 1);
  const e = w.events[0];
  assert.equal(e.text, "Login did not finish within 10 seconds");
  assert.equal(e.tags["login.missing"], "first_query");
  assert.equal(e.tags["login.stage"], "stalled");
  assert.deepEqual(e.fingerprint, ["login-diagnostics", "stalled", "first_query"]);
  assert.equal(e.extra.profileLoaded, true);
  assert.equal(e.extra.firstQueryLoaded, false);
  assert.equal(typeof e.extra.trace, "string", "plain text, so Sentry doesn't flatten it");
  for (const name of ["begin", "profile_loaded", "stalled_10s"]) assert.ok(e.extra.trace.includes(name), `trace lacks ${name}`);
});

test("nothing loaded: missing profile and first query", () => {
  const w = world();
  w.diag.begin("apple", UID);
  w.advance(STALL_MS);
  assert.equal(w.events[0].tags["login.missing"], "profile+first_query");
  assert.equal(w.events[0].tags["login.source"], "apple");
});

test("only one event per session, even if it keeps running", () => {
  const w = world();
  w.diag.begin("email", UID);
  w.advance(STALL_MS); w.advance(STALL_MS * 3);
  assert.equal(w.events.length, 1);
});

test("a late finish after the stall event adds no second event", () => {
  const w = world();
  w.diag.begin("email", UID);
  w.advance(STALL_MS);
  w.diag.milestone("profile"); w.diag.milestone("first_query");
  assert.equal(w.events.length, 1);
});

test("no personal data: uid is fingerprinted, emails scrubbed, objects dropped", () => {
  const w = world();
  w.diag.begin("email", UID);
  w.diag.fail("login_profile_read_failed", EMAIL_ERR, { role: "coach" });
  w.diag.step("x", { name: "Jane Smith", nested: { a: 1 }, ok: true, n: 3 });
  w.advance(STALL_MS);
  const all = JSON.stringify([w.crumbs, w.events, w.store.value]);
  assert.ok(!all.includes(UID), "raw uid leaked");
  assert.ok(!all.includes("jane.smith"), "email leaked");
  assert.ok(!all.includes("example.com"), "email domain leaked");
  assert.ok(!all.includes('"a":1'), "object detail leaked");
  assert.ok(all.includes("[email]"));
  assert.ok(all.includes("auth/user-not-found"), "the error code is kept");
  assert.ok(all.includes(hashUid(UID)), "the fingerprint is there");
});

test("hashUid: 8 hex digits, stable, different per user", () => {
  assert.match(hashUid(UID), /^[0-9a-f]{8}$/);
  assert.equal(hashUid(UID), hashUid(UID));
  assert.notEqual(hashUid(UID), hashUid(UID + "x"));
});

test("track(): passes the value through, records ms, reaches the milestone", async () => {
  const w = world();
  w.diag.begin("email", UID);
  const out = await w.diag.track("profile_read", Promise.resolve({ role: "coach" }), "profile");
  assert.deepEqual(out, { role: "coach" });
  assert.ok(w.crumbs.some(c => c.message === "profile_read_start"));
  assert.ok(w.crumbs.some(c => c.message === "profile_read_ok"));
  assert.ok(w.crumbs.some(c => c.message === "profile_loaded"));
});

test("track(): a rejection is recorded with its code, then re-thrown unchanged", async () => {
  const w = world();
  w.diag.begin("email", UID);
  const err = Object.assign(new Error("Missing or insufficient permissions."), { code: "permission-denied" });
  await assert.rejects(w.diag.track("videos_query", Promise.reject(err)), e => e === err);
  const c = w.crumbs.find(x => x.message === "videos_query_failed");
  assert.equal(c.level, "error");
  assert.equal(c.data.code, "permission-denied");
});

test("abandon(): an intentional end is not a stall", () => {
  const w = world();
  w.diag.begin("email", UID);
  w.diag.abandon("signin_failed", { code: "auth/invalid-credential" });
  w.advance(STALL_MS * 2);
  assert.equal(w.events.length, 0);
  assert.equal(w.diag.active(), false);
});

test("a login that never finished (page frozen / app killed) is reported by the next launch, once", () => {
  const shared = { value: null };
  const first = world(shared);
  first.diag.begin("email", UID);
  first.advance(400); first.diag.step("auth_state", { signedIn: true });
  first.advance(900); first.diag.milestone("profile");
  // The app dies here: its timer never fires. A new launch, 30 s later, shares localStorage.
  const second = world(shared);
  second.setNow(first.getNow() + 30_000);
  second.diag.checkPrevious();
  assert.equal(second.events.length, 1);
  assert.equal(second.events[0].tags["login.stage"], "previous-launch");
  assert.equal(second.events[0].tags["login.missing"], "first_query");
  const lines = second.events[0].extra.trace.split("\n");
  assert.ok(lines.at(-1).includes("previous_launch_ended_here"), lines.at(-1));
  second.diag.checkPrevious();
  assert.equal(second.events.length, 1, "reported only once");
});

test("the next launch leaves a recent login alone (it may still be in progress)", () => {
  const shared = { value: null };
  const first = world(shared);
  first.diag.begin("email", UID);
  const second = world(shared);
  second.setNow(first.getNow() + 3000);
  second.diag.checkPrevious();
  assert.equal(second.events.length, 0);
});

test("a finished login leaves nothing to report next launch", () => {
  const shared = { value: null };
  const first = world(shared);
  first.diag.begin("email", UID);
  first.diag.milestone("profile"); first.diag.milestone("first_query");
  const second = world(shared);
  second.setNow(first.getNow() + 60_000);
  second.diag.checkPrevious();
  assert.equal(second.events.length, 0);
});

test("step list is capped so a long session can't grow without bound", () => {
  const w = world();
  w.diag.begin("email", UID);
  for (let i = 0; i < 500; i++) w.diag.step("tick");
  w.advance(STALL_MS);
  assert.ok(w.events[0].extra.trace.split("\n").length <= 80);
});

test("nothing it does can throw: failing storage, failing Sentry", () => {
  const diag = createLoginDiagnostics({
    sink: { breadcrumb: () => { throw new Error("sentry down"); }, message: () => { throw new Error("sentry down"); } },
    store: { get: () => { throw new Error("no storage"); }, set: () => { throw new Error("no storage"); }, remove: () => { throw new Error("no storage"); } },
    now: () => 1,
    setTimer: () => { throw new Error("no timers"); },
    clearTimer: () => { throw new Error("no timers"); },
    route: () => { throw new Error("no window"); },
  });
  diag.begin("email", UID);
  diag.step("a"); diag.fail("b", new Error("x")); diag.milestone("profile"); diag.milestone("first_query");
  diag.abandon("c"); diag.checkPrevious(); diag.setUser(UID);
});

await Promise.all(pending);
console.log(`${passed} passed, ${failed.length} failed`);
for (const f of failed) console.log(`  FAIL ${f}`);
process.exit(failed.length ? 1 : 0);
