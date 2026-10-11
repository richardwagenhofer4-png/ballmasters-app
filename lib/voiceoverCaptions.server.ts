// Transcribes a coach's VOICEOVER recording (an audio file in R2) with the same
// OpenAI Whisper setup app/api/transcribe uses for a video's own audio: same
// model, same ffmpeg normalisation to 16 kHz mono mp3, same verbose_json
// segment + word format.
//
// This is deliberately a separate code path from app/api/transcribe. A
// voiceover is the coach's own voice, so it is transcribed for videos of all
// ages (owner decision). The under-13 gate on transcribing a VIDEO's audio
// lives in app/api/transcribe/route.ts, is untouched, and does not apply here.

import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import OpenAI from "openai";
import { createReadStream, createWriteStream, unlink } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { pipeline } from "stream/promises";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import ffmpeg from "fluent-ffmpeg";
import type { WhisperSegment, WhisperWord } from "@/lib/captions";

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

// Built on first use, not at import, so a build without the keys still works.
let r2: S3Client | null = null;
let openai: OpenAI | null = null;

function r2Client(): S3Client {
  r2 ??= new S3Client({
    region: "auto",
    endpoint: process.env.CLOUDFLARE_R2_ENDPOINT!,
    credentials: {
      accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
      secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
    },
  });
  return r2;
}

function openaiClient(): OpenAI {
  openai ??= new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
  return openai;
}

export interface VoiceoverTranscription {
  text: string;
  duration: number;
  segments: WhisperSegment[];
  words: WhisperWord[];
}

/** Downloads `r2Key`, converts it to mp3, transcribes it. Cleans up its temp files. */
export async function transcribeVoiceoverAudio(r2Key: string): Promise<VoiceoverTranscription> {
  const ts = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const rawPath = join(tmpdir(), `bm-vo-${ts}.audio`);
  const mp3Path = join(tmpdir(), `bm-vo-${ts}.mp3`);

  try {
    const { Body } = await r2Client().send(
      new GetObjectCommand({ Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME!, Key: r2Key })
    );
    if (!Body) throw new Error("Empty response from R2");
    await pipeline(Body as NodeJS.ReadableStream, createWriteStream(rawPath));

    // MediaRecorder output (webm/opus or mp4/aac) has no reliable duration
    // header; re-encoding to a plain mp3 gives Whisper a clean file.
    await new Promise<void>((resolve, reject) => {
      ffmpeg(rawPath)
        .audioFilters("asetpts=PTS-STARTPTS")
        .outputOptions(["-vn", "-ar 16000", "-ac 1", "-f mp3"])
        .output(mp3Path)
        .on("end", () => resolve())
        .on("error", (err: Error) => reject(err))
        .run();
    });

    const result = (await openaiClient().audio.transcriptions.create({
      file: createReadStream(mp3Path) as unknown as File,
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["word", "segment"],
    })) as unknown as {
      text: string;
      duration: number;
      segments?: Array<{ id: number; start: number; end: number; text: string }>;
      words?: Array<{ word: string; start: number; end: number }>;
    };

    return {
      text: (result.text ?? "").trim(),
      duration: result.duration ?? 0,
      segments: (result.segments ?? []).map(({ id, start, end, text }) => ({ id, start, end, text: text.trim() })),
      words: (result.words ?? []).map(({ word, start, end }) => ({ word, start, end })),
    };
  } finally {
    const del = (p: string) => new Promise<void>(r => unlink(p, () => r()));
    await Promise.allSettled([del(rawPath), del(mp3Path)]);
  }
}
