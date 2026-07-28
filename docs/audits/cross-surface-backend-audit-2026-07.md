# Cross-Surface Backend Audit — `pholio-app` ↔ `pholio-landing`

> **Status: remediated 2026-07-26.** Every P0 and P1 finding below has been
> fixed across both repos; see "Remediation" at the end of this document for
> what changed, what was deliberately left, and the three questions that still
> need answers from outside the repos. The findings are kept in their original
> form as the record of what was wrong.

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


---

# Remediation (2026-07-26)

## Fixed — P0

**1. Legal version drift.** `src/shared/lib/legal-versions.js` is now the app's
single `CURRENT_LEGAL_VERSION`, set to **2026-07-18** to match what the landing
publishes. The talent gate, the agency policy manifest, and the SPA acceptance
dialog all read from it; the dialog now takes the version and changelog from
`/settings/legal-status` rather than carrying a fourth copy.
`tests/shared/legal-versions.test.js` fails if the constant is bumped without a
plain-language changelog entry, or if any consumer drifts from it.
`pholio-landing/lib/legal-constants.ts` documents the cross-repo contract.

⚠️ **This bump re-prompts every talent and agency user for acceptance.** That is
the intended behaviour of the gate given `784f738` rewrote every legal document,
and it is what restores a truthful audit trail. Expect a wave of acceptance
dialogs on deploy.

**2. `/api/login` and `/api/logout` unthrottled and unprotected.** Both are now
in the `authLimiter` mount list, and both require the `X-Pholio-Request`
header. All five callers were updated (SPA login, Instagram callback, SPA
logout, SPA force-logout, marketing `session-api.ts`).

Origin/Referer is validated as defense in depth *when present* but tolerated
when absent, because the marketing site's Next.js rewrite is a server-side
proxy hop and we could not verify the Origin header survives it (open question
2). The header requirement carries the protection on its own: an HTML form
cannot set a request header, and cross-origin JS cannot set one without a
preflight the CORS allowlist rejects. `www.pholio.studio` is trusted for these
two endpoints only — dashboard mutation paths keep the app-only allowlist.

**3. `/api/public/session` PII caching.** Both `/api/public/session` and
`/api/session` now send `Cache-Control: private, no-store` and `Vary: Cookie`.

**4. Password logging.** The `fullBody` log on the login no-token path is gone;
key names and presence flags remain.

## Fixed — P1

**5 & 9. Consent is now one system, and it enforces.** Consent moved from
per-origin `localStorage` to a first-party cookie (`pholio_consent`) on the
shared `.pholio.studio` scope — the same mechanism the session cookie already
uses. One choice now covers both surfaces, and the server can read it.

`trackVisitorSession` in `src/routes/portfolio.js` is gated on it and **fails
closed**: no recorded choice means no `pholio_visitor_id`, no `visitor_sessions`
row. Event rows are still counted without consent (Talent need view counts) but
no longer store IP or user agent.

Four implementations are kept in step by a shared cookie name, version and
payload shape, each cross-referencing the others: `src/shared/lib/consent.js`
(server), `client/src/shared/lib/cookie-consent.js` (SPA),
`public/scripts/cookie-consent.js` (EJS), `pholio-landing/lib/cookie-consent.ts`.

Existing `localStorage` answers are adopted once on read, so the migration
itself does not re-prompt anyone.

The talent Settings record is now the account-level mirror of that cookie
rather than a fourth disagreeing store, and its analytics default flipped from
opt-out to opt-in to match the banner.

**6. No withdrawal path.** Clearing consent re-raises the banner. Reachable from
talent Settings ("Reset choice"), the marketing footer, and a new section on
`/cookies` — the page both banners' "Manage" links already pointed at.

**Consent banner on server-rendered pages.** Public portfolios are EJS, not the
SPA, so their visitors never saw a banner — yet those are the pages that set the
persistent identifier. `public/scripts/cookie-consent.js` is now loaded from
both EJS layouts. Without this, gating tracking on consent would have silently
zeroed portfolio analytics.

**7. Agency funnel 404 in both directions.** `pholio-landing/app/agency/request-access/`
now exists — the route `pholio-app`'s `/partners` handler has always redirected
to. Its form posts to `POST /api/public/agency-access-requests`, the endpoint
that already existed with a rate limiter and eleven-field validation and had
zero callers. The `/agency` page's two primary CTAs were repointed there from
the non-existent `${APP_URL}/agency/register`.

**8. Shipped header 404 for signed-in talent.** `${APP_URL}/talent/:slug` →
`${APP_URL}/portfolio/:slug`, which is what the app actually serves. The retired
`Footer.tsx` links to `/casting` and `/studio-plus` were fixed too.

## Fixed — P2

**10. Landing security headers.** `next.config.ts` now sets `X-Frame-Options`,
`X-Content-Type-Options`, `Referrer-Policy`, `Strict-Transport-Security`,
`Permissions-Policy`, and a report-only CSP (matching the app's posture, since
the marketing scenes need a browser pass before enforcement).

**11. Dev port fork.** The Vite proxy targets `:3000` — the port in
`.env.example`, `CLAUDE.md`, and the landing's dev proxy — via a single shared
config overridable with `VITE_API_PROXY_TARGET`. `dev:all` waits on `:3000` to
match. Also added the `.env.example` the landing repo never had, documenting
`APP_BACKEND_URL` and the Firebase variables.

**13. Shared constants.** `src/shared/lib/cookie-domain.js` centralizes the
cookie scope that was inlined in three places (which is how the session cookie
and its logout clear ended up with different attribute sets).
`dashboardPathForRole` remains duplicated — it is a three-line fallback the
server overrides on every response — but both copies now name each other.

## Deliberately not changed

**The `contentDigest` field name.** It hashes the policy *descriptor*, not the
document body at the URL. Renaming it would ripple through a DB column, the API
contract, and the client for a naming issue. Instead the function now documents
precisely what it binds and warns against citing it as proof of document text.
Because terms/privacy `version` now tracks the landing's published version, a
published revision does change the digest — the residual gap is a landing-side
content edit without a version bump, which the cross-repo contract comment and
the parity test address.

**Consent for `recordProfileEvent`.** It stores no IP or user agent, and its
`session_id` linkage already goes null without consent because
`trackVisitorSession` returns null. Coarse IP-derived `market` is left as
aggregate.

## Verification

- `tests/integration/consent-gating.test.js` — end-to-end against the real
  Express app: no cookie and declined both produce no identifier and no
  `visitor_sessions` row; granted produces both; `/api/public/session` returns
  `private, no-store`.
- `tests/security/session-endpoint-guard.test.js` — 13 cases covering headerless
  POSTs, cross-site form posts, untrusted origins, the absent-Origin proxy case,
  and confirmation that the marketing origin is still rejected for
  `/api/talent/*`.
- `tests/shared/consent.test.js` — cookie parse/serialize, version rejection,
  fail-closed behaviour, attribute assertions.
- `tests/shared/legal-versions.test.js` — cross-consumer version parity and the
  changelog requirement.
- Regression check: the 31 suites touching changed code paths were run on
  `origin/main` and on this branch. **Identical failure sets** (9 pre-existing
  failures in `tests/onboarding/`), with 196 passing vs 160 on the baseline.
  The full suite cannot complete in this container on either revision — SQLite
  connection-pool exhaustion, unrelated to these changes.
- `npx tsc --noEmit` and `npx next build` clean on the landing; 19 routes
  generated including `/agency/request-access`.

## Still needs an answer from outside the repos

1. ~~**Are `NEXT_PUBLIC_FIREBASE_*` set in the landing's Netlify environment?**~~
   **Resolved — the question no longer applies.** Reported unset, which led to a
   worse finding (see "Logout did not stick", below). The landing's Firebase
   client has been removed entirely rather than configured, so no
   `NEXT_PUBLIC_FIREBASE_*` value is needed on the marketing site at all.
2. ~~**Does the real client IP survive the Netlify Next-runtime proxy hop?**~~
   **Resolved — the hop no longer exists.** Measuring it turned up that the
   proxy returned 500 for every path in production (see "The API proxy was dead",
   below). The marketing site now calls the app API cross-origin, so the browser
   reaches Express directly and the real client IP is preserved by construction.
3. **Was the 2026-07-18 revision substantive?** *Answered from git:* commit
   `784f738` rewrote all nine legal documents (459 insertions, 933 deletions).
   The app has been gating on the superseded version since. Treated as a real
   re-acceptance event, which is why the version bump above will re-prompt
   every user.


---

# Follow-up: logout did not stick (2026-07-26)

Reported second-hand that the landing's Netlify environment has "a firebase
client but no `NEXT_PUBLIC` firebase" — i.e. the variables exist under some
other naming, not the prefix Next.js requires. Investigating that turned up a
live auth defect that the original audit under-called as "the auth integration
quietly does nothing."

## The actual defect

**Signing out from the marketing site did not sign the user out.**

1. User signs in at `app.pholio.studio`. Firebase persists the user in the
   **app origin's** IndexedDB; the Express session cookie is on
   `.pholio.studio`.
2. User clicks Log out on `www.pholio.studio`.
   `PholioAuthProvider.logout()` called `getPholioFirebaseAuth()`, got `null`
   (no `NEXT_PUBLIC_FIREBASE_*`), and **skipped `signOut()`**. The Express
   session was destroyed correctly.
3. User returns to `app.pholio.studio` — or has a tab already open that fires a
   focus event.
4. `PholioAuthBridge` (`client/src/shared/lib/pholio-auth/PholioAuthBridge.jsx`)
   finds `auth.currentUser` still populated, calls `fetchAppSession()`, sees no
   session, and posts the cached ID token to `/api/login` —
   **silently re-creating the session the user just ended.**

## Why setting the env vars would not have fixed it

Firebase Web SDK persistence is **per-origin** (IndexedDB). A `signOut()` on
`www.pholio.studio` clears www's Firebase state — never
`app.pholio.studio`'s. The marketing site's Firebase client therefore *could
never* have made logout stick on the app, configured or not. The missing
variables were a symptom; the architecture was the cause.

Compounding it: `verifyIdToken` called `auth.verifyIdToken(idToken)` **without
`checkRevoked`**, so its `auth/id-token-revoked` branch was unreachable and a
signed-out user's cached ID token stayed acceptable for up to an hour.

## Fix

Logout is now **server-authoritative** and independent of client config:

- `revokeRefreshTokens(uid)` added to
  `domains/auth/services/firebase-admin.js`; `POST /api/logout` looks up
  `users.firebase_uid` and revokes before destroying the session. Best-effort —
  it never blocks or fails a logout.
- `verifyIdToken` now passes `checkRevoked: true` by default, so a revoked
  token cannot re-establish a session. All four call sites verify identity, so
  all four should honour revocation; an explicit `{ checkRevoked: false }`
  opt-out exists.

With revocation server-side, the marketing site's Firebase client became both
unnecessary and impossible to make correct, so it was **removed**:

- deleted `lib/pholio-auth/firebase.ts` and the `syncFirebaseSession` helper
  (the marketing site has no auth UI, so nothing there can produce an ID token);
- dropped `onAuthStateChanged` from `PholioAuthProvider` — session state comes
  from `GET /api/public/session` via the shared cookie, which is what the header
  already relied on;
- removed the `firebase` dependency (**82 packages**) and the
  `NEXT_PUBLIC_FIREBASE_*` plumbing from `next.config.ts`;
- `.env.example` now states that no Firebase config belongs on the marketing
  site, and why, so nobody re-adds it.

This eliminates a silent-failure config surface, deletes a code path that could
not work, and permanently answers open question 1.

## Verification

`tests/security/logout-revokes-firebase.test.js` — 8 cases: revocation calls
through; is a no-op for accounts with no Firebase identity; never throws when
Firebase is unreachable; `verifyIdToken` requests the revocation check by
default; a revoked token is rejected; the opt-out works.

Landing: `tsc --noEmit` and `next build` clean with `firebase` absent from the
dependency tree.

Regression: the 33 suites touching changed paths show **no new failures** versus
the `origin/main` baseline (same 9 pre-existing failures in `tests/onboarding/`),
208 passing vs 160.

## Note for deploy

Revocation only fires for accounts with a `users.firebase_uid`. Sessions created
through the dev passthrough (`/api/dev/login`) have no Firebase identity and are
unaffected — correct, since they have no Firebase token to revoke.


---

# Follow-up: the API proxy was dead in production (2026-07-28)

Checking the client-IP question through the Netlify MCP turned up something
larger. **Every `/api/*` request from the marketing site returned HTTP 500 in
production.** The cross-surface integration described in §3.1 was not merely
imperfect — it never worked at all.

## Evidence

Probed against live production:

| Path class | Example | Result |
|---|---|---|
| Normal page | `www.pholio.studio/agency` | **200** |
| Internal rewrite (`beforeFiles`) | `/studio-plus` → `/studio/plus` | **200** |
| Internal rewrite | `/agencies` → `/agency` | **200** |
| **External rewrite (`afterFiles` → app)** | `/api/public/languages` | **500** |
| ″ | `/api/public/session` | **500** |
| ″ | `/api/anything` | **500** |
| Same path, direct to app | `app.pholio.studio/api/public/languages` | **200** |

The 500 carries `server: Netlify` with a `text/plain` "Internal Server Error"
body — it comes from the Netlify Next runtime, not from Express. Pages and
internal rewrites are healthy on the same deploy, which isolates the failure to
**external rewrites specifically**.

## What that meant in production

- `fetchPublicSession()` always failed → `{ authenticated: false }`. The
  marketing header could **never** resolve a signed-in state.
- The account menu in `components/header/kit.tsx` is gated on `isAuthenticated`
  (line 586), so the dashboard link, the portfolio link and **the logout control
  were unreachable** on the marketing site.
- `POST /api/logout` from www would have 500'd anyway, and the failure is
  swallowed by `.catch(() => {})`.

**This corrects two things stated earlier in this document.**

1. The §5 finding that the shipped header 404'd for signed-in talent
   (`${APP_URL}/talent/:slug`) was **real in the code but unreachable in
   production** — the header never rendered that link. Still correct to have
   fixed; it would have surfaced the moment the proxy started working.
2. The follow-up above describes marketing-site logout as destroying the Express
   session but leaving the Firebase identity live. In production it did not get
   that far: the logout request itself failed, and the control was not reachable
   to begin with. The server-side revocation fix remains correct and necessary —
   it is what makes logout authoritative once the marketing surface works — but
   the sequence described there was the code path, not the observed production
   behaviour.

## Fix: call the app API cross-origin, delete the proxy

The external rewrite is removed rather than repaired. Direct cross-origin calls
are the better architecture regardless of the Netlify bug:

- **No proxy hop**, so the real client IP reaches Express and rate limiting keys
  per visitor rather than per proxy. This is what makes open question 2 moot.
- **The browser always sends `Origin`** on a cross-origin request, so the app's
  CSRF origin check becomes real defense in depth instead of a check that must
  tolerate a missing header.
- `credentials: "include"` becomes meaningful. It was previously a no-op,
  because the call was same-origin to www.

`www` → `app` is cross-origin but **same-site** (both under `pholio.studio`), so
the `SameSite=Lax` session cookie is still sent.

Verified against production before changing anything:

```
OPTIONS app.pholio.studio/api/public/agency-access-requests
  Origin: https://www.pholio.studio
→ 204
  access-control-allow-origin: https://www.pholio.studio
  access-control-allow-credentials: true
  access-control-allow-headers: content-type,x-pholio-request
```

The app's CORS allowlist already names the marketing origin and already permits
the `x-pholio-request` CSRF header — no app-side change was needed.

Changed in `pholio-landing`: `lib/pholio-auth/constants.ts` (absolute app-API
paths + rationale), `lib/pholio-auth/session-api.ts`, `AgencyRequestAccessForm`,
`next.config.ts` (external rewrite deleted, `connect-src` narrowed to the app
origin), `.env.example` (`APP_BACKEND_URL` removed).

⚠️ **This also un-breaks work from this same audit.** The new
`/agency/request-access` form posts to `/api/public/agency-access-requests`; had
it shipped against the proxy, it would have 500'd on every submission.

## Firebase: confirmed from the shipped artifact

The report that the landing has "a firebase client but no `NEXT_PUBLIC`
firebase" is **confirmed**, with stronger evidence than a dashboard reading.

`NEXT_PUBLIC_*` values are inlined into the client bundle at build time. Fetching
the complete chunk graph of the deployed marketing site — 16 chunks, 1.13 MB,
across `/`, `/agency`, `/talent`, `/studio-plus` — finds:

| Marker | Chunks containing it |
|---|---|
| `firebase` / `Firebase` | **0** |
| `AIza…` (API key) | **0** |
| `authDomain`, `messagingSenderId` | **0** |
| `initializeApp`, `onAuthStateChanged` | **0** |
| *controls:* `framer`, `gsap`, `lenis` | 1, 2, 1 |

The controls confirm the extraction is complete, so the zeroes are real. The
Firebase SDK is not merely unconfigured — it is **absent from the bundle**,
which is what happens when `process.env.NEXT_PUBLIC_FIREBASE_API_KEY` inlines to
`undefined`: `getPholioFirebaseAuth()`'s guard becomes statically false, its body
is dead code, and the imports tree-shake away. A build with those variables set
could not have produced this bundle.

This is now moot — the Firebase client has been removed from the marketing site
entirely — but it confirms the production state the logout fix was reasoning
about.

## Deploy ordering

The landing must be redeployed for any of this to take effect; the currently
deployed marketing build still contains the broken proxy. Nothing in the app
needs to ship first — its CORS already permits the marketing origin — but
deploying the app's branch first is harmless and keeps the CSRF-header
requirement and the session endpoints in step.


---

# Correction: the proxy 500s were a misconfigured env var, not a Netlify limitation (2026-07-28)

The section above attributes the `/api/*` 500s to "Netlify's Next runtime does
not serve this site's external rewrites." **That diagnosis is wrong.** The
deployed marketing site's own CSP header gives the real answer:

```
content-security-policy-report-only: … connect-src 'self' http://localhost:3000 …
```

That `http://localhost:3000` is `${apiBackendOrigin}` baked in at build time. The
same variable fed the rewrite destination:

```ts
const apiBackendOrigin =
  process.env.APP_BACKEND_URL ||
  (process.env.NODE_ENV === "development" ? "http://localhost:3000" : pholioAppOrigin);

const apiProxy = { source: "/api/:path*", destination: `${apiBackendOrigin}/api/:path*` };
```

So the production rewrite was `/api/:path*` → **`http://localhost:3000/api/:path*`**.
Netlify's Next server tried to proxy to localhost inside the Lambda, found
nothing listening, and returned 500. External rewrites are fine; the destination
was wrong.

`NEXT_PUBLIC_APP_URL` inlined correctly as `https://app.pholio.studio`, so
`pholioAppOrigin` was right and the fallback was never reached. That leaves two
candidates in the landing site's Netlify environment:

- **`APP_BACKEND_URL=http://localhost:3000`** — most likely; `netlify.toml` does
  not set it, so it is a dashboard value, probably added for local testing and
  never scoped to a deploy context; or
- **`NODE_ENV=development`** — less likely (Next forces production for `next build`).

**Action:** delete or correct that variable in the landing site's Netlify
environment. The fix on this branch removes `apiBackendOrigin` and the rewrite
entirely and hardcodes the app origin in `connect-src`, so the site is no longer
sensitive to it — but a stray `APP_BACKEND_URL` pointing at localhost will
mislead the next person who reads the config.

## Retraction: the Firebase bundle evidence is inconclusive

The "Firebase: confirmed from the shipped artifact" section above reasoned that
zero Firebase in the deployed bundle proves `NEXT_PUBLIC_FIREBASE_*` were unset,
because dead-code elimination would strip the SDK. **That inference does not
hold**, for two reasons discovered afterwards:

1. The deployed marketing build already contains commits from this audit branch
   (`/agency/request-access` returns 200 and the security headers are live), so
   it may already include the commit that **removed** the Firebase client. If so,
   the SDK is absent because it was deleted, not because it was tree-shaken.
2. The pre-removal `logout()` used a **dynamic** `await import("firebase/auth")`.
   A lazily-loaded chunk would not appear in the initially-referenced chunk list
   that the scan walked, so its absence there proves nothing either way.

Whether `NEXT_PUBLIC_FIREBASE_*` are set in the landing's Netlify environment is
therefore **still unverified**. It no longer affects behaviour — the Firebase
client is gone from the marketing site and logout is server-authoritative — but
it should not be recorded as confirmed. Reading it requires either the Netlify
CLI with an auth token or the dashboard; this MCP server exposes no environment
variable operations.

## Branch/deploy state at time of writing

Both repos moved substantially during this work, and parts of this branch are
already merged and live:

| | `pholio-app` | `pholio-landing` |
|---|---|---|
| Audit commits merged to `main` | all except the newest doc commit | `cc69a13`, `48906f2` merged; `d4efd36` not |
| Deployed | yes — production runs the hardened session endpoints, the consent gate, and the 2026-07-18 legal version | partially — `/agency/request-access` and the headers are live; the cross-origin fix is not |
| Branch behind `main` | 234 commits | 30 commits |

Two consequences worth acting on:

- **The legal re-acceptance wave has already started in production.** The bumped
  version is live on the app.
- **The landing is in a half-fixed state**: the security headers and the new
  agency page are deployed, but the form still posts through the broken
  localhost proxy, so submissions 500 until `d4efd36` ships.

This branch should be rebased onto current `main` before any further work; it is
far enough behind that its base no longer reflects either repo.
