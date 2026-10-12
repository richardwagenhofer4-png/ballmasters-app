// Seeds the LOCAL Firebase emulators (Auth 9099, Firestore 8080, project
// demo-ballmasters) with fake data for the coach Videos tab: one coach, three
// athletes assigned to them, and five videos. Never touches a real project.
// Used by scripts/test-videos-filter.mjs.

const PROJECT = "demo-ballmasters";
const AUTH = "http://127.0.0.1:9099";
const FS = `http://127.0.0.1:8080/v1/projects/${PROJECT}/databases/(default)/documents`;

function toFs(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "string") return { stringValue: v };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toFs) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toFs(x)])) } };
}

async function put(path, data) {
  // "Bearer owner" is the emulator's admin token: it bypasses the security rules.
  const res = await fetch(`${FS}/${path}`, {
    method: "PATCH",
    headers: { Authorization: "Bearer owner", "content-type": "application/json" },
    body: JSON.stringify({ fields: Object.fromEntries(Object.entries(data).map(([k, v]) => [k, toFs(v)])) }),
  });
  if (!res.ok) throw new Error(`seed ${path}: ${res.status} ${await res.text()}`);
}

async function authUser(email, password) {
  const res = await fetch(`${AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key=fake`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  if (!res.ok) throw new Error(`auth ${email}: ${res.status} ${await res.text()}`);
  return (await res.json()).localId;
}

export const COACH = { email: "coach@example.test", password: "password1" };
export const ATHLETES = ["Alice Adams", "Ben Brown", "Cara Cole"];

export async function seed() {
  const coachUid = await authUser(COACH.email, COACH.password);
  await put(`users/${coachUid}`, { uid: coachUid, email: COACH.email, fullName: "Coach Carter", role: "coach" });

  const ids = {};
  for (const name of ATHLETES) {
    const email = `${name.split(" ")[0].toLowerCase()}@example.test`;
    const uid = await authUser(email, "password1");
    ids[name] = uid;
    await put(`users/${uid}`, { uid, email, fullName: name, role: "student", coachId: coachUid, age: 15 });
  }
  const [alice, ben, cara] = ATHLETES.map(n => ids[n]);

  const base = { coachId: coachUid, coachName: "Coach Carter", status: "published", downloadAllowed: false, type: "standard", fileName: "x.mp4" };
  const videos = [
    { id: "v1", title: "Footwork basics", studentIds: [alice], viewedBy: [alice], createdAt: "2026-09-01T12:00:00.000Z" },
    { id: "v2", title: "Dribbling series", studentIds: [ben], viewedBy: [], createdAt: "2026-09-02T12:00:00.000Z" },
    { id: "v3", title: "Shooting form", studentIds: [cara], viewedBy: [], createdAt: "2026-09-03T12:00:00.000Z" },
    { id: "v4", title: "Team drill", studentIds: [alice, ben], viewedBy: [alice], createdAt: "2026-09-04T12:00:00.000Z" },
    { id: "v5", title: "Unassigned clip", studentIds: [], viewedBy: [], createdAt: "2026-09-05T12:00:00.000Z" },
  ];
  for (const v of videos) {
    const { id, ...rest } = v;
    await put(`videos/${id}`, { ...base, ...rest });
  }
  return { coachUid, athletes: ids, videoTitles: videos.map(v => v.title) };
}
