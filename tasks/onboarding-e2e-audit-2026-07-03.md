# Onboarding (/onboarding) End-to-End Audit — 2026-07-03

Scope: talent casting-call onboarding — frontend flow, backend/API wiring, DB persistence,
auth/session, validation/normalization, security, legal/privacy, production readiness.

Surfaces audited:
- Server: `src/domains/onboarding/routes/casting.js`, `services/state-machine.js`,
  `services/signal-collector.js`, `analytics/onboarding-events.js`,
  `src/shared/lib/{talent-age,legal-acceptance,uploader}.js`,
  `src/domains/auth/middleware/require-auth.js`, `src/shared/middleware/onboarding-redirect.js`,
  `src/domains/talent/routes/guardian-consent.js`, `src/app.js` (mounting, sessions, rate limits, CSP)
- Client: `client/src/domains/onboarding/**` (CastingCallPage, CastingEntry, CastingBirthdate,
  CastingGender, CastingScout, CastingMeasurements, CastingProfile, CastingVerifyEmail, useCasting hooks)
- Tests: `tests/e2e-casting-to-dashboard.test.js`, `tests/onboarding/birthdate.test.js`

## Verdict

**Conditionally production-ready.** The core flow is functionally complete, well-tested on the
happy path, resume/rehydration works, the state machine blocks the known skip exploit, and the
minor-data policy is fail-closed in the right places. However, there are findings that
should be fixed before (or immediately after) launch — most notably a rate-limit bypass, missing
content/CSAM moderation on the onboarding photo path, and unverified-email account linking.

---

## What is solid (verified)

- **Step wiring & persistence.** Every step loads, saves, and advances via the server state
  machine (`entry → birthdate → gender → scout → measurements → profile → done`); each step's
  route persists to `profiles` / `images` and `/onboarding/status` rehydrates gender, DOB, city,
  height, measurements, appearance stats, and the scout photo URL on reload
  (`casting.js:947-989`, `CastingCallPage.jsx:268-316`). E2E test covers the full contract
  including resume and the skip exploit (`tests/e2e-casting-to-dashboard.test.js`).
- **Session integrity.** Session is regenerated before binding identity (fixation defense,
  `casting.js:338-354`); cookies are httpOnly, `SameSite=Lax`, `secure` in prod (`app.js:385-394`);
  Firebase ID tokens are verified server-side via Admin SDK; `/onboarding/email-verified` trusts
  only the token claim bound to the signed-in user's `firebase_uid` (`casting.js:443-455`).
- **Completion gating.** `/onboarding/profile` requires DOB on file and genuinely-completed
  `scout` + `measurements` steps; `transitionTo` never fabricates completion of skipped steps
  (`casting.js:1166-1189`, `state-machine.js:224-235`). `/onboarding/reveal-complete` cannot be
  used as a completion shortcut (`casting.js:1274-1283`).
- **Minor policy (mostly).** DOB before gender (age-gate first), COPPA floor 13 enforced
  server-side, sensitive body measurements fail closed without a valid DOB or guardian consent
  on both server and client (`talent-age.js:119-123`, `casting.js:1043,1080-1092`,
  `CastingCallPage.jsx:148-153`). New profiles default to `visibility_mode: 'private_intake'`
  and `services_locked: true`. Guardian consent infrastructure is token-based, GET-safe,
  POST-confirm (`guardian-consent.js`).
- **Field mapping & normalization.** Absent fields never null out saved values; enum whitelists
  for hair/eye/shoe; lanes normalized to a canonical subset with `[]` as a first-class "not sure"
  answer; city sentinel handled at API edges; measurements bodies deliberately not logged.
- **Legal record.** Terms/privacy acceptance recorded with version + timestamp at account
  creation inside the same transaction (`casting.js:189-203`, `legal-acceptance.js`).

---

## Findings

### HIGH

**H1. Rate limiting is bypassable by omitting the session cookie.**
`rateLimitKeyGenerator` (`src/app.js:221-242`) returns `session:${req.sessionID}` whenever a
session object exists. With `saveUninitialized: false`, express-session still generates a *fresh*
`req.sessionID` for every cookieless request — so every request from a client that drops cookies
gets a unique rate-limit key. The IP fallback is effectively unreachable. This neutralizes
`authLimiter` on `POST /onboarding/entry` (and `/login`, `/signup`) for exactly the attacker who
matters (scripted, cookieless). Consequences: unbounded Firebase token-verification calls, user
row creation attempts, and enumeration.
*Fix:* key on IP first (ipKeyGenerator) for unauthenticated routes, or only use the session key
when the session is authenticated (`req.session.userId`).

**H2. Onboarding photo uploads skip content moderation / CSAM screening.**
The dashboard media upload path runs `screenImageForCsam` + content-moderation flags
(`src/domains/talent/routes/media.js:1003-1111`), but `POST /onboarding/scout`
(`casting.js:676-767`) stores images with **no** screening — and this is the path where minors
(13+) upload photos. Images land in R2 with public URLs. This is both a safety and legal
(CSAM reporting obligations) inconsistency.
*Fix:* run the same `screenImageForCsam` / moderation pipeline on `processedBuffer` in the scout
route (the uploader already exposes `processedBuffer` for exactly this purpose).

**H3. Account linking by unverified email claim at `/onboarding/entry`.**
User lookup is `where firebase_uid = X OR email = Y` (`casting.js:163-169`) with no
`email_verified` requirement on the token. A Firebase identity whose (unverified) email claim
matches an existing `users.email` row gets a session as that user. Firebase's one-account-per-email
narrows the window, but any DB user whose email is not registered in Firebase (seeds, imports,
legacy rows, Instagram-synthesized addresses) is takeover-able by registering that email in
Firebase and hitting entry with an unverified token. `/login` has the same email-fallback pattern
(`auth.js:250-259`).
*Fix:* only match by email when `decodedToken.email_verified === true`; otherwise treat as new
identity (or reject with "sign in with your original method").

### MEDIUM

**M1. Suspended/banned accounts can run all onboarding endpoints.**
`onboardingRoutes` is deliberately mounted *before* `requireActiveAccount()` so stale sessions
don't block new signups (`app.js:668-672`) — but that exempts every onboarding endpoint, not just
entry. A banned TALENT can keep uploading photos and writing profile data.
*Fix:* apply `requireActiveAccount()` inside the casting router after entry, or per-route.

**M2. Role confusion: an AGENCY user entering onboarding becomes a TALENT session.**
Entry never checks `user.role`; it sets `req.session.role = "TALENT"` unconditionally and creates
a talent profile row for the user (`casting.js:345-347, 240-301`). An existing AGENCY user who
signs in via `/onboarding/entry` (same Google account) gets a TALENT session and a stray talent
profile attached to their agency user id — session role now disagrees with `users.role`.
*Fix:* if `user.role === 'AGENCY'`, reject entry (409) or route to the agency flow.

**M3. Forward-jump can permanently brick completion (no recovery path).**
`canTransitionTo` allows any forward jump (`fromIdx <= toIdx`, `state-machine.js:149-158`), so an
out-of-order call — e.g. `POST /onboarding/measurements` while parked at `gender` (two tabs, retry
after partial failure, flaky resume) — advances `current_step` to `profile` while `completed_steps`
never gains `scout`/`measurements`. The completion gate then 403s forever, and there is **no
backward transition** anywhere in the machine, server or API. The account can never finish
onboarding and never reach the dashboard.
*Fix:* either enforce strict next-step transitions on the mutating routes, or add a server-side
"step back / repair" path that can re-open scout & measurements.

**M4. Server does not actually require height (or any photo *upload* for Google users).**
- `/onboarding/measurements` advances `measurements → profile` even when the body contains no
  usable height (`casting.js:1046-1077`); "height is the only required step" is client-only.
  Profiles can complete onboarding with `height_cm = 0`.
- `/onboarding/scout/confirm` accepts the **seeded Google avatar** as the primary image
  (`casting.js:279-298, 840-860`), so a Google user can pass the "photo" gate via direct API
  calls without ever uploading a real headshot.
*Fix:* require a valid `height_cm` before transitioning; require at least one image with
`shot_type = 'headshot'` (or `image_type = 'digital'`) at scout/confirm.

**M5. Minor gating on `full_body` shots is client-side only at intake.**
`full_body` is in `SENSITIVE_IMAGE_SHOT_TYPES` (`talent-age.js:24-27`) and the client hides the
full-length slot for minors (`CastingCallPage.jsx:148-153`, `CastingScout.jsx:300`), but
`POST /onboarding/scout` accepts `shot_type=full_body` from any authenticated talent regardless
of age/consent (`casting.js:709-717`). Downstream visibility gating in media routes mitigates
*exposure*, but the stated policy ("minors: height only, nothing sensitive until guardian
consent") is not enforced at *collection*.
*Fix:* reject `full_body` at scout when `!canCollectSensitiveProfileFields(profile)`.

**M6. Consent capture is silent and unverifiable as an affirmative act.**
The client hardcodes `{ terms_accepted: true, privacy_accepted: true }` on every entry payload
(`CastingEntry.jsx:34`) and the only disclosure is the colophon line under the auth buttons
(`LegalNoticeLine.jsx`). Sign-in-wrap ("By continuing, you agree…") adjacent to the action is
generally defensible, but:
- the recorded acceptance is a client constant, not a user action — evidentiary value is weak;
- existing users are never re-prompted on version change (`requireLegalAcceptance` is only
  consulted in settings, `settings.js:544`); acceptance versions can silently go stale;
- `privacy_accepted` is recorded only at account creation; users created through other paths
  may lack it.
*Fix (legal call):* keep sign-in-wrap if counsel approves, but derive acceptance server-side from
the act of entry (don't trust client booleans), and add a re-acceptance gate when
`terms_accepted_version < CURRENT_TERMS_VERSION`.

**M7. Minors' photos are collected before any guardian involvement, contradicting on-screen copy.**
The birthdate step tells 13–17 users "We'll bring your parent or guardian in before anything
personal" (`CastingBirthdate.jsx:133`), yet the very next steps collect a headshot photo, height,
hair/eye color, and city with no guardian consent (consent is deferred to apply-time). Exposure is
gated (`private_intake`, `minorPublicExposureAllowed` fail-closed), but *collection* of a minor's
photograph is itself personal-data processing that several regimes (GDPR Art. 8, UK AADC, some US
state laws) treat as requiring parental consent or at minimum accurate disclosure.
*Fix (legal call):* either trigger the guardian-consent request during onboarding for minors, or
change the copy to accurately describe when guardians are involved and document the lawful basis
for pre-consent collection.

### LOW

**L1. Fake "AI analysis" theater.** The scout scan screen shows "Analyzing… Reading light,
structure & composition" (`CastingScout.jsx:260-265`) and the server hardcodes
`analysis_status = 'complete'` / `ai_success: true` (`casting.js:887, 898-900`) — but AI analysis
was removed from intake. With an "AI Notice" linked at signup, claiming analysis that doesn't
happen is a consumer-perception/FTC-hygiene risk and pollutes analytics (`ai_success` is
meaningless). Rename the beat or drop the claim.

**L2. State read-modify-write races.** Every step route does read-profile → compute →
update with no row locking or optimistic version check; two concurrent submissions can clobber
`onboarding_state_json` (also the path to M3). Consider `WHERE onboarding_stage = expected` guards.

**L3. Concurrent primary-photo race.** Two simultaneous headshot uploads both demote-then-insert
`is_primary = true`; the `one_primary_per_profile` unique index will 500 one of them
(`casting.js:736-753`). Wrap demote+insert in a transaction and retry.

**L4. Duplicate-user race at entry.** Two concurrent first entries for the same email hit the
`users.email` unique constraint → unhandled 500 for one (`casting.js:180-206`). Catch and re-read.

**L5. Client/server age boundary mismatch.** Client computes age in local time
(`CastingBirthdate.jsx:22-32`), server in UTC (`talent-age.js:52-62`) — a user turning 13 "today"
can pass one and fail the other. Cosmetic (server wins).

**L6. Observability gaps.** Only `entry`, `scout`, and `done` emit analytics events; birthdate,
gender, measurements, and profile steps never track, so funnel drop-off between those steps is
invisible. Analytics writes are best-effort (good) but also silent (`console.warn` only).

**L7. `/onboarding/status` polls every 5s indefinitely** while the tab is focused, even parked on
the entry screen pre-auth (each poll 401s until the query errors once). Consider polling only
after a session exists.

**L8. Dead code.** `routes/apply-essentials.js` is unmounted (documented TODO in `app.js:30-33`);
`derivedStorageKey` in the primary-swap route is computed and unused (`casting.js:803-805`).

**L9. CSRF posture.** No CSRF tokens; defense is `SameSite=Lax` + CORS allowlist. Acceptable for
JSON APIs, but the cookie is scoped to `.pholio.studio`, so any XSS on the marketing site becomes
full CSRF/session-riding on the app. Documented residual risk; CSP is still report-only.

---

## Legal / privacy summary

| Item | Status |
|---|---|
| Terms/privacy acceptance recorded with version + timestamp | ✅ at creation (M6 caveats) |
| Consent UX (affirmative act) | ⚠️ sign-in-wrap, client-hardcoded booleans (M6) |
| COPPA floor (13) | ✅ server-enforced |
| Minor sensitive measurements | ✅ fail-closed server+client |
| Minor photos at intake | ⚠️ collected pre-consent, copy over-promises (M7) |
| Guardian consent auditability | ✅ token-based, GET-safe, atomic confirm, audit rows |
| Data minimization | ✅ good (weight removed, stats optional, skip paths honest) |
| Sensitive data in logs | ✅ measurement bodies excluded |
| Data export / deletion tooling | ✅ exists (`data-export.js`, `account-deletion.js`) |
| CSAM screening on intake uploads | ❌ missing on onboarding path (H2) |

## Recommended fix order

1. H1 rate-limit keying; H3 verified-email linking (small, high leverage)
2. H2 moderation/CSAM screening on `/onboarding/scout`
3. M1 active-account check, M2 role guard, M5 full-body gate, M4 server-side height/photo truth
4. M3 state-machine strictness or repair path (+ L2/L3 transactionality)
5. M6/M7 with counsel; L1 copy fix
