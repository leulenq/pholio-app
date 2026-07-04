# Email Setup (Transactional SMTP)

## Root cause: why no emails are being sent

**`SMTP_HOST` is not set in the running environment.** When `config.smtp.host`
is empty, `src/shared/lib/email.js` installs a mock transporter at module
load that only `console.log`s the message and returns a fake `messageId` —
it never talks to a mail server. This is intentional for local dev, but if
`SMTP_HOST` (and the other `SMTP_*` vars below) are never set in
production/Netlify, **every** outbound email silently no-ops forever, with
no error and no crash. Two additional, independent bugs made this worse for
specific flows (both fixed in code, see below):

1. `src/domains/agency/routes/roster.js` imported two functions,
   `sendRejectedApplicantEmail` and `sendApplicationStatusChangeEmail`, that
   do not exist in `email.js`'s exports. The destructured import silently
   resolved to `undefined`, so calling them threw `TypeError: ... is not a
   function` on every accept/decline from the legacy agency dashboard
   (`POST /dashboard/agency/applications/:applicationId/:action`, driven by
   `public/scripts/dashboard/applicants.js`). The error was caught and only
   logged — so the request "succeeded" but no email was ever sent, in any
   environment, regardless of SMTP config.
2. `src/domains/agency/routes/inbox.js` had an inline
   `require("../../shared/lib/email")` inside the
   `POST /api/agency/discover/:profileId/invite` handler (the route the
   live React SPA's "Invite" button calls — see
   `client/src/domains/agency/api/agency.js`). That relative path resolves
   to `src/domains/shared/lib/email`, which does not exist. The `require()`
   threw `MODULE_NOT_FOUND`, caught by the surrounding `try/catch` and only
   logged as `[Discover Invite] Email send error`. So the SPA's "invite
   talent" action never sent an invite email, in any environment,
   regardless of SMTP config.

Both bugs are fixed in code (see "Code changes" below). The remaining,
environment-only cause is: **set `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` /
`SMTP_PASS` / `EMAIL_FROM` in production.** Nothing in code can fix a value
that only exists in the deploy environment.

## Required production environment variables

Set these in **Netlify → Site configuration → Environment variables** (or
whatever secret store production uses — they are not present in
`netlify.toml`, which does not set app secrets):

| Variable | Read in | Example | Required? |
|---|---|---|---|
| `SMTP_HOST` | `src/config.js` → `config.smtp.host` | `smtp.resend.com` | **Yes** — without this, email.js silently falls back to the no-op mock transporter |
| `SMTP_PORT` | `src/config.js` → `config.smtp.port` | `465` | Yes (defaults to `587` if unset) |
| `SMTP_USER` | `src/config.js` → `config.smtp.user` | `resend` | Yes |
| `SMTP_PASS` | `src/config.js` → `config.smtp.pass` | `re_xxx...` (provider API key/secret) | Yes |
| `EMAIL_FROM` | `src/config.js` → `config.smtp.from` | `Pholio <noreply@pholio.studio>` | Recommended (defaults to `Pholio <noreply@pholio.studio>` if unset) |
| `EMAIL_APP_URL` | `src/shared/lib/pholio-email/urls.js`, `email-templates.js` | `https://app.pholio.studio` | Optional — overrides the app base URL used to build links (guardian consent, reply links, invite links) in emails. Falls back to `APP_URL` / `URL` / `DEPLOY_PRIME_URL`. |
| `EMAIL_MARKETING_SITE_URL` | same files | `https://www.pholio.studio` | Optional — overrides the marketing-site base URL used in email footers. Falls back to `MARKETING_SITE_URL`. |
| `EMAIL_BRAND_MARK_URL` | `email-kit/theme.js`, `email-templates.js` | `https://app.pholio.studio/brand/pholio-sender-avatar.png` | Optional — public brand mark shown in email headers / inbox sender avatar (Gravatar). |

**`secure` vs `port`:** the transporter sets `secure: true` only when
`SMTP_PORT === 465` (implicit TLS). Any other port (e.g. `587`) uses
STARTTLS instead, which is what most providers (Resend, SendGrid, Postmark,
SES SMTP) expect. Match the port to what your provider's SMTP docs say —
don't set `SMTP_PORT=465` unless the provider's 465 endpoint is implicit-TLS.

### Example: Resend

```bash
SMTP_HOST=smtp.resend.com
SMTP_PORT=465
SMTP_USER=resend
SMTP_PASS=re_xxxxxxxxxxxxxxxxxxxxxxxxxxxx
EMAIL_FROM=Pholio <noreply@pholio.studio>
```

## How to verify it's working

After setting the env vars and deploying, check the server boot logs for:

```
[Email] Initialized REAL SMTP transporter with host: smtp.resend.com
[Email] SMTP transporter verify() OK — host: smtp.resend.com
```

If instead you see:

```
############################################################
# [Email] PRODUCTION MISCONFIGURATION: SMTP_HOST is not set. #
...
############################################################
```

`SMTP_HOST` is not set in that environment — fix the env var, not the code.

If you see `SMTP transporter verify() FAILED`, the host/port/credentials are
set but wrong (bad auth, wrong port/`secure` combo, host unreachable, IP
blocked by provider) — the log line includes the underlying error reason.

Every individual send also logs outcome without leaking PII:
`[Email] Sent: <messageId> to domain: <domain>` on success, or
`[Email] Failed to send — to domain: <domain> subject: <subject> reason:
<error message>` on failure (never the full recipient address, message
body, or any token/link embedded in the body — guardian consent links are
one-time secrets).

## Pipeline map

All sending goes through `src/shared/lib/email.js`. Templates are built in
`src/shared/lib/pholio-email/` (current design system) with shared visual
primitives in `src/shared/lib/email-kit/`; `src/shared/lib/email-templates.js`
is the legacy/compat module `pholio-email/index.js` drop-in replaces.

| Sender (`email.js`) | Called from | Product flow | Status |
|---|---|---|---|
| `sendGuardianConsentEmail` | `src/domains/talent/services/guardian-consent.js` → `createConsentRequest` | Minor talent requests a guardian to authorize account / agency-submission consent | **Live.** Failure correctly propagates as `GuardianConsentEmailError`, surfaced by `src/domains/talent/routes/guardian-consent.js` as HTTP 503 `EMAIL_DELIVERY_FAILED`. |
| `sendApplicationStatusEmail` | `src/domains/agency/routes/inbox.js` (`POST /api/agency/applications/:id/accept`, `/decline` — the SPA's JSON API) | Agency accepts/declines a talent application | Live. |
| `sendApplicationStatusEmail` | `src/domains/agency/routes/roster.js` (`POST /dashboard/agency/applications/:applicationId/:action` — legacy EJS dashboard) | Same flow, legacy path | **Was broken** (called two non-existent functions, always threw, silently swallowed) — fixed in this change, now calls the real `sendApplicationStatusEmail`. |
| `sendAgencyInviteEmail` | `src/domains/agency/routes/inbox.js` (`POST /api/agency/discover/:profileId/invite` — the SPA's "Invite" button) | Agency invites a discoverable talent to apply | **Was broken** (inline `require()` used a wrong relative path and threw `MODULE_NOT_FOUND` on every call, silently swallowed) — fixed in this change. |
| `sendAgencyInviteEmail` | `src/domains/agency/routes/roster.js` (`POST /agency/claim`-adjacent discover-invite route, legacy dashboard) | Same flow, legacy path | Live (this call site already used the correct import). |
| `sendNewMessageEmail` | `src/domains/agency/routes/messages.js` | Agency sends a message to a talent applicant; talent gets an email notification with a reply link | Live. |
| `sendEmail` | `email.js` internal (base sender used by all of the above) | — | Live. |
| `sendWelcomeTalentEmail`, `sendWelcomeAgencyEmail` | **Nowhere.** No caller anywhere in `src/` or `client/src/`. | Onboarding completion / signup | **Dead code.** The template exists but is never wired up. See recommendation below. |
| `sendEmailVerificationEmail` | **Nowhere.** | Email verification | **Dead code / superseded.** Email verification is handled by the Firebase client SDK directly (see `public/scripts/firebase-auth.js`); the app tracks `users.email_verified` from Firebase's `decodedToken.email_verified` claim (`src/domains/onboarding/routes/casting.js`, `src/domains/auth/routes/auth.js`). This Pholio-branded template is unused. |
| `sendPasswordResetEmail` | **Nowhere.** | Password reset | **Dead code / superseded.** `public/scripts/firebase-auth.js` calls Firebase's own `sendPasswordResetEmail(auth, email)` directly — Firebase sends and delivers that email itself, outside this app's SMTP pipeline entirely. This Pholio-branded template is unused. |
| `sendPasswordChangedEmail` | **Nowhere.** | Password-changed confirmation | **Dead code.** No caller; not clear any flow triggers a password change server-side. |
| `sendMagicSignInEmail` | **Nowhere.** | Magic-link sign-in | **Dead code.** No magic-link auth flow found calling it. |
| `sendTeamInviteEmail` | **Nowhere.** | Agency team member invite | **Dead code.** `src/domains/agency/routes/team-rbac.js` (agency team/RBAC management) has no "invite" concept or call site at all currently. |

## Recommendations (not wired in this change — out of scope)

`src/domains/onboarding/routes/casting.js`,
`src/domains/onboarding/services/state-machine.js`, and
`src/domains/auth/routes/auth.js` are owned by another workstream and were
intentionally left untouched here. If/when in scope:

- **Welcome email:** `sendWelcomeTalentEmail` / `sendWelcomeAgencyEmail` templates exist and render correctly but are never sent. If a "Welcome to Pholio" email is desired after onboarding completes / first signup, call the relevant sender from wherever onboarding is marked complete (e.g. near where `onboarding_completed_at` is set) or right after account creation in `auth.js`.
- **Password reset / email verification / magic sign-in / team invite:** these templates are fully built but orphaned. Password reset and verification are currently handled entirely by Firebase's own email delivery (not this app's SMTP), which is a reasonable design — but if there's a plan to send Pholio-branded versions instead of Firebase's default templates, or to add a team-invite feature, these builders are ready to use; they just need a call site.

## Local testing without sending real email

```bash
# Confirm the mock path (no SMTP env set):
node -e "require('./src/shared/lib/email')"
# → "[Email] Initialized MOCK development transporter (SMTP not configured)"

# Confirm transporter creation doesn't throw with SMTP configured
# (verify() will fail against a fake host — that's expected and non-fatal):
SMTP_HOST=smtp.fake.invalid SMTP_PORT=587 SMTP_USER=u SMTP_PASS=p \
  node -e "require('./src/shared/lib/email'); console.log('loaded OK')"
```

Do not run `test-send.js` / `test-smtp.js` at the repo root against real
credentials outside of deliberate manual verification — they send/attempt a
real message.
