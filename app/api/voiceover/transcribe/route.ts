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
import { transcribeVoiceoverAudio } from "@/lib/voiceoverCaptions.server";
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
    const { uid } = await verifyIdToken(idToken);

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
    console.error("[api/voiceover/transcribe]", err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
