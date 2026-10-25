// Unit checks for lib/loginErrors.ts and lib/roles.ts homeFor(): which failed
// sign-ins are the person's own answer, which are faults to report, and what
// the person is told. (Build 1.1 step 9.)
//
// Run:  node scripts/test-login-errors.mjs      (Node 22.6+ strips the types)

import assert from "node:assert/strict";
import { classifyLoginError, loginErrorMessage, NETWORK_MESSAGE, GENERIC_MESSAGE } from "../lib/loginErrors.ts";
import { homeFor, isValidRole } from "../lib/roles.ts";

let passed = 0;
const failed = [];
function test(name, fn) {
  try { fn(); passed++; } catch (err) { failed.push(`${name}: ${String(err.message).split("\n")[0]}`); }
}
const err = (code, name) => Object.assign(new Error(code ?? "x"), code ? { code } : {}, name ? { name } : {});

for (const code of ["auth/invalid-credential", "auth/user-not-found", "auth/wrong-password", "auth/invalid-email", "auth/user-disabled", "auth/too-many-requests"]) {
  test(`${code} is the person's own answer (not reported)`, () => assert.equal(classifyLoginError(err(code)).kind, "credential"));
}
test("a different-sign-in-method answer is also not a fault", () => assert.equal(classifyLoginError(err("auth/account-exists-with-different-credential")).kind, "credential"));

for (const code of ["auth/network-request-failed", "auth/timeout", "unavailable", "deadline-exceeded"]) {
  test(`${code} is a network problem`, () => {
    assert.equal(classifyLoginError(err(code)).kind, "network");
    assert.equal(loginErrorMessage(err(code)), NETWORK_MESSAGE);
  });
}
test("a read timeout / unreachable profile counts as network too", () => {
  assert.equal(classifyLoginError(err(undefined, "ReadTimeoutError")).kind, "network");
  assert.equal(loginErrorMessage(err(undefined, "ProfileUnreachableError")), NETWORK_MESSAGE);
});
test("the network message is the one the brief asked for", () => {
  assert.equal(NETWORK_MESSAGE, "Couldn’t reach Ball Masters. Check your connection and try again.");
});

for (const code of ["auth/internal-error", "auth/something-new", "permission-denied", ""]) {
  test(`'${code || "no code"}' is a fault to report, shown as the generic message`, () => {
    const c = classifyLoginError(err(code || undefined));
    assert.equal(c.kind, "other");
    assert.equal(loginErrorMessage(err(code || undefined)), GENERIC_MESSAGE);
  });
}
test("a network problem is never described as 'unexpected'", () => {
  for (const code of ["auth/network-request-failed", "auth/timeout", "unavailable"]) assert.ok(!/unexpected/i.test(loginErrorMessage(err(code))));
});
test("credential answers keep their wording", () => {
  assert.equal(loginErrorMessage(err("auth/invalid-credential")), "Invalid email or password.");
  assert.equal(loginErrorMessage(err("auth/too-many-requests")), "Too many failed attempts. Please try again later.");
});
test("non-error values don't throw", () => {
  assert.equal(classifyLoginError(null).kind, "other");
  assert.equal(classifyLoginError("boom").kind, "other");
  assert.equal(loginErrorMessage(undefined), GENERIC_MESSAGE);
});

test("homeFor: coach and admin to the coach screens, student to the student screens", () => {
  assert.equal(homeFor("coach"), "/coach/dashboard");
  assert.equal(homeFor("admin"), "/coach/dashboard");
  assert.equal(homeFor("student"), "/student/dashboard");
});
test("isValidRole: only the three roles", () => {
  for (const r of ["coach", "admin", "student"]) assert.equal(isValidRole(r), true);
  for (const r of [undefined, null, "", "undefined", "Coach", 1]) assert.equal(isValidRole(r), false);
});

console.log(`${passed} passed, ${failed.length} failed`);
for (const f of failed) console.log(`  FAIL ${f}`);
process.exit(failed.length ? 1 : 0);
