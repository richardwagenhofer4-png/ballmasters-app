// One-off cleanup: remove two test/junk conversations. TEST DATA ONLY.
//
//   Pass A: Test Coach (test@test.com) as coach  <->  Test Student
//           (test@test1.com) as athlete  — plus the Test Student's
//           new_message notifications.
//   Pass B: the head coach (settings/general.headCoachId, NOT hardcoded) as
//           coach  <->  Test Coach as the "athlete" — the reverse arrangement,
//           created by accident — plus the Test Coach's new_message
//           notifications.
//
// Each pass prints everything it found BEFORE deleting, then deletes the
// thread's /messages subcollection, then the thread doc, then the recipient's
// new_message notifications. If a thread is not found, it says so and moves on
// (never errors out). Touches nothing else.
//
// Needs in env (loaded via `node --env-file=.env.local`):
//   - existing FIREBASE_ADMIN_* / NEXT_PUBLIC_FIREBASE_PROJECT_ID vars in .env.local
//
// Run: node --env-file=.env.local scripts/delete-test-thread.mjs

import { cert, getApps, initializeApp as initAdminApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth as getAdminAuth } from "firebase-admin/auth";

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
const adminAuth = getAdminAuth();

const COACH_EMAIL = "test@test.com";
const STUDENT_EMAIL = "test@test1.com";

const LINE = "=".repeat(70);

// Resolve a uid + user doc by email. Prefer Admin Auth (authoritative uid),
// fall back to a Firestore users query on the email field.
async function resolve(label, email) {
  let uid = null;
  try {
    const rec = await adminAuth.getUserByEmail(email);
    uid = rec.uid;
  } catch {
    const q = await db.collection("users").where("email", "==", email).get();
    if (!q.empty) uid = q.docs[0].id;
  }
  if (!uid) return { label, email, uid: null, doc: null };
  const snap = await db.collection("users").doc(uid).get();
  return { label, email, uid, doc: snap.exists ? snap.data() : null };
}

// One cleanup pass. Prints what it finds, deletes it, returns tallies.
// notifRecipientUid: whose new_message notifications to remove for this pass.
async function cleanupPass({ title, coachUid, athleteUid, notifRecipientUid, notifRecipientLabel }) {
  console.log(`\n${LINE}\n${title}\n${LINE}`);
  const tally = { threads: 0, messages: 0, notifs: 0, threadIds: [] };

  // --- Find thread(s): coachId == coachUid AND athleteId == athleteUid -------
  // Single-field query + JS filter to avoid needing a composite index.
  const byCoach = await db.collection("threads").where("coachId", "==", coachUid).get();
  const matching = byCoach.docs.filter((d) => d.data().athleteId === athleteUid);

  console.log(`FOUND ${matching.length} matching thread(s) (coachId=${coachUid}, athleteId=${athleteUid})`);
  if (matching.length === 0) {
    console.log("  (thread not found — nothing to delete for this pair; moving on)");
  }

  const plan = [];
  for (const tDoc of matching) {
    const msgsSnap = await tDoc.ref.collection("messages").get();
    console.log(`\n  thread id: ${tDoc.id}`);
    console.log(`    fields: ${JSON.stringify(tDoc.data())}`);
    console.log(`    messages subcollection count: ${msgsSnap.size}`);
    plan.push({ ref: tDoc.ref, id: tDoc.id, messageDocs: msgsSnap.docs });
  }

  // --- Find new_message notifications for the affected recipient -------------
  const byRecipient = await db.collection("notifications").where("recipientId", "==", notifRecipientUid).get();
  const notifs = byRecipient.docs.filter((d) => d.data().type === "new_message");
  console.log(`\nFOUND ${notifs.length} new_message notification(s) for ${notifRecipientLabel} (recipientId=${notifRecipientUid})`);
  for (const n of notifs) {
    console.log(`  notif id: ${n.id}  fields: ${JSON.stringify(n.data())}`);
  }

  // --- Delete ---------------------------------------------------------------
  console.log("\nDELETING…");
  if (plan.length === 0 && notifs.length === 0) {
    console.log("  (nothing to delete)");
  }
  for (const t of plan) {
    for (const m of t.messageDocs) {
      await m.ref.delete();
      tally.messages++;
    }
    console.log(`  deleted ${t.messageDocs.length} message(s) under thread ${t.id}`);
    await t.ref.delete();
    tally.threads++;
    tally.threadIds.push(t.id);
    console.log(`  deleted thread ${t.id}`);
  }
  for (const n of notifs) {
    await n.ref.delete();
    tally.notifs++;
    console.log(`  deleted notification ${n.id}`);
  }

  return tally;
}

// --- Resolve accounts ------------------------------------------------------
console.log("Resolving accounts…\n");
const coach = await resolve("Test Coach", COACH_EMAIL);
const student = await resolve("Test Student", STUDENT_EMAIL);

console.log(`  ${coach.label}   (${coach.email}): uid=${coach.uid ?? "(NOT FOUND)"}  fullName=${JSON.stringify(coach.doc?.fullName ?? null)}`);
console.log(`  ${student.label} (${student.email}): uid=${student.uid ?? "(NOT FOUND)"}  fullName=${JSON.stringify(student.doc?.fullName ?? null)}`);

if (!coach.uid || !student.uid) {
  console.error("\nCould not resolve both test accounts — aborting, nothing deleted.");
  process.exit(1);
}

// Head coach uid from settings/general — never hardcoded.
const settingsSnap = await db.collection("settings").doc("general").get();
const headCoachId = settingsSnap.exists ? (settingsSnap.data()?.headCoachId ?? null) : null;
let headCoachName = null;
if (headCoachId) {
  const hcSnap = await db.collection("users").doc(headCoachId).get();
  headCoachName = hcSnap.exists ? (hcSnap.data()?.fullName ?? null) : null;
}
console.log(`  Head Coach (settings/general.headCoachId): uid=${headCoachId ?? "(NOT SET)"}  fullName=${JSON.stringify(headCoachName)}`);

// --- Pass A: Test Coach (coach) <-> Test Student (athlete) -----------------
const tallyA = await cleanupPass({
  title: "PASS A — Test Coach (coach) <-> Test Student (athlete)",
  coachUid: coach.uid,
  athleteUid: student.uid,
  notifRecipientUid: student.uid,
  notifRecipientLabel: "Test Student",
});

// --- Pass B: Head Coach (coach) <-> Test Coach (athlete), reverse junk ------
let tallyB = { threads: 0, messages: 0, notifs: 0, threadIds: [] };
if (!headCoachId) {
  console.log(`\n${LINE}\nPASS B — Head Coach (coach) <-> Test Coach (athlete)\n${LINE}`);
  console.log("  settings/general.headCoachId is not set — cannot resolve head coach; skipping pass B.");
} else {
  tallyB = await cleanupPass({
    title: "PASS B — Head Coach (coach) <-> Test Coach (athlete)  [reverse junk thread]",
    coachUid: headCoachId,
    athleteUid: coach.uid,
    notifRecipientUid: coach.uid,
    notifRecipientLabel: "Test Coach",
  });
}

// --- Final summary ---------------------------------------------------------
const totalThreads = tallyA.threads + tallyB.threads;
const totalMessages = tallyA.messages + tallyB.messages;
const totalNotifs = tallyA.notifs + tallyB.notifs;
const allThreadIds = [...tallyA.threadIds, ...tallyB.threadIds];

console.log(`\n${LINE}\nDONE — summary of exactly what was deleted\n${LINE}`);
console.log(`  Pass A (Test Coach <-> Test Student):  threads=${tallyA.threads}, messages=${tallyA.messages}, new_message notifs=${tallyA.notifs}`);
console.log(`  Pass B (Head Coach <-> Test Coach):    threads=${tallyB.threads}, messages=${tallyB.messages}, new_message notifs=${tallyB.notifs}`);
console.log(`  TOTAL threads deleted:              ${totalThreads}${allThreadIds.length ? "  [" + allThreadIds.join(", ") + "]" : ""}`);
console.log(`  TOTAL thread messages deleted:      ${totalMessages}`);
console.log(`  TOTAL new_message notifs deleted:   ${totalNotifs}`);
console.log(`  (touched no other thread, user, or notification)`);
