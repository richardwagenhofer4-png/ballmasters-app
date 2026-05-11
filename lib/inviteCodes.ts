import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  arrayUnion,
  serverTimestamp,
} from "firebase/firestore";
import { db } from "@/lib/firebase";

export interface InviteCode {
  code: string;
  createdBy: string;
  school: string;
  usedBy: string[];
  maxUses: number;
  active: boolean;
  createdAt: unknown;
}

function makeCode(): string {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  return Array.from({ length: 8 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join("");
}

export async function createInviteCode(coachUid: string): Promise<string> {
  // Deactivate the coach's previous code if one exists
  const profileSnap = await getDoc(doc(db, "users", coachUid));
  if (profileSnap.exists()) {
    const prev = profileSnap.data().currentInviteCode as string | undefined;
    if (prev) {
      await updateDoc(doc(db, "inviteCodes", prev), { active: false });
    }
  }

  const code = makeCode();
  await setDoc(doc(db, "inviteCodes", code), {
    code,
    createdBy: coachUid,
    school: "ballmasters",
    usedBy: [],
    maxUses: 100,
    active: true,
    createdAt: serverTimestamp(),
  });

  // Store reference on the coach's profile for quick lookup (no collection query needed)
  await updateDoc(doc(db, "users", coachUid), { currentInviteCode: code });

  return code;
}

export async function getInviteCode(code: string): Promise<InviteCode | null> {
  const snap = await getDoc(doc(db, "inviteCodes", code.toUpperCase()));
  if (!snap.exists()) return null;
  return snap.data() as InviteCode;
}

export async function validateInviteCode(
  code: string
): Promise<{ valid: boolean; error?: string }> {
  const data = await getInviteCode(code);
  if (!data) return { valid: false, error: "Invalid invite code." };
  if (!data.active) return { valid: false, error: "This invite code is no longer active." };
  if (data.usedBy.length >= data.maxUses)
    return { valid: false, error: "This invite code has reached its maximum uses." };
  return { valid: true };
}

export async function recordCodeUsage(code: string, uid: string): Promise<void> {
  await updateDoc(doc(db, "inviteCodes", code.toUpperCase()), {
    usedBy: arrayUnion(uid),
  });
}
