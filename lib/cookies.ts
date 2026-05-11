const MAX_AGE = 60 * 60 * 24 * 7; // 7 days

export function setAuthCookies(role: string): void {
  document.cookie = `ballmasters_auth=1; path=/; max-age=${MAX_AGE}; SameSite=Strict`;
  document.cookie = `ballmasters_role=${role}; path=/; max-age=${MAX_AGE}; SameSite=Strict`;
}

export function clearAuthCookies(): void {
  document.cookie = "ballmasters_auth=; path=/; max-age=0; SameSite=Strict";
  document.cookie = "ballmasters_role=; path=/; max-age=0; SameSite=Strict";
}
