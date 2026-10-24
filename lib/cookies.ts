import { isValidRole } from "@/lib/roles";

const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export function setAuthCookies(role: string): void {
  // Never write a role the app doesn't know, least of all the string "undefined":
  // the middleware and the login page both trust this cookie to route the person.
  if (!isValidRole(role)) {
    console.warn("[cookies] refusing to store an invalid role");
    return;
  }
  document.cookie = `ballmasters_auth=1; path=/; max-age=${MAX_AGE}; SameSite=Strict`;
  document.cookie = `ballmasters_role=${role}; path=/; max-age=${MAX_AGE}; SameSite=Strict`;
}

export function clearAuthCookies(): void {
  document.cookie = "ballmasters_auth=; path=/; max-age=0; SameSite=Strict";
  document.cookie = "ballmasters_role=; path=/; max-age=0; SameSite=Strict";
  localStorage.removeItem("ballmasters_role");
}
