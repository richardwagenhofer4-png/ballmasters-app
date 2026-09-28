// Emulator test for the paywall parts of firestore.rules.
//
// Never touches a real project: it runs against the local Firestore emulator
// under a demo- project id, seeds its own data and wipes it between cases.
//
// Checks:
//   1. Switch OFF (no config/app doc; paywallEnabled false; field absent):
//      every student read/write the app does today still succeeds, whatever
//      the student's plan fields say.
//   2. Switch ON: none / expired → no videos, breakdowns or messaging;
//      Access → videos (list + standard get) only; Coached → everything;
//      coaches and admins unaffected.
//   3. Always: a user can't create or delete a users doc (their own
//      included), or change their own role, coachId or plan/billing fields;
//      ordinary profile writes still work; admins can still update users;
//      config/app is read-only.
//
// Needs Java 11+ and the Firebase CLI. One-time, without touching package.json:
//   npm i --no-save @firebase/rules-unit-testing
// Run:
//   firebase emulators:exec --only firestore --project demo-ballmasters "node scripts/test-paywall-rules.mjs"
// Options (env):
//   RULES_FILE=path          rules to load (default firestore.rules)
//   ONLY_SWITCH_OFF=1        run only check 1 — e.g. against main's rules to
//                            confirm the switch-off expectations match today

import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertFails, assertSucceeds } from "@firebase/rules-unit-testing";
import {
  Timestamp,
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";

const RULES_FILE = process.env.RULES_FILE ?? "firestore.rules";
const ONLY_SWITCH_OFF = process.env.ONLY_SWITCH_OFF === "1";

const env = await initializeTestEnvironment({
  projectId: "demo-ballmasters",
  firestore: { rules: readFileSync(RULES_FILE, "utf8") },
});

const DAY = 86_400_000;
const STUDENTS = ["none", "access", "coached", "expired"];

async function seed(config) {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    const put = (path, data) => setDoc(doc(db, path), data);
    if (config !== undefined) await put("config/app", config);
    await put("settings/general", { headCoachId: "coach" });
    await put("users/coach", { role: "coach", fullName: "Coach" });
    await put("users/admin", { role: "admin", fullName: "Admin" });
    await put("users/none", { role: "student", fullName: "None", coachId: "coach" });
    await put("users/access", { role: "student", fullName: "Access", coachId: "coach", plan: "access", planSource: "admin", planExpiresAt: null });
    await put("users/coached", { role: "student", fullName: "Coached", coachId: "coach", plan: "coached", planSource: "revenuecat", planExpiresAt: Timestamp.fromMillis(Date.now() + 30 * DAY) });
    await put("users/expired", { role: "student", fullName: "Expired", coachId: "coach", plan: "coached", planSource: "admin", planExpiresAt: Timestamp.fromMillis(Date.now() - DAY) });
    const base = { coachId: "coach", coachName: "Coach", studentIds: STUDENTS, viewedBy: [], createdAt: "2026-09-01T00:00:00.000Z" };
    await put("videos/std", { ...base, type: "standard", title: "Standard", fileName: "k" });
    await put("videos/drill", { ...base, type: "drill_comparison", title: "Drill", coachVideoKey: "a", studentVideoKey: "b" });
    await put("videos/legacyDrill", { ...base, title: "Legacy drill", coachVideoKey: "a", studentVideoKey: "b" });
    await put("videos/std/annotations/10", { timestamp: 1, pauseOnPlay: false, drawings: [] });
    await put("videos/std/voiceover/main", { fileName: "voiceovers/x.webm", startTime: 0, duration: 3 });
    for (const s of STUDENTS) {
      await put(`threads/coach__${s}`, { coachId: "coach", athleteId: s, coachName: "Coach", athleteName: s });
      await put(`threads/coach__${s}/messages/m1`, { senderId: "coach", senderRole: "coach", text: "hi" });
    }
  });
}

const as = uid => env.authenticatedContext(uid).firestore();

let passed = 0;
const failed = [];
async function check(label, shouldAllow, op) {
  try {
    await (shouldAllow ? assertSucceeds(op()) : assertFails(op()));
    passed++;
  } catch (err) {
    failed.push(`${label}: expected ${shouldAllow ? "ALLOW" : "DENY"} (${String(err.message).split("\n")[0]})`);
  }
}

// Every student operation the app performs on videos, breakdowns and messaging.
function studentOps(uid) {
  const db = as(uid);
  return {
    "list my videos": [() => getDocs(query(collection(db, "videos"), where("studentIds", "array-contains", uid))), "videos"],
    "get standard video": [() => getDoc(doc(db, "videos/std")), "videos"],
    "get drill comparison": [() => getDoc(doc(db, "videos/drill")), "drill"],
    "get legacy drill (keys, no type)": [() => getDoc(doc(db, "videos/legacyDrill")), "drill"],
    "read annotations": [() => getDocs(collection(db, "videos/std/annotations")), "breakdown"],
    "read voiceover": [() => getDoc(doc(db, "videos/std/voiceover/main")), "breakdown"],
    "read my thread": [() => getDoc(doc(db, `threads/coach__${uid}`)), "messaging"],
    "mark thread read": [() => updateDoc(doc(db, `threads/coach__${uid}`), { unreadForAthlete: 0 }), "messaging"],
    "list messages": [() => getDocs(collection(db, `threads/coach__${uid}/messages`)), "messaging"],
    "send message": [() => addDoc(collection(db, `threads/coach__${uid}/messages`), { senderId: uid, senderRole: "student", text: "yo", createdAt: serverTimestamp() }), "messaging"],
    "open a new thread": [() => setDoc(doc(db, `threads/coach2__${uid}`), { coachId: "coach2", athleteId: uid }, { merge: true }), "messaging"],
  };
}

// --- 1. Switch OFF ----------------------------------------------------------
for (const [name, config] of [
  ["no config/app doc", undefined],
  ["paywallEnabled: false", { paywallEnabled: false }],
  ["paywallEnabled absent", { planToolsEnabled: true }],
]) {
  await seed(config);
  for (const s of STUDENTS) {
    for (const [op, [fn]] of Object.entries(studentOps(s))) {
      await check(`OFF (${name}) · ${s} · ${op}`, true, fn);
    }
  }
}

if (!ONLY_SWITCH_OFF) {
  // --- 2. Switch ON ---------------------------------------------------------
  await seed({ paywallEnabled: true });
  const allowedAreas = {
    none: [],
    expired: [],
    access: ["videos"],
    coached: ["videos", "drill", "breakdown", "messaging"],
  };
  for (const s of STUDENTS) {
    for (const [op, [fn, area]] of Object.entries(studentOps(s))) {
      await seed({ paywallEnabled: true }); // writes in one op must not leak into the next
      await check(`ON · ${s} · ${op}`, allowedAreas[s].includes(area), fn);
    }
  }
  await seed({ paywallEnabled: true });
  const coach = as("coach");
  await check("ON · coach · get drill", true, () => getDoc(doc(coach, "videos/drill")));
  await check("ON · coach · list own videos", true, () => getDocs(query(collection(coach, "videos"), where("coachId", "==", "coach"))));
  await check("ON · coach · read annotations", true, () => getDocs(collection(coach, "videos/std/annotations")));
  await check("ON · coach · read voiceover", true, () => getDoc(doc(coach, "videos/std/voiceover/main")));
  await check("ON · coach · list threads", true, () => getDocs(query(collection(coach, "threads"), where("coachId", "==", "coach"))));
  await check("ON · coach · message an Access athlete", true, () => addDoc(collection(coach, "threads/coach__access/messages"), { senderId: "coach", senderRole: "coach", text: "hi" }));
  await check("ON · coach · update own video (hasBreakdown)", true, () => updateDoc(doc(coach, "videos/std"), { hasBreakdown: true }));
  const admin = as("admin");
  await check("ON · admin · get drill", true, () => getDoc(doc(admin, "videos/drill")));
  await check("ON · admin · read annotations", true, () => getDocs(collection(admin, "videos/std/annotations")));

  // --- 3. Always: plan fields + config ---------------------------------------
  for (const [name, config] of [["OFF", undefined], ["ON", { paywallEnabled: true }]]) {
    await seed(config);
    const me = as("none");
    await check(`${name} · student renames self`, true, () => setDoc(doc(me, "users/none"), { fullName: "New Name" }, { merge: true }));
    await check(`${name} · student saves fcmToken`, true, () => setDoc(doc(me, "users/none"), { fcmToken: "t" }, { merge: true }));
    await check(`${name} · student lastActiveAt`, true, () => updateDoc(doc(me, "users/none"), { lastActiveAt: serverTimestamp() }));
    for (const field of ["plan", "planSource", "planExpiresAt", "planProductId", "planIsTrial", "planWillRenew", "rcAppUserId", "revenuecat", "adminGrant"]) {
      await check(`${name} · student writes own ${field}`, false, () => setDoc(doc(me, "users/none"), { [field]: "coached" }, { merge: true }));
    }
    // Role hardening: profiles are created/deleted server-side only.
    await check(`${name} · new user creates own profile`, false, () => setDoc(doc(as("newbie"), "users/newbie"), { uid: "newbie", role: "student", fullName: "N" }));
    await check(`${name} · new user creates own profile as coach`, false, () => setDoc(doc(as("newbie"), "users/newbie"), { uid: "newbie", role: "coach", fullName: "N" }));
    await check(`${name} · new user creates profile with a plan`, false, () => setDoc(doc(as("newbie2"), "users/newbie2"), { uid: "newbie2", role: "student", plan: "coached" }));
    await check(`${name} · admin creates a profile from the client`, false, () => setDoc(doc(as("admin"), "users/newbie3"), { uid: "newbie3", role: "student" }));
    await check(`${name} · student makes self coach`, false, () => setDoc(doc(me, "users/none"), { role: "coach" }, { merge: true }));
    await check(`${name} · student makes self admin`, false, () => updateDoc(doc(me, "users/none"), { role: "admin" }));
    await check(`${name} · coach makes self admin`, false, () => updateDoc(doc(as("coach"), "users/coach"), { role: "admin" }));
    await check(`${name} · student removes own role`, false, () => updateDoc(doc(me, "users/none"), { role: deleteField() }));
    await check(`${name} · student changes own coachId`, false, () => updateDoc(doc(me, "users/none"), { coachId: "coach2" }));
    await check(`${name} · student removes own coachId`, false, () => updateDoc(doc(me, "users/none"), { coachId: deleteField() }));
    await check(`${name} · student renames self alongside a role change`, false, () => setDoc(doc(me, "users/none"), { fullName: "X", role: "coach" }, { merge: true }));
    await check(`${name} · student picks an avatar`, true, () => setDoc(doc(me, "users/none"), { avatarId: "a1" }, { merge: true }));
    await check(`${name} · coach saves currentInviteCode`, true, () => updateDoc(doc(as("coach"), "users/coach"), { currentInviteCode: "ABCD1234" }));
    await check(`${name} · coach renames self`, true, () => setDoc(doc(as("coach"), "users/coach"), { fullName: "Coach Two" }, { merge: true }));
    await check(`${name} · admin assigns a coach`, true, () => setDoc(doc(as("admin"), "users/none"), { coachId: "coach", needsCoachAssignment: false }, { merge: true }));
    await check(`${name} · admin changes a role`, true, () => updateDoc(doc(as("admin"), "users/expired"), { role: "coach" }));
    await check(`${name} · admin sets a student's plan`, true, () => updateDoc(doc(as("admin"), "users/none"), { plan: "access" }));
    await check(`${name} · signed-in read config/app`, true, () => getDoc(doc(me, "config/app")));
    await check(`${name} · signed-out read config/app`, false, () => getDoc(doc(env.unauthenticatedContext().firestore(), "config/app")));
    await check(`${name} · student writes config/app`, false, () => setDoc(doc(me, "config/app"), { paywallEnabled: false }));
    await check(`${name} · admin writes config/app from the client`, false, () => setDoc(doc(as("admin"), "config/app"), { paywallEnabled: false }));
    await check(`${name} · student reads billingEvents`, false, () => getDoc(doc(me, "billingEvents/x")));
    // Deletes last: if one were (wrongly) allowed it must not skew the checks above.
    await check(`${name} · student deletes own profile`, false, () => deleteDoc(doc(me, "users/none")));
    await check(`${name} · coach deletes own profile`, false, () => deleteDoc(doc(as("coach"), "users/coach")));
    await check(`${name} · admin deletes a profile from the client`, false, () => deleteDoc(doc(as("admin"), "users/none")));
  }
}

await env.cleanup();

console.log(`${passed} passed, ${failed.length} failed (rules: ${RULES_FILE}${ONLY_SWITCH_OFF ? ", switch-off checks only" : ""})`);
for (const f of failed) console.log("  ✗ " + f);
process.exit(failed.length ? 1 : 0);
