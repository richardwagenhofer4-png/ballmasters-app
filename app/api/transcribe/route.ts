// Long-running — requires Vercel Pro for maxDuration > 60 s
export const maxDuration = 300;

import type { NextRequest } from "next/server";
import { verifyIdToken, getFirestoreDoc, updateFirestoreDoc } from "@/lib/firebaseServer";
import { isUnder13 } from "@/lib/age";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import OpenAI from "openai";
import { createReadStream, createWriteStream, unlink } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { pipeline } from "stream/promises";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffmpeg from "fluent-ffmpeg";
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.CLOUDFLARE_R2_ENDPOINT!,
  credentials: {
    accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
    secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
  },
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// Interim safeguard until Zero Data Retention is active with OpenAI.
// Set to true once ZDR is confirmed to relax the gate.
const UNDER13_TRANSCRIPTION_ENABLED = false;

interface TranscriptSegment { id: number; start: number; end: number; text: string; }
interface TranscriptWord { word: string; start: number; end: number; }

export async function POST(request: NextRequest) {
  const ts = Date.now();
  const videoPath = join(tmpdir(), `bm-${ts}.mp4`);
  const audioPath = join(tmpdir(), `bm-${ts}.mp3`);

  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const idToken = authHeader.slice(7);
    const { uid } = await verifyIdToken(idToken);

    const { videoId } = (await request.json()) as { videoId: string };
    if (!videoId) return Response.json({ error: "videoId required" }, { status: 400 });

    const video = await getFirestoreDoc("videos", videoId, idToken);
    const callerProfile = await getFirestoreDoc("users", uid, idToken);
    if (!video || (video.coachId !== uid && callerProfile?.role !== "admin")) {
      return Response.json({ error: "You don't have access to this video." }, { status: 404 });
    }

    // Under-13 privacy gate. While transcription is disabled by policy, it may
    // proceed ONLY when we can positively confirm every person in the video is
    // 13 or older. Anything short of that fails safe (skip):
    //   - No assigned athlete → we don't know who is in the video → skip.
    //   - A missing profile or unknown DOB → not confirmed 13+ → skip
    //     (isUnder13 already treats unknown DOB as under-13).
    //   - Any assigned athlete under 13 → skip.
    if (!UNDER13_TRANSCRIPTION_ENABLED) {
      const studentIds: string[] = (video.studentIds as string[]) ?? [];

      let skipTranscription: boolean;
      if (studentIds.length === 0) {
        skipTranscription = true;
      } else {
        const profiles = await Promise.all(
          studentIds.map((sid) => getFirestoreDoc("users", sid, idToken))
        );
        // A null profile is not a confirmed 13+ athlete, so it also fails safe.
        skipTranscription = profiles.some(
          (p) => !p || isUnder13(p.dateOfBirth as string | null)
        );
      }

      if (skipTranscription) {
        await updateFirestoreDoc(
          "videos",
          videoId,
          { transcriptionSkippedReason: "under13_privacy" },
          idToken
        );
        return Response.json({ transcriptionSkippedReason: "under13_privacy" });
      }
    }

    // Stream video from R2 to a temp file (avoids loading into memory)
    const { Body } = await r2.send(
      new GetObjectCommand({
        Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME!,
        Key: video.fileName as string,
      })
    );
    if (!Body) throw new Error("Empty response from R2");
    await pipeline(Body as NodeJS.ReadableStream, createWriteStream(videoPath));

    // atrim=start=0 discards any audio before t=0, asetpts=PTS-STARTPTS resets
    // all output timestamps relative to the first frame — together they strip the
    // container's non-zero start_time so Whisper receives audio anchored at 0.
    await new Promise<void>((resolve, reject) => {
      ffmpeg(videoPath)
        .inputOptions(["-ss 0"])
        .audioFilters("atrim=start=0,asetpts=PTS-STARTPTS")
        .outputOptions(["-vn", "-ar 16000", "-ac 1", "-f mp3"])
        .output(audioPath)
        .on("end", () => resolve())
        .on("error", (err: Error) => reject(err))
        .run();
    });

    const result = (await openai.audio.transcriptions.create({
      file: createReadStream(audioPath) as unknown as File,
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["word", "segment"],
    })) as unknown as {
      text: string;
      duration: number;
      segments?: Array<{ id: number; start: number; end: number; text: string }>;
      words?: Array<{ word: string; start: number; end: number }>;
    };

    const rawSegments = result.segments ?? [];
    const rawWords = result.words ?? [];

    // Safety net: if the container offset still bled through (first segment > 5 s),
    // subtract it. Threshold avoids incorrectly shifting videos with genuine silence.
    const firstStart = rawSegments[0]?.start ?? 0;
    const offset = firstStart > 5 ? firstStart : 0;

    const segments: TranscriptSegment[] = rawSegments.map(
      ({ id, start, end, text }) => ({ id, start: start - offset, end: end - offset, text: text.trim() })
    );
    const words: TranscriptWord[] = rawWords.map(({ word, start, end }) => ({
      word,
      start: start - offset,
      end: end - offset,
    }));

    const transcript = {
      text: result.text,
      duration: result.duration ?? 0,
      segments,
      words,
    };

    await updateFirestoreDoc("videos", videoId, { transcript }, idToken);
    return Response.json({ transcript });
  } catch (err) {
    console.error("[api/transcribe]", err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  } finally {
    const del = (p: string) => new Promise<void>((r) => unlink(p, () => r()));
    await Promise.allSettled([del(videoPath), del(audioPath)]);
  }
}
