import { readOwnUserDoc } from "@/lib/ownProfile";

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

/**
 * The signed-in person's own profile, or null if they really have none.
 * A first "missing" answer is double-checked against the server about a second
 * later before null is returned (lib/ownProfile.ts). `onRead` (optional,
 * diagnostics only) is told what the FIRST read answered, so the login trace
 * can show whether a "no profile" came from the server or from the cache. It
 * cannot change the result.
 */
export async function getUserProfile(
  uid: string,
  onRead?: (meta: { exists: boolean; fromCache: boolean }) => void
): Promise<UserProfile | null> {
  const snap = await readOwnUserDoc(uid, onRead);
  if (!snap.exists()) return null;
  return snap.data() as UserProfile;
}
