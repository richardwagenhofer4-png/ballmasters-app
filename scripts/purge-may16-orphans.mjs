// One-time cleanup: delete 8 cancelled test sessions from 2026-05-16 + their booking docs
// Run: node --env-file=.env.local scripts/purge-may16-orphans.mjs
// Run with deletion: node --env-file=.env.local scripts/purge-may16-orphans.mjs --confirm

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

// The one real session that must never be touched
const PRESERVE_SESSION_ID = "lDbF3i6Zhh8nc4GZDuG0";

console.log(`\n${"=".repeat(60)}`);
console.log(`  May-16 Orphan Cleanup — ${confirm ? "🔴 LIVE DELETE MODE" : "🟡 DRY RUN (no changes)"}`);
console.log(`${"=".repeat(60)}\n`);

// Fetch the 8 target sessions: cancelled, date 2026-05-16
const sessionSnap = await db.collection("sessions")
  .where("date", "==", "2026-05-16")
  .where("status", "==", "cancelled")
  .get();

const targetSessions = sessionSnap.docs.filter(d => d.id !== PRESERVE_SESSION_ID);

if (targetSessions.length === 0) {
  console.log("✅ No matching sessions found — nothing to do.\n");
  process.exit(0);
}

// For each session, find its related booking docs
const bookingsBySession = new Map(); // sessionId -> booking docs
for (const s of targetSessions) {
  const bSnap = await db.collection("bookings").where("sessionId", "==", s.id).get();
  bookingsBySession.set(s.id, bSnap.docs);
}

// Print plan
console.log(`🗑  SESSIONS TO DELETE (${targetSessions.length}):`);
console.log(`   ${"SESSION ID".padEnd(22)} ${"DATE".padEnd(12)} ${"TIME".padEnd(7)} ${"STATUS".padEnd(12)} ${"BOOKED".padEnd(8)} COACH`);
console.log(`   ${"─".repeat(80)}`);
for (const s of targetSessions) {
  const data = s.data();
  const booked = Array.isArray(data.bookedBy) ? data.bookedBy.length : 0;
  console.log(`   ${s.id.padEnd(22)} ${data.date.padEnd(12)} ${(data.startTime ?? "").padEnd(7)} ${(data.status ?? "").padEnd(12)} ${String(booked).padEnd(8)} ${data.coachName ?? "(unknown)"}`);
}
console.log();

let totalBookings = 0;
console.log(`🗑  BOOKING DOCS TO DELETE:`);
for (const [sessionId, docs] of bookingsBySession) {
  if (docs.length === 0) {
    console.log(`   session ${sessionId} — no booking docs found`);
  }
  for (const b of docs) {
    const data = b.data();
    console.log(`   booking ${b.id}  →  session ${sessionId}  student: ${data.studentName ?? data.studentId ?? "(unknown)"}`);
    totalBookings++;
  }
}
if (totalBookings === 0) console.log("   (none found)");
console.log();

console.log(`📊 Summary: ${targetSessions.length} sessions + ${totalBookings} booking docs = ${targetSessions.length + totalBookings} total docs to delete`);
console.log(`   PRESERVED (untouched): ${PRESERVE_SESSION_ID}\n`);

if (!confirm) {
  console.log("🟡 DRY RUN complete — nothing was deleted.");
  console.log("   Re-run with --confirm to delete everything listed above.\n");
  process.exit(0);
}

// Live delete — batch all sessions + bookings together
console.log(`🔴 LIVE MODE: deleting ${targetSessions.length} sessions + ${totalBookings} booking docs…`);
const allRefs = [
  ...targetSessions.map(d => d.ref),
  ...[...bookingsBySession.values()].flat().map(d => d.ref),
];

for (let i = 0; i < allRefs.length; i += 500) {
  const batch = db.batch();
  for (const ref of allRefs.slice(i, i + 500)) batch.delete(ref);
  await batch.commit();
  console.log(`   … committed batch ${Math.floor(i / 500) + 1} (${Math.min(i + 500, allRefs.length)}/${allRefs.length} docs)`);
}

console.log(`\n✅ Done — deleted ${targetSessions.length} sessions and ${totalBookings} booking docs.`);
console.log(`   Preserved: ${PRESERVE_SESSION_ID}\n`);
