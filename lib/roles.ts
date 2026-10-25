// The three roles a Ball Masters profile can have. A users/{uid} document
// without one of them is not a usable profile (an Apple/Google sign-in whose
// only document was made by a push-token write had none): treat it exactly
// like no profile at all.

export type ValidRole = "coach" | "admin" | "student";

export function isValidRole(role: unknown): role is ValidRole {
  return role === "coach" || role === "admin" || role === "student";
}

/**
 * Where a person lives after signing in: the screens of their own role.
 * Login and sign-up navigate here DIRECTLY, with the role they have just
 * read or been given, instead of going through the /dashboard redirect: the
 * client router remembers redirects, and after an account switch it reused
 * the previous account's (an admin landed on the student screens).
 * The /dashboard middleware relay stays for people who visit it directly.
 */
export function homeFor(role: ValidRole): "/coach/dashboard" | "/student/dashboard" {
  return role === "coach" || role === "admin" ? "/coach/dashboard" : "/student/dashboard";
}
