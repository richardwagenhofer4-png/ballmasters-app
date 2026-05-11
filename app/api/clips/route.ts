import type { NextRequest } from "next/server";
import { verifyIdToken } from "@/lib/firebaseServer";

const DEFAULT_PHRASES = [
  "next drill",
  "okay stop",
  "watch this",
  "let's move on",
  "good now",
  "moving on",
  "okay next",
  "alright everyone",
  "let's go",
  "stop there",
  "stop here",
  "pause here",
  "now watch",
  "switch sides",
  "change sides",
  "next exercise",
  "next rep",
  "reset",
];

interface Segment { id: number; start: number; end: number; text: string; }

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    await verifyIdToken(authHeader.slice(7));

    const { segments, customPhrases = [] } = (await request.json()) as {
      segments: Segment[];
      customPhrases?: string[];
    };

    const phrases = [...DEFAULT_PHRASES, ...customPhrases].map((p) => p.toLowerCase());

    const cutPoints: Array<{ time: number; phrase: string }> = [];

    for (const seg of segments) {
      const lower = seg.text.toLowerCase();
      const matched = phrases.find((p) => lower.includes(p));
      if (!matched) continue;

      // Avoid duplicate cuts within 3 seconds of each other
      const last = cutPoints[cutPoints.length - 1];
      if (!last || seg.start - last.time > 3) {
        cutPoints.push({ time: seg.start, phrase: matched });
      }
    }

    return Response.json({ cutPoints });
  } catch (err) {
    console.error("[api/clips]", err);
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
