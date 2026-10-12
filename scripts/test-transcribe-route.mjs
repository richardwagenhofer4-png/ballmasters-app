// Checks who may call POST /api/voiceover/transcribe and what they see when it
// fails. Starts `next dev` with a mocked Firebase REST layer
// (scripts/fixtures/mock-firebase-rest.cjs) and dead-end R2 / fake OpenAI
// settings, so it never touches production, R2 or OpenAI.
//
// Run:  node scripts/test-transcribe-route.mjs
// (needs nothing running; picks port 3114; stops its own server)

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import assert from "node:assert/strict";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 3114;
const BASE = `http://localhost:${PORT}`;

const server = spawn("npx", ["next", "dev", "-p", String(PORT)], {
  cwd: root,
  env: {
    ...process.env,
    NODE_OPTIONS: `--require ${join(root, "scripts/fixtures/mock-firebase-rest.cjs")}`,
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-test",
    NEXT_PUBLIC_FIREBASE_API_KEY: "fake",
    CLOUDFLARE_R2_ENDPOINT: "http://127.0.0.1:9", // nothing listens: the R2 step must fail
    CLOUDFLARE_R2_BUCKET_NAME: "none",
    CLOUDFLARE_R2_ACCESS_KEY_ID: "x",
    CLOUDFLARE_R2_SECRET_ACCESS_KEY: "y",
    OPENAI_API_KEY: "sk-fake-1234abcd",
  },
  stdio: "ignore",
});
const stop = () => { try { server.kill("SIGTERM"); } catch { /* already gone */ } };
process.on("exit", stop);

async function call(body, token) {
  const res = await fetch(`${BASE}/api/voiceover/transcribe`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
}

// Wait for the server (first compile of the route can take a while).
let up = false;
for (let i = 0; i < 90 && !up; i++) {
  try { await call({}, null); up = true; } catch { await new Promise(r => setTimeout(r, 1000)); }
}
if (!up) { console.log("server did not start"); stop(); process.exit(1); }

let passed = 0;
const failed = [];
async function check(name, body, token, status, message) {
  try {
    const r = await call(body, token);
    assert.equal(r.status, status, `status ${r.status} ${JSON.stringify(r.body)}`);
    if (message) assert.equal(r.body.error, message);
    passed++;
  } catch (err) {
    failed.push(`${name}: ${err.message.split("\n")[0]}`);
  }
}

const NO_ACCESS = "You don't have access to this video.";
await check("no auth header", { videoId: "vid1" }, null, 401, "Unauthorized");
await check("invalid token", { videoId: "vid1" }, "t-wrong", 401, "Unauthorized");
await check("no videoId", {}, "t-coach1", 400, "videoId required");
await check("a student", { videoId: "vid1" }, "t-stud1", 404, NO_ACCESS);
await check("a coach who doesn't own the video", { videoId: "vid1" }, "t-coach2", 404, NO_ACCESS);
await check("a video that doesn't exist", { videoId: "nope" }, "t-coach1", 404, NO_ACCESS);
// voiceover/main points at another file in the bucket: must never be read.
await check("owner, voiceover key outside voiceovers/{videoId}-…", { videoId: "vid2" }, "t-coach1", 404, "No voiceover found");
// Past every check: the (dead) R2 step fails with the coach-facing message,
// not the SDK's own text.
const OK_STAGE = "Couldn't load the voiceover audio. Please try again.";
await check("owner, valid voiceover → reaches R2", { videoId: "vid1" }, "t-coach1", 502, OK_STAGE);
await check("admin who doesn't own the video → reaches R2", { videoId: "vid1" }, "t-admin1", 502, OK_STAGE);

stop();
console.log(`${passed} passed, ${failed.length} failed`);
for (const f of failed) console.log(`  FAIL ${f}`);
process.exit(failed.length ? 1 : 0);
