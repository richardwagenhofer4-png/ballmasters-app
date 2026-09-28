// POST /api/register — create the signed-up user's users/{uid} profile.
//
// The client still creates the Firebase Auth account itself, then calls this
// with that account's ID token and the form fields. Clients can no longer
// create, delete, or change role/coachId on a users doc (firestore.rules),
// so this route is the only place a profile is born, and it decides role and
// coachId itself from the invite that was used:
//
//   ?coachInvite=<token>  → role "coach". coachInvites/{token} must exist and
//                           be unused; it is marked used in the same
//                           transaction, so one link can't mint two coaches.
//   invite code           → role "student", coachId = the code's createdBy.
//                           The code must exist, be active and be under
//                           maxUses; this uid is appended to usedBy in the
//                           same transaction.
//
// The validation messages and every profile field are the same as the
// client-side flow this replaces (app/register/RegisterForm.tsx +
// lib/firestore.ts saveUserProfile, lib/inviteCodes.ts, lib/coachInvites.ts).
// Body:
//   { fullName, email, age, dateOfBirth?, guardianName?, termsConsent,
//     guardianConsent, inviteCode?, coachInviteToken? }
// age is the value the form computed (for athletes, from dateOfBirth); the
// server checks it against dateOfBirth itself, allowing a day of timezone
// difference.

import type { NextRequest } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebaseAdmin";
import { getAge } from "@/lib/age";

const SAFE_ID = /^[A-Za-z0-9_-]{1,200}$/;

class Rejected extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) return Response.json({ error: "Missing authorization token" }, { status: 401 });

    let uid: string;
    let authEmail: string | null;
    try {
      const decoded = await getAdminAuth().verifyIdToken(token);
      uid = decoded.uid;
      authEmail = decoded.email ?? (await getAdminAuth().getUser(uid)).email ?? null;
    } catch {
      return Response.json({ error: "Invalid or expired token" }, { status: 401 });
    }
    if (!authEmail) return Response.json({ error: "This account has no email address." }, { status: 400 });

    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return Response.json({ error: "Invalid JSON body" }, { status: 400 });
    }

    const coachInviteToken = str(body.coachInviteToken);
    const code = str(body.inviteCode).trim().toUpperCase();
    const fullName = str(body.fullName).trim();
    const typedEmail = str(body.email);
    const dateOfBirth = str(body.dateOfBirth);
    const guardianName = str(body.guardianName).trim();
    const termsConsent = body.termsConsent === true;
    const guardianConsent = body.guardianConsent === true;
    const age = typeof body.age === "number" && Number.isInteger(body.age) ? body.age : null;

    // ── Same rules as RegisterForm.validate() ──────────────────────────────
    const isStudentPath = !coachInviteToken;
    const role: "student" | "coach" = isStudentPath ? "student" : "coach";
    if (typedEmail.trim().toLowerCase() !== authEmail.toLowerCase()) {
      throw new Rejected("The email doesn't match the account being registered.");
    }
    if (coachInviteToken && !SAFE_ID.test(coachInviteToken)) throw new Rejected("Invalid coach invite link.");
    if (code && !SAFE_ID.test(code)) {
      throw new Rejected("That invite code doesn't exist. Please check the code or use the link your coach gave you.");
    }

    let isMinor = false;
    if (isStudentPath) {
      if (!dateOfBirth) throw new Rejected("Please enter the athlete's date of birth.");
      const serverAge = getAge(dateOfBirth);
      if (serverAge === null || age === null || Math.abs(serverAge - age) > 1 || age < 3 || age > 100) {
        throw new Rejected("Please enter a valid date of birth (athlete must be between 3 and 100 years old).");
      }
      isMinor = age < 13;
      if (isMinor) {
        if (!guardianConsent) throw new Rejected("You must check the consent box to create an account for an athlete under 13.");
        if (!fullName) throw new Rejected("Please enter the athlete's full name.");
        if (!guardianName) throw new Rejected("Please enter the parent or guardian's full name.");
      } else {
        if (!termsConsent) throw new Rejected("Please agree to the Terms of Service, Privacy Policy, and AI Disclosure to continue.");
        if (!fullName) throw new Rejected("Please enter your full name.");
      }
      if (!code) throw new Rejected("An invite code is required to register.");
    } else {
      if (!termsConsent) throw new Rejected("Please agree to the Terms of Service, Privacy Policy, and AI Disclosure to continue.");
      if (!fullName) throw new Rejected("Please enter your full name.");
      if (age === null || age < 1 || age > 120) throw new Rejected("Please enter a valid age.");
    }

    const db = getAdminFirestore();
    const userRef = db.collection("users").doc(uid);

    const result = await db.runTransaction(async tx => {
      // All reads first.
      const existing = await tx.get(userRef);
      const inviteRef = coachInviteToken ? db.collection("coachInvites").doc(coachInviteToken) : null;
      const codeRef = code ? db.collection("inviteCodes").doc(code) : null;
      const inviteSnap = inviteRef ? await tx.get(inviteRef) : null;
      const codeSnap = codeRef ? await tx.get(codeRef) : null;

      // A retry after a lost response: the profile is already there. Nothing
      // is changed; the client carries on with the stored role.
      if (existing.exists) return { role: existing.data()?.role as string, alreadyRegistered: true };

      let coachId: string | undefined;
      if (inviteRef && inviteSnap) {
        // Same checks as lib/coachInvites.ts validateCoachInvite().
        if (!inviteSnap.exists) throw new Rejected("Invalid coach invite link.");
        if (inviteSnap.data()?.usedBy) throw new Rejected("This invite link has already been used.");
        tx.update(inviteRef, { usedBy: uid, usedAt: FieldValue.serverTimestamp() });
        // The coach form can also carry an invite code (prefilled from the
        // URL); its use was recorded but never validated. Kept as-is, except
        // that a code that doesn't exist is skipped instead of failing.
        if (codeRef && codeSnap?.exists) tx.update(codeRef, { usedBy: FieldValue.arrayUnion(uid) });
      } else if (codeRef && codeSnap) {
        // Same checks as lib/inviteCodes.ts validateInviteCode().
        if (!codeSnap.exists) {
          throw new Rejected("That invite code doesn't exist. Please check the code or use the link your coach gave you.");
        }
        const c = codeSnap.data()!;
        if (!c.active) throw new Rejected("This invite code is no longer active.");
        const usedBy = Array.isArray(c.usedBy) ? c.usedBy : [];
        if (usedBy.length >= (c.maxUses as number)) throw new Rejected("This invite code has reached its maximum uses.");
        if (typeof c.createdBy === "string" && c.createdBy) coachId = c.createdBy;
        tx.update(codeRef, { usedBy: FieldValue.arrayUnion(uid) });
      }

      // The profile exactly as lib/firestore.ts saveUserProfile() wrote it
      // from RegisterForm: optional fields only when set.
      const data: Record<string, unknown> = {
        uid,
        email: authEmail,
        fullName,
        role,
        age,
        school: "ballmasters",
        createdAt: FieldValue.serverTimestamp(),
        termsConsentAt: FieldValue.serverTimestamp(),
        termsConsentVersion: "v1",
      };
      if (isStudentPath && dateOfBirth) data.dateOfBirth = dateOfBirth;
      if (isMinor) {
        data.guardianManaged = true;
        data.guardianName = guardianName;
        data.guardianEmail = typedEmail;
        data.guardianConsentAt = FieldValue.serverTimestamp();
        data.guardianConsentVersion = "v1";
      }
      if (coachId) data.coachId = coachId;
      // A student whose coach could not be resolved is flagged so an admin
      // can assign one. Never flag coaches — they legitimately have no coachId.
      if (role === "student" && !coachId) data.needsCoachAssignment = true;

      tx.create(userRef, data);
      return { role, alreadyRegistered: false };
    });

    return Response.json({ ok: true, role: result.role, alreadyRegistered: result.alreadyRegistered });
  } catch (err) {
    if (err instanceof Rejected) return Response.json({ error: err.message }, { status: err.status });
    console.error("[api/register]", err);
    return Response.json({ error: "Internal server error" }, { status: 500 });
  }
}
