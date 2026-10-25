// Signing out, without leaving this phone's push token on the account
// (Build 1.1 step 8, problem C).
//
// The same phone token used to be written onto every account that signed in on
// the phone, and nothing removed it at sign-out: after switching accounts the
// phone could still receive the previous account's notifications. So, BEFORE
// the Firebase sign-out (while the rules still know who is asking), the
// person's fcmToken and fcmTokenSource are deleted from their users/{uid}
// document. That is best effort: errors are ignored and it gets at most
// TOKEN_REMOVE_LIMIT_MS, so a dead connection can never keep anyone from
// signing out. The "this device already saved its token for that account"
// marker is cleared either way, so signing back in saves the token again.
//
// Then the app NAVIGATES to /login with a full page load, not a client-side
// route change. The Next.js client router keeps pages and redirects it has
// already seen (it cached "/dashboard goes to /student/dashboard" while a
// student was signed in, and handed it to the admin who signed in next). A
// full page load throws all of that away, along with every other bit of the
// previous account's in-memory state.
//
// Pure logic (everything injected) so scripts/test-sign-out.mjs can test it.
// The real wiring is lib/signOut.ts.

export const TOKEN_REMOVE_LIMIT_MS = 2000;

export interface SignOutDeps {
  currentUid(): string | null;
  /** Deletes fcmToken and fcmTokenSource from users/{uid}. Runs while still signed in. */
  removePushToken(uid: string): Promise<void>;
  /** Forgets that this device saved its token for that account. */
  forgetSavedToken(uid: string): void;
  signOut(): Promise<void>;
  clearAuthCookies(): void;
  /** A FULL page load of `url` (window.location.replace), never a client-side route change. */
  hardNavigate(url: string): void;
  setTimer(fn: () => void, ms: number): unknown;
  clearTimer(handle: unknown): void;
  onError?(err: unknown): void;
}

export function createSignOut(deps: SignOutDeps) {
  /**
   * `removeToken: false` skips the token removal (account deletion: the profile
   * is already gone; no profile yet: nothing to remove it from).
   * `redirectTo` is where the full page load goes (default "/login"; account
   * deletion passes "/login?deleted=1").
   */
  return async function signOutUser(opts: { removeToken?: boolean; redirectTo?: string } = {}): Promise<void> {
    const uid = deps.currentUid();
    if (uid && opts.removeToken !== false) {
      let timer: unknown;
      try {
        await Promise.race([
          deps.removePushToken(uid),
          new Promise<void>(resolve => { timer = deps.setTimer(resolve, TOKEN_REMOVE_LIMIT_MS); }),
        ]);
      } catch (err) {
        try { deps.onError?.(err); } catch { /* ignore */ }
      } finally {
        if (timer !== undefined) { try { deps.clearTimer(timer); } catch { /* ignore */ } }
      }
      try { deps.forgetSavedToken(uid); } catch { /* ignore */ }
    }
    await deps.signOut();
    deps.clearAuthCookies();
    deps.hardNavigate(opts.redirectTo ?? "/login");
  };
}
