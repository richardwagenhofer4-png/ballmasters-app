// POST /api/voiceover/transcribe { videoId }
//
// Transcribes the coach's voiceover for a video and returns DRAFT captions in
// video time. Nothing is saved here: the coach reviews and edits the draft in
// the annotate editor and saves it to videos/{id}/captions/main themselves, so
// athletes only ever see captions the coach has approved.
//
// Only a coach (or admin) who owns the video may call it. A voiceover is the
// coach's own voice, so it is transcribed for videos of ALL ages, under-13
// athletes included. That is separate from the under-13 gate on transcribing a
// video's own audio (app/api/transcribe), which is unchanged.

// Long-running — requires Vercel Pro for maxDuration > 60 s
export const maxDuration = 300;

import type { NextRequest } from "next/server";
import { verifyIdToken, getFirestoreDoc } from "@/lib/firebaseServer";
import { CaptionsError, transcribeVoiceoverAudio } from "@/lib/voiceoverCaptions.server";
import { buildCaptionSegments } from "@/lib/captions";

// A voiceover is recorded live next to a clip; nothing legitimate is longer.
const MAX_VOICEOVER_SECONDS = 3600;

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const idToken = authHeader.slice(7);
    let uid: string;
    try {
      ({ uid } = await verifyIdToken(idToken));
    } catch {
      // An expired or invalid token is the caller's problem, not a server fault.
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { videoId } = (await request.json()) as { videoId?: string };
    if (!videoId) return Response.json({ error: "videoId required" }, { status: 400 });

    // Same ownership test as /api/voiceover, plus: the caller must be a coach
    // or admin. Reads use the caller's own token, so the rules apply too.
    const video = await getFirestoreDoc("videos", videoId, idToken);
    const callerProfile = await getFirestoreDoc("users", uid, idToken);
    const role = callerProfile?.role;
    const staff = role === "coach" || role === "admin";
    if (!video || !staff || (video.coachId !== uid && role !== "admin")) {
      return Response.json({ error: "You don't have access to this video." }, { status: 404 });
    }

    const voiceover = await getFirestoreDoc(`videos/${videoId}/voiceover`, "main", idToken);
    if (!voiceover || typeof voiceover.fileName !== "string" || !voiceover.fileName) {
      return Response.json({ error: "No voiceover found" }, { status: 404 });
    }
    // voiceover/main is written by the coach's browser, so its fileName is not
    // trustworthy. Only ever read the object POST /api/voiceover issues for THIS
    // video (voiceovers/{videoId}-{timestamp}.webm|mp4). Without this a coach
    // could point it at any file in the bucket, such as another coach's video,
    // or an under-13 athlete's footage this route has no age gate for.
    const expected = new RegExp(`^voiceovers/${videoId.replace(/[^A-Za-z0-9_-]/g, "")}-\\d+\\.(webm|mp4)$`);
    if (!expected.test(voiceover.fileName)) {
      return Response.json({ error: "No voiceover found" }, { status: 404 });
    }
    const duration = Number(voiceover.duration);
    if (Number.isFinite(duration) && duration > MAX_VOICEOVER_SECONDS) {
      return Response.json({ error: "This voiceover is too long to transcribe." }, { status: 400 });
    }

    const result = await transcribeVoiceoverAudio(voiceover.fileName);

    // Spoken time t on the voiceover's own clock sits at startTime + t in the video.
    const startTime = Number(voiceover.startTime);
    const segments = buildCaptionSegments({
      segments: result.segments,
      words: result.words,
      startTime: Number.isFinite(startTime) ? startTime : 0,
    });

    return Response.json({ segments, text: result.text });
  } catch (err) {
    // Only messages written for the coach (CaptionsError) go to the browser.
    // Raw SDK/ffmpeg errors can quote API key fragments or file paths.
    console.error("[api/voiceover/transcribe]", err instanceof CaptionsError ? err.detail ?? err : err);
    if (err instanceof CaptionsError) {
      return Response.json({ error: err.message }, { status: 502 });
    }
    return Response.json({ error: "Couldn't create captions. Please try again." }, { status: 500 });
  }
}
