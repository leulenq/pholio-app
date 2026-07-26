# Cross-Surface Backend Audit — `pholio-app` ↔ `pholio-landing`

**Date:** 2026-07-26
**Scope:** auth/session architecture, cookie behavior, consent handling, subdomain/domain behavior,
API usage, environment/config parity, redirect and callback flows, shared services, identity flow.
**Explicitly out of scope:** visual/design critique.

Line references are to the state of `main` in both repos at the time of the audit.

---

## Verdict

The two surfaces are **not one product stack**. They are two independently-built products that share
exactly two pieces of real infrastructure — the `.pholio.studio` session cookie and one Firebase
project — plus a Next.js server-side proxy that makes the app's API look local to the marketing site.

Everything layered above that seam is reimplemented per repo: consent storage, legal version
constants, role→dashboard routing, the app-origin constant, Firebase client init, and security
headers. There is no shared package, no generated client, no OpenAPI contract, no monorepo. Each
duplicated concept has its own independent drift clock, and **three of them have already drifted into
production defects** (legal acceptance versions, the public portfolio URL, the agency signup URL).

The cookie-bar discrepancy is not a cosmetic outlier. It is the most visible symptom of the pattern:
the same concept implemented twice, in two languages, with no shared source of truth, and — in this
case — enforcing nothing on either side.

---

## 1. Consent: three stores, three defaults, zero consumers

### 1.1 The implementation is duplicated, not shared

`pholio-landing/lib/cookie-consent.ts` and `pholio-app/client/src/shared/lib/cookie-consent.js` are
logically identical: same key (`pholio_cookie_consent_v1`), same `{necessary, analytics, updatedAt}`
shape, same validation, same try/catch. One is TypeScript, one is JS. Neither imports the other.

### 1.2 The same key does not mean the same store

`localStorage` is **origin-scoped**. `https://www.pholio.studio` and `https://app.pholio.studio` are
different origins, therefore different stores. Identical key names create the appearance of a shared
record while guaranteeing two independent ones.

Consequences:

- A user who clicks **Necessary only** on the marketing site is prompted again on first app load and
  can answer differently.
- Two consent records exist, both look authoritative, and nothing reconciles them.
- Consent is stored in `localStorage`, not a cookie — so the one mechanism that *would* have shared
  it across subdomains (`Domain=.pholio.studio`, which the session cookie already uses successfully)
  is not in play.

### 1.3 Consent gates nothing, on either surface

**Landing:** `getConsent`/`setConsent` are imported by exactly one file, `CookieConsentBanner.tsx`.
There is no `next/script`, no gtag, no analytics loader, no tag manager anywhere in `app/`,
`components/`, or `lib/`. Nothing reads the stored value after it is written.

**App:** `cookie-consent.js:37` exports `analyticsAllowed()`. A grep across `client/src` returns
**zero importers**. The function exists and is never called.

Meanwhile, `src/routes/portfolio.js:105-131` runs on every public portfolio view and unconditionally:

- sets `pholio_visitor_id`, a persistent 1-year identifier;
- creates a `visitor_sessions` row;
- records `ip_address` and user agent.

There is no consent check anywhere in that path. That is precisely the first-party analytics the
banner offers to decline. **Declining changes nothing.**

Note also that `pholio_visitor_id` is set with `httpOnly` + `sameSite: lax` but **no `secure` flag and
no `domain`** — host-only to the app origin, and transmissible over plaintext if the app is ever
reached over HTTP.

### 1.4 A third consent store, with the opposite default

`src/domains/talent/routes/settings.js` persists a *server-side* consent record in
`talent_user_settings.cookie_preferences` as `{analytics, marketing}`, with
`DEFAULT_COOKIES = { analytics: true, marketing: false }` (settings.js:56-59).

That default is **opt-out** for analytics. The banner is **opt-in**. Two systems in the same product
disagree on the polarity of the same permission.

`cookie_preferences` is written at row creation (settings.js:189), read back by the settings screen
(settings.js:305), and updated by it (settings.js:460). Grep confirms **no other consumer**. It is a
write-only preference, same as the other two.

Tally: three consent stores (marketing localStorage, app localStorage, app database), three defaults,
zero enforcement points.

### 1.5 There is no withdrawal path

Both banners' **Manage** action links to `/cookies`, which renders `CookiesContent.tsx` — a static
legal document with no controls. Neither repo exposes a `clearConsent`, a re-open trigger, or a
preferences dialog reachable after dismissal. Once a user accepts, withdrawing requires clearing site
data manually. Withdrawal is strictly harder than granting.

(The app's Settings → cookies toggles are the closest thing, but they write to the unrelated
server-side store described in 1.4, are talent-only, and are unreachable while signed out.)

### 1.6 The published policy already concedes this

- `CookiesContent.tsx:37` — "This preference does not itself erase prior analytics and may not
  currently gate every server-side security or public-portfolio event."
- `PrivacyContent.tsx:108` — same language.
- `CookiesContent.tsx:62` — "Where law requires consent before nonessential analytics or storage,
  Pholio must obtain that consent before the relevant technology is used."

The policy is accurate about the current implementation and, read alongside 1.3, describes a gap
rather than a design. The legal text is doing the work the code is not.

### Direct answers to the framing questions

| Question | Answer |
|---|---|
| Same consent system? | No — three, coincidentally sharing one key name. |
| Stored the same way? | Same shape, different origins → different stores; plus a fourth shape in Postgres. |
| Gating scripts consistently? | Neither surface gates anything. |
| Same cookie domain / SameSite? | Consent isn't a cookie, so it has no domain. Session cookie: `.pholio.studio`, Lax, Secure, HttpOnly. Analytics cookie: host-only, Lax, **not** Secure. |
| One trust surface, or two? | Two. |

---

## 2. Legal versioning: three sources of truth, already drifted

| Source | Constant | Value |
|---|---|---|
| `pholio-landing/lib/legal-constants.ts:8-10` | `LAST_UPDATED` / `CURRENT_LEGAL_VERSION` | **2026-07-18** |
| `pholio-app/src/shared/lib/legal-acceptance.js:1-2` | `CURRENT_TERMS_VERSION` / `CURRENT_PRIVACY_VERSION` | **2026-06-25** |
| `pholio-app/src/domains/agency/services/legal-acceptance.js:9-45` | terms / privacy | **2026-06-25** |
| ″ | workspaceUse / decisionPolicy / dataProcessing | **2026-07-12** |

The landing **publishes** the documents. The app **gates on** them. `requireLegalAcceptance`
(`legal-acceptance.js:39-43`) re-prompts only when the stored version differs from the app's hardcoded
constant.

Because the app's constant is over three weeks behind what is published at `/terms` and `/privacy`:

- the documents were revised on 2026-07-18 and **no user was re-prompted**;
- every acceptance row records `2026-06-25` against documents that now read July 18;
- the acceptance audit trail asserts consent to a version that is no longer the served version.

There is no build step, API call, shared package, or CI check that propagates the published version
into the gate. And `CURRENT_LEGAL_VERSION` in the landing is **imported by nobody** — a dead constant.
Only `LAST_UPDATED` / `EFFECTIVE_DATE` are rendered.

### 2.1 The agency policy digest does not cover the policy

`domains/agency/services/legal-acceptance.js:51-61` computes
`contentDigest = sha256({key, version, title, copy, url})`.

That hashes the **link** and the app's one-line summary — not the document at the URL. The digest has
the shape of tamper-evidence and provides none: the landing repo can rewrite `/terms` entirely without
any digest in the app changing. It is a false assurance in an evidentiary record.

---

## 3. Auth and session architecture

### What genuinely works

The session seam is real and correctly built. `src/app.js:384-411` sets `connect.sid` with
`httpOnly`, `sameSite: "lax"`, `secure` in production, and `domain: .pholio.studio`. The landing reads
it through `/api/public/session`; the `firebase_token` body key matches on both sides
(`session-api.ts:26` ↔ `auth.js:309`). Firebase is one project. The session-store retry logic
(`app.js:437-500`) refuses to downgrade a cookie-bearing request to anonymous on a DB blip — that is
careful, correct work.

The problems are around that seam, not in it.

### 3.1 The landing does not call the app cross-origin — it server-side proxies

`next.config.ts:34-48` rewrites `/api/:path*` → `${apiBackendOrigin}/api/:path*`. Every "API call"
from the marketing site is same-origin to `www`, then proxied server-side by Next.

This is undocumented in either CLAUDE.md and has three consequences:

1. **The app's CORS allowlist entry for `https://www.pholio.studio` (`app.js:65`) is never exercised**
   for these calls. Requests arrive at Express from Netlify's Next runtime, not from a browser. The
   allowlist entry is inert reassurance.
2. **`credentials: "include"` in `session-api.ts:6` is a no-op.** The cookie reaches Express only
   because `Domain=.pholio.studio` causes the browser to send it to `www`, and the Next proxy forwards
   the `Cookie` header. This works, but it is load-bearing and invisible. Anyone who "cleans up" the
   config to call `app.pholio.studio` directly will silently change the CORS, CSRF, and SameSite
   posture underneath themselves.
3. **Client IP attribution passes through an extra hop.** The app's IP middleware
   (`app.js:147-190`) takes `x-forwarded-for.split(",")[0]` with `trust proxy: true` (trust
   everything). Whether the real client IP survives Netlify's Next-runtime proxy is not determinable
   from the repo. *If it does not*, every marketing-origin request shares one rate-limit bucket and
   one `visitor_sessions.ip_address` value. **This needs measuring in production**, not assuming — the
   failure mode is silent in both directions (mass false lockouts, or a bypassed limiter).

### 3.2 `/api/login` and `/api/logout` are not rate-limited

`app.js:562` mounts the auth limiter as `app.use(["/login", "/signup"], authLimiter)`. Express path
mounting matches `/login` and its sub-paths. The routes are declared as
`router.post(["/login", "/api/login"], …)` (`auth.js:285`) and
`router.post(["/logout", "/api/logout"], …)` (`auth.js:1067`).

`/api/login` does **not** match the `/login` mount prefix. The limiter never runs on it.

The session-creation endpoint the marketing site uses is the unthrottled alias of the one that is
throttled. Same for logout.

### 3.3 CSRF: `www` is CORS-trusted but not CSRF-trusted, and the endpoints it uses are neither

`sameOriginMutationGuard` (`shared/middleware/same-origin-mutation.js`) protects only
`/api/agency`, `/api/talent`, `/api/reply`, `/api/internal` (lines 2-7), and its allowlist
(lines 37-50) is `localhost:3000`, `localhost:5173`, `https://app.pholio.studio`, plus `APP_URL` —
**deliberately excluding `https://www.pholio.studio`**.

So the three endpoints the landing actually uses — `/api/login`, `/api/logout`,
`/api/public/agency-access-requests` — have **no origin check and no custom-header requirement**.

Reachable today:

- **Login CSRF** — forcing a victim's browser into an attacker-controlled session.
- **Drive-by logout** — any cross-site page can terminate a Pholio session.

The proxy makes this easier, not harder: `www.pholio.studio/api/login` is a same-site POST target that
requires no CORS preflight.

Note the architectural contradiction: `www` is trusted enough to be in the CORS allowlist and to
proxy authenticated traffic, but not trusted enough to appear in the CSRF allowlist. Both positions
are defensible; holding both simultaneously means no one decided.

### 3.4 `/api/public/session` returns PII with no cache directives

`src/routes/api/public.js:662-735` returns `email`, `first_name`, `last_name`, `profile_image`,
`slug`, `isPro`, and `completeness`.

The `Cache-Control: private, no-store` middleware (`app.js:596-599`) is scoped to
`/api/talent`, `/api/agency`, `/api/internal` — **`/api/public/session` is not covered**.

This response now traverses a CDN/proxy hop it was not designed for. Any intermediary that caches a
200 GET lacking `Cache-Control` can cross-serve one user's identity to another. The client's
`cache: "no-store"` (`session-api.ts:8`) governs the browser's request, not a proxy's storage.

This one is cheap to fix and high-consequence if wrong.

### 3.5 Two divergent session endpoints

| | `/api/session` (`auth.js:1101`) | `/api/public/session` (`public.js:662`) |
|---|---|---|
| Shape | agency-oriented | talent-oriented |
| Fields | `agencyId`, `memberUserId`, `agencyMembershipRole`, `permissions`, `redirect` | `profile`, `subscription`, `completeness`, `dashboardPath` |
| Redirect field name | `redirect` | `dashboardPath` |

Two endpoints, two names for the same concept, neither a superset. The landing consumes only the
second — so an authenticated **agency** user browsing the marketing site gets
`onboardingComplete: true` hardcoded (`public.js:681`) and no membership or permission context. The
marketing surface cannot correctly represent agency session state.

### 3.6 `dashboardPathForRole` is forked

`pholio-landing/lib/pholio-auth/constants.ts:4` and `pholio-app/src/routes/api/public.js:167`.
They agree today. Nothing enforces that. The landing's copy is the fallback used whenever the server
omits `dashboardPath` (`PholioAuthProvider.tsx:100-101`), so a divergence would surface as
intermittent wrong-dashboard redirects rather than a clean failure.

### 3.7 Logout clears the cookie with different attributes than it was set with

`auth.js:1088-1093` calls `res.clearCookie("connect.sid", { domain, path: "/" })` — omitting `secure`,
`httpOnly`, and `sameSite`, all three of which were set at creation. Browsers match deletion on
name/domain/path, so this generally works. It is still an avoidable mismatch on the one operation
that must never half-succeed across two origins, and it duplicates the cookie-domain resolution logic
from `app.js:396-398` rather than sharing it.

### 3.8 Passwords are written to logs

`auth.js:352` logs `fullBody: JSON.stringify(req.body, null, 2)` on the no-token path — immediately
after explicitly recording `hasPassword: !!(req.body && req.body.password)`. Any login attempt that
reaches that branch carrying a password writes it in plaintext to function logs.

---

## 4. Security headers: asymmetric across a shared cookie

| | `pholio-app` | `pholio-landing` |
|---|---|---|
| CSP | helmet, **Report-Only**, `'unsafe-inline'` in `scriptSrc` (`app.js:277-307`) | none |
| X-Frame-Options / frame-ancestors | helmet default | none |
| Referrer-Policy | helmet default | none |
| HSTS | helmet default | none |
| `[[headers]]` in netlify.toml | absent | absent |
| `headers()` in next.config | n/a | absent |

The landing ships **zero** security headers. That matters specifically *because* the session cookie is
shared: `www.pholio.studio` is framable, script-unconstrained, and is a same-site origin that can POST
to `/api/login` and `/api/logout` with the session cookie attached (see 3.3). The weaker of the two
surfaces effectively sets the trust boundary for both.

---

## 5. URL contract: hardcoded strings, broken in both directions

Neither repo can resolve the other's routes. Both hardcode path strings. Several point at routes that
do not exist.

### App → landing

| Reference | Target | Status |
|---|---|---|
| `auth.js:96` `agencyRequestAccessUrl()` | `${MARKETING}/agency/request-access` | **404** — `app/agency/` contains only `page.tsx`; no `request-access` route exists |

Used by `GET /partners` (302 redirect) and `POST /partners` (410 + `redirect` payload, `auth.js:1042`).
Both dead-end.

### Landing → app

| Reference | Target | Status |
|---|---|---|
| `components/agency/HeroSection.tsx:83` | `${APP_URL}/agency/register` | **404** — zero hits in `src/`, `client/src/App.jsx`, `netlify.toml` |
| `components/agency/FinalCTA.tsx:85` | `${APP_URL}/agency/register` | **404** — same |
| `components/header/kit.tsx:801` | `${APP_URL}/talent/${slug}` | **404** — app serves portfolios at `/portfolio/:slug` (`portfolio.js:339`; `netlify.toml` routes `/portfolio/*`). No `/talent/*` route or redirect exists on the app. |
| `components/Footer.tsx:12,96` | `${APP_URL}/casting` | **404** — app has `/casting/entry`, `/casting/gender`, … as API endpoints, but no bare `/casting` page and no netlify redirect for it |
| `components/Footer.tsx:14` | `${APP_URL}/studio-plus` | **404** — that page lives on the landing, not the app |

`HeroSection` and `FinalCTA` are both mounted on the live `/agency` page (`AgencyPageClient.tsx:3,11`)
— these are the page's two primary conversion CTAs.

`header/kit.tsx` is the **shipped** header (`VariantIndex`). Line 801 is the signed-in talent's
"view public portfolio" link. This is a live 404 for authenticated users.

`Footer.tsx` is currently unmounted (`MarketingFooter` is the live footer), so those two are latent
rather than live — but the same class of error.

### And the endpoint that does work has no callers

`POST /api/public/agency-access-requests` (`public.js:178`) exists, has a dedicated rate limiter
(`app.js:565`), validates eleven required fields (`public.js:36-48`), and writes to the database.

A grep for `agency-access-requests` across the **entire** `pholio-landing` repo returns **nothing**.

Net: the agency acquisition funnel is broken from the app side (→ 404), broken from the landing side
(→ 404), and the working backend endpoint built for it was never wired to a form.

---

## 6. Environment and config parity

### 6.1 The dev backend port is forked three ways

| Source | Port |
|---|---|
| `.env.example:4` `PORT=3000`, `APP_URL=http://localhost:3000` | 3000 |
| `CLAUDE.md` ("Express backend on :3000") | 3000 |
| `pholio-landing/next.config.ts:13-15` dev proxy target | 3000 |
| `client/vite.config.js:27-85` — **every** proxy entry | **3002** |
| `package.json:12` `dev:all` → `wait-on tcp:127.0.0.1:3002` | **3002** |

With the documented `.env`, `npm run dev:all` starts Express on 3000, waits 60 seconds on a port
nothing binds, then starts Vite pointed at a dead backend. Whichever port is chosen, one of the two
frontends is misconfigured — the landing and the SPA cannot both reach the backend from a single
documented setup.

### 6.2 Firebase config: one project, three naming schemes, silent failure

| Consumer | Variable prefix |
|---|---|
| App server (`src/config.js:10-20`) | `FIREBASE_*` with `VITE_FIREBASE_*` fallback |
| App client (`client/src/shared/lib/firebase.js:18-24`) | `VITE_FIREBASE_*` with `FIREBASE_*` fallback |
| Landing (`lib/pholio-auth/firebase.ts:5-10`) | `NEXT_PUBLIC_FIREBASE_*` |

Both clients **fail silently** when the key is absent: `firebase.ts:14` returns `null`;
`client/.../firebase.js:34-40` sets `auth = null` and logs a warning. A missing variable degrades to
"the auth integration quietly does nothing" with no user-visible error and no alert.

### 6.3 The landing's Netlify build sets only one variable

`pholio-landing/netlify.toml:7` sets `NEXT_PUBLIC_APP_URL` and nothing else. The six
`NEXT_PUBLIC_FIREBASE_*` values must come from the Netlify dashboard.

**Assumption I cannot verify from the repos:** if those are not set in the Netlify UI, then in
production `getPholioFirebaseAuth()` returns `null`, and the entire
`onAuthStateChanged → syncFirebaseSession` path in `PholioAuthProvider.tsx:61-72` is inert — the
marketing header would depend purely on the shared cookie. Given 6.2's silent-failure behavior, this
is worth confirming in the dashboard; there would be no symptom other than the header occasionally
not knowing the user is signed in.

### 6.4 `APP_BACKEND_URL` is undocumented

The proxy target override appears only in a code comment (`next.config.ts:8-10`). The landing repo has
no `.env.example` at all.

---

## 7. What is shared vs. what is copied

**Genuinely shared:** the `.pholio.studio` session cookie; the Firebase project; the
`/api/public/session` response contract; the `firebase_token` request body key.

**Copy-pasted per repo, with independent drift clocks:** consent storage + banner; legal version
constants; `dashboardPathForRole`; the Pholio app-origin constant; Firebase client init; brand
tokens; security-header policy (present on one side only); cross-surface route strings.

No shared package. No generated client. No OpenAPI or typed contract. No monorepo. No CI check that
either repo's assumptions about the other still hold.

Three of the copied concepts have already drifted into production defects: legal acceptance versions
(§2), the public portfolio URL (§5), and the agency signup URL (§5).

---

## Priority

**P0 — trust and correctness**
1. Legal acceptance versions are three weeks behind the published documents; no user was re-prompted (§2).
2. `/api/login` and `/api/logout` are unthrottled and have no CSRF protection (§3.2, §3.3).
3. `/api/public/session` returns PII with no `Cache-Control`, through a new proxy hop (§3.4).
4. Plaintext passwords in login failure logs (§3.8).

**P1 — consent correctness and cross-surface continuity**
5. Consent gates nothing while `pholio_visitor_id` tracks unconditionally (§1.3).
6. No consent withdrawal path on either surface (§1.5).
7. Agency funnel 404s in both directions; the working endpoint is orphaned (§5).
8. Shipped marketing header 404s for signed-in talent (`/talent/:slug` vs `/portfolio/:slug`) (§5).
9. Consent split across three stores with contradictory defaults (§1.2, §1.4).

**P2 — structural**
10. Landing ships no security headers behind a shared session cookie (§4).
11. Dev backend port forked three ways (§6.1).
12. Verify client-IP survival through the Next proxy hop (§3.1).
13. Extract shared constants (legal versions, route map, role→dashboard) into one source of truth (§7).

---

## Open questions requiring information outside the repos

1. Are `NEXT_PUBLIC_FIREBASE_*` set in the landing's Netlify environment? (§6.3)
2. Does the client IP survive the Netlify Next-runtime proxy hop into Express? (§3.1)
3. Was the 2026-07-18 legal revision substantive enough to require re-acceptance? If yes, §2 is a
   compliance incident, not just drift.
