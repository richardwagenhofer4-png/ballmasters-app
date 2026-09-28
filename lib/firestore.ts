import { doc, getDoc } from "firebase/firestore";
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
  // Date of birth and consent fields (added for COPPA compliance)
  dateOfBirth?: string;
  termsConsentAt?: unknown;
  termsConsentVersion?: string;
  guardianManaged?: boolean;
  guardianName?: string;
  guardianEmail?: string;
  guardianConsentAt?: unknown;
  guardianConsentVersion?: string;
  needsCoachAssignment?: boolean;
}

// users/{uid} profiles are created server-side only, by /api/register
// (firestore.rules refuse client creates). There is deliberately no client
// writer here.

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  return snap.data() as UserProfile;
}
