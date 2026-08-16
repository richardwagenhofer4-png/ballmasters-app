# Static Export Spike — Completion Estimate & Failure Inventory

**Date:** 2026-08-09
**Spike branch:** `spike/local-bundle` @ `59b9489` ("SPIKE: static-export PoC for local iOS bundle (do not merge)")
**Goal of the conversion:** ship the Next.js UI as a locally-bundled static export inside the Capacitor iOS shell (loaded from `capacitor://localhost`) instead of pointing the WKWebView at the remote Vercel site — the App Store Guideline 4.2 ("minimum functionality") fix. The 13 API routes stay on Vercel and are called cross-origin over the network.

Everything below was derived by inspecting the real repo, diffing the spike against `main`, and **running the static build**. Each finding is tagged **OBSERVED** (I ran it or read the exact code) or **INFERRED** (reasoned from how the tech works; not directly exercised here). Counts were re-verified against the code on 2026-08-09, not taken from memory.

---

## 1. What the spike already did, and what it deliberately left undone

**OBSERVED** — `git diff main...spike/local-bundle` touches exactly 10 files (`148` insertions, `9` deletions):

| File | What it does |
|---|---|
| `next.config.ts` | Adds `const isStaticExport = process.env.STATIC_EXPORT === "1"`. When set, injects `output: "export"` + `distDir: "out-static"`. Vercel build (env unset) is unchanged. |
| `scripts/build-static.mjs` (new, 68 lines) | The build driver. **Moves `app/api` and `middleware.ts` out of the tree** (into `.static-build-hold/`), runs `next build` with `STATIC_EXPORT=1`, then restores them in a `finally`. This is necessary because `output:"export"` cannot coexist with route handlers or middleware. |
| `package.json` | Adds `"build:static": "node scripts/build-static.mjs"`. |
| `capacitor.config.ts` | **Removes `server.url`** (the Vercel URL) and the `server` block; sets `webDir: "out-static"`. This is what makes the shell load the local bundle. `appId` unchanged. Marked "Do NOT merge this to main." |
| `.gitignore` | Ignores `/out-static/` and `/.static-build-hold/`. |
| `app/student/videos/[id]/page.tsx`, `app/coach/students/[id]/page.tsx`, `app/coach/videos/[id]/{drill,clips,annotate}/page.tsx` (5 files) | Each gains an env-guarded `generateStaticParams()` that returns `[{ id: "_placeholder" }]` under `STATIC_EXPORT=1` and `[]` otherwise. This lets the export build complete while keeping the Vercel build's runtime behavior for real IDs. |

**What it deliberately left undone** (the spike is a build-only PoC — it proves the bundle *builds*, not that the app *works*):

- The 5 dynamic routes are **stubbed with a `_placeholder` path, not converted.** In the bundle they resolve to a single dead placeholder page; real IDs have no page. No route was actually migrated to query parameters.
- **No API base-URL indirection.** All `fetch("/api/...")` calls are still relative and would resolve against `capacitor://localhost`, where no server exists.
- **No CORS work** on any API route.
- **No client-side auth guard** to replace middleware. The spike just drops middleware from the build; nothing takes over gating.
- **No notification-link handling** (neither the code that writes old-format links nor the historical links already stored).
- **No on-device verification.** The spike author explicitly did not load `out-static` in an actual iOS WebView. (The earlier manual Google sign-in test in this project was run against the **remote-URL** build, i.e. `server.url = vercel`, *not* the local-bundle spike — so local-bundle runtime is entirely unverified.)

---

## 2. Real static-export build output

**OBSERVED** — checked out `spike/local-bundle`, cleaned artifacts, ran `npm run build:static`. **The build SUCCEEDED.** No build errors. The only warnings were benign Node runtime notices, verbatim:

```
(node:90590) [DEP0205] DeprecationWarning: `module.register()` is deprecated. Use `module.registerHooks()` instead.
(node:90607) ExperimentalWarning: localStorage is not available because --localstorage-file was not provided.
(node:90608) ExperimentalWarning: localStorage is not available because --localstorage-file was not provided.
```

(Note: because `build-static.mjs` moves `middleware.ts` aside before building, the "middleware is deprecated, use proxy" warning that appears on a normal build does **not** appear here.)

What it produced (**OBSERVED**):
- `out-static/` — **31 HTML files, 4.8 MB total.**
- Entry points present: `out-static/index.html`, `out-static/login.html`.
- **Zero** `/api/*` HTML leaked into the export.
- 5 placeholder pages for the dynamic routes: `student/videos/_placeholder.html`, `coach/students/_placeholder.html`, `coach/videos/_placeholder/{annotate,clips,drill}.html`.
- Asset references are **absolute** (`href="/_next/static/chunks/..."`). The Vercel origin is **not** baked into the HTML.
- `app/api` and `middleware.ts` were correctly restored after the build.

The 5 dynamic routes build as `● (SSG)` with a single `_placeholder` param; everything else is `○ (Static)`.

---

## 3. Complete, counted failure inventory

### 3.1 Dynamic `[id]` leaf routes — **5** (OBSERVED)

The leaf `page.tsx` files under a `[id]` segment (excluding `app/api`):

1. `app/student/videos/[id]/page.tsx`
2. `app/coach/students/[id]/page.tsx`
3. `app/coach/videos/[id]/drill/page.tsx`
4. `app/coach/videos/[id]/clips/page.tsx`
5. `app/coach/videos/[id]/annotate/page.tsx`

Each renders a client component that reads the id via `useParams<{ id: string }>()` (**OBSERVED**, 5 call sites): `StudentVideoPage.tsx:65`, `StudentProfilePage.tsx:115`, `DrillViewPage.tsx:52`, `ClipsPage.tsx:33`, `AnnotatePage.tsx:61`.

**Why static export breaks them:** `output:"export"` pre-renders to fixed HTML files; a `[id]` route must enumerate all paths at build via `generateStaticParams`, and IDs are unknown at build. A non-obvious detail confirmed earlier in this project: **returning an empty array from `generateStaticParams` is rejected as "missing"** — you must emit at least one concrete path. So a dynamic segment cannot ship as a zero-page stub. (The spike papers over this with a `_placeholder`, which is a dead page.)

**Fix:** convert each to a static route reading a query parameter (e.g. `/coach/videos/annotate?id=xxx`): remove the `[id]` directory nesting, change `useParams` → `useSearchParams`, add a guard for a missing/invalid `id`. Then update every call site (§3.2).

### 3.2 Old-format URL construction sites — **32 total** (OBSERVED)

Every place in the code that builds one of the old dynamic URLs and would need rewriting to the query-param form. Broken down:

**Navigation / share — 26:**
- `Link href={…}` — **16**: `student/messages/page.tsx:302`; `student/videos/page.tsx:166,195,203,226,240`; `student/dashboard/page.tsx:442,450,469,495,506`; `coach/dashboard/page.tsx:569`; `coach/students/page.tsx:286,318,366`; `coach/messages/page.tsx:409`.
- `router.push(…)` — **5**: `coach/dashboard/page.tsx:476,498,499`; `coach/videos/page.tsx:679,680`.
- `window.open(…)` — **1**: `coach/videos/[id]/annotate/AnnotatePage.tsx:1164`.
- Ternary `const href = isDrill ? …` — **3**: `coach/students/[id]/StudentProfilePage.tsx:458,490,523`.
- Clipboard **share** URL — **1**: `coach/dashboard/page.tsx:270` (`handleShare`), builds `${window.location.origin}/student/videos/${videoId}` and copies it. See §3.7 — under a local bundle `window.location.origin` is `capacitor://localhost`, so this share feature produces a useless link regardless of routing.

**Notification payloads — 6** (see §3.3).

**Why static export breaks them:** they target `/coach/videos/<id>/annotate` style paths that no longer exist as pages in the bundle.

**Fix:** mechanical rewrite of all 32 to the query-param form. Low individual complexity, but spread across ~11 files and easy to miss one (nothing type-checks a template-literal URL).

### 3.3 Notification payloads building old-format URLs — **6** (OBSERVED)

Docs are written with an old-format `link`/`url` that is later navigated to:
1. `app/coach/videos/page.tsx:384` — `link: /student/videos/${editingVideo.id}`
2. `app/coach/upload/page.tsx:287` — `link: /student/videos/${saved.id}`
3. `app/coach/upload/page.tsx:343` — `link: /student/videos/${saved.id}`
4. `components/CommentsSection.tsx:120` — `link: /student/videos/${videoId}`
5. `components/CommentsSection.tsx:130` — `link: /coach/videos/${videoId}/annotate`
6. `lib/notifications.ts:135` — `url: /student/videos/${videoId}` (the FCM push payload URL)

**Consumed by** `router.push(n.link)` at `student/dashboard/page.tsx:390` and `coach/dashboard/page.tsx:444` (**OBSERVED**), and by the FCM service worker's `clients.openWindow(url)` (§3.7).

**Fix:** update these 6 write sites to emit query-param URLs. But that only fixes *future* notifications — see §3.4.

### 3.4 Notification links already stored in Firestore (OBSERVED code; live count NOT obtained)

Every notification document created to date holds an **old-format** `link` (and FCM pushes carry an old-format `url`). After a cutover these are opened verbatim via `router.push(n.link)` / `openWindow(url)` and would land on a page that no longer exists in the bundle → dead navigation.

**I did not query the live Firestore** (read-only investigation; no DB count authorized/run), so I cannot state how many such documents exist — only that the schema guarantees all pre-cutover notification docs use the old format.

**What a migration/redirect involves — two viable approaches:**
- **Redirect shim (recommended, low-risk):** at the notification click handlers and the SW `openWindow`, normalize an old-format URL to the new query-param form before navigating (a small pure function, `/coach/videos/:id/annotate` → `/coach/videos/annotate?id=:id`, etc.). No data migration; handles both stored docs and any in-flight FCM pushes. Must live in **both** the in-app handler and the service worker.
- **Data migration:** a one-off Admin-SDK script rewriting `link` on every existing `notifications` doc. Heavier, doesn't help already-delivered FCM pushes, and races with new writes. Only worth it if you also want the stored data clean.

### 3.5 CORS — **13 API routes, 21 relative fetches** (OBSERVED)

- **13 route handlers**, none of which set any CORS header or export an `OPTIONS` handler (**OBSERVED** — grep for `Access-Control`/`OPTIONS`/`cors` in `app/api` returns nothing): `bookings/[id]` (DELETE), `bookings` (POST), `clips` (POST), `delete-account` (POST), `notifications/send` (POST), `session-reminders` (GET), `sessions/[id]` (PATCH,DELETE), `sessions` (GET,POST), `transcribe` (POST), `upload` (GET,POST), `videos/[id]` (GET,DELETE), `videos` (POST,GET), `voiceover` (GET,POST,DELETE).
- **21 relative `fetch("/api/...")` call sites across 10 files** (**OBSERVED**), none using any base-URL indirection.

**What happens today with origin `capacitor://localhost` — OBSERVED against a running server (`next start`, curl):**
- `OPTIONS /api/videos` with `Origin: capacitor://localhost` → `HTTP/1.1 204 No Content`, headers `vary`, `allow: GET, HEAD, OPTIONS, POST`, `Date`, `Connection`, `Keep-Alive`. **No `Access-Control-Allow-Origin`, `-Allow-Methods`, or `-Allow-Headers`.**
- `POST /api/videos` with the same origin → `HTTP/1.1 500`, `content-type: application/json`, **no `Access-Control-*` header.**
- Total `Access-Control-*` headers across both responses: **0.**

**INFERRED (well-founded, not exercised in a real WebView here):** because these calls send `Authorization: Bearer` + `application/json` (both preflight-triggering), WKWebView will issue an `OPTIONS` preflight; with no `Access-Control-Allow-Origin` in the response, the browser blocks the actual request. So every one of the 21 calls would fail from the local bundle until CORS is added. The **Bearer-token auth itself is origin-independent** (it's an HTTP header, not a cookie) and keeps working once CORS is in place; no cookie/credentials CORS needed.

**Fix:** (a) an API base-URL helper (`NEXT_PUBLIC_API_BASE_URL` — empty on web → relative; `https://ballmasters-app.vercel.app` in the bundle) applied to all 21 sites or via a wrapped `fetch`; (b) CORS + `OPTIONS` on all 13 routes, cleanest as one shared wrapper or a Next `headers()`/proxy rule scoped to `/api`. **Uncertainty:** if WKWebView's fetch proves unreliable cross-origin, the fallback is Capacitor's native `CapacitorHttp` (bypasses WebView CORS), which would change the fetch layer app-wide — see §5.

### 3.6 Middleware (OBSERVED)

`middleware.ts` (70 lines, matcher on `/dashboard`, `/incomplete-profile`, `/coach/:path*`, `/student/:path*`, `/admin/:path*`, `/login`, `/register`) reads two client-set cookies (`ballmasters_auth`, `ballmasters_role`, set by `lib/cookies.ts:setAuthCookies`) and does: (1) redirect unauthenticated users off protected routes → `/login`; (2) relay `/dashboard` → role home; (3) bounce authenticated users off `/login`/`/register` → their dashboard; (4) let `/incomplete-profile` through.

**What stops working:** **all of it.** Static export has no middleware runtime (and the spike physically removes the file for the build). With nothing in its place, the bundle performs **no** gating — any route is directly reachable (data is still protected by Firestore rules, but the UI is not gated). This is a hard requirement, not a nicety: the conversion cannot ship without a replacement.

**What moving it client-side involves:** a guard in a shared client layout (or a hook) over the protected segments that reads Firebase auth state + the user's role and performs the same redirects, plus the `/dashboard` relay and the login/register bounce. Because it's client-side, there is an unavoidable pre-hydration flash where gated content can momentarily render before the redirect fires (mitigable with a loading gate). See §6 for the role-enforcement angle.

### 3.7 Anything else the build/code revealed

- **FCM service worker (`public/firebase-messaging-sw.js`)** — **OBSERVED**: it opens notification URLs via `clients.openWindow(url)` on `notificationclick` (line 80) using `payload.data.url` (old-format), so it's a **third** consumer of old-format links (besides the two dashboards), and any redirect shim must also live here. Its `fetch` handler (lines 31–32) intercepts requests and special-cases `/_next/` and `/api/`. **INFERRED:** service-worker behavior inside a Capacitor WKWebView loading from `capacitor://localhost` is uncertain — SW support in the native shell is historically unreliable, and this SW's fetch interception could interfere with serving the local bundle. Push on iOS may need to move to native APNs via the Capacitor plugin. This is a genuine unknown (see §5).
- **Absolute asset paths** — **OBSERVED** the export emits `/_next/...` absolute URLs. **INFERRED:** these resolve correctly under Capacitor's `capacitor://localhost` (which serves `webDir` at root) but would break under raw `file://`. The bundle depends on Capacitor's scheme.
- **`generateStaticParams` reclassifies the Vercel build** — **OBSERVED**: even with the env-guard returning `[]`, the mere presence of the function flips the 5 routes from `ƒ (Dynamic)` to `● (SSG)` in the **server** build output. Runtime for real IDs is preserved (`dynamicParams` defaults true), but it is a real classification change on Vercel. A production-grade approach should inject these params via the build script so the shared page files (and the Vercel build) stay untouched.
- **Firebase Auth** — **OBSERVED** the login path branches on `Capacitor.isNativePlatform()` → `FirebaseAuthentication.signInWithGoogle()` (native) → `signInWithCredential`. **INFERRED:** this native flow is origin-independent (no popup/iframe), so `capacitor://localhost` shouldn't break it; but auth **persistence is keyed by origin**, so moving from the remote origin to the local origin logs existing users out once (they re-login). **Local-bundle Google sign-in is NOT observed** — the prior device test was the remote-URL build.
- **Sentry** — **OBSERVED**: `withSentryConfig` survives the export (build succeeded) and `instrumentation-client.ts` code ships in `out-static`. **INFERRED:** the server `instrumentation.ts` is inert in a static bundle (no server), which is fine — server-side Sentry keeps running on Vercel for the API routes. No `tunnelRoute` configured. Minimal impact.
- **Bounded surface (positive finding)** — **OBSERVED**: a sweep found **no** server actions (`"use server"`), **no** `next/headers` usage in pages, **no** route-segment config (`export const dynamic/revalidate/runtime`), **no** `next/og`, and no `rewrites`/`redirects`/`headers` in `next.config.ts`. The **only** server-only Next features in play are the 13 API routes and middleware. This meaningfully bounds the job — there is no hidden ISR/server-action machinery to untangle.

---

## 4. Effort estimate by workstream

Hours of **focused** engineering (not calendar time). Confidence reflects how predictable the work is.

| Workstream | Hours | Confidence | Notes / assumptions |
|---|---|---|---|
| Dual-build hardening (productionize `build-static.mjs`; inject `generateStaticParams` via script so Vercel is byte-identical; CI wiring) | 4–8 | Medium-High | Spike already proves the mechanism. |
| Dynamic routes → query params (5 routes + rewrite 32 URL sites + missing-id guards) | 10–16 | Medium | Mechanical but broad; template-literal URLs aren't type-checked, so easy to miss one. |
| API base-URL indirection + CORS on 13 routes (env base, wrapper/`OPTIONS`, test each verb) | 6–12 | Medium | Assumes plain `fetch` works cross-origin in WKWebView. If not → CapacitorHttp rewrite (see risks). |
| Notification link back-compat (redirect shim in 2 handlers + SW; update 6 write sites) | 4–8 | Low-Medium | Depends on shim vs data-migration choice; SW behavior unknown. |
| Client auth **+ role** guard replacing middleware (gating + relay + login/register bounce + anti-flash) | 8–14 | Medium | Must cover every protected segment; role fix folded in (see §6). |
| Firebase auth on local origin + on-device Google sign-in verification | 3–6 | Low | Device-dependent; persistence/session behavior needs real testing. |
| Service worker / push under local bundle | 3–8 | **Low** | Genuinely unpredictable — may not work in WKWebView at all; could require native-push rework. Do not treat this number as firm. |
| Integration/device QA across all screens in the real iOS shell | 8–16 | Low | Where cross-origin, auth, and routing interact for real. |

**Total: ~46–88 hours of focused work (≈ 6–11 working days).** The wide band is honest: the bottom assumes plain `fetch` works cross-origin, the SW is tractable, and device testing is clean; the top assumes a CapacitorHttp rewrite and/or push rework. The two workstreams marked Low confidence (service worker/push, device QA) are the ones I would not defend to a tighter number.

---

## 5. Risks that could make this much larger, and the point of no return

**Point of no return.** Removing `server.url` from `capacitor.config.ts` and shipping the local bundle is **all-or-nothing for the iOS app**: the moment it loads `out-static`, *every* unconverted piece — dynamic routes, API base URL, CORS on all 13 routes, and the auth guard — must already be done, or the app is broken on launch (blank/dead screens, failed API calls, no gating). You cannot half-ship this to the iOS shell. **The Vercel web app is unaffected** (the dual build keeps `main`'s server output identical), so `main`/production web stays safe throughout — the risk is confined to the iOS release, which is a single flip.

**Risks that could balloon the estimate:**
- **WKWebView cross-origin fetch.** If plain `fetch` from `capacitor://localhost` to Vercel misbehaves (preflight quirks, streaming/multipart like the R2 upload in `coach/upload`, long-running `transcribe`/`clips`), the fix is Capacitor's native `CapacitorHttp`, which changes the fetch layer app-wide and needs re-testing everywhere. This is the single biggest unknown. **(INFERRED risk — the preflight gap is observed; the WebView runtime is not.)**
- **Service worker / push notifications.** May not function under `capacitor://localhost` at all; the SW's fetch interception could fight the local bundle. Worst case, iOS push moves to native APNs — a separate mini-project.
- **Stored notification links.** Without the redirect shim, every historical notification 404s in-app after cutover.
- **Auth-guard flash / gaps.** Client-side gating renders before it redirects; getting this airtight across all protected routes (and not regressing the `/dashboard` relay) takes iteration.
- **Firebase persistence.** Origin change logs users out once — acceptable but must be communicated/expected.

---

## 6. Does completing this conversion fix the "any logged-in student can browse the coach console" bug?

**Not automatically — but it forces the fix into the right place, if written deliberately.**

- **OBSERVED:** the current `middleware.ts` checks **authentication but not role** for `/coach/*` vs `/student/*` — its block "Authenticated users on `/coach/*`, `/student/*`, `/admin/*` pass through immediately" does no role comparison. That is exactly the bug: a signed-in student can open the coach UI.
- The conversion **requires** replacing middleware (which doesn't run under static export) with a **client-side auth guard**. That guard is the correct and natural home for role enforcement (redirect a student hitting `/coach/*` → `/student/dashboard`, and vice-versa).
- **But the fix is a deliberate addition, not a side effect.** If the replacement guard merely mirrors today's middleware (auth-only), the bug survives the conversion unchanged. Fixing it means the new guard must compare the user's role against the requested section — work that is *not* in the current middleware and must be written in.

**Bottom line:** completing the conversion is the occasion for the fix and puts the fix where it belongs, but does not fix the bug by itself. The role check has to be explicitly added to the new client guard (a small, well-scoped addition once that guard exists — folded into the "Client auth + role guard" workstream in §4).

---

## Provenance summary

- **OBSERVED (ran/read real code):** the 10-file spike diff; the successful `npm run build:static` and its exact output/warnings and 31-file bundle; all counts (5 dynamic routes, 32 URL sites, 6 notification payloads, 13 API routes with their methods and zero CORS handling, 21 relative fetches, 2 in-app link consumers); the live CORS behavior (204 preflight with no `Access-Control-*`; 500 POST with none); middleware contents and the missing role check; the service worker's `openWindow` and fetch interception; absolute asset paths; the `ƒ`→`●` reclassification; the absence of server actions/`next/headers`/route-config/rewrites; Sentry client code shipping in the bundle.
- **INFERRED (reasoned, not exercised here):** that WKWebView blocks the cross-origin calls given the missing CORS headers; that CapacitorHttp may be needed; that the service worker/push is unreliable under `capacitor://localhost`; that native Google sign-in is origin-independent and that persistence forces a one-time re-login; that server-side Sentry is inert in the static bundle. **Not tested at all:** loading `out-static` in a real iOS WebView, and any API call or Google sign-in from the local-bundle shell.
