// Long-running — requires Vercel Pro for maxDuration > 60 s
export const maxDuration = 300;

import type { NextRequest } from "next/server";
import { verifyIdToken, getFirestoreDoc, updateFirestoreDoc } from "@/lib/firebaseServer";
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
    if (!video || video.coachId !== uid) {
      return Response.json({ error: "Not found or forbidden" }, { status: 404 });
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

    // Extract mono MP3 at 16 kHz — simple extraction with no timestamp
    // manipulation. Whisper timestamps are relative to the audio file start,
    // so clean extraction from position 0 gives correct video-aligned timestamps.
    await new Promise<void>((resolve, reject) => {
      ffmpeg(videoPath)
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

    const segments: TranscriptSegment[] = (result.segments ?? []).map(
      ({ id, start, end, text }) => ({ id, start, end, text: text.trim() })
    );
    const words: TranscriptWord[] = (result.words ?? []).map(({ word, start, end }) => ({
      word,
      start,
      end,
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
