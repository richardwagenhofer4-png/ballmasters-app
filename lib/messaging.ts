import {
  addDoc,
  collection,
  doc,
  increment,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { createNotification } from "@/lib/notifications";

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
  // Only ever write identity/display fields. The volatile conversation state
  // (lastMessage, lastSenderRole, lastAt, unreadForCoach, unreadForAthlete) is
  // owned by sendMessage — its increment() works on a not-yet-existent field,
  // so nothing needs initialising here. Writing them would reset a live thread
  // on every page load that resolves it. A pre-create getDoc is not an option:
  // the /threads read rule denies on a non-existent doc (resource is null), so
  // it would throw rather than return exists() === false.
  await setDoc(
    doc(db, "threads", tid),
    { coachId, athleteId, coachName, athleteName, athleteAvatarId },
    { merge: true }
  );
  return tid;
}

export async function sendMessage(
  tid: string,
  senderId: string,
  senderRole: "coach" | "student",
  text: string,
  videoRef?: { videoId: string; videoTitle: string } | null,
  senderName?: string
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

  // Push to the other person's iPhone app (1.1+ only; the server decides).
  void pushNewMessage(tid);

  if (senderName) {
    const parts = tid.split("__");
    const recipientId = senderRole === "coach" ? parts[1] : parts[0];
    const body = text.trim() || (videoRef ? `Shared video: ${videoRef.videoTitle}` : undefined);
    createNotification({
      recipientId,
      type: "new_message",
      title: `Message from ${senderName}`,
      body,
      link: senderRole === "coach" ? "/student/messages" : "/coach/messages",
      meta: { threadId: tid },
    }).catch(console.error);
  }
}

async function pushNewMessage(tid: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  try {
    const idToken = await user.getIdToken();
    await fetch("/api/notifications/message", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({ threadId: tid }),
    });
  } catch (err) {
    console.error("[messaging] push request failed", err);
  }
}

export async function markThreadRead(tid: string, role: "coach" | "student"): Promise<void> {
  const field = role === "coach" ? "unreadForCoach" : "unreadForAthlete";
  await updateDoc(doc(db, "threads", tid), { [field]: 0 });
}
