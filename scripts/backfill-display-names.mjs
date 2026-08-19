// One-time cleanup: denormalised display names, plus a few fixed text edits.
//
// Two kinds of pass live here. The display-name passes are re-derivable — they
// read from users/{uid}, so re-running self-corrects. The text passes are
// one-way edits to what someone actually wrote, matched on the whole trimmed
// field, and the original survives nowhere afterwards.
//
// Display names are copied onto documents at write time and were never
// refreshed when the Settings page (commit 2614cd3) started letting users
// rename themselves. This re-points three denormalised copies at the current
// value of users/{uid}.fullName (falling back to users/{uid}.name):
//
//   videos/{videoId}.coachName                  — frozen at upload
//   videos/{videoId}/comments/{id}.authorName   — frozen at write; replies are
//                                                 flat docs in the same
//                                                 subcollection carrying a
//                                                 parentId, so one pass covers
//                                                 top-level comments and replies
//   threads/{threadId}.coachName / .athleteName — frozen at thread creation
//
// Field names were read out of components/CommentsSection.tsx (authorId /
// authorName / parentId), app/api/videos/route.ts (coachId / coachName) and
// lib/messaging.ts (coachId / athleteId / coachName / athleteName), not guessed.
//
// Plus two one-off whole-field typo fixes:
//
//   videos/{videoId}/comments/{id}.text  — see TEXT_FIX_FROM
//   threads/{threadId}/messages/{id}.text — see MESSAGE_FIX_FROM
//
// DRY RUN BY DEFAULT. Nothing is written unless --apply is passed. No field
// other than the five above is ever touched.
//
// Needs in env (loaded via `node --env-file=.env.local`):
//   FIREBASE_ADMIN_PROJECT_ID / FIREBASE_ADMIN_CLIENT_EMAIL / FIREBASE_ADMIN_PRIVATE_KEY
//
// Run (dry run):  node --env-file=.env.local scripts/backfill-display-names.mjs
// Run (for real): node --env-file=.env.local scripts/backfill-display-names.mjs --apply

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

const APPLY = process.argv.includes("--apply");

// Comment ids deliberately left alone by the authorName pass. This one's stored
// authorName is a DIFFERENT person's name rather than a stale spelling of the
// same person's: the account (rVOO9dAn6yPxqcIAuwcvP5JEi5b2) was named
// "Richard Wagenhofer" when the comment was written and is now Lukas Hombach's.
// Rewriting it would change who appears to have said it, and the old string
// survives nowhere else, so the change is not reversible. Left as-is by decision.
const SKIP_COMMENTS = new Set(["yOFnRkkz08rJmHPw65EY"]);

// Whole-field typo fix applied by backfillCommentText(). Matched against the
// trimmed field value in full — never as a substring rewrite.
const TEXT_FIX_FROM = "Very fun excersice";
const TEXT_FIX_TO = "Very fun exercise";

// Whole-field typo fix applied by backfillMessageText(), same rules.
const MESSAGE_FIX_FROM = "Absolutely. I think we are scheduled on Thursday. We can do more of these excersices";
const MESSAGE_FIX_TO = "Absolutely. I think we are scheduled on Thursday. We can do more of these exercises";
const BATCH_LIMIT = 450; // Firestore caps a batch at 500 ops; leave headroom.

// --- helpers -------------------------------------------------------------

// A name we are willing to write. Guards against propagating the junk this
// backfill exists to clean up: empty strings, missing fields, and the literal
// "undefined"/"null" that string interpolation leaves behind.
function usableName(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed === "undefined" || trimmed === "null") return null;
  return trimmed;
}

function show(value) {
  if (value === undefined) return "(missing)";
  if (value === null) return "(null)";
  return String(value);
}

// Queues updates and flushes them in batches. In dry-run mode it counts and
// discards, so the same call sites work either way.
function makeWriter() {
  let batch = db.batch();
  let queued = 0;
  let committed = 0;

  return {
    async queue(ref, data) {
      if (!APPLY) { committed++; return; }
      batch.update(ref, data);
      queued++;
      if (queued >= BATCH_LIMIT) {
        await batch.commit();
        committed += queued;
        queued = 0;
        batch = db.batch();
      }
    },
    async flush() {
      if (APPLY && queued > 0) {
        await batch.commit();
        committed += queued;
        queued = 0;
        batch = db.batch();
      }
      return committed;
    },
  };
}

// --- 1. users -> current name map ---------------------------------------

async function loadUserNames() {
  const snap = await db.collection("users").get();
  const names = new Map();
  let unusable = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    const name = usableName(data.fullName) ?? usableName(data.name);
    if (name) names.set(doc.id, name);
    else unusable++;
  }

  console.log(`users: ${snap.size} loaded, ${names.size} with a usable name, ${unusable} without`);
  console.log();
  return names;
}

// Resolves the name to write for a uid, or explains why we are skipping.
// Returns { name } | { skip: "<reason>" }.
function resolve(names, uid, stored) {
  const uidKey = usableName(uid);
  if (!uidKey) return { skip: "no uid on doc" };
  const current = names.get(uidKey);
  if (!current) return { skip: `no usable name for uid ${uidKey}` };
  if (current === stored) return { skip: null }; // already correct — silent
  return { name: current };
}

// --- 2. videos.coachName -------------------------------------------------

async function backfillVideos(names) {
  const writer = makeWriter();
  const snap = await db.collection("videos").get();
  let changes = 0;
  const skipped = [];

  console.log("=".repeat(72));
  console.log("videos.coachName");
  console.log("=".repeat(72));

  for (const doc of snap.docs) {
    const data = doc.data();
    const r = resolve(names, data.coachId, data.coachName);
    if (r.skip === null) continue;
    if (r.skip) { skipped.push(`videos/${doc.id}: skipped — ${r.skip}`); continue; }
    console.log(`videos/${doc.id}: coachName '${show(data.coachName)}' -> '${r.name}'`);
    changes++;
    await writer.queue(doc.ref, { coachName: r.name });
  }

  const committed = await writer.flush();
  skipped.forEach(line => console.log(line));
  return { label: "videos", scanned: snap.size, changes, committed, skipped: skipped.length };
}

// --- 3. videos/{id}/comments.authorName ---------------------------------

async function backfillComments(names) {
  const writer = makeWriter();
  // One collection-group query instead of a per-video subcollection read. The
  // path guard keeps this to comments that hang off a video, in case any other
  // collection ever uses the same subcollection name.
  const snap = await db.collectionGroup("comments").get();
  let scanned = 0;
  let changes = 0;
  const skipped = [];

  console.log();
  console.log("=".repeat(72));
  console.log("videos/{videoId}/comments.authorName  (top-level comments and replies)");
  console.log("=".repeat(72));

  for (const doc of snap.docs) {
    if (doc.ref.parent.parent?.parent.id !== "videos") continue;
    scanned++;
    const data = doc.data();
    const path = `videos/${doc.ref.parent.parent.id}/comments/${doc.id}`;
    if (SKIP_COMMENTS.has(doc.id)) {
      skipped.push(`${path}: skipped — excluded by decision (attribution change, not a spelling fix)`);
      continue;
    }
    const r = resolve(names, data.authorId, data.authorName);
    if (r.skip === null) continue;
    if (r.skip) { skipped.push(`${path}: skipped — ${r.skip}`); continue; }
    const kind = data.parentId ? "reply" : "comment";
    console.log(`${path}: authorName '${show(data.authorName)}' -> '${r.name}'  (${kind})`);
    changes++;
    await writer.queue(doc.ref, { authorName: r.name });
  }

  const committed = await writer.flush();
  skipped.forEach(line => console.log(line));
  return { label: "comments", scanned, changes, committed, skipped: skipped.length };
}

// --- 3b. videos/{id}/comments.text (one-off typo fix) -------------------

// Field name `text` confirmed from components/CommentsSection.tsx (the Comment
// interface, and the addDoc in submitComment) rather than guessed.
async function backfillCommentText() {
  const writer = makeWriter();
  const snap = await db.collectionGroup("comments").get();
  let scanned = 0;
  const hits = [];

  console.log();
  console.log("=".repeat(72));
  console.log(`videos/{videoId}/comments.text  (typo fix: '${TEXT_FIX_FROM}' -> '${TEXT_FIX_TO}')`);
  console.log("=".repeat(72));

  for (const doc of snap.docs) {
    if (doc.ref.parent.parent?.parent.id !== "videos") continue;
    scanned++;
    const data = doc.data();
    if (typeof data.text !== "string" || data.text.trim() !== TEXT_FIX_FROM) continue;
    const path = `videos/${doc.ref.parent.parent.id}/comments/${doc.id}`;
    console.log(`${path}: text '${data.text}' -> '${TEXT_FIX_TO}'`);
    hits.push(path);
    // Only `text` is written here — this pass never touches authorName.
    await writer.queue(doc.ref, { text: TEXT_FIX_TO });
  }

  if (hits.length === 0) {
    console.log();
    console.log("!".repeat(72));
    console.log(`NO MATCH — comment text not found, check the exact wording`);
    console.log(`Looked for a comment whose trimmed text is exactly: '${TEXT_FIX_FROM}'`);
    console.log(`Scanned ${scanned} comment(s). Nothing was changed by this pass.`);
    console.log("!".repeat(72));
  } else if (hits.length > 1) {
    console.log();
    console.log(`WARNING: ${hits.length} documents matched, expected 1. All are listed above.`);
  }

  const committed = await writer.flush();
  return { label: "comment text", scanned, changes: hits.length, committed, skipped: 0 };
}

// --- 3c. threads/{id}/messages.text (one-off typo fix) ------------------

// Field name `text` confirmed from lib/messaging.ts (the addDoc in sendMessage)
// rather than guessed.
async function backfillMessageText() {
  const writer = makeWriter();
  const snap = await db.collectionGroup("messages").get();
  let scanned = 0;
  const hits = [];

  console.log();
  console.log("=".repeat(72));
  console.log("threads/{threadId}/messages.text  (typo fix: 'excersices' -> 'exercises')");
  console.log("=".repeat(72));

  for (const doc of snap.docs) {
    if (doc.ref.parent.parent?.parent.id !== "threads") continue;
    scanned++;
    const data = doc.data();
    if (typeof data.text !== "string" || data.text.trim() !== MESSAGE_FIX_FROM) continue;
    const path = `threads/${doc.ref.parent.parent.id}/messages/${doc.id}`;
    console.log(`${path}: text '${data.text}' -> '${MESSAGE_FIX_TO}'`);
    hits.push(path);
    // Only `text` is written here — never senderId, senderRole or anything else.
    await writer.queue(doc.ref, { text: MESSAGE_FIX_TO });
  }

  if (hits.length === 0) {
    console.log();
    console.log("!".repeat(72));
    console.log(`NO MATCH — message text not found, check the exact wording`);
    console.log(`Looked for a message whose trimmed text is exactly: '${MESSAGE_FIX_FROM}'`);
    console.log(`Scanned ${scanned} message(s). Nothing was changed by this pass.`);
    console.log("!".repeat(72));
  } else if (hits.length > 1) {
    console.log();
    console.log(`WARNING: ${hits.length} documents matched, expected 1. All are listed above.`);
  }

  const committed = await writer.flush();
  return { label: "message text", scanned, changes: hits.length, committed, skipped: 0 };
}

// --- 4. threads.coachName / .athleteName --------------------------------

async function backfillThreads(names) {
  const writer = makeWriter();
  const snap = await db.collection("threads").get();
  let changes = 0;
  const skipped = [];

  console.log();
  console.log("=".repeat(72));
  console.log("threads.coachName / threads.athleteName");
  console.log("=".repeat(72));

  for (const doc of snap.docs) {
    const data = doc.data();
    const update = {};

    for (const [uidField, nameField] of [["coachId", "coachName"], ["athleteId", "athleteName"]]) {
      const r = resolve(names, data[uidField], data[nameField]);
      if (r.skip === null) continue;
      if (r.skip) { skipped.push(`threads/${doc.id}: ${nameField} skipped — ${r.skip}`); continue; }
      console.log(`threads/${doc.id}: ${nameField} '${show(data[nameField])}' -> '${r.name}'`);
      update[nameField] = r.name;
    }

    if (Object.keys(update).length === 0) continue;
    changes++; // one doc write, even when both names move
    await writer.queue(doc.ref, update);
  }

  const committed = await writer.flush();
  skipped.forEach(line => console.log(line));
  return { label: "threads", scanned: snap.size, changes, committed, skipped: skipped.length };
}

// --- main ----------------------------------------------------------------

async function main() {
  console.log();
  console.log(APPLY
    ? "*** --apply PASSED: changes below are being WRITTEN ***"
    : "*** DRY RUN: nothing is written. Pass --apply to commit these changes. ***");
  console.log();

  const names = await loadUserNames();

  const results = [];
  results.push(await backfillVideos(names));
  results.push(await backfillComments(names));
  results.push(await backfillCommentText());
  results.push(await backfillMessageText());
  results.push(await backfillThreads(names));

  console.log();
  console.log("=".repeat(72));
  console.log("SUMMARY");
  console.log("=".repeat(72));
  const col = (s, w) => String(s).padEnd(w);
  console.log(`${col("collection", 14)}${col("scanned", 10)}${col(APPLY ? "changed" : "would-change", 14)}${col("skipped", 9)}`);
  for (const r of results) {
    console.log(`${col(r.label, 14)}${col(r.scanned, 10)}${col(r.changes, 14)}${col(r.skipped, 9)}`);
  }
  const totalChanges = results.reduce((n, r) => n + r.changes, 0);
  const totalWrites = results.reduce((n, r) => n + r.committed, 0);
  console.log();
  if (APPLY) {
    console.log(`Committed ${totalWrites} document write(s) across ${results.length} collections.`);
  } else {
    console.log(`${totalChanges} document write(s) would be committed. Nothing was written.`);
    console.log("Re-run with --apply to commit.");
  }
  console.log();
}

main().catch(err => {
  console.error("\nFAILED:", err);
  process.exit(1);
});
