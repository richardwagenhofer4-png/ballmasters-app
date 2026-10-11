// Captions and the coach's written feedback for a video.
//
//   videos/{id}/captions/main  { segments: [{start,end,text}], source: "voiceover", createdAt, updatedAt }
//   videos/{id}/feedback/main  { text, updatedAt }
//
// Caption times are in VIDEO time (seconds into the clip), the same clock the
// annotations use. A voiceover starts at voiceover.startTime on that clock, so
// a spoken segment at voiceover-time t belongs at video-time startTime + t.
//
// Pure functions only (no React, no Firebase) so the server route, the coach
// editor and both student players share them, and scripts/test-captions.mjs
// can run them directly.

export interface CaptionSegment {
  start: number;
  end: number;
  text: string;
}

export interface CaptionsDoc {
  segments: CaptionSegment[];
  source: "voiceover";
  createdAt: string;
  updatedAt: string;
}

export interface FeedbackDoc {
  text: string;
  updatedAt: string;
}

/** Longest coach's-feedback text we store or show. */
export const FEEDBACK_MAX_CHARS = 2000;

/**
 * Longest caption the transcriber produces. Two short lines of white text on a
 * 390px-wide phone; longer speech is split into several timed captions.
 */
export const CAPTION_MAX_CHARS = 70;

/** The editor warns above this: the player shows at most two lines. */
export const CAPTION_WARN_CHARS = 90;

/** A caption never flashes by faster than this (seconds). */
const MIN_CAPTION_SECONDS = 0.4;

// What OpenAI's verbose_json returns (and what app/api/transcribe stores).
export interface WhisperSegment { id?: number; start: number; end: number; text: string }
export interface WhisperWord { word: string; start: number; end: number }

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Greedy split on whitespace into pieces of at most `maxChars` characters. */
function splitTokens(tokens: string[], maxChars: number): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let from = 0;
  let len = 0;
  for (let i = 0; i < tokens.length; i++) {
    const add = tokens[i].length + (i > from ? 1 : 0);
    if (i > from && len + add > maxChars) {
      ranges.push([from, i]);
      from = i;
      len = 0;
    }
    len += tokens[i].length + (i > from ? 1 : 0);
    // Prefer ending a caption at the end of a sentence once it has some body.
    if (/[.!?]["')\]]?$/.test(tokens[i]) && len >= 30 && i + 1 < tokens.length) {
      ranges.push([from, i + 1]);
      from = i + 1;
      len = 0;
    }
  }
  if (from < tokens.length) ranges.push([from, tokens.length]);
  return ranges;
}

/**
 * Turns the transcriber's segments into captions in video time.
 *
 * Each spoken segment longer than `maxChars` is split into several captions.
 * When the transcriber's word timings line up one-to-one with the words of the
 * segment text, the pieces get exact times; otherwise the segment's time is
 * shared out in proportion to each piece's length.
 */
export function buildCaptionSegments(input: {
  segments: WhisperSegment[];
  words?: WhisperWord[];
  /** voiceover.startTime: where the voiceover begins in the video, in seconds. */
  startTime: number;
  maxChars?: number;
}): CaptionSegment[] {
  const { segments, words = [], startTime } = input;
  const maxChars = input.maxChars ?? CAPTION_MAX_CHARS;
  const offset = Number.isFinite(startTime) ? startTime : 0;
  const out: CaptionSegment[] = [];

  for (const seg of segments) {
    const text = String(seg.text ?? "").replace(/\s+/g, " ").trim();
    if (!text || !Number.isFinite(seg.start) || !Number.isFinite(seg.end)) continue;
    const segStart = Math.max(0, seg.start);
    const segEnd = Math.max(segStart, seg.end);

    const tokens = text.split(" ");
    const ranges = text.length <= maxChars ? [[0, tokens.length] as [number, number]] : splitTokens(tokens, maxChars);

    const segWords = words.filter(w => {
      const mid = (w.start + w.end) / 2;
      return mid >= segStart - 0.05 && mid <= segEnd + 0.05;
    });
    const exact = ranges.length > 1 && segWords.length === tokens.length;
    const totalChars = ranges.reduce((n, [a, b]) => n + tokens.slice(a, b).join(" ").length, 0) || 1;

    let usedChars = 0;
    for (const [a, b] of ranges) {
      const piece = tokens.slice(a, b).join(" ");
      let start: number;
      let end: number;
      if (ranges.length === 1) {
        start = segStart;
        end = segEnd;
      } else if (exact) {
        start = segWords[a].start;
        end = segWords[b - 1].end;
      } else {
        start = segStart + (segEnd - segStart) * (usedChars / totalChars);
        end = segStart + (segEnd - segStart) * ((usedChars + piece.length) / totalChars);
      }
      usedChars += piece.length;
      out.push({ start: round2(offset + start), end: round2(offset + end), text: piece });
    }
  }

  return tidy(out);
}

/** Orders captions, gives each a minimum length, and removes overlaps. */
function tidy(list: CaptionSegment[]): CaptionSegment[] {
  const sorted = list
    .map(s => ({ ...s, end: Math.max(s.end, s.start + MIN_CAPTION_SECONDS) }))
    .sort((a, b) => a.start - b.start);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    if (prev.end > sorted[i].start) prev.end = round2(Math.max(prev.start + 0.1, sorted[i].start));
  }
  return sorted.map(s => ({ start: round2(s.start), end: round2(s.end), text: s.text }));
}

/**
 * Validates caption data from Firestore or the API: keeps well-formed entries
 * with text, trims the text, orders by start time.
 */
export function cleanSegments(raw: unknown): CaptionSegment[] {
  if (!Array.isArray(raw)) return [];
  const out: CaptionSegment[] = [];
  for (const item of raw) {
    const s = item as Partial<CaptionSegment> | null;
    if (!s || typeof s.text !== "string") continue;
    const text = s.text.replace(/\s+/g, " ").trim();
    const start = Number(s.start);
    const end = Number(s.end);
    if (!text || !Number.isFinite(start) || !Number.isFinite(end)) continue;
    out.push({ start, end: Math.max(start, end), text });
  }
  return out.sort((a, b) => a.start - b.start);
}

/** The caption on screen at video time `t`, or null. */
export function activeCaptionAt(segments: CaptionSegment[], t: number): CaptionSegment | null {
  for (const s of segments) {
    if (t >= s.start && t < s.end) return s;
  }
  return null;
}

/**
 * The full transcript as editable feedback text, cut to `max` characters at a
 * word boundary.
 */
export function transcriptToFeedback(
  segments: CaptionSegment[],
  max: number = FEEDBACK_MAX_CHARS
): { text: string; truncated: boolean } {
  const full = segments.map(s => s.text).join(" ").replace(/\s+/g, " ").trim();
  if (full.length <= max) return { text: full, truncated: false };
  const cut = full.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return { text: (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd(), truncated: true };
}

/** True when two caption lists are identical (used for "unsaved changes"). */
export function sameSegments(a: CaptionSegment[], b: CaptionSegment[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((s, i) => s.start === b[i].start && s.end === b[i].end && s.text === b[i].text);
}
