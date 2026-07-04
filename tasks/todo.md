# Email System Rebuild — 2026-07-04

## Plan
- [x] Read root/product/design guidance plus onboarding and agency design references.
- [x] Audit email moments in codebase and define no-filler template set.
- [x] Rebuild Pholio email visual/content system from zero around onboarding dark-stage + applications/submission communication.
- [x] Route Firebase/Auth email moments through Pholio SMTP where the app controls delivery.
- [x] Update preview/test/docs references that depend on the email template contract.
- [x] Run focused tests and commit.

## Required template set
No filler templates. Keep only moments Pholio actually sends or has a concrete product surface for now:

1. `auth.verify_email` — email/password onboarding verification. SMTP-delivered Firebase action link.
2. `auth.password_reset` — login/settings password reset. SMTP-delivered Firebase action link; replaces client-side stock Firebase send.
3. `guardian.consent` — parent/guardian authorization for minor account activation or agency submission.
4. `submission.status` — agency decision on a talent submission: accepted/declined today, phrased as submission outcome rather than generic application CRM.
5. `submission.invite` — agency invites talent to submit from Discover.
6. `message.new` — agency message notification to talent with a reply link.
7. `team.invite` — agency team invitation template retained because sender API exists, but treated as operational access only.
8. `welcome.talent` and `welcome.agency` — retained sender API for existing exports/previews, but written as minimal first-session orientation until a caller is wired.
9. `auth.password_changed` and `auth.magic_sign_in` — retained API compatibility only; not presented as live send moments until product flow exists.

## Audit notes
- Current live SMTP moments: guardian consent, application status, agency invite, new message, onboarding verification resend/initial verification.
- Current stock Firebase moments: password reset in SPA login and talent settings.
- Current dead/compat senders: welcomes, password changed, magic sign-in, team invite.

## Design rules applied
- Onboarding: dark cinematic screen-test system, warm white type, gold as light, no grain/glass/chips.
- Agency/applications: editorial command-center restraint, Playfair/Inter hierarchy, one gold accent, no status badges, no generic SaaS card-in-inbox composition.
- Email-specific: full-frame dark stage shell with table-safe layout, spacious composition, inline styles, no decorative badge/chip/eyebrow patterns.

## Review
- Rebuilt the email design system as a dark, full-frame Pholio stage with serif hierarchy, warm neutral panels, and one gold action.
- Replaced stock Firebase password-reset delivery in React and legacy helpers with a server endpoint that generates Firebase Admin action links and sends via SMTP.
- Regenerated previews and updated the focused guardian-consent email test expectations.
