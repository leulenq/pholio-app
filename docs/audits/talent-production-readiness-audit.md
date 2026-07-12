# Talent Experience Production-Readiness Audit

Date: 2026-07-12  
Scope: Entire Talent experience in `pholio-app`, including Talent dashboard routes, onboarding entry points that create Talent users, application/submission flows, media/comp-card workflows, messaging/interviews, settings/legal/account flows, public portfolio exposure controls, and supporting Talent APIs.

## 1. Discovered map of the Talent experience

### Entry points

- `/` and `/dashboard` redirect into `/dashboard/talent`; `/dashboard/talent/*` is wrapped by `DashboardLayoutShell`, which applies auth bootstrap, legal acceptance, profile gating, and the Talent layout.
- `/onboarding`, `/apply`, `/opencall/:code`, and `/onboarding/test` are pre-dashboard entry points for first-time/casting/open-call arrivals.
- `/reveal` and `/dashboard/talent/reveal` are standalone reveal experiences.
- `/dashboard/talent/applications/apply` is a standalone full-screen submission studio, intentionally outside dashboard chrome.
- `/login`, `/auth/instagram/callback`, and `/reply/:token` support authentication/social/magic-link message reply.

### Core Talent journeys

1. **First-time onboarding and unlock**
   - User completes the casting/onboarding flow, then lands in the dashboard.
   - `DashboardLayoutShell` redirects to onboarding when the profile API returns `onboarding_required`, gates restricted routes when profile essentials are incomplete, checks legal acceptance, and may show a one-shot profile unlock experience.

2. **Profile setup and maintenance**
   - `/dashboard/talent/profile` collects identity, discipline, measurements, availability, credits/training, representation, socials, compliance/private details, and contact data.
   - It supports autosynced profile normalization, profile strength/readiness, unit toggling, guardian-consent requests, and AI writing assistance.

3. **Media, digitals, book, image rights, and comp card**
   - `/dashboard/talent/media` is the media workspace for uploads, image role/type metadata, digitals guidance, set selection, image rights/model release records, image replacement/restoration, bulk actions, and comp-card assembly.
   - Talent APIs support upload, reorder, set current media set, rights/model-release CRUD, AI classification, moderation, replacement, restoration, role tagging, and saved comp-card presets.

4. **Agency submissions/applications**
   - `/dashboard/talent/applications` lists available agencies, recent submission history, status/detail, messaging, interviews, and withdrawal.
   - `/dashboard/talent/applications/apply` is a seven-page dossier flow: agency/board selection, digitals, stats, book, comp card, message, review & send. It has server drafts, local recovery, quota awareness, consent fingerprinting, and guardian agency consent.

5. **Messages and interviews**
   - `/dashboard/talent/messages` aggregates message threads; application detail can open a per-application message dock.
   - Talent interview APIs allow response to agency meeting requests.

6. **Analytics / Intel**
   - `/dashboard/talent/analytics` exposes profile/website/application intelligence, with Studio+ gating for premium analytics.
   - Overview also surfaces profile views, website analytics, applications, interviews needing response, readiness, stale digitals, and public portfolio URL when allowed.

7. **Settings, legal, privacy, subscription, and account lifecycle**
   - `/dashboard/talent/settings` and section deep links handle preferences, legal status/acceptance, Stripe checkout, data export, session revocation, deactivation, deletion, and subscription controls.

### Supporting, hidden, and edge-case workflows

- Minor/guardian consent is a cross-cutting state: unconsented minors should have measurements, sensitive body imagery, public portfolio, comp-card exposure, and agency submissions blocked until consent.
- Agency-specific guardian consent is separate from account-level guardian consent for minor submissions.
- Submission program acknowledgment is versioned and required before participating in the submission program.
- Application drafts have server lifecycle states plus local browser backup/tombstones for recoverable abandoned submissions.
- Media uploads invoke moderation, CSAM screening, AI classification, image processing, S3/local storage cleanup, and post-upload profile readiness notifications.
- Public portfolio sharing is gated by slug, subscription, and minor public-exposure policy.
- Representation supports mother-agency and placement-agency records, including market, territory, division, exclusivity, active/ended status.
- Availability/bookouts exist as Talent APIs and profile UI state, but they are not yet tied to a full booking/options calendar.

### Permission boundaries and state transitions

- Backend Talent routers are mounted under `/api/talent/*` and generally require `requireRole("TALENT")` plus active account checks; agency-facing APIs are separate.
- Client API wrapper redirects 401s to `/login?redirect=<pathname>` unless suppressed.
- Profile gating locks restricted Talent navigation and route content until core essentials are complete.
- Applications transition through submitted/reviewing/shortlisted/requested-more/meeting/kept-on-file/development/accepted/withdrawn-like states; Talent may withdraw from a broad set of in-process states.
- Drafts transition through active/recoverable/deleted/expired/conflict states.
- Media can move between visible/private, roles, sets, rights statuses, and moderation/classification states.

### Mobile-specific experience

- Talent layout collapses top navigation into mobile affordances and a mobile tab bar. Several pages include responsive breakpoints and reduced-motion fallbacks.
- Mobile density intentionally hides the numeric unread badge and keeps a dot indicator in the top bar.
- The application studio is full-screen and page-based, which should be more mobile-friendly than a dashboard form, but it requires live viewport testing before launch.

## 2. Executive summary

The Talent experience is unusually complete for an early launch candidate: it has the right high-level product objects (profile, digitals, book, comp card, submissions, applications, interviews, messages, settings), good industry terminology in the submission studio, meaningful guardian-consent architecture, image-rights/model-release scaffolding, and robust draft recovery.

However, I would not launch it publicly today. The riskiest issues are not missing features in isolation; they are trust breaks in the moments where Talent are deciding whether Pholio is safe and professionally credible: first-run route protection, mobile/accessibility compliance, minor/privacy consent gaps, inconsistent quota/count truth, and unfinished operational lifecycle states after submission.

Launch-readiness headline: **private beta / controlled pilot only**. Public launch should wait until P0/P1 blockers below are resolved and verified in-browser on desktop and mobile.

## 3. Launch readiness assessment

| Dimension | Rating | Evidence-based assessment |
|---|---:|---|
| Journey completeness | 3/5 | Core journeys exist, but booking/options/payment lifecycle and post-submission next steps are incomplete. |
| Trust/safety/compliance | 2/5 | Strong minor protections exist, but adult AI consent and local draft privacy remain unresolved. |
| UX clarity | 3/5 | Strong professional language in submission flow; some dead-end/counter inconsistencies remain. |
| Mobile readiness | 2/5 | Breakpoints exist, but several patterns need live testing and one banned unread indicator remains. |
| Accessibility | 2/5 | ARIA exists in places; badge/dot indicators, tab semantics, overlays, and route fallback need audit. |
| Data integrity | 3/5 | Draft versioning and server validation are strong; profile save/version concurrency is only partially enforced. |
| Industry credibility | 3/5 | Correct digitals/book/comp-card vocabulary is present; applications still over-index on generic “application” language and lacks option/hold/payment states. |

Overall: **Not public-launch ready; pilot-launch ready with guardrails.**

## 4. Critical launch blockers

### P0-1 — Dashboard route is client-rendered before a clear authenticated/authorized Talent gate is visible

- **Severity:** Critical launch blocker.
- **Reproduction steps:** Open a dashboard route such as `/dashboard/talent/profile` in a fresh browser with no valid session; observe that the client route is mounted by `DashboardLayoutShell` and only redirects to onboarding for a specific `onboarding_required` API error.
- **Expected behavior:** A non-authenticated or non-Talent visitor should deterministically hit login/role handling before any dashboard shell, user chrome, profile gating, or Talent-specific effects can render.
- **Actual behavior:** The shell relies on auth hook state and an API-error special case; the route itself is publicly declared in React Router and does not show an explicit client-side role/session gate at the route boundary.
- **Evidence:** Talent routes are mounted directly under `DashboardLayoutShell` in `App.jsx`; the shell only has a special redirect for `error.data?.error === 'onboarding_required'` and otherwise renders legal/layout/gating branches.
- **Suspected root cause:** Authentication/authorization is enforced mainly at API and hook levels, not as an explicit React route guard for the Talent route tree.

### P0-2 — Sensitive AI processing lacks an explicit adult opt-in/opt-out consent model

- **Severity:** Critical trust/compliance blocker.
- **Reproduction steps:** Upload or set a primary image as an adult profile with a DOB on file; sensitive image analysis may run without a dedicated AI-processing consent flag.
- **Expected behavior:** Talent should explicitly control whether images may be used for sensitive analysis that infers measurements, body/face traits, market suitability, or similar biometric-adjacent attributes.
- **Actual behavior:** The media route treats adults with DOB as allowed and documents that a future schema wave should add explicit `ai_processing_consent`.
- **Evidence:** `sensitiveImageAiAllowed` delegates to `canCollectSensitiveProfileFields`; the comment states adults with DOB are treated as having implied consent until an explicit opt-out column exists.
- **Suspected root cause:** Minor consent hardening was prioritized, but adult AI consent was left as a documented TODO.

### P0-3 — Application drafts store submission dossier data in browser localStorage for up to seven days

- **Severity:** Critical privacy/trust blocker on shared devices.
- **Reproduction steps:** Start an agency submission, enter notes/select package materials, abandon the flow, then inspect browser localStorage keys beginning `pholio:apply-draft:v2:<profileId>:<agencyId>`.
- **Expected behavior:** Sensitive submission package drafts should be server-side only or encrypted/session-scoped locally, with explicit “saved on this device” disclosure and a way to clear local data.
- **Actual behavior:** Draft documents are serialized to localStorage with a seven-day TTL and are keyed by profile and agency.
- **Evidence:** `LOCAL_RECORD_TTL_MS` is seven days and `writeLocalDraft` persists the full draft record/document to localStorage.
- **Suspected root cause:** The product optimized for abandoned-flow recovery without a matching privacy/disclosure model.

### P0-4 — Talent layout reintroduces banned unread count badge/dot status indicators

- **Severity:** Critical design-system compliance and mobile clarity blocker.
- **Reproduction steps:** Use an account with unread notifications; observe numeric count badge and dot indicator in the Talent header. On mobile, numeric badge is hidden but dot remains.
- **Expected behavior:** Pholio’s current rules ban count bubbles and pulsing/static dot status indicators on nav/header items; unread state should be text/aria-led or handled inside the notification panel.
- **Actual behavior:** The topbar renders `.tl-action-badge` plus `.has-unread::after` dot indicator.
- **Evidence:** Talent layout renders `tl-action-badge` for unread count and CSS creates a gold dot via `.tl-action-icon.has-unread::after`; mobile CSS hides only the numeric badge.
- **Suspected root cause:** Notification affordance predates the latest banned-pattern rules or was missed during cleanup.

## 5. High-priority issues

### P1-1 — Submission quota/counts can mislead Talent

- **Severity:** High.
- **Reproduction steps:** Create applications this month, including invited/open-call or non-discovery submissions; compare `/dashboard/talent/applications` monthly label with the full-screen apply flow quota label.
- **Expected behavior:** Every quota/count display should use the same server quota source and distinguish discovery submissions from invited/open-call exemptions.
- **Actual behavior:** Applications page computes free-tier monthly usage locally from `created_at` and shows `monthCount/5`; Apply flow uses `applicationQuota` with open-call exemption language.
- **Evidence:** Applications page derives `monthCount` by filtering application timestamps and renders `${monthCount}/5`; Apply flow derives quota from `applicationQuota.used`, `.limit`, `.unlimited`, and active open-call claims.
- **Suspected root cause:** The list view retained a local monthly count after quota logic moved server-side.

### P1-2 — Application discovery only exposes six open agencies and can create a dead end

- **Severity:** High.
- **Reproduction steps:** Seed or return more than six eligible agencies; visit `/dashboard/talent/applications`.
- **Expected behavior:** Talent should be able to browse/search/paginate all eligible agencies or understand why only a curated subset appears.
- **Actual behavior:** Available agencies are filtered, sorted, and hard-sliced to six; if none remain, the empty state says every available agency is already in the ledger.
- **Evidence:** `openAgencies` is `.slice(0, 6)` and the empty state says “Every available agency is already in your ledger.”
- **Suspected root cause:** Discovery was implemented as a compact dashboard panel rather than a scalable agency marketplace.

### P1-3 — Post-submission state model is still not launch-complete for real agency workflows

- **Severity:** High.
- **Reproduction steps:** Submit to an agency, then inspect the application detail available states/actions and next-step guidance.
- **Expected behavior:** Talent should see realistic lifecycle states: received/in review, kept on file, requested more digitals, go-see/meeting, development offer, signed/represented, declined/try again later, with explicit owner and next action.
- **Actual behavior:** The detail panel shows a status label, “next” copy, stale-application message, interviews, messaging, and withdrawal, but no structured request-more deliverables, kept-on-file nuance, or outcome timeline.
- **Evidence:** Application detail renders status, generic facts, note, interviews, messages, withdrawal, and package links.
- **Suspected root cause:** Agency application operations exist, but Talent-facing status semantics are not yet rich enough to guide confused or anxious users.

### P1-4 — Booking/availability lifecycle is only partially represented

- **Severity:** High.
- **Reproduction steps:** Try to manage real availability from Talent profile/settings: mark bookouts, holds/options, fitting, booking, or confirm/release.
- **Expected behavior:** A launch-ready talent product should represent availability/bookouts and, once agencies interact, option/hold/booking/fitting/voucher states.
- **Actual behavior:** Talent API has availability and bookout endpoints, but the product map lacks option priority, holds, confirm/release, fitting, voucher, cancellation, and pay status.
- **Evidence:** Talent API exposes `getAvailability`, `updateAvailability`, `getBookouts`, `createBookout`, and `deleteBookout`, but no option/hold/voucher/payment endpoints are present in the Talent API client.
- **Suspected root cause:** Current Talent experience is portfolio/submission-centric and not yet a full agency operating calendar.

### P1-5 — Profile save concurrency is documented as transitional and may still allow stale overwrite

- **Severity:** High.
- **Reproduction steps:** Open profile in two tabs, edit different sections, save both; inspect whether stale `expected_updated_at` is always sent and enforced.
- **Expected behavior:** Profile saves should consistently include a version token and reject stale writes with a recoverable conflict UI.
- **Actual behavior:** Backend profile comparison proceeds when no token is supplied, described as a safe fallback until the client always sends the token.
- **Evidence:** `profileVersionMatches` returns true when no version token is supplied and comments that this is temporary until the client always sends the token.
- **Suspected root cause:** Optimistic concurrency was added server-side before the client contract was made mandatory everywhere.

### P1-6 — Adult/minor measurement model is strong but still not fully localized or versioned in UX

- **Severity:** High.
- **Reproduction steps:** Use an international Talent profile with EU/UK/US sizing needs and stale measurement history; try to understand what agencies will receive.
- **Expected behavior:** Measurements should be dual-unit, localized by market/division, and clearly dated/current.
- **Actual behavior:** Schema supports metric fields and shoe region, and there is a stats currency prompt, but garment/localized sizing and per-field measurement history/versioning are limited.
- **Evidence:** Profile schema has `height_cm`, `weight_kg`, `bust_cm`, `chest_cm`, `waist_cm`, `hips_cm`, `shoe_region`, `dress_size`, `suit_size`, and `inseam_cm`; send readiness only checks current required measurement presence.
- **Suspected root cause:** Data model has enough for basic submissions, not yet full international casting accuracy.

### P1-7 — Mobile/a11y semantics of application filters are questionable

- **Severity:** High.
- **Reproduction steps:** Keyboard/screen-reader navigate the application history filters.
- **Expected behavior:** If using `role="tablist"`, each tab should control a corresponding `tabpanel`, support arrow-key behavior, and have clear selected semantics; otherwise use a simpler button group.
- **Actual behavior:** Filter buttons use `role="tab"` and `aria-selected`, but there is no visible paired `tabpanel` in the snippet and no evidence of tab keyboard management.
- **Evidence:** Applications page renders `PholioToggleGroup role="tablist"` with child buttons `role="tab"` and `aria-selected`.
- **Suspected root cause:** Visual toggle components were given tab roles without completing the ARIA tab pattern.

## 6. Medium/low-priority issues

### P2-1 — Some Talent surfaces still use generic “applications” language

- **Severity:** Medium.
- **Evidence:** Routes and UI still call the area Applications and “Filter applications,” while the product’s strongest industry copy calls the object a submission/dossier.
- **Why it matters:** “Submission” is more credible than “application” for agencies reviewing digitals/stats; the current mixed language is not fatal but softens trust.

### P2-2 — Public portfolio URL default may confuse app-vs-marketing domains

- **Severity:** Medium.
- **Evidence:** Overview constructs share URLs from `VITE_PORTFOLIO_URL || 'https://pholio.studio'`, while the product architecture distinguishes marketing and app domains.
- **Why it matters:** Talent trust drops if copied portfolio links route to the wrong host or behave differently from expected public profile URLs.

### P2-3 — External agency websites are linked without visible trust/safety context

- **Severity:** Medium.
- **Evidence:** Application detail renders an agency site link directly from agency website data with `target="_blank" rel="noreferrer"`.
- **Why it matters:** Pholio should make it clear whether an agency is verified, unverified, user-added, or platform-approved before encouraging Talent to leave the app.

### P2-4 — Unread notification state duplicates visual status on mobile

- **Severity:** Medium.
- **Evidence:** Mobile CSS comments say the numeric unread count is unreadable and keeps only the dot.
- **Why it matters:** Beyond banned-pattern compliance, dot-only status is poor for accessibility and creates hidden-state anxiety for impatient mobile users.

### P2-5 — Seven-page apply flow may be heavy for impatient users without strong progress recovery disclosure

- **Severity:** Medium.
- **Evidence:** Apply flow is intentionally seven pages (`01 / 07`) and autosaves drafts every 1.5 seconds.
- **Why it matters:** This is robust for quality submissions, but users need clear “saved securely / saved on this device / resume later” messaging to trust abandonment and return.

### P3-1 — Several design-system anti-pattern remnants are present but isolated

- **Severity:** Low.
- **Evidence:** `HeroCard.css` contains gradient text rules; modal scrims use backdrop-filter appropriately, but the topbar also uses blur.
- **Why it matters:** These are mostly craft-system cleanup issues unless they appear prominently in launch flows.

## 7. Areas that appear production-ready or close

- **Submission package validation:** Client and server share send-readiness gates for core profile completion, digitals, stale digitals, retouched digitals, contact, measurements, image rights, and guardian consent.
- **Minor protection architecture:** There is meaningful guardian-consent routing, agency-specific consent, default-private image behavior for unconsented minors, sensitive body image blocking, and public exposure gating.
- **Draft lifecycle resilience:** The application studio has server drafts, version/generation handling, local recovery, tombstones, conflict handling, repair flow hooks, and idempotency concepts.
- **Industry language in Apply studio:** “Digitals,” “book,” “comp card,” “raw set,” “unretouched,” “head to toe,” and “dossier” are credible and coach Talent toward professional submissions.
- **Representation model:** The profile schema supports mother agency vs placement agency, market, territory, division, exclusivity, and active/ended state.
- **Media rights foundation:** Image rights and model-release APIs exist and are threaded into distribution readiness.
- **Legal acceptance gate:** Dashboard shell defers unlock celebration until legal acceptance status is checked.
- **Reduced-motion awareness:** Talent pages/components use `useReducedMotion` and CSS reduced-motion fallbacks in multiple places.

## 8. Ten improvements that would most increase Talent satisfaction and trust

1. Add an explicit Talent route guard for authenticated, active, Talent-role sessions before dashboard shell render.
2. Add first-class AI image-processing consent with opt-in/opt-out, audit log, and plain-language settings copy.
3. Replace localStorage dossier drafts with server-only encrypted drafts, or disclose/clear local device drafts prominently.
4. Unify quota/count displays by using the server application quota everywhere.
5. Replace notification count/dot badges with accessible text-state inside the notification control/panel.
6. Expand agency discovery beyond six cards with search/filter/pagination and clear agency verification context.
7. Make post-submission status a guided timeline with “who acts next,” “what the agency can see,” and “what you can do now.”
8. Add request-more deliverables for agencies and Talent: specific digitals, updated stats, reel, availability, or meeting/go-see response.
9. Harden measurements into dated, dual-unit, localized stats with visible “last updated” and market-aware display.
10. Run a real mobile/a11y pass on the application studio, media workspace, profile form, notification panel, and settings account flows.

## 9. Final recommendation

**Do not launch the Talent experience publicly today.** Launch it as a controlled beta/pilot only, with selected agencies and Talent, because the product foundation is promising but the trust boundary is not yet launch-safe. The highest-risk issues are privacy/consent handling, explicit route authorization, quota truth, mobile/a11y readiness, and incomplete post-submission lifecycle guidance.

If the P0 blockers and at least P1-1 through P1-5 are fixed and verified in production-like desktop/mobile sessions, the Talent experience would be a strong candidate for a broader public launch.
