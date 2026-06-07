import {
  addDoc,
  collection,
  doc,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export function threadId(coachId: string, athleteId: string): string {
  return `${coachId}__${athleteId}`;
}

export async function getOrCreateThread(
  coachId: string,
  athleteId: string,
  coachName: string,
  athleteName: string,
  athleteAvatarId: string
): Promise<string> {
  const tid = threadId(coachId, athleteId);
  await setDoc(
    doc(db, "threads", tid),
    {
      coachId,
      athleteId,
      coachName,
      athleteName,
      athleteAvatarId,
      lastMessage: "",
      lastSenderRole: null,
      lastAt: null,
      unreadForCoach: 0,
      unreadForAthlete: 0,
    },
    { merge: true }
  );
  return tid;
}

export async function sendMessage(
  tid: string,
  senderId: string,
  senderRole: "coach" | "student",
  text: string,
  videoRef?: { videoId: string; videoTitle: string } | null
): Promise<void> {
  await addDoc(collection(db, "threads", tid, "messages"), {
    senderId,
    senderRole,
    text,
    videoId: videoRef?.videoId ?? null,
    videoTitle: videoRef?.videoTitle ?? null,
    createdAt: serverTimestamp(),
  });
  const unreadField = senderRole === "coach" ? "unreadForAthlete" : "unreadForCoach";
  await updateDoc(doc(db, "threads", tid), {
    lastMessage: text || (videoRef ? `\u{1F4F9} ${videoRef.videoTitle}` : ""),
    lastSenderRole: senderRole,
    lastAt: serverTimestamp(),
    [unreadField]: increment(1),
  });
}

export async function markThreadRead(tid: string, role: "coach" | "student"): Promise<void> {
  const field = role === "coach" ? "unreadForCoach" : "unreadForAthlete";
  await updateDoc(doc(db, "threads", tid), { [field]: 0 });
}
