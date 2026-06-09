// One-off script: list all sessions with id, date, startTime, coachId, bookedBy count, status
// Run: node --env-file=.env.local scripts/list-sessions.mjs

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
const snap = await db.collection("sessions").get();

const sessions = snap.docs.map(d => {
  const data = d.data();
  return {
    id: d.id,
    date: data.date ?? "(none)",
    startTime: data.startTime ?? "(none)",
    endTime: data.endTime ?? "(none)",
    coachId: data.coachId ?? "(none)",
    coachName: data.coachName ?? "(none)",
    status: data.status ?? "(none)",
    bookedByCount: Array.isArray(data.bookedBy) ? data.bookedBy.length : 0,
    waitlistCount: Array.isArray(data.waitlist) ? data.waitlist.length : 0,
  };
}).sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime));

// Print all sessions
console.log("\n=== ALL SESSIONS ===");
console.log(`${"ID".padEnd(22)} ${"DATE".padEnd(12)} ${"START".padEnd(7)} ${"END".padEnd(7)} ${"STATUS".padEnd(12)} ${"BKD".padEnd(4)} ${"WL".padEnd(4)} ${"COACH NAME"}`);
console.log("─".repeat(110));
for (const s of sessions) {
  console.log(
    `${s.id.padEnd(22)} ${s.date.padEnd(12)} ${s.startTime.padEnd(7)} ${s.endTime.padEnd(7)} ${s.status.padEnd(12)} ${String(s.bookedByCount).padEnd(4)} ${String(s.waitlistCount).padEnd(4)} ${s.coachName}`
  );
}

// Find duplicates: same coachId + date + startTime
const keyMap = new Map();
for (const s of sessions) {
  const key = `${s.coachId}__${s.date}__${s.startTime}`;
  if (!keyMap.has(key)) keyMap.set(key, []);
  keyMap.get(key).push(s);
}

const dupes = [...keyMap.entries()].filter(([, arr]) => arr.length > 1);
if (dupes.length === 0) {
  console.log("\n✓ No duplicates found (coachId + date + startTime all unique)\n");
} else {
  console.log(`\n⚠️  DUPLICATES (${dupes.length} groups):`);
  for (const [key, arr] of dupes) {
    console.log(`\n  Key: ${key}`);
    for (const s of arr) {
      console.log(`    id=${s.id}  status=${s.status}  booked=${s.bookedByCount}  waitlist=${s.waitlistCount}`);
    }
  }
  console.log();
}

console.log(`Total: ${sessions.length} sessions`);
