import { doc, setDoc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

function makeToken(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from({ length: 32 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

export async function createCoachInvite(adminUid: string, email: string): Promise<string> {
  const token = makeToken();
  await setDoc(doc(db, "coachInvites", token), {
    token,
    email,
    createdBy: adminUid,
    createdAt: serverTimestamp(),
    usedBy: null,
    usedAt: null,
  });
  return token;
}

export async function validateCoachInvite(
  token: string
): Promise<{ valid: boolean; error?: string; email?: string }> {
  const snap = await getDoc(doc(db, "coachInvites", token));
  if (!snap.exists()) return { valid: false, error: "Invalid coach invite link." };
  const data = snap.data();
  if (data.usedBy) return { valid: false, error: "This invite link has already been used." };
  return { valid: true, email: data.email as string };
}

export async function useCoachInvite(token: string, uid: string): Promise<void> {
  await updateDoc(doc(db, "coachInvites", token), {
    usedBy: uid,
    usedAt: serverTimestamp(),
  });
}
