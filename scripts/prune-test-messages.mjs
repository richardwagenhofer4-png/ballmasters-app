// One-off: list, and optionally delete, individual messages in the single
// Test Coach <-> Test Student thread. TEST DATA ONLY.
//
// Scope is deliberately fixed: it only ever touches the thread between
// test@test.com (coach) and test@test1.com (athlete). It takes no email
// arguments and does no pattern matching — you name the exact document ids to
// remove, or it removes nothing.
//
// DRY RUN BY DEFAULT: with no arguments it prints the thread's messages,
// oldest first, and writes nothing.
//
// It never touches the thread doc itself — not lastMessage, lastAt,
// lastSenderRole, unreadForCoach or unreadForAthlete — and never touches
// notifications. Because the thread doc carries a denormalised lastMessage
// copy of the newest message body (lib/messaging.ts:58), deleting the newest
// message would strand that copy, so that is refused outright.
//
// Needs in env (loaded via `node --env-file=.env.local`):
//   - existing FIREBASE_ADMIN_* / NEXT_PUBLIC_FIREBASE_PROJECT_ID vars in .env.local
//
// Run (dry run): node --env-file=.env.local scripts/prune-test-messages.mjs
// Run (delete):  node --env-file=.env.local scripts/prune-test-messages.mjs --delete id1,id2

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

// --- args ------------------------------------------------------------------

const argv = process.argv.slice(2);
const deleteIdx = argv.indexOf("--delete");
const DELETE_MODE = deleteIdx !== -1;
const REQUESTED_IDS = DELETE_MODE
  ? (argv[deleteIdx + 1] ?? "").split(",").map((s) => s.trim()).filter(Boolean)
  : [];

// --- helpers ---------------------------------------------------------------

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

// createdAt is written by serverTimestamp(), so it arrives as a Firestore
// Timestamp. Older rows could hold an ISO string; handle both.
function toIso(v) {
  if (!v) return "(no timestamp)";
  if (typeof v.toDate === "function") return v.toDate().toISOString();
  if (typeof v === "string") return v;
  return String(v);
}

function sortKey(v) {
  if (!v) return 0;
  if (typeof v.toDate === "function") return v.toDate().getTime();
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isNaN(t) ? 0 : t;
  }
  return 0;
}

function trunc(s, n = 80) {
  const t = String(s ?? "").replace(/\s+/g, " ");
  return t.length <= n ? t : `${t.slice(0, n)}…`;
}

function fmt(i, doc) {
  const d = doc.data();
  return `${String(i).padStart(3)}  ${doc.id}  ${String(d.senderRole ?? "?").padEnd(7)}  ${toIso(d.createdAt).padEnd(24)}  "${trunc(d.text)}"`;
}

// Fetch every message and sort in JS rather than with orderBy(): a Firestore
// orderBy silently drops documents missing the ordered field, which would make
// the listing incomplete and could make a real id look absent.
async function loadMessages(threadRef) {
  const snap = await threadRef.collection("messages").get();
  return snap.docs.sort((a, b) => sortKey(a.data().createdAt) - sortKey(b.data().createdAt));
}

// --- resolve the one thread this script is allowed to touch ----------------

const coach = await resolve("Test Coach", COACH_EMAIL);
const student = await resolve("Test Student", STUDENT_EMAIL);

if (!coach.uid || !student.uid) {
  console.error(`Could not resolve both test accounts (coach=${coach.uid ?? "NOT FOUND"}, student=${student.uid ?? "NOT FOUND"}) — aborting, nothing changed.`);
  process.exit(1);
}

// Thread id format from lib/messaging.ts:13 — `${coachId}__${athleteId}`.
const tid = `${coach.uid}__${student.uid}`;
const threadRef = db.collection("threads").doc(tid);
const threadSnap = await threadRef.get();

if (!threadSnap.exists) {
  console.log(`Thread ${tid} does not exist — nothing to do.`);
  process.exit(0);
}

const messages = await loadMessages(threadRef);

// --- dry run ---------------------------------------------------------------

if (!DELETE_MODE) {
  if (messages.length === 0) console.log("(no messages in this thread)");
  else messages.forEach((doc, i) => console.log(fmt(i, doc)));
  process.exit(0);
}

// --- delete path -----------------------------------------------------------

console.log(`${LINE}\nDELETE MODE — thread ${tid}\n${LINE}`);

if (REQUESTED_IDS.length === 0) {
  console.error("--delete needs a comma-separated list of message ids, e.g. --delete id1,id2 — aborting, nothing deleted.");
  process.exit(1);
}

const byId = new Map(messages.map((d) => [d.id, d]));

// Rail 1: every supplied id must exist in THIS thread.
const missing = REQUESTED_IDS.filter((id) => !byId.has(id));
if (missing.length > 0) {
  console.error(`These id(s) are not messages in thread ${tid}:`);
  missing.forEach((id) => console.error(`  ${id}`));
  console.error("Aborting — nothing deleted.");
  process.exit(1);
}

// Rail 2: never delete the newest message. The thread doc's denormalised
// lastMessage points at it, and this script must not strand that copy.
const newest = messages[messages.length - 1];
if (REQUESTED_IDS.includes(newest.id)) {
  console.error(`${newest.id} is the NEWEST message in this thread.`);
  console.error(`The thread doc's lastMessage is a denormalised copy of it, and this script does not update the thread doc.`);
  console.error(`Deleting it would leave lastMessage pointing at a row that no longer exists.`);
  console.error("Aborting — nothing deleted.");
  process.exit(1);
}

// Show exactly what is about to go.
console.log(`\nAbout to delete ${REQUESTED_IDS.length} message(s):`);
REQUESTED_IDS.forEach((id) => {
  const doc = byId.get(id);
  console.log(fmt(messages.indexOf(doc), doc));
});

console.log("\nDeleting…");
for (const id of REQUESTED_IDS) {
  await byId.get(id).ref.delete();
  console.log(`  deleted ${id}`);
}

// Re-read so the result is visible rather than assumed.
const remaining = await loadMessages(threadRef);
console.log(`\n${LINE}\nREMAINING messages in thread ${tid} (${remaining.length})\n${LINE}`);
if (remaining.length === 0) console.log("(none)");
else remaining.forEach((doc, i) => console.log(fmt(i, doc)));

console.log(`\nDeleted ${REQUESTED_IDS.length} message(s). Thread doc untouched (lastMessage, lastAt, lastSenderRole, unread counts unchanged). No notifications touched.`);
