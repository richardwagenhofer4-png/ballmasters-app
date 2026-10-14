// Unit checks for the two pieces that fix Build 1.1 bug 2:
//   lib/lastActive.core.ts  - the lastActiveAt write never overlaps a profile read
//   lib/ownProfile.core.ts  - a "missing" profile is only believed after a second look
// Fake clock, fake timers, fake Firestore snapshots. Nothing real is touched.
//
// Run:  node scripts/test-profile-read.mjs      (Node 22.6+ strips the types)

import assert from "node:assert/strict";
import {
  createLastActiveGate, QUIET_MS, MAX_WAIT_MS, READ_WAIT_MS, DEDUPE_MS,
} from "../lib/lastActive.core.ts";
import { readWithMissingRetry, RETRY_WAIT_MS } from "../lib/ownProfile.core.ts";

let passed = 0;
const failed = [];
const pending = [];
function test(name, fn) {
  const fail = err => failed.push(`${name}: ${String(err.message).split("\n")[0]}`);
  try {
    const out = fn();
    if (out && typeof out.then === "function") pending.push(out.then(() => { passed++; }, fail));
    else passed++;
  } catch (err) { fail(err); }
}


// ---- fake world for the gate ----------------------------------------------
function world({ dueToday = true } = {}) {
  let now = 0;
  const timers = [];
  const writes = [];
  const marked = [];
  const traces = [];
  const state = { dueToday, writeMs: 0, writeFails: false };
  const gate = createLastActiveGate({
    now: () => now,
    setTimer: (fn, ms) => { const t = { fn, at: now + ms, live: true }; timers.push(t); return t; },
    clearTimer: t => { t.live = false; },
    write: async uid => {
      writes.push({ uid, at: now });
      if (state.writeMs) await new Promise(r => { timers.push({ fn: r, at: now + state.writeMs, live: true }); });
      if (state.writeFails) throw new Error("network");
    },
    dueToday: () => state.dueToday,
    markWritten: uid => marked.push(uid),
    onError: () => {},
    trace: (s, d) => traces.push([s, d]),
  });
  async function advance(ms) {
    const end = now + ms;
    while (now < end) {
      now = Math.min(end, now + 50);
      for (const t of timers.filter(x => x.live && x.at <= now)) { t.live = false; t.fn(); }
      for (let i = 0; i < 6; i++) await Promise.resolve();
    }
  }
  return { gate, writes, marked, traces, state, advance, at: () => now };
}
const UID = "u1";

// ---- gate ------------------------------------------------------------------
test("constants are what the report says", () => {
  assert.deepEqual([QUIET_MS, MAX_WAIT_MS, READ_WAIT_MS, DEDUPE_MS, RETRY_WAIT_MS], [1500, 8000, 2000, 60000, 1000]);
});

test("a request does NOT write at the moment of sign-in", async () => {
  const w = world();
  w.gate.request(UID);
  assert.equal(w.writes.length, 0);
  await w.advance(3000);
  assert.equal(w.writes.length, 0, "still waiting for a profile read");
});

test("nothing ever reads the profile: the write still goes out, at the 8 s cap", async () => {
  const w = world();
  w.gate.request(UID);
  await w.advance(MAX_WAIT_MS - 100);
  assert.equal(w.writes.length, 0);
  await w.advance(200);
  assert.equal(w.writes.length, 1);
  assert.equal(w.traces.find(t => t[0] === "last_active_write_start")[1].why, "max_wait");
});

test("the write follows the first profile read by the quiet period, not before", async () => {
  const w = world();
  w.gate.request(UID);
  await w.advance(100);
  const done = w.gate.readStarted(UID);
  await w.advance(300);
  done(); // read finished at 400 ms
  await w.advance(QUIET_MS - 100);
  assert.equal(w.writes.length, 0, "inside the quiet period");
  await w.advance(300);
  assert.equal(w.writes.length, 1);
  assert.ok(w.writes[0].at >= 400 + QUIET_MS, `wrote at ${w.writes[0].at}`);
  assert.deepEqual(w.marked, [UID]);
});

test("never writes while a read is in flight, even past the quiet period", async () => {
  const w = world();
  w.gate.request(UID);
  const d1 = w.gate.readStarted(UID);
  await w.advance(200); d1();
  await w.advance(1200);                // login page's read done, quiet period nearly over...
  const d2 = w.gate.readStarted(UID);   // ...the destination page's read starts
  await w.advance(1000);
  assert.equal(w.writes.length, 0, "a read is in flight");
  d2();
  await w.advance(QUIET_MS + 100);
  assert.equal(w.writes.length, 1);
  assert.ok(w.writes[0].at >= 200 + 1200 + 1000 + QUIET_MS);
});

test("a slow read cannot hold the write forever", async () => {
  const w = world();
  w.gate.request(UID);
  w.gate.readStarted(UID); // never finishes
  await w.advance(MAX_WAIT_MS + 100);
  assert.equal(w.writes.length, 1);
});

test("the login page's request and AuthContext's collapse into ONE write", async () => {
  const w = world();
  w.gate.request(UID);                    // AuthContext, at sign-in
  const done = w.gate.readStarted(UID);
  await w.advance(200); done();
  w.gate.request(UID, { force: true });   // login page, after its read
  w.gate.request(UID, { force: true });   // the second afterLogin run
  await w.advance(5000);
  assert.equal(w.writes.length, 1);
});

test("order doesn't matter: login page first, then AuthContext", async () => {
  const w = world();
  w.gate.request(UID, { force: true });
  w.gate.request(UID);
  const done = w.gate.readStarted(UID); await w.advance(100); done();
  await w.advance(3000);
  assert.equal(w.writes.length, 1);
});

test("the once-a-day throttle still applies, and `force` (login) bypasses it", async () => {
  const w = world({ dueToday: false });
  w.gate.request(UID);
  await w.advance(MAX_WAIT_MS + 500);
  assert.equal(w.writes.length, 0, "already written today");
  assert.ok(w.traces.some(t => t[0] === "last_active_skipped" && t[1].why === "done_today"));
  w.gate.request(UID, { force: true });
  await w.advance(MAX_WAIT_MS + 500);
  assert.equal(w.writes.length, 1);
});

test("a request right after a write is dropped; after a minute it goes through", async () => {
  const w = world();
  w.gate.request(UID);
  await w.advance(MAX_WAIT_MS + 100);
  assert.equal(w.writes.length, 1);
  w.gate.request(UID, { force: true });
  await w.advance(MAX_WAIT_MS + 100);
  assert.equal(w.writes.length, 1, "just written");
  await w.advance(DEDUPE_MS);
  w.gate.request(UID, { force: true });
  await w.advance(MAX_WAIT_MS + 100);
  assert.equal(w.writes.length, 2);
});

test("a request while the write is in flight is dropped", async () => {
  const w = world();
  w.state.writeMs = 3000;
  w.gate.request(UID);
  await w.advance(MAX_WAIT_MS + 100);
  assert.equal(w.writes.length, 1);
  w.gate.request(UID, { force: true });
  await w.advance(MAX_WAIT_MS + 100);
  assert.equal(w.writes.length, 1);
});

test("a profile read that starts while the write is in flight waits for it", async () => {
  const w = world();
  w.state.writeMs = 600;
  w.gate.request(UID);
  await w.advance(MAX_WAIT_MS + 100);       // write starts at 8000, takes 600 ms
  let released = false;
  const p = w.gate.beforeRead(UID).then(() => { released = true; });
  await w.advance(300);
  assert.equal(released, false, "still waiting");
  await w.advance(400);
  await p;
  assert.equal(released, true);
});

test("...but never longer than READ_WAIT_MS if the write hangs", async () => {
  const w = world();
  w.state.writeMs = 60_000;
  w.gate.request(UID);
  await w.advance(MAX_WAIT_MS + 100);
  let released = false;
  const p = w.gate.beforeRead(UID).then(() => { released = true; });
  await w.advance(READ_WAIT_MS - 100);
  assert.equal(released, false);
  await w.advance(200);
  await p;
  assert.equal(released, true);
});

test("with no write in flight, beforeRead resolves immediately", async () => {
  const w = world();
  let released = false;
  await w.gate.beforeRead(UID).then(() => { released = true; });
  assert.equal(released, true);
});

test("a failed write doesn't throw, isn't marked as done, and is reported", async () => {
  const w = world();
  w.state.writeFails = true;
  w.gate.request(UID);
  await w.advance(MAX_WAIT_MS + 200);
  assert.equal(w.writes.length, 1);
  assert.deepEqual(w.marked, []);
  assert.ok(w.traces.some(t => t[0] === "last_active_write_failed"));
});

test("reads of another user don't release this user's write", async () => {
  const w = world();
  w.gate.request(UID);
  const done = w.gate.readStarted("someone-else"); await w.advance(100); done();
  await w.advance(4000);
  assert.equal(w.writes.length, 0);
});

test("finishing a read twice is harmless", async () => {
  const w = world();
  w.gate.request(UID);
  const done = w.gate.readStarted(UID);
  const done2 = w.gate.readStarted(UID);
  await w.advance(100);
  done(); done(); // second call must not count as the other read finishing
  await w.advance(QUIET_MS + 500);
  assert.equal(w.writes.length, 0, "the other read is still in flight");
  done2();
  await w.advance(QUIET_MS + 300);
  assert.equal(w.writes.length, 1);
});

// ---- missing-profile retry -------------------------------------------------
const snap = (exists, fromCache = false) => ({ exists: () => exists, metadata: { fromCache }, tag: Math.random() });
function retryWorld({ first, second, firstThrows, secondThrows }) {
  const log = { sleeps: [], traces: [], fails: [], flags: [], calls: [] };
  const deps = {
    first: async () => { log.calls.push("first"); if (firstThrows) throw firstThrows; return first; },
    fromServer: async () => { log.calls.push("server"); if (secondThrows) throw secondThrows; return second; },
    sleep: async ms => { log.sleeps.push(ms); log.calls.push("sleep"); },
    trace: (s, d, l) => log.traces.push([s, d, l]),
    fail: (s, e, d) => log.fails.push([s, e.message, d]),
    flag: (n, d) => log.flags.push([n, d]),
  };
  return { deps, log };
}

test("retry: a profile that is found first time is returned at once, with nothing extra", async () => {
  const first = snap(true);
  const { deps, log } = retryWorld({ first });
  const out = await readWithMissingRetry(deps);
  assert.equal(out, first);
  assert.deepEqual(log.calls, ["first"]);
  assert.deepEqual(log.sleeps, []);
  assert.equal(log.flags.length, 0);
  assert.equal(log.traces.length, 0);
});

test("retry: first says missing, the server then finds it: the found profile is returned and flagged", async () => {
  const first = snap(false, false), second = snap(true, false);
  const { deps, log } = retryWorld({ first, second });
  const out = await readWithMissingRetry(deps);
  assert.equal(out, second);
  assert.deepEqual(log.calls, ["first", "sleep", "server"]);
  assert.deepEqual(log.sleeps, [RETRY_WAIT_MS]);
  assert.deepEqual(log.traces.map(t => t[0]), ["profile_retry_start", "profile_retry"]);
  assert.equal(log.traces[1][1].retryExists, true);
  assert.equal(log.flags.length, 1);
  assert.equal(log.flags[0][0], "profile_retry_rescued");
});

test("retry: a truly missing profile is still missing after the retry, about 1 s later, and is NOT flagged", async () => {
  const first = snap(false), second = snap(false);
  const { deps, log } = retryWorld({ first, second });
  const out = await readWithMissingRetry(deps);
  assert.equal(out.exists(), false);
  assert.equal(out, second);
  assert.deepEqual(log.sleeps, [1000]);
  assert.equal(log.traces[1][1].retryExists, false);
  assert.equal(log.flags.length, 0);
});

test("retry: when the second look fails, the error is thrown (not 'no account')", async () => {
  const boom = new Error("offline");
  const { deps, log } = retryWorld({ first: snap(false), secondThrows: boom });
  await assert.rejects(readWithMissingRetry(deps), e => e === boom);
  assert.equal(log.fails[0][0], "profile_retry_failed");
  assert.equal(log.flags.length, 0);
});

test("retry: a failed first read is thrown straight away, no retry", async () => {
  const boom = new Error("denied");
  const { deps, log } = retryWorld({ firstThrows: boom });
  await assert.rejects(readWithMissingRetry(deps), e => e === boom);
  assert.deepEqual(log.calls, ["first"]);
});

test("retry: the first-read callback sees exists/fromCache, and a throwing callback is ignored", async () => {
  const seen = [];
  const { deps } = retryWorld({ first: snap(true, true) });
  await readWithMissingRetry(deps, m => { seen.push(m); throw new Error("diag bug"); });
  assert.deepEqual(seen, [{ exists: true, fromCache: true }]);
});

await Promise.all(pending);
console.log(`${passed} passed, ${failed.length} failed`);
for (const f of failed) console.log(`  FAIL ${f}`);
process.exit(failed.length ? 1 : 0);
