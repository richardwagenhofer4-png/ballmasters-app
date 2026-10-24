// Unit checks for lib/signOut.core.ts: the shared sign-out removes this
// account's push token while still signed in, never lets that block the
// sign-out, and still clears everything. Fake auth, fake timers.
//
// Run:  node scripts/test-sign-out.mjs      (Node 22.6+ strips the types)

import assert from "node:assert/strict";
import { createSignOut, TOKEN_REMOVE_LIMIT_MS } from "../lib/signOut.core.ts";

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
const flush = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };

function world({ uid = "u1", removal = async () => {}, signOutFails = false } = {}) {
  const log = [];
  const state = { signedIn: uid !== null, timers: [] };
  const signOutUser = createSignOut({
    currentUid: () => (state.signedIn ? uid : null),
    removePushToken: async u => {
      log.push(["remove", u, `signedIn=${state.signedIn}`]);
      await removal(u);
    },
    forgetSavedToken: u => log.push(["forget", u]),
    signOut: async () => {
      log.push(["signOut"]);
      if (signOutFails) throw new Error("signOut failed");
      state.signedIn = false;
    },
    clearAuthCookies: () => log.push(["cookies"]),
    setTimer: (fn, ms) => { const t = { fn, ms, live: true }; state.timers.push(t); return t; },
    clearTimer: t => { t.live = false; },
    onError: err => log.push(["error", String(err.message)]),
  });
  return { signOutUser, log, state };
}

test("the token is removed BEFORE signing out, while still signed in", async () => {
  const w = world();
  await w.signOutUser();
  assert.deepEqual(w.log.map(e => e[0]), ["remove", "forget", "signOut", "cookies"]);
  assert.equal(w.log[0][2], "signedIn=true", "removal ran after the sign-out would have happened");
});

test("the removal is for the person who is signed in", async () => {
  const w = world({ uid: "abc" });
  await w.signOutUser();
  assert.deepEqual(w.log[0].slice(0, 2), ["remove", "abc"]);
  assert.deepEqual(w.log[1], ["forget", "abc"]);
});

test("a failing removal is ignored and sign-out still happens", async () => {
  const w = world({ removal: async () => { throw new Error("permission-denied"); } });
  await w.signOutUser();
  assert.deepEqual(w.log.map(e => e[0]), ["remove", "error", "forget", "signOut", "cookies"]);
});

test("a removal that never finishes cannot block sign-out: it gets 2 s, then sign-out goes ahead", async () => {
  const w = world({ removal: () => new Promise(() => {}) });
  let done = false;
  const p = w.signOutUser().then(() => { done = true; });
  await flush();
  assert.equal(done, false, "still waiting for the removal");
  assert.equal(w.state.timers[0].ms, TOKEN_REMOVE_LIMIT_MS);
  assert.equal(TOKEN_REMOVE_LIMIT_MS, 2000);
  w.state.timers[0].fn();
  await p;
  assert.deepEqual(w.log.map(e => e[0]), ["remove", "forget", "signOut", "cookies"]);
});

test("nobody signed in: no removal, but sign-out and cleanup still run", async () => {
  const w = world({ uid: null });
  await w.signOutUser();
  assert.deepEqual(w.log.map(e => e[0]), ["signOut", "cookies"]);
});

test("removeToken: false (account deletion, no profile yet) skips the removal only", async () => {
  const w = world();
  await w.signOutUser({ removeToken: false });
  assert.deepEqual(w.log.map(e => e[0]), ["signOut", "cookies"]);
});

test("if the Firebase sign-out itself fails, the error reaches the caller and cookies are left alone (as before)", async () => {
  const w = world({ signOutFails: true });
  await assert.rejects(w.signOutUser(), /signOut failed/);
  assert.ok(!w.log.some(e => e[0] === "cookies"));
});

await Promise.all(pending);
console.log(`${passed} passed, ${failed.length} failed`);
for (const f of failed) console.log(`  FAIL ${f}`);
process.exit(failed.length ? 1 : 0);
