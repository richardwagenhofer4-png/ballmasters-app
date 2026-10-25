// What a failed sign-in means, and what to tell the person (Build 1.1 step 9).
//
// Only a credential ANSWER is the person's answer: wrong password, no such
// account, and so on. Anything else (the network failed, a timeout, an internal
// error, something we have never seen) is a fault somewhere, so it is reported
// to Sentry with its code, and a network problem is never described as an
// "unexpected error".

export type LoginErrorKind = "credential" | "network" | "other";

export const NETWORK_MESSAGE = "Couldn\u2019t reach Ball Masters. Check your connection and try again.";
export const GENERIC_MESSAGE = "An unexpected error occurred. Please try again.";

const CREDENTIAL_MESSAGES: Record<string, string> = {
  "auth/invalid-credential": "Invalid email or password.",
  "auth/user-not-found": "No account found with this email.",
  "auth/wrong-password": "Incorrect password.",
  "auth/invalid-email": "Please enter a valid email address.",
  "auth/user-disabled": "This account has been disabled.",
  "auth/too-many-requests": "Too many failed attempts. Please try again later.",
};

// Answers about the account that is signing in, not faults. (Also answered here
// because the message differs: "different sign-in method".)
const OTHER_ANSWERS: Record<string, string> = {
  "auth/account-exists-with-different-credential":
    "This email already has an account with a different sign-in method. Sign in the way you did before.",
};

const NETWORK_CODES = new Set([
  "auth/network-request-failed",
  "auth/timeout",
  "unavailable", // Firestore: the client is offline
  "deadline-exceeded",
]);

export function errorCode(err: unknown): string {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : "";
}

export function classifyLoginError(err: unknown): { kind: LoginErrorKind; code: string } {
  const code = errorCode(err);
  const name = (err as { name?: unknown } | null)?.name;
  if (code in CREDENTIAL_MESSAGES || code in OTHER_ANSWERS) return { kind: "credential", code };
  if (NETWORK_CODES.has(code) || name === "ReadTimeoutError" || name === "ProfileUnreachableError") return { kind: "network", code: code || String(name) };
  return { kind: "other", code: code || "none" };
}

/** The sentence to show for a failed sign-in. */
export function loginErrorMessage(err: unknown): string {
  const { kind, code } = classifyLoginError(err);
  if (kind === "network") return NETWORK_MESSAGE;
  return CREDENTIAL_MESSAGES[code] ?? OTHER_ANSWERS[code] ?? GENERIC_MESSAGE;
}
