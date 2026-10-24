// The three roles a Ball Masters profile can have. A users/{uid} document
// without one of them is not a usable profile (an Apple/Google sign-in whose
// only document was made by a push-token write had none): treat it exactly
// like no profile at all.

export type ValidRole = "coach" | "admin" | "student";

export function isValidRole(role: unknown): role is ValidRole {
  return role === "coach" || role === "admin" || role === "student";
}
