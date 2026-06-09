// One-time admin cleanup: purge cancelled and stale past sessions
// Run: node --env-file=.env.local scripts/purge-sessions.mjs
// Run with deletion: node --env-file=.env.local scripts/purge-sessions.mjs --confirm

import { cert, getApps, initializeApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID ?? process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY?.replace(/\\n/g, "\n"),
    }),
  });
}

const db = getFirestore();
const confirm = process.argv.includes("--confirm");

const today = new Date();
const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;

console.log(`\n${"=".repeat(60)}`);
console.log(`  Session Cleanup Script — ${confirm ? "🔴 LIVE DELETE MODE" : "🟡 DRY RUN (no changes)"}`);
console.log(`  Today: ${todayStr}`);
console.log(`${"=".repeat(60)}\n`);

const snap = await db.collection("sessions").get();
const all = snap.docs.map(d => ({ id: d.id, ...d.data() }));

const toDelete = [];
const skipped = [];

for (const s of all) {
  const bookedCount = Array.isArray(s.bookedBy) ? s.bookedBy.length : 0;
  const isPast = s.date < todayStr;
  const isCancelled = s.status === "cancelled";

  if (bookedCount > 0) {
    // Never delete sessions with real bookings — flag for manual review
    if (isCancelled || isPast) {
      skipped.push({ id: s.id, date: s.date, startTime: s.startTime, status: s.status, booked: bookedCount, coach: s.coachName ?? "(unknown)" });
    }
    continue;
  }

  if (isCancelled) {
    toDelete.push({ id: s.id, date: s.date, startTime: s.startTime, status: s.status, reason: "cancelled", coach: s.coachName ?? "(unknown)" });
  } else if (isPast) {
    toDelete.push({ id: s.id, date: s.date, startTime: s.startTime, status: s.status, reason: "past + no bookings", coach: s.coachName ?? "(unknown)" });
  }
}

// Sort for readability
toDelete.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));
skipped.sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));

console.log(`📋 CANDIDATES FOR DELETION (${toDelete.length}):`);
if (toDelete.length === 0) {
  console.log("   None found.\n");
} else {
  console.log(`   ${"ID".padEnd(22)} ${"DATE".padEnd(12)} ${"TIME".padEnd(7)} ${"STATUS".padEnd(12)} ${"REASON".padEnd(22)} COACH`);
  console.log(`   ${"─".repeat(90)}`);
  for (const s of toDelete) {
    console.log(`   ${s.id.padEnd(22)} ${s.date.padEnd(12)} ${s.startTime.padEnd(7)} ${s.status.padEnd(12)} ${s.reason.padEnd(22)} ${s.coach}`);
  }
  console.log();
}

console.log(`⚠️  SKIPPED — HAS BOOKINGS, REVIEW MANUALLY (${skipped.length}):`);
if (skipped.length === 0) {
  console.log("   None.\n");
} else {
  console.log(`   ${"ID".padEnd(22)} ${"DATE".padEnd(12)} ${"TIME".padEnd(7)} ${"STATUS".padEnd(12)} ${"BOOKED".padEnd(8)} COACH`);
  console.log(`   ${"─".repeat(80)}`);
  for (const s of skipped) {
    console.log(`   ${s.id.padEnd(22)} ${s.date.padEnd(12)} ${s.startTime.padEnd(7)} ${s.status.padEnd(12)} ${String(s.booked).padEnd(8)} ${s.coach}`);
  }
  console.log();
}

console.log(`📊 Summary: ${all.length} total | ${toDelete.length} to delete | ${skipped.length} skipped\n`);

if (!confirm) {
  console.log("🟡 DRY RUN complete — nothing was deleted.");
  console.log("   Re-run with --confirm to delete the candidates above.\n");
  process.exit(0);
}

if (toDelete.length === 0) {
  console.log("🔴 LIVE MODE: nothing to delete.\n");
  process.exit(0);
}

console.log(`🔴 LIVE MODE: deleting ${toDelete.length} sessions in batches of 500…`);
let deleted = 0;
for (let i = 0; i < toDelete.length; i += 500) {
  const batch = db.batch();
  for (const s of toDelete.slice(i, i + 500)) {
    batch.delete(db.collection("sessions").doc(s.id));
  }
  await batch.commit();
  deleted += toDelete.slice(i, i + 500).length;
  console.log(`   … committed batch ${Math.floor(i / 500) + 1} (${deleted}/${toDelete.length})`);
}
console.log(`\n✅ Done — deleted ${deleted} sessions. ${skipped.length} skipped (review manually).\n`);
