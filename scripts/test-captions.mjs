// Unit checks for lib/captions.ts (pure logic: turning a transcription of the
// coach's voiceover into captions in video time, finding the caption on screen,
// cleaning stored data, and building the feedback pre-fill).
//
// Run:  node scripts/test-captions.mjs      (Node 22.6+ strips the types itself)

import assert from "node:assert/strict";
import {
  CAPTION_MAX_CHARS,
  FEEDBACK_MAX_CHARS,
  activeCaptionAt,
  buildCaptionSegments,
  cleanSegments,
  sameSegments,
  transcriptToFeedback,
} from "../lib/captions.ts";

let passed = 0;
const failed = [];
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failed.push(`${name}: ${err.message.split("\n")[0]}`);
  }
}

// Words with even timing for a text, starting at t0.
function words(text, t0, per = 0.3) {
  return text.split(" ").map((w, i) => ({ word: w.replace(/[.,!?]/g, ""), start: t0 + i * per, end: t0 + (i + 1) * per }));
}

test("a short segment maps to video time: startTime + t", () => {
  const out = buildCaptionSegments({ segments: [{ start: 1, end: 3.5, text: " Keep your head up. " }], startTime: 12 });
  assert.deepEqual(out, [{ start: 13, end: 15.5, text: "Keep your head up." }]);
});

test("startTime 0 leaves times alone", () => {
  const out = buildCaptionSegments({ segments: [{ start: 0.5, end: 2, text: "Hello" }], startTime: 0 });
  assert.deepEqual(out, [{ start: 0.5, end: 2, text: "Hello" }]);
});

const LONG =
  "Watch how my back foot pivots here. Then the hips open before the shoulders do, and that is where the power comes from, so slow it down and feel it.";

test("a long segment is split into captions of at most 70 characters", () => {
  const out = buildCaptionSegments({ segments: [{ start: 0, end: 9, text: LONG }], words: words(LONG, 0), startTime: 0 });
  assert.ok(out.length >= 3, `expected 3+ pieces, got ${out.length}`);
  for (const c of out) assert.ok(c.text.length <= CAPTION_MAX_CHARS, `"${c.text}" is ${c.text.length} chars`);
});

test("splitting loses no words and keeps punctuation", () => {
  const out = buildCaptionSegments({ segments: [{ start: 0, end: 9, text: LONG }], words: words(LONG, 0), startTime: 0 });
  assert.equal(out.map(c => c.text).join(" "), LONG);
});

test("split captions are in order, never overlap, and stay inside the segment", () => {
  const out = buildCaptionSegments({ segments: [{ start: 2, end: 11, text: LONG }], words: words(LONG, 2), startTime: 20 });
  for (let i = 0; i < out.length; i++) {
    assert.ok(out[i].end > out[i].start, "positive length");
    assert.ok(out[i].start >= 22 - 0.01 && out[i].end <= 31 + 0.5, `inside window: ${JSON.stringify(out[i])}`);
    if (i > 0) assert.ok(out[i].start >= out[i - 1].end - 0.001, "no overlap");
  }
});

test("matching word timings give exact piece boundaries", () => {
  const text = "one two three four five six seven eight nine ten eleven twelve thirteen fourteen fifteen sixteen seventeen eighteen";
  const w = words(text, 5, 0.5);
  const out = buildCaptionSegments({ segments: [{ start: 5, end: 5 + 18 * 0.5, text }], words: w, startTime: 0, maxChars: 40 });
  assert.ok(out.length > 1);
  // The first piece starts at the first word and the last ends at the last word.
  assert.equal(out[0].start, 5);
  assert.equal(out[out.length - 1].end, 14);
});

test("word timings that don't line up fall back to proportional timing", () => {
  const out = buildCaptionSegments({
    segments: [{ start: 0, end: 10, text: LONG }],
    words: [{ word: "nope", start: 0, end: 1 }],
    startTime: 0,
  });
  assert.ok(out.length >= 3);
  assert.equal(out[0].start, 0);
  assert.ok(Math.abs(out[out.length - 1].end - 10) < 0.05, `ends near 10, got ${out[out.length - 1].end}`);
});

test("empty, blank and non-numeric segments are skipped", () => {
  const out = buildCaptionSegments({
    segments: [
      { start: 0, end: 1, text: "   " },
      { start: NaN, end: 2, text: "bad" },
      { start: 3, end: 4, text: "ok" },
    ],
    startTime: 0,
  });
  assert.deepEqual(out, [{ start: 3, end: 4, text: "ok" }]);
});

test("a too-short caption is stretched to a readable length", () => {
  const out = buildCaptionSegments({ segments: [{ start: 1, end: 1.05, text: "Yes" }], startTime: 0 });
  assert.ok(out[0].end - out[0].start >= 0.39, "about 0.4s long");
});

test("overlapping input is trimmed so captions never overlap", () => {
  const out = buildCaptionSegments({
    segments: [{ start: 0, end: 4, text: "first" }, { start: 2, end: 5, text: "second" }],
    startTime: 0,
  });
  assert.ok(out[0].end <= out[1].start);
});

test("a non-finite startTime is treated as 0", () => {
  const out = buildCaptionSegments({ segments: [{ start: 1, end: 2, text: "hi" }], startTime: NaN });
  assert.equal(out[0].start, 1);
});

test("activeCaptionAt: start inclusive, end exclusive, null in gaps", () => {
  const segs = [{ start: 1, end: 2, text: "a" }, { start: 3, end: 4, text: "b" }];
  assert.equal(activeCaptionAt(segs, 0.99), null);
  assert.equal(activeCaptionAt(segs, 1)?.text, "a");
  assert.equal(activeCaptionAt(segs, 1.99)?.text, "a");
  assert.equal(activeCaptionAt(segs, 2), null);
  assert.equal(activeCaptionAt(segs, 3.5)?.text, "b");
  assert.equal(activeCaptionAt([], 1), null);
});

test("cleanSegments drops junk, trims, orders and fixes end < start", () => {
  const out = cleanSegments([
    { start: 5, end: 6, text: "  later " },
    null,
    { start: "x", end: 1, text: "bad" },
    { start: 1, end: 0.5, text: "early" },
    { start: 2, end: 3, text: "   " },
    { start: 2, end: 3 },
    "string",
  ]);
  assert.deepEqual(out, [
    { start: 1, end: 1, text: "early" },
    { start: 5, end: 6, text: "later" },
  ]);
  assert.deepEqual(cleanSegments(undefined), []);
  assert.deepEqual(cleanSegments({}), []);
});

test("transcriptToFeedback joins the captions", () => {
  const r = transcriptToFeedback([{ start: 0, end: 1, text: "Good job." }, { start: 1, end: 2, text: "Keep going." }]);
  assert.deepEqual(r, { text: "Good job. Keep going.", truncated: false });
});

test("transcriptToFeedback cuts at a word boundary within the limit", () => {
  const segs = [{ start: 0, end: 1, text: "word ".repeat(1000).trim() }];
  const r = transcriptToFeedback(segs);
  assert.equal(r.truncated, true);
  assert.ok(r.text.length <= FEEDBACK_MAX_CHARS);
  assert.ok(r.text.endsWith("word"), "no half word at the end");
});

test("sameSegments compares times and text", () => {
  const a = [{ start: 1, end: 2, text: "a" }];
  assert.equal(sameSegments(a, [{ start: 1, end: 2, text: "a" }]), true);
  assert.equal(sameSegments(a, [{ start: 1, end: 2, text: "b" }]), false);
  assert.equal(sameSegments(a, []), false);
});

console.log(`${passed} passed, ${failed.length} failed`);
for (const f of failed) console.log(`  FAIL ${f}`);
process.exit(failed.length ? 1 : 0);
