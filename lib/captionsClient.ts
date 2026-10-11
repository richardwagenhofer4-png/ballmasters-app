// Loads a video's captions and the coach's feedback (client side).
//
// Never throws: a failed read counts as "none". The student video page must
// still play the video if these reads are refused — for instance while the
// security rules for videos/{id}/captions and /feedback are not deployed yet,
// or a plan runs out mid-session — and it then falls back to what it did
// before captions existed.

import { doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { cleanSegments, FEEDBACK_MAX_CHARS, type CaptionSegment } from "@/lib/captions";

export interface CoachNotes {
  captions: CaptionSegment[];
  /** captions/main createdAt, kept so the coach's later saves don't reset it. */
  captionsCreatedAt: string | null;
  feedback: string;
}

export async function loadCoachNotes(videoId: string): Promise<CoachNotes> {
  const [captionsSnap, feedbackSnap] = await Promise.all([
    getDoc(doc(db, "videos", videoId, "captions", "main")).catch(() => null),
    getDoc(doc(db, "videos", videoId, "feedback", "main")).catch(() => null),
  ]);

  const captionsData = captionsSnap?.exists() ? captionsSnap.data() : null;
  const feedbackData = feedbackSnap?.exists() ? feedbackSnap.data() : null;
  const feedbackText = typeof feedbackData?.text === "string" ? feedbackData.text.trim() : "";

  return {
    captions: cleanSegments(captionsData?.segments),
    captionsCreatedAt: typeof captionsData?.createdAt === "string" ? captionsData.createdAt : null,
    feedback: feedbackText.slice(0, FEEDBACK_MAX_CHARS),
  };
}
