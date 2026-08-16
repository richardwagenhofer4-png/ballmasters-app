// READ-ONLY diagnostic. Counts athletes who are stranded with no coach.
//
// This script ONLY reads. It performs no setDoc/updateDoc/deleteDoc/batch
// writes, seeds nothing, and touches only the `users` collection.
//
// Reports:
//   1. Total users with role == "student".
//   2. How many have no usable coachId (missing / null / empty / whitespace).
//   3. Of those, how many carry needsCoachAssignment == true (registered after
//      commit 9c245f5) vs. none (predate the fix — invisible to a flag query).
//   4. Per stranded athlete: uid, fullName, email, createdAt, guardianManaged.
//   5. Test/throwaway accounts labelled (by email/name heuristic) so real
//      families can be told apart from leftover test data. Nothing is deleted.
//   6. How many coachId values point at a user who does not exist or is not a
//      coach — an athlete assigned to a deleted coach is stranded in a way no
//      needsCoachAssignment flag would catch.
//
// Needs in env (loaded via `node --env-file=.env.local`):
//   - existing FIREBASE_ADMIN_* / NEXT_PUBLIC_FIREBASE_PROJECT_ID vars in .env.local
//
// Run: node --env-file=.env.local scripts/count-unassigned-athletes.mjs

import { cert, getApps, initializeApp as initAdminApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (getApps().length === 0) {
  initAdminApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}
const db = getFirestore();

// --- helpers -------------------------------------------------------------

function hasUsableCoachId(data) {
  const c = data.coachId;
  return typeof c === "string" && c.trim().length > 0;
}

// Heuristic only — labels likely test/throwaway accounts. Never deletes.
function looksLikeTest(data) {
  const email = (data.email ?? "").toLowerCase();
  const name = (data.fullName ?? "").toLowerCase();
  const hay = `${email} ${name}`;
  const patterns = [
    "test", "throwaway", "example.com", "example.org", "demo",
    "placeholder", "asdf", "qwerty", "foo", "bar", "temp", "dummy",
    "delete", "+test", "no-reply", "noreply", "sample", "fake",
  ];
  return patterns.some((p) => hay.includes(p));
}

function fmtCreatedAt(v) {
  if (!v) return "(none)";
  // Firestore Timestamp
  if (typeof v === "object" && typeof v.toDate === "function") {
    try { return v.toDate().toISOString(); } catch { return String(v); }
  }
  if (typeof v === "string") return v; // ISO string stored directly
  return String(v);
}

// --- read all users ------------------------------------------------------

console.log("Reading users collection (read-only)…\n");
const usersSnap = await db.collection("users").get();

const all = usersSnap.docs.map((d) => ({ uid: d.id, data: d.data() }));
const students = all.filter((u) => u.data.role === "student");

// Build a lookup of every user id -> role, to validate coachId targets.
const roleById = new Map(all.map((u) => [u.uid, u.data.role]));

// --- (2)(3) stranded: no usable coachId ---------------------------------

const stranded = students.filter((u) => !hasUsableCoachId(u.data));
const strandedFlagged = stranded.filter((u) => u.data.needsCoachAssignment === true);
const strandedUnflagged = stranded.filter((u) => u.data.needsCoachAssignment !== true);

// --- (6) coachId pointing at a non-existent / non-coach user ------------
// Among students who DO have a coachId, is the target a real coach?
const withCoachId = students.filter((u) => hasUsableCoachId(u.data));
const danglingCoach = withCoachId.filter((u) => {
  const targetRole = roleById.get(u.data.coachId.trim());
  return targetRole === undefined || (targetRole !== "coach" && targetRole !== "admin");
});

// --- test vs real for the summary ---------------------------------------
const strandedReal = stranded.filter((u) => !looksLikeTest(u.data));
const strandedTest = stranded.filter((u) => looksLikeTest(u.data));

// --- SUMMARY -------------------------------------------------------------

const line = "=".repeat(72);
console.log(line);
console.log("SUMMARY");
console.log(line);
console.log(`Total students (role == "student"):            ${students.length}`);
console.log(`Stranded (no usable coachId):                  ${stranded.length}`);
console.log(`  ...of which appear to be REAL people:        ${strandedReal.length}`);
console.log(`  ...of which look like test/throwaway:        ${strandedTest.length}`);
console.log(`  ...flagged needsCoachAssignment==true:       ${strandedFlagged.length}  (post-fix)`);
console.log(`  ...NOT flagged (predate the fix):            ${strandedUnflagged.length}  (a flag-only query would miss these)`);
console.log(`Students assigned to a missing/non-coach id:   ${danglingCoach.length}  (stranded, no flag would catch)`);
console.log();

// --- (4)(5) DETAIL: each stranded athlete -------------------------------

function printAthlete(u) {
  const d = u.data;
  const guardian = d.guardianManaged === true ? "guardianManaged=YES" : "guardianManaged=no";
  const flag = d.needsCoachAssignment === true ? "flagged" : "UNFLAGGED";
  const test = looksLikeTest(d) ? " [LIKELY TEST]" : "";
  console.log(
    `  uid=${u.uid}  name=${JSON.stringify(d.fullName ?? "")}  email=${JSON.stringify(d.email ?? "")}  ` +
    `createdAt=${fmtCreatedAt(d.createdAt)}  ${guardian}  ${flag}${test}`
  );
}

console.log(line);
console.log(`STRANDED ATHLETES — no usable coachId (${stranded.length})`);
console.log(line);
if (stranded.length === 0) {
  console.log("  (none)");
} else {
  console.log("-- appear to be REAL people --");
  if (strandedReal.length === 0) console.log("  (none)");
  strandedReal.forEach(printAthlete);
  console.log("-- look like test/throwaway --");
  if (strandedTest.length === 0) console.log("  (none)");
  strandedTest.forEach(printAthlete);
}
console.log();

console.log(line);
console.log(`ASSIGNED TO A MISSING OR NON-COACH coachId (${danglingCoach.length})`);
console.log(line);
if (danglingCoach.length === 0) {
  console.log("  (none)");
} else {
  danglingCoach.forEach((u) => {
    const target = u.data.coachId.trim();
    const targetRole = roleById.get(target);
    const why = targetRole === undefined ? "target user does not exist" : `target role is "${targetRole}"`;
    const test = looksLikeTest(u.data) ? " [LIKELY TEST]" : "";
    console.log(
      `  uid=${u.uid}  name=${JSON.stringify(u.data.fullName ?? "")}  email=${JSON.stringify(u.data.email ?? "")}  ` +
      `coachId=${target}  (${why})${test}`
    );
  });
}
console.log();
console.log("Done. Read-only — nothing was modified.");
