# Build 1.1 · Step 2 — Subscriptions, website side

Branch `build-1.1-paywall` (off `main`). Nothing pushed, nothing deployed, no `firebase deploy`, nothing under `ios/` touched, no `npx cap sync`.

**Status:** everything in the brief is built and the switch is **off**. `npm run build` and `npm run lint` pass (lint: 0 errors). The security rules were run against the Firestore emulator: 225/225 checks pass, and the switch-off checks give identical results on `main`'s rules and on this branch's. An independent review of the full diff found no switch-off differences in the app screens; its switch-on findings are fixed (§4). The pre-existing `role` hole (§6.1) is closed — see §8.

---

## 1. What was built

### The switch
- Firestore document `config/app`, boolean `paywallEnabled`. Missing doc, missing field or `false` = off.
- `lib/paywall.ts` (client): `useAppConfig()` / `loadAppConfig()`. One live `onSnapshot` listener per app session (1 read to start, 1 when it flips), last value remembered in `localStorage` so the next launch knows before the network does. Any read error keeps the last known value, else "off", and retries at most once a minute.
- `lib/paywall.server.ts` (server): `getAppConfigServer()` / `isPaywallEnabledServer()` via the Admin SDK, cached 60s per instance.
- Optional second flag `config/app.planToolsEnabled` (see Decisions §5.2): shows the coach-side plan tools while the paywall itself is still off.

### Data model (`users/{uid}`) and helpers
- `plan` (`"none" | "access" | "coached"`, absent = none), `planSource` (`"revenuecat" | "admin"`), `planExpiresAt` (Timestamp or null = no end), `rcAppUserId`. Existing users are not backfilled — absent means none.
- Supporting fields, written only by the server: `adminGrant` (the staff grant), `revenuecat.entitlements.{access,coached}` (what RevenueCat last said), `planProductId` / `planIsTrial` / `planWillRenew` (details of the winning subscription, for badges and "Renews …").
- `lib/entitlements.ts`: `effectivePlan(user)` (coach/admin → coached, expired → none), `canSeeVideos`, `canSeeBreakdowns` (coached), `canMessage` (coached), the plan resolver shared by the webhook and the admin route, and the coach badge label.
- `lib/plans.ts`: the four product IDs exactly as given, prices, trial days and the plan copy.
- `lib/billing.ts`: `getOfferings()`, `purchase(productId)`, `restorePurchases()`, `presentCodeRedemption()`, `isNativeBillingAvailable()` (Capacitor native detection). A stub: on the web there are no buy buttons; inside the iOS shell the buttons show but report "not available in this version yet" until RevenueCat is wired in.
- `lib/EntitlementsContext.tsx`: what the signed-in viewer may see on student screens. While the switch is off it is a constant "everything unlocked" and opens no listener.

### Security rules (`firestore.rules`) — edited, not deployed
Only when `config/app` exists and `paywallEnabled == true` (`exists()` is checked before `get()`):
- `videos/{id}`: a student **list** needs Access or Coached; a single-doc **get** of a drill comparison needs Coached.
- `videos/{id}/annotations/*` and `videos/{id}/voiceover/*`: student reads need Coached.
- `threads/{id}` and `threads/{id}/messages/*`: the athlete side (read, write, create, send) needs Coached. The coach side is never gated.
- "Effective plan" in rules: role coach/admin → allowed; otherwise `plan` in the required set and (`planExpiresAt == null` or `> request.time`).

Always (not switch-dependent — see Decisions §5.6): users can't write the plan/billing fields on their own doc. New `config/{doc}` match: readable by signed-in users, never writable from a client. `billingEvents` has no client access.

### RevenueCat webhook — `POST /api/billing/revenuecat`
- `Authorization: Bearer <REVENUECAT_WEBHOOK_SECRET>` or 401 (also 401 if the env var isn't set). Constant-time comparison.
- Maps entitlement `coached` → Coached, `access` → Access, nothing active → none, and writes `plan` / `planSource: "revenuecat"` / `planExpiresAt` / `rcAppUserId` to `users/{app_user_id}`.
- Never downgrades an unexpired admin grant.
- Idempotent: each event is written to `billingEvents/{event.id}` inside the same transaction; a repeat id changes nothing. Out-of-order events (older `event_timestamp_ms` than the last one applied to that entitlement) are ignored.
- The user is found by `app_user_id`, then `original_app_user_id`, then `aliases` (a purchase made before `logIn()` arrives under an anonymous id with the uid aliased). An event that matched no user is re-processed if RevenueCat redelivers it, rather than counted as a duplicate.
- `POST /api/billing/refresh` re-resolves the **caller's own** plan from what's already stored on their doc. The app calls it when the stored plan has run out but another source is still active (e.g. a staff Coached grant that outranked a paid Access subscription expires first) — without it the subscriber would be locked out until RevenueCat's next event, up to a year away. It can't grant anything not already paid for or granted.
- `REVENUECAT_WEBHOOK_SECRET` added to the new `.env.example` (names only; `.gitignore` now un-ignores that one file).

### Admin grant tool
- `POST /api/admin/plan` `{uid, plan, expiresAt | null}`. ID token verified with the Admin SDK; caller's role read from Firestore; coach or admin only. Writes the grant with `planSource: "admin"`, logged to `billingEvents`.
- **Plan card** on the coach's student profile (`app/coach/students/[id]/StudentProfilePage.tsx`): current plan, source and expiry, a plan select and optional end date. Choosing an end date means "through the end of that day, local time".

### `hasBreakdown` flag
- The annotate editor sets `videos/{id}.hasBreakdown = true` when the coach saves an annotation or a voiceover, and `false` when the last of both is removed. Best-effort: a failed flag write never blocks the coach's save.
- Backfill: `scripts/backfill-has-breakdown.mjs` (not run — see §3).

### Student UI (all of it inert while the switch is off)
1. **Paywall** — `components/Paywall.tsx` + `/student/subscribe`. Monthly/Annual toggle (annual shows "2 months free"), Coached card first, navy and badged "Most complete", Access card, one CTA ("Start 7-day free trial" monthly, "Subscribe" annual), fine print with price, period and "Auto-renews until cancelled in Settings", and Restore purchases · Redeem code · Terms · Privacy. `?mode=upgrade` shows Coached only. On the web the CTA reads "Subscribe in the Ball Masters iPhone app". Every control is in a bottom sheet for one-handed use; checked at 390×844 in headless Chrome with no horizontal overflow.
2. **Gate** — `app/student/layout.tsx` + `components/StudentPaywallGate.tsx`. Students with no plan land on `/student/subscribe` after login and every student route sends them there, except `/student/profile` (sign out, delete account). Support, Terms and Privacy are outside `/student` and never gated.
3. **Video page** — for Access, annotations and voiceover are not loaded; when `hasBreakdown` is true a locked panel under the player reads "Coach breakdown on this clip" / "Your coach added drawings and feedback to this video. Upgrade to Coached to watch it with their breakdown." / **See Coached**. Drill comparisons: cards stay in the dashboard and My Videos lists with a "🔒 Coached" badge and open the upgrade paywall instead of the player (a deep link from a notification does the same).
4. **Profile** — "Your plan": plan name, "Renews/Expires <date>" when known, Choose a plan / Upgrade, **Manage subscription** (apps.apple.com/account/subscriptions) and **Restore purchases**.
5. **Messaging** — for Access, the bottom-nav Messages item (all five student screens) and the dashboard's "Message Coach" show a lock and open the upgrade paywall; `/student/messages` itself shows a locked state.

### Coach UI
- Plan badge — None / Access / Access · trial / Coached / Coached · annual (tooltip: source and renew/expiry date) — on the athlete list (all three views), the student profile header, and beside each name in the upload page's athlete picker. Built from the user docs those screens already load; no extra reads.

### Terms (`app/terms/page.tsx`)
The "Add fees/subscription/refund terms" placeholder is replaced by **7 Subscriptions** (plans and prices, monthly/annual, 7-day trial on monthly, auto-renewal, cancelling in iPhone Settings, changing plans, deleting the account doesn't cancel the subscription, free access granted by us), **8 Refunds** (handled by Apple under the App Store's terms; we can't issue refunds directly) and **9 Changes to Price** (advance notice as Apple's rules require). Later sections renumbered; "Last updated" set to September 27, 2026.

### Bug fixes
- **Bug 1** (`app/coach/dashboard/page.tsx`): the athletes query is now an `onSnapshot` listener, so a newly assigned athlete appears without a reload (also when the iOS app comes back from the background). The first snapshot gates the initial render exactly as before; only changed docs are re-read. Videos and the comment scan are unchanged.
- **Bug 7** (`app/coach/videos/[id]/annotate/AnnotatePage.tsx`): entering Preview pauses the editor video, stops a running voiceover preview (and un-ducks the clip audio), and cancels a pending record countdown. A take that is already recording is held, not discarded.

---

## 2. How to flip the switch (launch day)

Order matters — web build first, rules right after it, switch last. (Changed by §8: the rules now refuse client-side profile creation, so `/api/register` must be live before they are.)

1. **Deploy the web build** from this branch. The app keeps behaving as today; sign-up now goes through `/api/register` (it uses the same `FIREBASE_ADMIN_*` env vars as `/api/delete-account`, already set on Vercel). Until step 2, the paywall switch's `config/app` read is refused by the old rules — harmless: it reads as "off" and retries once a minute.
2. **Deploy the rules** (`firebase deploy --only firestore:rules`) right after. With no `config/app` doc the paywall parts behave exactly like today's; the emulator test proves the switch-off cases match `main`. Then **create one test account** through the invite flow to confirm sign-up works end to end.
3. **Vercel env:** set `REVENUECAT_WEBHOOK_SECRET` (a long random string). **RevenueCat → Integrations → Webhooks:** URL `https://<your-domain>/api/billing/revenuecat`, Authorization header `Bearer <same secret>`. Send RevenueCat's test event; it should appear in `billingEvents` with `outcome: "test"`.
4. **Backfill `hasBreakdown`** (§3).
5. **Pilot families' free Access** — optional preview first: in the Firebase console create `config/app` with `planToolsEnabled: true` (boolean). Coaches/admins now see plan badges and the Plan card while athletes still see nothing new. On each pilot athlete's profile: Plan → Access, end date 3 months out → Save.
6. **Flip:** Firebase console → Firestore → `config` / `app` → set `paywallEnabled` (boolean) to `true`. Rules enforce immediately; open apps pick it up live through the listener.
7. **Roll back:** set `paywallEnabled` to `false` (or delete the doc). Takes effect immediately for rules and open apps.

Before step 6, see §6.

## 3. How to run the backfill script

`scripts/backfill-has-breakdown.mjs` sets `videos/{id}.hasBreakdown` from each video's annotations/voiceover subcollections (≤2 reads per video; only writes videos whose stored value differs; safe to re-run). **Dry run by default.** It uses the Admin SDK credentials in whatever env file you pass — `.env.local` is production.

```bash
# See what would change (no writes):
node --env-file=.env.local scripts/backfill-has-breakdown.mjs
# Apply:
node --env-file=.env.local scripts/backfill-has-breakdown.mjs --apply
```

It was **not** run against any project.

## 4. Testing done

- `npm run build` ✅ and `npm run lint` ✅ (0 errors). The only new warnings are two `<img>` logo warnings, the same pattern every screen in the app uses. The build's `localStorage is not available` warning is pre-existing — a build of `main` prints it too.
- **Security rules** — `scripts/test-paywall-rules.mjs` against the Firestore emulator (demo project, never production): **225/225 pass**. The 132 switch-off checks pass identically against `main`'s rules. To re-run: install Java 11+, `npm i --no-save @firebase/rules-unit-testing`, then `firebase emulators:exec --only firestore --project demo-ballmasters "node scripts/test-paywall-rules.mjs"`.
- **Webhook, admin and refresh routes** — the real route handlers were run in a scratch harness against an in-memory Firestore (not committed; nothing external touched): 32 checks covering auth/401s, bad payloads, TEST events, trial purchase, renewal, duplicate delivery, stale events, cancellation, expiry, refunds, unknown/anonymous users, alias resolution, redelivery of unmatched events, coach vs admin permissions, every admin-grant ↔ subscription interplay (including "never downgrade an admin grant"), and the stale-plan refresh.
- **Independent review** of the whole diff (a separate reviewer pass). Fixed from it: the stale-plan lockout above; webhook alias lookup and redelivery; a denied breakdown read now shows the locked panel instead of failing the page; a failed plan listener is retried instead of treating a coach as plan-less; the config listener restarts after an error; a text `planExpiresAt` now counts as expired in the app, as it does in the rules; the lint overrides narrowed to one rule per file. It confirmed identical switch-off output on the student and coach screens.
- **Paywall UI** — rendered at 390×844 (mobile emulation in headless Chrome) in subscribe, annual, upgrade, native-CTA and staff-preview variants, plus plan badges and the new Terms sections. No horizontal overflow.
- **Not tested end-to-end:** the student and coach screens behind login (video page lock panel, messages lock, profile plan section, Plan card) were not exercised with real accounts — there is no test project, and I did not sign in to production. They were verified by code review, typecheck and lint only.

## 5. Decisions where the spec was silent

1. **Lint baseline.** `npm run lint` failed on `main` (42 errors): 27 from generated files under `ios/` (Xcode build output), 15 React Compiler rule violations in working code. I added `ios/**` to eslint's ignores and downgraded each of those rules to a warning only for the files that actually violate it (listed in `eslint.config.mjs`), rather than rewriting out-of-scope code. Every other file, and every other rule, stays an error.
2. **`planToolsEnabled`.** The Plan card and badges are coach-facing UI; showing them while the switch is off would change coach screens, but pilot grants need to be made *before* the flip. A second optional flag solves both.
3. **Two switch helpers.** `lib/paywall.ts` (client) and `lib/paywall.server.ts` (server) — one file can't import both the Firebase client SDK and the Admin SDK.
4. **Live switch.** A single `onSnapshot` rather than a one-time read, so an iOS app left open in the background for days sees the flip (and a rollback) without a restart.
5. **Videos rule split into `list` and `get`.** Rules are not filters: a drill-type condition on `list` would fail an Access athlete's whole library query. So `list` needs any plan and `get` enforces Coached for drill comparisons. Listing exposes no media — playback URLs are only minted server-side after a rules-checked `get`. Drill detection in rules mirrors the app (`type == "drill_comparison"`, or both video keys present, for older docs without a type).
6. **Plan fields locked unconditionally.** A switch-dependent lock would let anyone write `plan: "coached"` on themselves before launch and keep it. No existing client write touches these fields; the emulator test confirms profile writes (name, avatar, FCM token, lastActiveAt, registration) still work.
7. **Comments and reactions are not gated.** The brief lists videos, breakdowns and messaging only. An Access athlete can still comment on their own videos — confirm that's intended.
8. **Plan resolution.** A user can hold an admin grant and a subscription at once. The effective plan is the highest active one; on a tie the subscription wins and the grant stays on file (`adminGrant`), resuming if the subscription lapses first. So an unexpired admin grant is never downgraded, and a pilot family who subscribes loses nothing.
9. **Webhook event handling.** Grant-type events (INITIAL_PURCHASE, RENEWAL, UNCANCELLATION, NON_RENEWING_PURCHASE, SUBSCRIPTION_EXTENDED, TEMPORARY_ENTITLEMENT_GRANT, REFUND_REVERSED) set the entitlement until `expiration_at_ms`; CANCELLATION keeps it until expiry but marks it non-renewing (a refund arrives as a cancellation with a past expiry, so it ends immediately); BILLING_ISSUE keeps it until expiry; EXPIRATION ends it. PRODUCT_CHANGE, TRANSFER, SUBSCRIPTION_PAUSED and anything unknown are logged only. Anonymous RevenueCat ids and unknown users are logged and acknowledged (200) so RevenueCat doesn't retry forever. The raw event is kept as a JSON string in the audit doc.
10. **Admin route permissions.** Admins can set any student's plan; a coach only their own athletes (plus unassigned athletes if they're the head coach) — the same athletes they can open in the app. Coach/admin accounts can't be targeted. Past end dates are rejected. Choosing "None" removes the staff grant (an active subscription stays in effect).
11. **Extra user fields** (`adminGrant`, `revenuecat.*`, `planProductId`, `planIsTrial`, `planWillRenew`) so plans can be re-resolved without data loss and badges can show "trial"/"annual" and the profile can say "Renews" vs "Expires".
12. **Paywall details.** Coached is first and pre-selected. The mode follows the athlete's plan (no plan → both cards even on an upgrade link; Access → Coached only); `?mode` matters only to a coach previewing it (they see a "Preview" note and are never redirected). With the switch off, `/student/subscribe` redirects to the dashboard. On the web, Restore/Redeem show "Subscriptions are managed in the Ball Masters iPhone app."
13. **Gate.** While the switch is on and the plan is still loading, student screens show the app's usual spinner rather than flashing content. While off (or unknown), children render immediately — no hold.
14. **Access + video page.** Annotations/voiceover are never requested for Access (the rules would refuse them), whether or not `hasBreakdown` is set; the locked panel shows only when `hasBreakdown` is true.
15. **Locked drill cards.** The lock badge replaces New/Watched; the card view's "Watch" button reads "Unlock with Coached".
16. **Profile plan section** is hidden for coaches/admins. "Renews" for an App Store plan that will renew; "Expires" for a cancelled one or a staff grant with an end date.
17. **Bug 7.** Besides pausing, entering Preview cancels a pending 3-2-1 record countdown (otherwise it would start the editor video under the overlay). An in-progress take is held, not stopped.
18. **Terms.** New sections sit where the placeholder was (after Termination). This is the one change existing users can see with the switch off — the brief asks for it. `termsConsentVersion` (`"v1"`, `app/register/RegisterForm.tsx`) was **not** bumped — that would change what's recorded for new sign-ups while the switch is off.
19. **Stale-plan refresh** (`/api/billing/refresh`) rather than a scheduled job: it runs exactly when an affected athlete opens the app, which is the only time it matters, and needs no cron.
20. **Coaches can replace or remove a staff grant an admin made** on their own athlete (same permission as creating one). Tighten if admin grants should be admin-only.

## 6. Not finished / needs attention before launch

1. ~~**CRITICAL — pre-existing: users can set their own `role`.**~~ **Fixed — see §8.** Profiles are now created only by `/api/register`, which decides `role` and `coachId` from the invite; the rules refuse client creates and deletes of `users/*` and any self-change of `role` or `coachId`.
2. **Native purchases** (next step): RevenueCat SDK, `Purchases.logIn(firebaseUid)` so the webhook's `app_user_id` is the Firebase uid, and filling in `lib/billing.ts`. The paywall shows "Start 7-day free trial" to everyone; the native layer should check trial eligibility (Apple allows one per subscription group).
3. **Coaches can message Access athletes** (the coach side is never gated), but those athletes can't read it. Consider showing the athlete's plan in the coach's Messages screen.
4. **Upgrades:** the webhook assumes an App Store Access→Coached upgrade is followed by a RENEWAL/INITIAL_PURCHASE carrying the new product (PRODUCT_CHANGE itself is logged only). Verify in the sandbox during the native step.
5. **TRANSFER events** (a subscription moving between app user ids, e.g. restore on a shared Apple ID) are logged only; the new owner is picked up on their next renewal event. For a fully authoritative state, the webhook could fetch `GET /v1/subscribers/{id}` from RevenueCat's API on each event (needs a RevenueCat secret API key).
6. **Terms consent version** — consider bumping to `v2` (and a re-consent prompt) when the new Terms go live, and update "Last updated" if that's later than September 27, 2026. The Disclaimers and Governing Law lawyer-review notes are unchanged.
7. **`captions/*`** rules not added — there is no captions feature yet.
8. **Signed-in screens not exercised live** — see §4.

## 7. Every file touched

New:
- `lib/plans.ts`, `lib/entitlements.ts`, `lib/paywall.ts`, `lib/paywall.server.ts`, `lib/billing.ts`, `lib/EntitlementsContext.tsx`, `lib/planStore.server.ts`
- `app/api/billing/revenuecat/route.ts`, `app/api/billing/refresh/route.ts`, `app/api/admin/plan/route.ts`, `app/api/register/route.ts` (§8)
- `app/student/layout.tsx`, `app/student/subscribe/page.tsx`
- `components/Paywall.tsx`, `components/StudentPaywallGate.tsx`, `components/PlanLock.tsx`, `components/PlanBadge.tsx`
- `scripts/backfill-has-breakdown.mjs`, `scripts/test-paywall-rules.mjs`
- `.env.example`, `BUILD-1.1-STEP2-REPORT.md`

Changed:
- `firestore.rules`
- `app/student/dashboard/page.tsx`, `app/student/videos/page.tsx`, `app/student/videos/[id]/StudentVideoPage.tsx`, `app/student/messages/page.tsx`, `app/student/profile/page.tsx`
- `app/coach/dashboard/page.tsx`, `app/coach/students/page.tsx`, `app/coach/students/[id]/StudentProfilePage.tsx`, `app/coach/upload/page.tsx`, `app/coach/videos/[id]/annotate/AnnotatePage.tsx`
- `app/terms/page.tsx`
- `app/register/RegisterForm.tsx`, `lib/firestore.ts`, `lib/coachInvites.ts`, `lib/inviteCodes.ts` (§8)
- `eslint.config.mjs`, `.gitignore`

The four untracked scripts that were already in `scripts/` before this work (`diagnose-r2-delete.mjs`, `test-athlete-video-deletion.mjs`, `test-coach-deletion.mjs`, `test-delete-auth.mjs`) were left alone and are not committed.

---

## 8. Role hardening

**The hole (§6.1):** any signed-in user could write `role` and `coachId` on their own `users/{uid}` doc, and could also delete it and re-create it with any role. `role` in `['coach','admin']` counts as Coached for the paywall and opens the coach/admin console. It's now closed. Clients can no longer create or delete a `users` doc, and they can't change their own `role` or `coachId`. Registration's profile write moved to the server.

### Client writes to `users/*` found (before any change)

| # | Where | What it wrote | Now |
|---|---|---|---|
| 1 | `app/register/RegisterForm.tsx` → `lib/firestore.ts` `saveUserProfile()` | **Created** `users/{uid}` with `role`, `coachId`, `needsCoachAssignment` and all profile/consent fields | **Moved to `POST /api/register`** (Admin SDK). `saveUserProfile` deleted. |
| 1a | `RegisterForm.tsx` → `lib/coachInvites.ts` `useCoachInvite()` | `coachInvites/{token}.usedBy/usedAt` (not a users doc, but it gates `role: "coach"`) | **Moved into `/api/register`'s transaction**. Otherwise a client that skipped it could reuse one coach link for many accounts. Function deleted. |
| 1b | `RegisterForm.tsx` → `lib/inviteCodes.ts` `recordCodeUsage()` | `inviteCodes/{code}.usedBy` += uid (gates `maxUses`) | **Moved into `/api/register`'s transaction**; function deleted. |
| 2 | `app/coach/students/[id]/StudentProfilePage.tsx` (Coach Assignment card, admin-only UI) | `coachId`, `needsCoachAssignment: false` on an athlete | **Unchanged.** Still a client write, allowed by the existing admin update rule, which is kept as-is. |
| 3 | `app/student/profile/page.tsx`, `app/coach/settings/page.tsx` | own `fullName`, `avatarId` | Unchanged — still allowed. |
| 4 | `lib/notifications.ts` | own `fcmToken` (merge) | Unchanged for anyone with a profile (see "not preserved" #1). |
| 5 | `lib/AuthContext.tsx`, `app/login/page.tsx` | own `lastActiveAt` | Unchanged — still allowed. |
| 6 | `lib/inviteCodes.ts` `createInviteCode()` | coach's own `currentInviteCode` | Unchanged — still allowed. |
| — | Deletes | No client deletes a users doc. Student self-delete, coach self-delete, admin delete-coach and admin delete-athlete all call `/api/delete-account`, which uses the Admin SDK — **confirmed**. | Unaffected by the new rule. |
| — | Role changes after sign-up | None in the app. `app/coach/coaches/page.tsx` only writes `settings/general.headCoachId`; `app/admin/invite-coach` only creates `coachInvites`. | Nothing to move. An admin can still change a role (admin update rule). |

### What changed

- **`POST /api/register`** (`app/api/register/route.ts`, new). The client still creates the Firebase Auth account. It then POSTs the account's ID token plus the form fields: name, typed email, age, DOB, guardian name, the two consent flags, invite code and coach token. The server:
  - verifies the token with the Admin SDK and uses the account's own email. The typed email must match it (case-insensitive).
  - **decides `role`**: `"coach"` only with an existing, unused `coachInvites/{token}`; otherwise `"student"` with an invite code that exists, is active and is under `maxUses`. These are the same checks and error messages as `validateCoachInvite` / `validateInviteCode`.
  - **decides `coachId`**: the code's `createdBy`, else `needsCoachAssignment: true`, exactly as before.
  - repeats the form's validation, so a direct call can't skip it: names, the consent rules (guardian box for under-13, terms box otherwise), athlete age 3–100 (coach 1–120), and a required invite code on the student path. It also checks the submitted age against the date of birth, allowing one year of difference for timezones.
  - in **one transaction**, marks the coach invite used (`usedBy`, `usedAt`), appends the uid to the code's `usedBy`, and `create`s the profile. The profile has exactly the fields `saveUserProfile` wrote: `uid, email, fullName, role, age, school, createdAt, termsConsentAt, termsConsentVersion: "v1"`, plus `dateOfBirth` (athletes), plus `guardianManaged, guardianName, guardianEmail, guardianConsentAt, guardianConsentVersion: "v1"` (under-13), plus `coachId` / `needsCoachAssignment`. `termsConsentAt` is still written for under-13 accounts too, as before.
  - ignores any `role`, `coachId` or plan fields in the request, and never changes an existing profile. A retry after a lost response just returns the stored role.
- **`RegisterForm.tsx`**: the same form, validation, read-only invite pre-checks (a bad invite still fails *before* an Auth account exists), `updateProfile`, cookies and redirect. Only the profile write changed: it's now a `fetch` to `/api/register`, and the role cookie uses the role the server returns.
- **`firestore.rules`** (`users/{userId}`):
  - `allow create, delete: if false` — for every client, including the owner and admins.
  - The owner's own update may not touch `selfLockedFields()` = `planFields()` + `role` + `coachId`.
  - Owner reads, coach/admin reads and the admin `read, update` rule are unchanged.
- **Dead code removed**: `saveUserProfile`, `useCoachInvite`, `recordCodeUsage`. Removing the `useCoachInvite(...)` call also cleared RegisterForm's only `rules-of-hooks` warning, so its lint override is gone.

### Tests

- **Emulator** (`scripts/test-paywall-rules.mjs`): **259/259 pass**. New cases per switch state: self-create denied (as student and as coach), self-delete denied (student, coach), admin client create/delete denied, self role change denied (student→coach, student→admin, coach→admin, removing `role`), self `coachId` change and removal denied, a rename bundled with a role change denied. Still allowed: avatar, rename, FCM token, `lastActiveAt`, a coach's `currentInviteCode`, admin coach assignment, admin role change, admin plan edit.
  - The same suite run against the pre-hardening rules fails exactly those 22 hole checks, so the tests really detect the hole.
  - The student switch-off matrix is still 132/132 on both `main`'s rules and this branch's.
- **Route harness** (in-memory Firestore, scratch only): 9 new `/api/register` checks, 41/41 overall. They cover:
  - the exact key set of a 13+ athlete profile;
  - the under-13 guardian fields;
  - consent, age and email rejections;
  - each invite-code failure message;
  - a code without `createdBy`;
  - a coach invite being used once and rejected on reuse;
  - an existing profile left untouched;
  - the coach form's prefilled code;
  - injected `role`/`coachId`/`plan` being ignored.
- `npm run build` ✅, `npm run lint` ✅ (0 errors).
- **Not exercised live**: a real sign-up against Firebase Auth. There's no test project, so do the test account in §2 step 2.

### Behaviour that could not be kept exactly

1. **Stub profiles are no longer created.** `lib/notifications.ts` saves the FCM token with `setDoc(…, { merge: true })`. For a signed-in account *without* a profile, that used to create a stub `users` doc holding only `fcmToken`; that create is now refused. The error is caught and the function returns `false`. Accounts with a profile — everyone who registered — are unaffected.
2. **Coach sign-up with a prefilled code that doesn't exist.** Before, the client recorded the code's use *after* saving the profile. A missing code made that step throw, so the coach saw "Registration error" even though their account had been created. Now a missing code is skipped and sign-up succeeds. The code was never validated on this path and still isn't.
3. **New sign-up failure mode.** If an invite becomes invalid in the seconds between the form's pre-check and `/api/register` (used up, deactivated, or a coach link used by someone else), the server now refuses. The Auth account then exists without a profile — the same state any failed profile write left before. The form shows the server's message.
4. **No client can create or delete `users` docs**, admins included. No app flow did either (deletion goes through `/api/delete-account`).
5. A **tampered request** whose age doesn't match its date of birth (beyond ±1) is refused. The real form never sends one.

### Still open (optional hardening, not needed for the paywall)

- A user can still edit their own `dateOfBirth`, guardian fields, `email` field and `needsCoachAssignment`. `dateOfBirth` feeds the under-13 transcription gate. Consider locking them the same way.
- The `inviteCodes` / `coachInvites` rules still let any signed-in user append themselves to a code's `usedBy`, or mark an unused coach invite as used by themselves. Registration no longer needs either. Someone holding a leaked link could burn it, but can no longer become a coach through it. These client rules can be removed.

