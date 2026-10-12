// Test fixture for scripts/test-transcribe-route.mjs. Preloaded into `next dev` with
// NODE_OPTIONS=--require: answers the Firebase REST endpoints the API routes call
// (token lookup, Firestore reads) from fixed fake data, and passes everything else through.
// It never contacts a real Firebase project.
const real = globalThis.fetch;
const str = v => ({ stringValue: v });
const num = v => ({ integerValue: String(v) });
const DOCS = {
  "users/coach1": { role: str("coach") },
  "users/coach2": { role: str("coach") },
  "users/admin1": { role: str("admin") },
  "users/stud1": { role: str("student") },
  "videos/vid1": { coachId: str("coach1"), title: str("T") },
  "videos/vid1/voiceover/main": { fileName: str("voiceovers/vid1-1760000000000.webm"), startTime: num(12), duration: num(8) },
  "videos/vid2": { coachId: str("coach1"), title: str("T2") },
  "videos/vid2/voiceover/main": { fileName: str("videos/some-other-coachs-video.mp4"), startTime: num(0), duration: num(8) },
};
const TOKENS = { "t-coach1": "coach1", "t-coach2": "coach2", "t-admin1": "admin1", "t-stud1": "stud1" };
globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input.url ?? String(input);
  if (url.startsWith("https://identitytoolkit.googleapis.com/")) {
    const { idToken } = JSON.parse(init.body);
    const uid = TOKENS[idToken];
    return uid ? Response.json({ users: [{ localId: uid, email: uid + "@x.test" }] }) : new Response("{}", { status: 400 });
  }
  const m = url.match(/^https:\/\/firestore\.googleapis\.com\/v1\/projects\/[^/]+\/databases\/\(default\)\/documents\/(.+)$/);
  if (m) {
    const fields = DOCS[m[1].split("?")[0]];
    return fields ? Response.json({ name: m[1], fields }) : Response.json({ error: { message: "not found" } }, { status: 404 });
  }
  return real(input, init);
};
