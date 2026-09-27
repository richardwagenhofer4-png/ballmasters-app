// One-time backfill: videos/{videoId}.hasBreakdown.
//
// hasBreakdown is a denormalised flag: true when the video has at least one
// doc in its annotations subcollection or a voiceover (voiceover/main).
// Access-plan athletes can't read those subcollections once the paywall is
// on, so their app reads this flag to show the "Coach breakdown on this clip"
// upgrade panel. The annotate editor keeps it current from now on
// (app/coach/videos/[id]/annotate/AnnotatePage.tsx); this script sets it on
// videos annotated before that existed. Safe to re-run — it only writes
// videos whose stored value differs from what the subcollections say.
//
// Reads per video: at most 2 (limit(1) on each subcollection).
//
// DRY RUN BY DEFAULT. Nothing is written unless --apply is passed. Only the
// hasBreakdown field is ever touched.
//
// Needs in env (loaded via `node --env-file=...`):
//   FIREBASE_ADMIN_PROJECT_ID / FIREBASE_ADMIN_CLIENT_EMAIL / FIREBASE_ADMIN_PRIVATE_KEY
// Point these at the project you mean to change. .env.local is production —
// dry-run there first and read the output before adding --apply.
//
// Run (dry run):  node --env-file=.env.local scripts/backfill-has-breakdown.mjs
// Run (for real): node --env-file=.env.local scripts/backfill-has-breakdown.mjs --apply

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
const BATCH_LIMIT = 450; // Firestore caps a batch at 500 ops; leave headroom.

function show(value) {
  if (value === undefined) return "(missing)";
  return String(value);
}

async function main() {
  const projectId = process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  console.log(`Project: ${projectId}`);
  console.log(APPLY ? "Mode: APPLY (writing changes)\n" : "Mode: DRY RUN (no writes; pass --apply to write)\n");

  const videos = await db.collection("videos").get();
  let batch = db.batch();
  let queued = 0;
  let changed = 0;
  let withBreakdown = 0;

  for (const v of videos.docs) {
    const [annotations, voiceover] = await Promise.all([
      v.ref.collection("annotations").limit(1).get(),
      v.ref.collection("voiceover").limit(1).get(),
    ]);
    const hasBreakdown = !annotations.empty || !voiceover.empty;
    if (hasBreakdown) withBreakdown++;

    const stored = v.data().hasBreakdown;
    if (stored === hasBreakdown) continue;

    changed++;
    console.log(`  videos/${v.id}  "${v.data().title ?? ""}"  hasBreakdown: ${show(stored)} -> ${hasBreakdown}`);
    if (!APPLY) continue;
    batch.update(v.ref, { hasBreakdown });
    queued++;
    if (queued >= BATCH_LIMIT) {
      await batch.commit();
      batch = db.batch();
      queued = 0;
    }
  }
  if (APPLY && queued > 0) await batch.commit();

  console.log(`\nVideos scanned: ${videos.size}`);
  console.log(`With a breakdown: ${withBreakdown}`);
  console.log(`${APPLY ? "Updated" : "Would update"}: ${changed}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
