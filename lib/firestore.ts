import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type UserRole = "student" | "coach" | "admin";

export interface UserProfile {
  uid: string;
  email: string;
  fullName: string;
  role: UserRole;
  age: number | null;
  parentEmail?: string;
  createdAt: unknown;
  school: string;
}

export async function saveUserProfile(
  profile: Omit<UserProfile, "createdAt" | "school">
): Promise<void> {
  console.log("[saveUserProfile] called with:", {
    uid: profile.uid,
    email: profile.email,
    role: profile.role,
    age: profile.age,
  });

  const ref = doc(db, "users", profile.uid);
  const data: Record<string, unknown> = {
    uid: profile.uid,
    email: profile.email,
    fullName: profile.fullName,
    role: profile.role,
    age: profile.age ?? null,
    school: "ballmasters",
    createdAt: serverTimestamp(),
  };
  if (profile.parentEmail) {
    data.parentEmail = profile.parentEmail;
  }

  console.log("[saveUserProfile] writing to Firestore path: users/" + profile.uid);
  try {
    await setDoc(ref, data);
    console.log("[saveUserProfile] write succeeded");
  } catch (err) {
    console.error("[saveUserProfile] write FAILED:", err);
    throw err;
  }
}

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data() as UserProfile;
}
