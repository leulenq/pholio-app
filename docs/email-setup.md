# Email Setup (Transactional SMTP)

Pholio sends transactional email through `src/shared/lib/email.js` and the SMTP settings in `src/config.js`. Firebase still owns auth state and action-code validity, but Pholio generates Firebase action links with the Admin SDK and delivers the actual email through our SMTP provider.

## Required environment

| Variable | Purpose |
|---|---|
| `SMTP_HOST` | SMTP host. Required for real delivery. |
| `SMTP_PORT` | SMTP port, usually `465` or `587`. |
| `SMTP_USER` | SMTP username. |
| `SMTP_PASS` | SMTP password/API key. |
| `EMAIL_FROM` | Sender, default `Pholio <noreply@pholio.studio>`. |
| `EMAIL_APP_URL` | Public app URL used in email links; falls back to `APP_URL`. |
| `EMAIL_MARKETING_SITE_URL` | Public marketing/legal URL; falls back to `MARKETING_SITE_URL`. |

If `SMTP_HOST` is missing, development uses a mock transporter. A deployed runtime logs a loud misconfiguration warning and now FAILS the send rather than silently succeeding — a mock that returns success let guardian consent report `email_sent: true` having sent nothing.

## Live email moments

| Template key | Sender | Product moment |
|---|---|---|
| `auth.verify_email` | `sendEmailVerificationEmail` | Email/password onboarding and resend verification. Firebase Admin generates the action link; Pholio SMTP sends it. |
| `auth.password_reset` | `sendPasswordResetEmail` | Login and settings password reset. Firebase Admin generates the action link; Pholio SMTP sends it. |
| `guardian.consent` | `sendGuardianConsentEmail` | Guardian authorization before minor account activation or agency submission disclosure. |
| `submission.status` | `sendApplicationStatusEmail` | Agency accepts or declines a talent representation submission. |
| `submission.invite` | `sendAgencyInviteEmail` | Agency invites discoverable talent to submit. |
| `message.new` | `sendNewMessageEmail` | Agency message notification with reply link. |

## Compatibility templates

The sender API also exports `sendWelcomeTalentEmail`, `sendWelcomeAgencyEmail`, `sendPasswordChangedEmail`, `sendMagicSignInEmail`, and `sendTeamInviteEmail`. These are retained for compatibility/previews and future call sites, but they are not currently live send moments unless a route calls them.

## Local verification

```bash
node -e "require('./src/shared/lib/email')"
npm run preview:emails
npm test -- --runInBand tests/shared/pholio-email.test.js
```

Do not run ad-hoc real-send scripts against production credentials unless you intend to send a real email.
