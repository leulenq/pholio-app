# Bio Writer Label Separation — 2026-06-27

- [x] Keep Length and Voice inline with their choices.
- [x] Limit each filter baseline to the selectable options.
- [x] Run focused verification.

## Review

- Length and Voice remain inline, outside the selection baseline.
- The hairline now begins with Tight/Standard and Agency/Personal only, making
  the gold bold labels read clearly as group names.
- Focused ESLint, `git diff --check`, and the client production build pass.

# Bio Writer Inline Hierarchy Correction — 2026-06-27

- [x] Restore Length and Voice to the inline control-row structure.
- [x] Remove the stacked serif group-title treatment.
- [x] Distinguish group labels using bold gold mono text only.
- [x] Run focused verification.

## Review

- Length and Voice are restored to the same inline baseline as their choices.
- Both labels remain mono uppercase but now use the Profile gold token and
  `700` weight for distinction.
- The Training & Skills architectural button refinement is unchanged.
- `git diff --check` and the client production build pass.

# Profile Writing Controls Refinement — 2026-06-27

- [x] Move Bio Length and Voice into authoritative group-title positions.
- [x] Restyle Training actions with the `/apply` Back/Next bordered architecture.
- [x] Give Draft from profile the primary Next treatment and keep transformations secondary.
- [x] Add a restrained busy/activity detail without generic AI iconography.
- [x] Preserve the hairline shared-toolbar treatment for non-Training callers.
- [x] Run focused lint, diff, and production-build verification.
- [ ] Run rendered QA when the in-app browser connector is available.

## Review

- Bio group titles now sit above the option rows in a medium-weight editorial
  serif, while Tight/Standard and Agency/Personal remain compact mono choices.
- Training uses a scoped `architectural` writing-toolbar variant copied from the
  `/apply` navigation family: 42px height, 2px radius, bordered cream structure,
  precise hover lift, and restrained shadows.
- Format list and Summarize use the quieter Back-button treatment. Draft from
  profile uses the stronger Next-button border/background treatment.
- Intelligence is communicated through an inset gold activity rule and a spinner
  only on the active action; there are no pills, sparkles, glows, or magic copy.
- Application-note and message writing controls keep the prior hairline action
  treatment, so this refinement does not broaden the bordered variant beyond
  Training.
- Focused ESLint, `git diff --check`, and the client production build pass.
- Browser visual QA remains unavailable because the in-app browser connector
  fails before opening a tab.

# Profile Writing Controls Redesign — 2026-06-27

- [x] Rebuild Bio length/voice choices as hairline filter rows matching Submission History.
- [x] Replace the shared writing-assist pill/chip treatment with the same filter-row language.
- [x] Preserve disabled, busy, undo, keyboard-focus, and reduced-motion behavior.
- [x] Verify Profile, application-note, and message-toolbar usages after the shared change.
- [x] Run focused lint/build verification.
- [ ] Run rendered QA when the in-app browser connector is available.

## Review

- Bio Length and Voice are now two compact shared-hairline rows using the same
  mono spacing, quiet inactive labels, active text, and gold underline motion as
  Submission History filters.
- The shared `WritingAssistToolbar` no longer renders gold capsule chips or a
  sparkle icon on every action. Training, application notes, and messages now
  inherit the same transparent hairline action language.
- Busy state is scoped to the action actually running instead of replacing every
  action label; disabled, undo, focus-visible, and reduced-motion states remain.
- Focused ESLint, `git diff --check`, and the client Vite production build pass.
- Browser visual QA remains unavailable because the in-app browser connector
  fails before opening a tab.

# Mia Website Analytics Runtime Fix — 2026-06-27

- [x] Reproduce the zero-state through the live development data path.
- [x] Compare the seeded SQLite rows with the website analytics range query.
- [x] Normalize SQLite website analytics range predicates with `datetime()`.
- [x] Add an ISO-timestamp regression test.
- [x] Verify the authenticated live API returns Mia's non-zero metrics and series.

## Review

- Root cause: the demo seed stores ISO timestamp strings, while the website API
  bound JavaScript `Date` objects directly in SQLite range predicates. SQLite
  grouped the rows by date but returned zero for the range counts.
- Website analytics now uses native timestamp predicates on PostgreSQL and
  `datetime(column)` / `datetime(?)` comparisons on SQLite.
- Bumped the React Query website analytics contract key so the mounted overview
  replaces its cached zero response immediately after the backend correction.
- The live port-3000 response for Mia now reports 215 visits, 18 unique visitors,
  215 page views, 121 outbound clicks, a 30-day series, and `hasData: true`.
- Focused regression `website analytics counts ISO timestamps in SQLite` passes.

# Studio+ Analytics Follow-up — 2026-06-27

- [x] Remove nonessential analytics provenance/filler copy.
- [x] Restore the original top-right URL link treatment.
- [x] Change the visible and linked portfolio identity to `pholio.studio/{talent-username}`.
- [x] Make the standalone analytics seed target Mia Voss explicitly and replace her demo traffic transactionally.
- [x] Seed the active Mia Voss development account with current website analytics.
- [x] Run focused lint/build/data verification.
- [ ] Run rendered QA when the in-app browser connector is available.

## Review

- Removed the website analytics subtitle, chart provenance sentence, and footer provenance label while preserving functional metric and empty-state copy.
- Restored the original compact rounded top-right link treatment and changed the shared display/destination value to `https://pholio.studio/{talent-username}`.
- Reworked `scripts/seed-analytics.js` to resolve Mia through `talent@example.com`, replace only her sessions/events in one transaction, and produce a repeatable 30-day website dataset.
- Added `npm run seed:analytics` and applied it to the active development database.
- Active Mia dataset verified: 215 visits, 18 unique visitors, 215 page views, and 121 outbound clicks across 30 days.
- Verification passed: seed script syntax, focused frontend ESLint, `git diff --check`, source scan for removed filler copy, and the client Vite production build.
- Browser visual QA remains unavailable because the in-app browser connector fails before opening a tab.

# Studio+ Overview Website Analytics — 2026-06-27

- [x] Audit every overview website metric against its stored event/session source.
- [x] Define a truthful first-party website analytics contract for visits, unique visitors, page views, outbound clicks, and the daily visit trend.
- [x] Harden portfolio tracking so owner previews, bots, cross-profile session cookies, and arbitrary event names do not corrupt reporting.
- [x] Make the displayed public portfolio URL and link destination use the same non-localhost canonical identity.
- [x] Replace the hand-built spark bars with a restrained full-width Recharts visualization and clear empty/loading/error states.
- [x] Add focused backend coverage and run frontend lint/build verification.
- [ ] Visually verify the rendered overview when the in-app browser connector is available.

## Review

- Website reporting now comes from a dedicated first-party contract on `/api/talent/analytics`: visits and the daily trend use `visitor_sessions`; unique visitors use distinct persisted visitor IDs; page views use `view` events; outbound clicks use only `social_click` and `portfolio_click`.
- Unique visitors are shown as unavailable when legacy session rows make identity coverage partial. Empty data, disconnected data, loading, and API errors are separate UI states; no estimates or seeded placeholders are presented as measured traffic.
- Public portfolio GET/event tracking now excludes signed-in owner activity and known crawlers, awaits session creation before response headers commit, uses a profile-specific session cookie, and accepts only the four events emitted by the portfolio page.
- Comp-card downloads and bio reads were removed from the overview website metric set.
- The overview URL and its destination are now derived from one canonical public URL, with `https://app.pholio.studio` as the non-local fallback, so localhost is never exposed in the production-facing section.
- Replaced the manual bar sparkline with a restrained full-width Recharts monotone area/line chart, custom tooltip, sparse grid, prior-period context, reduced-motion support, and responsive sizing.
- Verification passed: backend syntax checks, focused frontend ESLint, `git diff --check`, client Vite production build, and three focused Supertest regressions covering the website contract, owner exclusion, and event whitelist.
- The full pre-existing `overview-backend.test.js` suite still has three seed-state failures unrelated to this work (`is_pro` SQLite integer vs strict boolean, and absent seeded analytics). The three new focused tests pass.
- Browser visual QA could not run because the in-app browser connector failed before opening a tab; this remains the only unchecked item.

# Apply Workspace Editorial Frame — 2026-06-26

- [x] Add a refined workspace header that uses the talent dashboard header DNA: wordmark left, "Submitting to" centered, exit action right.
- [x] Rebuild the locked agency scene with the reference-inspired left editorial rail while preserving Pholio product logic on the right.
- [x] Remove visible Address / Curate / Send / step-count navigation from the workspace.
- [x] Restyle the apply workspace responsively using existing application tokens and without banned badge/glass/status-dot patterns.
- [x] Run focused frontend verification.

## Review

- Header now follows the talent shell's three-zone topbar structure, serif PHOLIO wordmark treatment, centered mono navigation language, and right action placement.
- Header center now reads `Submitting to {agency name}` when an agency is selected.
- Left agency rail now shows `Established {date}` above the agency name when explicit establishment/founding data exists, with a fallback that reads founded/established years from current agency descriptions.
- The custom progress row and visible step labels are removed; navigation remains in the footer actions where it supports the real flow.
- The focused agency page now uses one continuous cream workspace with a left editorial rail and a right product/readiness brief.
- Verification passed: focused ESLint for `ApplyExperience.jsx`; `git diff --check`; removed-label scan; `cd client && vite build`; local route probe returned HTTP 200. Vite still reports the existing large-chunk warning.
- Browser visual QA was not available because the in-app browser connector failed before opening a tab in this session.

# Apply Address Stage Redesign — 2026-06-26

- [x] Rework the focused Address composition so the agency identity feels like an application stage.
- [x] Add restrained motion, contrast, and layered editorial structure without making the page busy.
- [x] Restructure the fit section for stronger rhythm and visual tension.
- [x] Run focused frontend verification.

## Review

- Rebuilt the focused agency masthead as a high-contrast editorial stage with the agency logo, large serif identity, match signal, and subtle scanning hairline motion.
- Increased emotional weight through contrast, layered linear texture, stronger type scale, and hover/motion on the stage, boards, and readiness ledger.
- Reworked "What this house looks for" into an asymmetric editorial spread: headline/verdict/pressure on the left, requirement ledger on the right.
- Added responsive collapse rules so the stage and fit spread remain usable on tablet/mobile.
- Verification passed: `cd client && npx eslint src/domains/talent/pages/ApplyPage/ApplyExperience.jsx`; `cd client && npm run build`. Vite still reports the existing large-chunk warning.

# Apply Agency Content Assets — 2026-06-26

- [x] Trace the agency fields used by the talent apply experience.
- [x] Add Marilyn and Lumen logo/content data for fresh seeds and existing databases.
- [x] Verify migration and script syntax.

## Review

- The talent apply experience reads `website`, `description`, `logo_path`, and `open_boards` from `/api/talent/agencies`.
- Added local agency logo SVG assets for Marilyn and Lumen under `public/agency-logos/`.
- Mirrored those SVGs into `client/public/agency-logos/` so Vite dev serves `/agency-logos/...` at `localhost:5173`.
- Updated fresh seed data for Marilyn and the Lumen demo seed with apply-facing descriptions, local logo paths, brand colors, and open boards.
- Added `20260626120000_populate_apply_agency_content.js` to backfill existing `agencies` rows.
- Verification passed: `node --check` for touched seed/migration files, plus an in-memory SQLite migration smoke test that confirmed both agency rows populate the fields consumed by `/applications/apply`.
- Applied the migration locally with `npm run migrate` and confirmed the current database now has populated Marilyn and Lumen agency rows.
- Bumped the `talent-agencies` React Query key to `apply-content-v2` so old cached agency rows are replaced on `/applications` and `/applications/apply`.
- Verification passed: focused ESLint for `ApplicationsView.jsx` and `ApplyExperience.jsx`; `cd client && npm run build`. Vite still reports the existing large-chunk warning.

# Apply Address Spacing Refinement — 2026-06-26

- [x] Add back selective breathing room to the Address mast and fit section.
- [x] Move the agency website action to a subtle icon beside the agency name.
- [x] Run focused frontend verification.

## Review

- Added back modest top spacing through the apply shell, step header, focused dossier hero, and info row.
- Gave "What this house looks for" more room with larger section spacing and slightly taller requirement rows.
- Replaced the text website treatment with an icon-only external-link action beside the agency name.
- Verification passed: `cd client && npx eslint src/domains/talent/pages/ApplyPage/ApplyExperience.jsx`; `cd client && npm run build`. Vite still reports the existing large-chunk warning.


# Apply Address Compaction + Website Link — 2026-06-26

- [x] Tighten the locked Address scene enough to fit normal desktop viewports without feeling compressed.
- [x] Rework the agency website link as integrated editorial identity metadata.
- [x] Run focused frontend verification.

## Review

- Reduced apply shell vertical padding, Address header spacing, agency crest/name/match scale, info-row rhythm, board spacing, and fit-list row padding.
- Moved the website link into the agency identity metadata line beside location, styled as a subtle serif text link with a hairline divider/underline and gold arrow.
- Removed unused `digitalsGaps` plumbing from `AgencyDossier` while keeping Curate-scene digitals guidance intact.
- Verification passed: `cd client && npx eslint src/domains/talent/pages/ApplyPage/ApplyExperience.jsx`; `cd client && npm run build`. Vite still reports the existing large-chunk warning.

# Apply Page Right-Side Layout Balance — 2026-06-26

- [x] Identify the apply page layout constraints that leave the far-right canvas unused.
- [x] Adjust the apply scene CSS so right-side content reaches farther right on wide screens.
- [x] Run focused frontend verification for the touched apply page files.

## Review

- Removed the focused agency dossier max-width so the selected-agency address scene can span the available canvas.
- Widened and right-aligned the Curate aside and Send comp-card column so those right-side surfaces reach farther toward the canvas edge on desktop.
- Increased preview scale in the right columns while preserving the existing single-column mobile layout.
- Verification: `cd client && npm run build` passed; Vite still reports the existing large chunk warning.

# Billing + Payments Implementation — 2026-06-25

- [x] Make Stripe checkout and customer portal talent-only.
- [x] Stop granting Studio+ before Stripe confirms checkout.
- [x] Replace fragile subscription update logic with webhook-safe upsert/sync helpers.
- [x] Normalize Studio+ pricing to $9.99/month or $95.88/year with a 14-day trial in app settings and landing copy.
- [x] Remove agency self-serve billing affordances and unused agency Stripe client methods.
- [x] Route app upgrade CTAs to the talent billing surface instead of dead `/pricing` paths.
- [x] Route landing Studio+ CTAs to the app billing/onboarding handoff without pricing drift.
- [x] Preserve the landing Enterprise/contact-sales agency offering while keeping agencies out of app Stripe billing.
- [x] Run focused backend tests and frontend/landing checks.

## Review

- Stripe routes now require `TALENT` only; agency app UI/API no longer exposes customer portal or checkout helpers.
- Checkout creation requires billing disclosure acceptance, supports monthly and annual Studio+ intervals, and no longer creates a local trialing subscription before Stripe confirmation.
- Stripe success/webhook flows upsert subscriptions from Stripe payloads and ignore unknown or non-talent customers, keeping entitlement sync tied to Stripe state.
- App settings and onboarding use the required disclosure modal with monthly/annual selection; active subscription display derives monthly vs annual from the stored Stripe price ID.
- Landing pricing keeps Free, Studio+, and Enterprise/contact-sales; Studio+ amounts and CTAs are centralized in `pholio-landing/lib/marketing-pricing.ts`.
- Verification passed: `node --check` on touched backend billing modules; `npx jest tests/stripe-resolve-price.test.js --runInBand`; `npx jest tests/stripe/billing-disclosure.test.js --runInBand` outside sandbox for Supertest listener; focused client ESLint; client Vite build; landing Next build with NVM PATH.
- Landing ESLint itself is still blocked by an existing ESLint 10 / Next config circular-reference loader error, so build/TypeScript was used as the landing verification gate.

# Billing + Payments Audit — 2026-06-25

- [x] Inventory pricing, billing, Stripe, subscription, trial, and entitlement surfaces across `pholio-app` and `pholio-landing`.
- [x] Audit current pricing truth and copy consistency against Studio+ at $9.99/month with a 14-day free trial.
- [x] Audit app/backend Stripe integration, webhook handling, subscription state, and gated access.
- [x] Map the landing-to-app user flow for new and existing users.
- [x] Identify production gaps, risks, and broken assumptions.
- [x] Produce a practical implementation plan for a durable billing foundation.

## Review

- Audited `pholio-landing` pricing/copy/CTA surfaces and `pholio-app` backend, client, routes, migrations, settings, and entitlement checks.
- Main production blocker: app creates a local `trialing` subscription and syncs `profiles.is_pro` during checkout-session creation, before Stripe confirms checkout.
- Additional blockers: subscription update helper uses mismatched camelCase keys, guesses ID type by string length, and webhook paths do not reliably attach/update the local subscription row.
- Pricing drift: landing shows `$9.99/month` plus a yearly `$7.99/month` option; app settings still displays `$29/month`; legal copy is generic and one Studio+ page says no card is required.
- Cross-repo drift: landing Studio+ CTAs go to `app/signup?plan=studio`, not an authenticated app billing surface; app upgrade CTAs often go to `/pricing`, which is not an app route.
- Verification: `npx jest tests/stripe-resolve-price.test.js --runInBand` passed, but current tests only cover price ID resolution.

# PITS Frontend Polish — 2026-06-24

- [x] Rewrite PITS-facing copy so it reads as Pholio studio intelligence, not backend taxonomy output.
- [x] Redesign the image review strip and frame captions with quiet editorial treatment.
- [x] Rename visible classification controls without changing backend payload fields.
- [x] Refine Digitals guidance copy and presentation to feel ambient and brand-native.
- [x] Run focused frontend lint and build verification.

## Review

- Replaced "Suggested / Confirm / photo type / sorting" UI copy with "Studio reads", "Reads as", "Frame read", "Framing", "Register", and "Use".
- Removed raw classifier reasoning from the review strip so backend analysis does not leak into the interface.
- Restyled the review strip as a quiet editorial band with restrained rules and thumbnail/copy hierarchy rather than a rounded suggestion card.
- Updated frame captions, completion toasts, timeout copy, editor controls, and legacy metadata modal labels to use the same Pholio-facing vocabulary.
- Changed Digitals guidance from "suggestions" and "tag" language to calm refinements.
- Follow-up correction: removed the gold wash around Studio reads, replaced repeated "Later" actions with a close icon plus one per-frame "Hold" action, moved cover/private states onto the image as icon marks, and turned frame reads into structured square-edged signal components instead of loose text.
- Follow-up correction: replaced the awkward right-aligned `Keep read / Refine / Hold` controls with an integrated square-edged decision rail under the read, using compact icons and a single primary action.
- Follow-up correction: removed explanatory row copy and redesigned the Studio reads item as a horizontal scanline: larger thumbnail, compact state label, signal rail, and right-aligned actions on desktop.
- Follow-up correction: removed `Studio reads` as a competing section and moved frame-read review rows inside the single `Digitals read` intelligence surface.
- Verification: focused ESLint passed for touched frontend files via `/Users/lenquanhone/.nvm/versions/node/v22.19.0/bin/node ./node_modules/eslint/bin/eslint.js ...`.
- Verification: client production build passed via `/Users/lenquanhone/.nvm/versions/node/v22.19.0/bin/node ./node_modules/vite/bin/vite.js build`; Vite still reports the existing large-chunk warning.

# Profile Index Simplification — 2026-06-24

- [x] Simplify the profile index header and remove descriptive copy.
- [x] Remove nested-scroll presentation from the index sidebar.
- [x] Fix active-section detection so Contact wins when it is the viewed section.
- [x] Run focused frontend lint for changed files.

## Review
- Header now reads "Index" with no intro copy.
- Left index no longer has its own `max-height` / `overflow-y` scroll behavior.
- Active-section tracking now scores the known profile sections against the `.tl-content` scroll viewport instead of accepting arbitrary `section[id]` observer order.
- Follow-up fix: the first pass listened to `window`, but talent pages scroll inside `.tl-content`, so the nav could stay stuck on the initial section.
- Verification: `/Users/lenquanhone/.nvm/versions/node/v22.19.0/bin/node ./node_modules/eslint/bin/eslint.js src/domains/talent/components/ProfileNav.jsx src/domains/talent/pages/ProfilePage/index.jsx` passed from `client/`.
- Verification: `/Users/lenquanhone/.nvm/versions/node/v22.19.0/bin/node ./node_modules/vite/bin/vite.js build` passed from `client/`.

# Profile Completeness Panel Polish — 2026-06-24

- [x] Replace the generic right-panel "Readiness" label.
- [x] Rewrite the profile-strength message copy and improve spacing from the progress bar.
- [x] Restyle the save action so it works on the light panel and still aligns with the shared Pholio button system.
- [x] Run focused frontend lint and build verification.

## Review
- Right panel title is now "Profile Signal" instead of the generic readiness eyebrow.
- Strong-package copy now reads as a Pholio-native agency signal, and the message has more separation from the progress bar.
- Save action keeps the shared `PholioButton` base but has light-panel scoped colors for unchanged and actionable states.
- Verification: focused ESLint passed for sidebar/profile files and `profileScoring.js`.
- Verification: `/Users/lenquanhone/.nvm/versions/node/v22.19.0/bin/node ./node_modules/vite/bin/vite.js build` passed from `client/`.

# Booking Lanes Product Model — 2026-06-24

- [x] Replace Market Positioning with Booking Lanes in the profile tab.
- [x] Add canonical lane taxonomy shared by client and server.
- [x] Add `booking_lanes` and `profile_booking_lanes` data model with legacy backfill from `modeling_categories`.
- [x] Expose `booking_primary_lane`, `booking_secondary_lanes`, and `booking_lanes` through the talent profile API.
- [x] Stop bio/scoring copy from treating Special Skills as booking lanes.
- [x] Update discover/embedding text to prefer booking lanes for market routing.
- [x] Run focused frontend lint, backend syntax checks, client build, and temp SQLite migration verification.

## Review
- Profile tab now presents a primary booking lane plus up to three secondary lanes, with explanatory copy distinguishing lanes from Special Skills.
- The backend stores lanes in a normalized join table while mirroring to legacy `profiles.modeling_categories` for compatibility.
- Bio writer no longer falls back from lanes to `specialties`; skills stay capabilities.
- Verification: focused ESLint passed for touched client files.
- Verification: `node --check` passed for touched backend modules and migration.
- Verification: `/Users/lenquanhone/.nvm/versions/node/v22.19.0/bin/node ./node_modules/vite/bin/vite.js build` passed from `client/`.
- Verification: temp SQLite migrate passed and confirmed 12 `booking_lanes` rows plus `profile_booking_lanes` table.

# Profile Index + Booking Lanes Restoration — 2026-06-24

- [x] Restore the simplified integrated index sidebar after external editor rollback.
- [x] Restore the Booking Lanes field treatment and spacing after external editor rollback.
- [x] Keep the later Booking Lanes cleanup: no "Define the briefs..." copy and no divider treatment.
- [x] Run focused frontend lint for restored profile files.

## Review
- Index sidebar is back to the simple "Index" heading, editorial active row, and no nested scroll container.
- Booking Lanes is back as a primary lane plus secondary lanes control, with the distinct skills-vs-lanes note preserved.
- Verification: focused ESLint passed for `ProfileNav.jsx`, `Section.jsx`, and `ProfilePage/index.jsx`.
- Verification: `/Users/lenquanhone/.nvm/versions/node/v22.19.0/bin/node ./node_modules/vite/bin/vite.js build` passed from `client/`.

# Agency Representation Section Redesign — 2026-06-24

- [x] Replace the basic segmented representation selector with a premium booking-path control.
- [x] Make the represented agency field feel like an agency record instead of a loose form field.
- [x] Refine previous representation as history, separate from current booking status.
- [x] Run focused frontend lint and client build verification.

## Review
- Representation now presents three deliberate paths: seeking representation, represented, and direct bookings.
- Active state uses restrained gold, editorial typography, and a clean icon treatment without status badges.
- Current agency only appears for represented talent and is grouped as an agency record.
- Follow-up correction: replaced the icon-card treatment with an integrated thin-rule selector so the section matches the rest of the profile tab.
- Follow-up correction: restored the Booking Lanes-style choice surface, fixed option text casing, and removed representation-specific form label/input overrides so `Agency name` and `Previous representation` use the standard profile form treatment.
- Verification: focused ESLint passed for `RepresentationSection.jsx` and `ProfilePage/index.jsx`.
- Verification: `/Users/lenquanhone/.nvm/versions/node/v22.19.0/bin/node ./node_modules/vite/bin/vite.js build` passed from `client/`.
- Latest verification note: focused ESLint still passes for `RepresentationSection.jsx`; a fresh full client build is currently blocked by an unrelated syntax error in `client/src/domains/talent/pages/ApplyPage/ApplyExperience.jsx:546`.

# Apply Experience Redesign — Premium submission flow (2026-06-22)

Replace the clunky, form-like talent→agency apply flow with a dedicated, non-modal,
immersive **submission experience** (curating & sending a package, not filling fields).

## Direction (confirmed by user: "Your decision. Build fresh components.")
- Flow: immersive, one focus per scene — Address → Curate → Voice → Send → Arrival.
- Scope: production-ready. Codebase: fresh components, reuse API + hooks + routing.
- System: Pholio Talent Studio (Noto Serif Display, pill buttons, pressed-paper fields,
  spring motion, image-first, cinematic arrival); `--app-*` palette for continuity.
- Fix old ApplyWorkspace violations: no `app-kicker` eyebrows, no `01/02` markers,
  no dense readiness tables, no toast-only completion.

## Build
- [ ] pages/ApplyPage/ApplyExperience.jsx (orchestrator + scenes + motion)
- [ ] pages/ApplyPage/ApplyExperience.css (standalone talent styling)
- [ ] pages/ApplyPage/index.jsx → render ApplyExperience
- [ ] delete superseded components/ApplyWorkspace.jsx

## Preserve: agency select + ?agency= preselect, exclude applied; media-set + image
include/exclude; comp-card choice + live CompCard; readiness gate (headshot/full-body/
measurements/contact); digitals advisory; monthly limit + upgrade error; note ≤1200 +
consent; profile gate; empty/error/loading/arrival states; prefers-reduced-motion.

## Verify
- [x] cd client && npm run lint (scoped); build green.
- [ ] walk the flow live (auth-gated SPA route — pending a logged-in session).

## Course-correction (user feedback)
- First pass invented a new aesthetic (ambient gold "aura", pill buttons, immersive
  `--apx-*` scenes). User: **"wrong, never use again. Use the /applications design
  philosophy. Make it full screen."** Saved to memory:
  feedback_apply_uses_applications_language.
- Rebuilt in the editorial-ledger language: reuses `ApplicationsView.css` (`.app-*`
  classes, `--app-*` tokens, cream canvas), `PholioButton` (solid/secondary), serif
  weight-300 titles, `app-kicker` mono micro-labels, `app-agency-option` list,
  `app-application-package`, `app-package-readiness`, `app-submit-success` arrival.
  CSS-entrance scene transitions (no framer/spring). `ApplyExperience.css` now only
  adds the full-screen frame, curation gallery, and quiet mono waypoints.
- Full screen: route moved OUT of `DashboardLayoutShell` to a standalone route (like
  `/reveal`), so no sidebar/topbar chrome.
- Flow: Address → Curate → Send (+ arrival). Note+consent folded into Send.
- Second pass feedback: selected agency address scene still reads dull and too
  top-heavy. Fixes required: remove the Open status dot entirely, reduce mast
  dominance, integrate website as an icon action beside agency identity, make
  location core identity, compose the logo intentionally, redesign "What this
  house looks for" as a Pholio Intelligence fit surface, fix open-agency row
  vertical clipping, and make `?agency=` Compose land in a focused single-agency
  experience with no Apply New/sidebar framing.

---

# Comp Card Production Audit + /media Surface Rebuild (2026-06-12)

Report: docs/comp-card-production-audit.md. 283 PDF-domain tests green
(incl. new 8-scenario audit battery); app.test.js still only the 4
pre-existing failures.

- [x] Audit (3 lenses) via 7-case real-world matrix (men/kids/long-name/
      1-2 images/no stats/no dims) + visual inspection + code review
- [x] CRITICAL fixes: long names clipped (3-stage fit: tracking → stacked
      two-line name → 12pt floor; CI fit-math invariant); single-image
      empty back page (hero reuse at any deficit); dead stats carving when
      no stats (stats.skip); production URL safety (printed/annotated link
      from config.appUrl, never the Puppeteer request host); kids guardian-
      contact labeling; compact 4-stat front line (no more ellipsis)
- [x] Audit battery locked in CI: __tests__/audit-regression.test.js
- [x] /media rebuild: CompCard.jsx scrapped manual controls (finish/themes,
      layout family — which silently routed users to the CLASSIC engine —
      shuffle, lead/support locks). New: previewer kept with a proper
      composition veil (one gold ring, no copy), "This design" panel with
      voice summary + booking note (new ?meta=1 JSON on the view route,
      deterministic), engine-driven "Strengthen the card" notes, New
      direction (seed), Download. Lint + vite build green; verified live in
      the running SPA (screenshot; dev session redirects away from /media
      after ~7s — pre-existing route-guard behavior, not the component).
- [x] FULL remediation (all severities, same day): ?print=1 bleed export
      (5.75×8.75, imagery extended through the bleed, RGB by design);
      photo-staleness guardrail + /media note; brief persistence
      (profiles.pdf_design_brief, input-fingerprinted — stable
      regeneration); ai-advisor.js removed; upload-time dimensions +
      forensics (incl. attention focal) into image metadata
- [x] TYPOGRAPHY-PLACEMENT SAFETY (production blocker):
      composition/type-safety.js — on-image text requires contrast +
      quiet-zone + protected-subject verification (focal-derived face zone,
      backdrop-deviation subject mask); unverifiable imagery never carries
      on-image type; full bleeds demote to floated when no band passes;
      stat line + wordmark obey the same rules; composed-type-safety ERROR
      guardrail; 10-test suite; 280 PDF-domain tests green; print/normal/
      meta verified live

---

# Apple Wallet Identity Pass — Design Lock (2026-06-12)

- [x] Research verified against Apple docs: pkpass anatomy + signing
      (manifest SHA-1 → PKCS#7 with Pass Type ID cert + WWDR G4), GENERIC is
      the correct style (icon/logo/thumbnail only — no strip/background;
      thumbnail 90×90pt clamped 2:3–3:2), Add-to-Wallet badge rules
      (official artwork only, 0.1X clear space, secondary placement),
      distribution (application/vnd.apple.pkpass), update web service (five
      /v1 endpoints, ApplePass auth, empty-payload APNs to pass-type topic
      using the pass cert), passkit-generator as the Node library.
- [x] Product spec: docs/wallet/apple-wallet-spec.md — Pholio Identity Pass
      as derived state of the profile (issue → auto-update → void), data
      model (wallet_passes / wallet_devices / wallet_registrations), backend
      surface (src/domains/wallet/), reuse of stats-formatter + photo
      intelligence focal crop + booking block + /p/:slug short link, share
      tokens, rollout M1–M4, open questions for lock.
- [x] Visual prototype: docs/wallet/prototype/wallet-prototype.html —
      pass front (faithful generic geometry, ivory/ink/gold), pass details
      view, dashboard Identity Pass module with badge placement.
- [ ] Implementation (M2+) after design lock: certs, pass-builder/signer,
      web service endpoints, APNs fan-out.

---

# Comp Card v3.2 — Premium Polish Pass (2026-06-12)

- [x] Booking parity: buildBookingBlock → { mode, label, primary, line };
      "Representation / Agency Name / contact" and "Direct Bookings /
      strongest channel / rest" share one typographic hierarchy — direct
      talent is never a lesser fallback. Footer raised to 0.46in so the
      three-line block owns its box (was overflowing onto the photo).
- [x] Wordmark: ↗ arrow removed — gold "PHOLIO" signature only; back keeps
      the tiny short-URL line as the intentional portfolio cue.
- [x] Crop system strengthened (subject presence): width loss >55% is now
      UNSAFE (was caution at 50%), >38% caution. Three-stage healing in the
      director: (1) swap in a benched image that fits the cell cleanly,
      (2) trade images between cells when both improve, (3) last resort —
      mat the image (object-fit contain on paper) so the whole subject
      survives. No unsafe crop can ship; every heal is logged.
- [x] Demo images gained real width/height — without dimensions every crop
      read "safe" and healing never engaged (real uploads always have dims).
- [x] 275/275 PDF-domain tests (healing exercised under 12 seeds with a
      hostile pool); visual verification: healed left cell, clean booking
      block, full figure intact.

---

# Comp Card v3.1 — Industry Audit Pass (2026-06-12)

Audit vs real comp card standards + fixes, built inline:
- [x] Back-story curation (photo-intelligence.curateBackStory): mandatory
      full-length first, ≤1 image sharing the hero's register, ≤2 per role,
      market-signal relevance bonus; director consumes the curated story
- [x] Representation/booking: route loads agencies.name via
      profiles.partner_agency_id → "Represented by X" line; freelance gets
      BOOKINGS framing; guardrail warns when no booking path exists at all
- [x] Gold wordmark (brand rule): bright #C9A55A over dark imagery, deep
      #A6845C on paper — never monochrome
- [x] Portfolio access cue: "PHOLIO ↗" lockup + tiny human-readable short
      URL line on the back (works for link annotation, NFC, and OCR/Lens)
- [x] Dynamic logo placement: four corners scored by forensics corner quiet,
      gold-contrast feasibility, interference with name/stat geometry; brief
      gains wordmarkCorner (schema field) with engine veto power; link
      annotation rect follows the placed corner automatically
- [x] Bugs found by visual audit + fixed: name overflow/clip (glyph advances
      recalibrated +10-15%, span cap 0.85, 0.95 safety factor, on-image band
      constrained inside floated heroes, nowrap); full-length losing feet
      (solver reserves a column at the figure's own aspect; assignment pins
      FL to nearest-aspect tall cell; maxCellsFor float-boundary epsilon)
- [x] 274/274 PDF-domain tests; visual verification of the final card

---

# Comp Card Atelier v3 — Authored Intelligence Layer

Spec: `tasks/comp-card-atelier-spec.md` (v3 addendum). Built inline 2026-06-12.

- [x] Research: Groq live model audit (this account) — strict json_schema
      constrained decoding ONLY on openai/gpt-oss-120b + gpt-oss-20b;
      brief verified live at ~1.7s; schema axes must be 0–100 integers
- [x] composition/font-library.js — 10 curated families with weights +
      glyph-advance metrics; 7 pairing voices with tone-affinity casting,
      kids vetoes, fontsCssUrl builder (12 tests)
- [x] composition/contrast.js — measured band luminance → ink choice, solved
      scrim strength (WCAG 4.5:1 targets, worst-cell math), 'relocate'
      verdict for unrescuable bands (7 tests)
- [x] composition/art-director.js — gpt-oss-120b strict-schema design brief
      (voice, tone axes, treatment, statsSide, frontStatLine, bleedAppetite,
      hero); field-level validation + null-on-failure (12 tests incl. mocked
      transport)
- [x] Rewired: design-language adopts brief tone/voice (kids clamps +
      frontStatLine legibility veto hold); solver takes treatmentPreference/
      statsSide/bleedAppetite; director runs contrast control over the name
      band (safe/scrim/relocate incl. opposite-band retry + paper fallback);
      template renders solved scrim alpha + library fonts; index.js swaps
      ai-advisor → art-director (same env gating); advisor token bound fix
      carried over
- [x] Verification: 260/260 PDF-domain tests; live brief authored
      (editorial-serif/floated/stats-right) and visible in the rendered PDF;
      links/metadata intact; app.test.js still only the 4 pre-existing fails

---

# Comp Card Atelier (engine v2) — Build Plan

Spec: `tasks/comp-card-atelier-spec.md`. Direction: kill the template feel —
parametric design space driven by talent data (image pixels via forensics,
generative partition layouts, continuous tone vectors); stats default to the
back (front line only under researched rule); premium portfolio link
(pdf-lib wordmark annotation for digital, /p/:slug short URL for NFC/QR).

### Phase 0 — Research ✅
- [x] Stats-on-front conventions + parametric design principles (agent
      stalled; conclusions closed from round-1 research + standards)
- [x] Link tech verified empirically: Chromium PDFs have NO link annotations;
      pdf-lib 1.17.1 post-processing works (installed); qrcode lib present

### Phase 1 — Spec v2 ✅

### Phase 2 — Wave 1 (built inline by orchestrator — subagents hit the
### account session limit; same for all later phases)
- [x] WS-F image-forensics.js (luma/detail 9×6 grids, quiet-band scores,
      ≤5-color palette, warmth/contrast; fail-soft, bounded concurrency;
      10 tests)
- [x] WS-G layout-solver.js (seeded recursive partition with jittered
      ratios, stats carved as partition member, left/right page bleeds
      applied before assignment, full-length → tallest cell; front geometry
      with quiet-band name placement; validateLayout invariants; 15 tests
      incl. 50-seed property run)
- [x] WS-I portfolio-link.js (pdf-lib wordmark URI annotations with
      inch→point conversion, merge-not-replace, metadata; dark-ink-enforced
      subtle QR ≥0.45in; /p/:slug 302 + analytics; generator header-driven
      post-processing; 10 tests)

### Phase 3 — Wave 2
- [x] WS-H design-language.js (continuous toneVector from archetype scores +
      casting text + category; type-ratio register; name size SOLVED from
      band geometry; palette accent derived from hero pixels with sat ≤0.38 +
      WCAG ≥4.5:1 clamps; researched front-stat-line rule P≈0.15; 14 tests)
      + director v2 (solver pipeline, v1 enums deleted, deterministic
      fallback layout; 23 tests) + template v2 (absolute inch geometry,
      scrim-only legibility, wordmark lockup both pages) + route wiring
      (forensics fetch/caching incl. in-memory cache, wordmark/portfolio/
      title headers, offline in tests)

### Phase 4 — Orchestrator verification
- [x] PDF domain 230/230 green; app.test.js back to only the 4 pre-existing
      failures (advisor token-bound test updated deliberately: 500 starved
      the reasoning model — json_validate_failed in prod — now 1400)
- [x] Live render seeds alpha/bravo/charlie → three structurally distinct
      cards (bleed cell + stats column / stacked rows / tall column + stats
      strip; floated vs full-bleed fronts; forensics-driven light-ink name
      in the hero's dark quiet band)
- [x] Generated PDFs verified: 2 pages, Title/Author/Subject metadata,
      clickable PHOLIO wordmark annotation on BOTH pages → /p/elara-k;
      /p/:slug 302s to the portfolio (unknown slug → /)
- [x] Visual inspection of both seeds confirms agency-grade output

---

# Comp Card Composition Engine — Build Plan

Spec: `tasks/comp-card-composition-spec.md` (module contracts — source of truth)

## Orchestration

Supervisor-style multi-agent build. Orchestrator (main session) owns the spec,
delegates workstreams, integrates, verifies.

### Phase 0 — Research ✅
- [x] Industry research: comp card print specs, front/back conventions, exact
      stats formats per category, crop rules, agency typography norms
- [x] Codebase recon: existing generator/selector/style-engine/guardrails,
      profile + image schema, Groq casting analysis fields

### Phase 1 — Spec ✅
- [x] Write architecture spec with strict module contracts

### Phase 2 — Parallel specialist workstreams (disjoint files)
- [x] WS-A stats-formatter: `composition/stats-formatter.js` + 51 tests
- [x] WS-B photo intelligence: `composition/photo-intelligence.js`,
      `composition/crop-engine.js` + 49 tests (sharp attention focal verified)
- [x] WS-C composition director: `composition/composition-director.js`,
      `composition/grid-catalog.js` + 38 tests (agent stalled twice;
      orchestrator audited draft, fixed true-full-body vs three_quarter
      distinction via rawShotType, wrote tests)
- [x] WS-E AI advisor: `composition/ai-advisor.js` + 13 tests (mocked Groq)
- [x] Full PDF domain suite green: 183 tests / 10 suites

### Phase 3 — Integration workstream
- [x] WS-D: `composition/index.js`, `templates/compcard-composed.ejs`,
      `routes/pdf.js` engine switch (default composed, `?engine=classic`
      escape hatch + classic fallback on composed failure),
      `generator.js` param forwarding, extended guardrails, 13 integration
      tests (196 total in PDF domain)

### Phase 4 — Verification (orchestrator)
- [x] PDF domain + app comp-card tests green (198 passed; the 4 remaining
      app.test.js failures pre-exist this work — proven by stashing the PDF
      changes and re-running)
- [x] Fixed one regression I introduced: explicit `layoutFamily`/
      `styleVariant` query params now auto-route to the classic engine
      (they are classic-only controls; keeps preset UI + old links working)
- [x] Live verification: dev server, `/pdf/view/elara-k` → composed engine,
      focal-aware crops (headshot 50% 18%, full-length kept whole), dual-unit
      stats from legacy measurements fallback, no banned patterns
- [x] Real Puppeteer PDF generated and visually inspected: 2 pages,
      396×612pt (5.5×8.5in), 4.4MB; front hero + caps name, back trio grid
      with full-length anchoring the tall cell + side-column stats
- [x] Demo data upgraded: coherent female-model image set with shot_type/
      style_type so the demo exercises the intelligent path

## Review

- New layer `src/domains/pdf/composition/`: stats-formatter (51 tests),
  photo-intelligence + crop-engine (49), composition-director + grid-catalog
  (38), ai-advisor (13), index orchestrator + template + route integration
  (13). 196 PDF-domain tests green.
- AI (Groq) is advisory only: schema-whitelisted, hero clamped to within 15
  heroScore points of top, tone locked for kids, null on any failure.
- Known behavior: with GROQ_API_KEY set, same-seed re-renders can differ
  because live advice is an input. Tests/key-less environments are fully
  deterministic. Follow-up idea: persist advice per profile for stable
  regeneration.
- Orchestrator note: WS-C background agent stalled twice (watchdog); its
  draft was completed inline — fixed three_quarter-vs-full_length coverage
  distinction (raw shot_type is authoritative; derived role collapses both
  to full_body).

---

# Agency Sidebar Collapse Control Redesign

## Plan

- [x] Audit the existing agency rail collapse button and current dirty diff.
- [x] Rework the collapse affordance so it is part of the rail edge, not a floating attached button.
- [x] Tune expanded/collapsed, hover, focus, and mobile states against the command-center rail language.
- [x] Run focused lint/build verification for the touched client files.
- [x] Inspect rendered expanded and collapsed states.

## Review

- Lint passes clean on all roster and nav files. Rendered expanded state confirmed via headless screenshot — editorial portrait grid, always-open intel strip, workspace click tested (22 cards, no errors, workspace mounts).

---

# Premium Match Score Indicator

## Plan

- [x] Locate plain match score renderers across agency overview, talent panel, and full profile.
- [x] Create a reusable luxury match score badge with fixed sizing and dark/light/overlay tones.
- [x] Replace basic text indicators with the reusable badge.
- [x] Verify with focused lint/build and browser inspection where possible.

## Review

- Added `MatchScoreBadge` as the reusable premium agency match indicator.
- Replaced the basic text score in the Top Matches strip, incoming rows, talent drawer hero, and full profile hero.
- Verified focused ESLint, client production build, and local headless browser screenshots/geometry checks.
- Correction pass: removed the rounded/radial badge treatment entirely. The component now renders as a minimal editorial score mark with open typography and a thin gold rule, with no fill, border, radius, or box shadow.
- Final correction pass: stripped all visible match/tier labels. The score now renders as raw number only inside a sharp-cornered, thin-border, minimal rectangular frame.

---

# Agency Dashboard IA Refresh

## Plan

- [x] Audit the current agency dashboard sections against a modeling-agency workflow.
- [x] Reorganize navigation around the primary workflow: submissions, scouting, castings, and roster management.
- [x] Demote secondary surfaces so analytics and summary pages do not compete with daily work areas.
- [x] Collapse redundant or legacy navigation paths where possible.
- [x] Disable/bypass agency onboarding redirects on backend (require-auth middleware, auth routes)
- [x] Disable/bypass agency onboarding redirects on client (AgencySessionGate, AgencyLayout)
- [x] Remove the unused/broken agency onboarding route and imports in App.jsx
- [x] Verify route behavior and document the final IA review.

## IA Audit Notes

- Core workflow surfaces:
  - `Inbox`: primary submissions review workspace for screening applicants.
  - `Discover`: primary scouting surface for finding and inviting new talent.
  - `Casting`: active client-role pipeline for shortlisting and booking talent.
  - `Roster`: signed talent management and availability review.
- Secondary/supporting surfaces:
  - `Overview`: summary and alerts, helpful but not the main place work happens.
  - `Activity`: audit/history layer, supports follow-up rather than primary decision-making.
  - `Analytics`: performance reporting, useful for managers but not first-click workflow.
  - `Messages`: cross-cutting communication utility rather than a top-level workflow anchor.
  - `Settings`: agency administration.
- Redundant/misplaced/mislabeled surfaces:
  - `Boards`: overlaps heavily with `Casting` and reads like an internal product term instead of an agency workflow label.
  - `Inbox`: accurate mechanically, but too generic for agency submissions review.
  - `Discover`: understandable, but `Scout` is more aligned with industry language.
  - `Overview` and `Analytics`: currently over-promoted relative to actual day-to-day agency work.

## Review

- Restructured `agencyNav.js` into three groups: **Work** (primary workflow), **Roster**, **Agency** (monitoring + admin).
- Renamed "Applicants" → "Applications" (h1 heading + component internals); API call and CSS file paths preserved.
- Renamed "Discover" → "Scout" in nav label with `Telescope` icon (industry-aligned language).
- Primary workflow (Applications 14, Scout, Casting 8, Interviews) now leads the rail; Overview/Activity/Team/Analytics demoted to Agency section.
- Agency onboarding: `AgencySessionGate` has no onboarding redirect; `App.jsx` already has `<Navigate>` fallback for `/dashboard/agency/onboarding`; no stale route imports remain.
- Nav text confirmed via headless browser query: `['Applications', 'Scout', 'Casting', 'Interviews', 'Talent', 'Overview', 'Activity', 'Team', 'Analytics']`.

---

# Talent Dashboard Editorial Redesign (Phase 1)

## Plan

- [completed] Audit current talent shell + overview against `Brand Reference.html` and imported `pholio-talent-platform`.
- [completed] Redesign `TalentLayout` for stronger editorial hierarchy, contrast, and talent-native navigation language.
- [completed] Recompose talent overview first fold (hero + primary modules) with premium hierarchy and improved panel rhythm.
- [completed] Validate route/data behavior remains intact and run lint checks for changed files.
- [completed] Document implementation review notes and tradeoffs.

## Review

- Shell now uses a stronger editorial frame: branded lockup + identity line in topbar, wider talent-native left rail, and clearer tier/presence treatment.
- Overview composition is tightened: identity + status metadata, refined book taxonomy tags, renamed module language (`Readiness Board`, `Market Signal`), and explicit `Career Assets` preface.
- Data flow/routes were preserved; this pass changes structure and styling only for the overview experience and shell.
- `client` lint remains failing due to broad pre-existing issues across agency/onboarding/shared modules; no new lint errors were introduced in modified overview/shell files.

## Review (Pass 2)

- Rebuilt the overview into a functional surface: `Booking Queue`, `Submission Pulse`, `Profile Composition`, `Portfolio Surface`, `Career Assets`, `Market Board`, and `Activity Ledger`.
- Added richer operational density from existing data sources (`applications`, `agencies`, `auth profile/images/completeness`, and analytics summary/activity), while preserving existing routes and API contracts.
- Shifted focus from shell decoration to talent workflow orchestration: what to do next, where submissions stand, and what profile/composition gaps are blocking conversion.

---

# Polish Languages and Special Skills Input Fields

## Plan

- [x] Audit the current visual layout, markup, and styling of `PholioTagInput` (Special Skills) and `PholioMultiSelect` (Languages) in the browser/code.
- [x] Refine the typography, border radius, background, border, focus outline, and shadows for both inputs to ensure consistency with the premium Pholio Editorial Design System:
  - Labels should use uppercase typography (JetBrains Mono) with letter spacing.
  - Selected tags/badges (for both languages and special skills) should be polished: pill/capsule shape, elegant styling, custom colors, smooth hover states, and clear, stylish remove indicators.
  - Inputs should have consistent high-end borders, backgrounds, focus states (e.g. subtle shadow aura or gold line transition), and placeholders.
  - Polish the dropdown menu container, search input, hover states, and scrollbar in `PholioMultiSelect` to match the brand reference (smooth, floating, glassmorphism-adjacent, elegant typography).
- [x] Implement and test the changes in the React client.
- [x] Verify that there are no regressions, compile the client dashboard app (`npm run client:build`), and ensure it compiles successfully.

---

# Polish Custom Select Dropdowns

## Plan

- [x] Refine custom select dropdown list container styles, including glassmorphism backdrop-filters, custom shadows, and borders.
- [x] Introduce custom scrollbars using `--color-gold-400` highlights.
- [x] Polish dropdown selection option item hover states, adding a premium 3px horizontal translation (translateX slide) interaction.
- [x] Integrate option transition and keyframe fade/scale animations for a smoother entrance.
- [x] Verify build compilation works correctly.

## Review

- Dropdown containers are now fully polished, glassmorphic, and float with an elegant scale/translate entrance animation.
- Option hovers feature a subtle horizontal slide alongside active/hover states to enhance tactile feedback.
- Autocomplete active selection states are fully matched.

---

# Place of Birth and Nationality Data Normalization

## Plan

- [x] Create a robust world cities list with location hierarchies (City, State/Province, Country) for birthplace selection.
- [x] Update filterCities autocomplete match logic to support state/province fields.
- [x] Replace raw country names inside the Nationality list with proper demonyms (e.g. American, French).
- [x] Verify compilation builds cleanly.

---

# Onboarding (Casting Call) — Resilience Overhaul

End-to-end map agreed; sequencing Phase 0 (cleanup) + Phase 1 (persist into state machine), then Phase 2 (guided shell) + Phase 3 (honest scan).

## Phase 0 — Cleanup & truth (done)

- [x] Verify dead files with proof before deleting (corrected initial list — CastingRevealRadar/RadarChart are LIVE via RevealPage; kept).
- [x] Delete zero-reference client files: CastingReview.jsx, LuxuryCompletionPromptModal.jsx(+css), ProgressIndicator.jsx(+css).
- [x] casting.js: remove commented-out vibe + reveal routes, orphaned vibeSchema, unused zod import, never-called inferBuildFromPredictions (−253 lines net with Phase 1 additions).
- [x] Rewrite state-machine.js header to describe the real linear flow (entry→gender→scout→measurements→profile→done).

## Phase 1 — Persist into the state machine (done)

- [x] **Bug found + fixed:** gender step was client-only; server stayed at `gender`, so `scout/confirm` 403'd on `gender→measurements`. Added `POST /onboarding/gender` (idempotent) that persists gender and advances `gender→scout`.
- [x] `/onboarding/status` now returns persisted answers (gender, city, experience_level, measurements) + `step_data` for rehydration.
- [x] `useCastingGender` hook + wired CastingGender to persist before advancing.
- [x] CastingCallPage rehydrates local state from `/status` once on resume (no more empty gender/measurements after reload).
- [x] **Bug found + fixed:** Stripe checkout was nested behind redundant `/complete` await — a failed safety-net call stranded paying users. Decoupled checkout; `/complete` is now non-blocking. Stripped debug console noise.
- [x] Verify: server parses, client lints + builds, full state-machine sequence simulates green end-to-end.

## Phase 1.5 — Rewrote the regression net (done)

- [x] Rewrote `tests/e2e-casting-to-dashboard.test.js` to cover the real contract: entry→gender→scout(upload+confirm)→measurements→profile→done, plus /status resume assertions (gender, measurements, predictions). **13/13 passing** in isolation and `--runInBand`.
- [x] **Bug found + fixed (schema drift):** `analysis_status` / `analysis_error` / `photo_key_primary` were missing from `profiles` (migration `20250125000000` applied only partially), so `/casting/entry` 500'd against the DB — onboarding was broken, not just the test. Added idempotent corrective migration `20260603120000_add_missing_profile_analysis_columns.js` and ran it.
- [x] **Bug found (getState):** `getState()` dropped `predictions`, so AI estimates never reached /status for measurements resume. Added passthrough.
- [x] Session handling in the test: forward the entry `Set-Cookie` explicitly (cookie Domain=localhost vs supertest 127.0.0.1 would otherwise drop the session).
- Note: full `npx jest` shows 6 OTHER suites failing (app, overview-backend, agency-overview, date-debug, completeness, regression-dashboard) — these are PRE-EXISTING, caused by unrelated uncommitted working-tree changes from prior sessions; none reference the onboarding files I touched (verified).

## Phase 1.6 — Google-avatar Scout fix (done)

- [x] Fixed the real 500: scout upload now promotes the uploaded LOCAL photo to primary even when a remote Google avatar was seeded at entry, demoting the seed BEFORE insert to respect the `one_primary_per_profile` constraint.
- [x] Defense-in-depth in scout/confirm: if the primary is a remote seed (no `absolute_path`), fall back to the latest local upload instead of failing.
- [x] Test now seeds the Google avatar on purpose and asserts the local photo wins primary + confirm succeeds (regression guard). 13/13 green.
- Note: confirm's legacy disk-path fallback does `require("../../config")` which doesn't resolve — pre-existing, never hit on the happy path (absolute_path is always set now). Left out of scope.

## Phase 2 — Guided shell (in progress)

- [x] `CinematicStepRail` component + CSS: editorial dark rail — numbered gold nodes, completed→check, active→gold ring + pulse, filling gold hairline, clickable completed steps to jump back. Matches the cinematic design system.
- [x] Wired into CastingCallPage: rail shows on Identity→Portrait→Measurements→Details; thin top bar reserved for the entry/auth sub-progress.
- [x] Step-level Back control (top-left) across the rail steps (excl. first), client-side view change — safe because answers are persisted + rehydrated.
- [x] Replaced the jarring LIGHT-themed loading + error screens with on-theme cinematic dark ones.
- [x] Verified: lint clean, client build green, rendered a preview screenshot of the rail with the real CSS.
- [ ] Awaiting visual sign-off; potential polish: per-step Back vs internal sub-step Back interplay on Measurements/Details.

## Dev preview harness (done)

- [x] Dependency-free, dev-only onboarding review mode (declined LaunchDarkly — overkill for a temporary dev tool; offered to add later for staging/teammate flags).
- [x] `dev/onboardingPreview.js` (realistic seed + step/sub-step map + `?preview=` URL parser) and `dev/OnboardingDevPanel.jsx` (floating panel to jump to any step/sub-step).
- [x] CastingMeasurements/CastingProfile accept an `initialStep`/`initialProfileStep` (preview only); CastingCallPage seeds state, bypasses server gating, and remounts steps on sub-step change. All gated behind `import.meta.env.DEV`.
- [x] Verified: prod build clean AND panel/seed strings absent from the production bundle (fully tree-shaken — real flow untouched). Drove the live dev panel via puppeteer: jumped to Measurements→Review with seeded 33-24-35, rail + Back in context.
- Note: deep-link `?preview=` only renders frontend-only if the backend is up (the Vite proxy bypass for `/onboarding` ignores query strings); the panel itself works with or without the backend.

## Follow-ups / flagged

- [ ] Phase 3 (honest Scout scan + guaranteed predictions into measurements) not yet started.
- [ ] Remember to remove the dev preview harness (`dev/` folder + CastingCallPage wiring) before this ships, or keep it — it's inert in prod either way.
- [ ] Phase 2 (guided shell: labeled step indicator + Back nav + dark-theme loading/error) and Phase 3 (honest Scout scan + prediction guarantees) not yet started.
- [ ] Dev-only preview routes `TestPreview` / `CastingRevealPreview` left in App.jsx — reachable scaffolding, flagged not deleted.

---

# Center Onboarding Portrait Title Text

## Plan

- [x] Audit the CSS styling and markup for the portrait header in `CastingScout.jsx` (`{name}, show us your look` text).
- [x] Remove `whiteSpace: 'nowrap'` from the styling of `ThinkingText` in `CastingScout.jsx` to prevent it from failing to wrap and overflow.
- [x] Ensure that it is centered by verifying `.cinematic-question` styles and its wrapper elements.
- [x] Build the client and run tests to ensure no regressions.
- [x] Verify visually/code-wise.

- Audited `CastingScout.jsx` and found that the title element was styled inline with `whiteSpace: 'nowrap'` but restricted by a parent container with `max-width: 560px`.
- Restructured `CastingScout.jsx` so that the main `motion.div` is full-width block layout (`w-full`) instead of a flexbox container, allowing adjacent block margins to collapse naturally.
- Explicitly tightened margins on `ThinkingText` (`marginBottom: '1rem'`) and `CinematicDivider` (`marginTop: '1.5rem'`, `marginBottom: '2.5rem'`) to reduce excess whitespace between the text and the line.
- Wrapped the rest of the form components in a `<div className="pt-surface">` container so that the form layout remains restricted to `560px` as originally intended.
- Built the React client successfully and verified that the E2E onboarding tests pass.

---

# Remove Scrollbars from Top Matches Today and Talent Panel

## Plan

- [x] Create `.scrollbar-hide` utility class in `client/src/styles/utilities.css` for consistency and reusability.
- [x] Update `client/src/domains/agency/pages/OverviewPage.css` to hide the horizontal scrollbar on `.ov-strip` while keeping horizontal scrolling intact.
- [x] Update `client/src/domains/agency/components/TalentPanel.css` to hide the vertical scrollbar on `.tp-body` while keeping vertical scrolling intact.
- [x] Compile the client (`npm run client:build`) to verify no compilation errors.
- [x] Document results in a Review section.

## Review

- Added a reusable `.scrollbar-hide` utility class inside `client/src/styles/utilities.css`.
- Hidden the horizontal scrollbar of the "Top Matches Today" strip (`.ov-strip`) in `client/src/domains/agency/pages/OverviewPage.css` using modern browser-supported rules: `scrollbar-width: none` (Firefox), `-ms-overflow-style: none` (IE/Edge), and `display: none` for `::-webkit-scrollbar` (Chrome/Safari/Opera). Scrolling functionality remains perfectly functional.
- Removed the custom 5px vertical scrollbar UI for the "Talent Panel" body (`.tp-body`) in `client/src/domains/agency/components/TalentPanel.css` using the same browser-agnostic rules, ensuring clean and smooth vertical scrolling with zero visual clutter.
- Built the React client successfully (`npm run client:build`), confirming zero compilation issues.

---

# Refactor Agency Textareas to Match Talent "About You" Style

## Plan

- [x] Create the `.agency-textarea` utility styles in `client/src/styles/utilities.css`.
- [x] Refactor `.cp-note-textarea` inside `client/src/domains/agency/components/CastingPanel.css` to adopt the new style.
- [x] Refactor `.notes-textarea` inside `client/src/domains/agency/components/zones/zones.css` to adopt the new style.
- [x] Refactor `.board-modal-field textarea` inside `client/src/domains/agency/pages/BoardsPage.css` to adopt the new style.
- [x] Refactor `.cas-form-group textarea` inside `client/src/domains/agency/pages/CastingPage.css` to adopt the new style.
- [x] Refactor `<textarea>` tags with blocky Tailwind styles in JSX components to use the new `.agency-textarea` style:
  - `client/src/domains/agency/components/NotesPanel.jsx`
  - `client/src/domains/agency/components/InterviewCard.jsx`
  - `client/src/domains/agency/components/InterviewScheduler.jsx`
  - `client/src/domains/agency/components/ReminderCreator.jsx`
- [x] Compile the client (`npm run client:build`) to verify no compilation errors.
- [x] Document results in a Review section.

## Review

- Created the `.agency-textarea` global utility class inside `client/src/styles/utilities.css` which exactly matches the premium, minimal, hair-bordered and spacious styling of the talent "About You" textarea on the profile tab (e.g. 2px border radius, 300 font weight, 1.7 line height, white background, subtle hairline border, custom gold active outline).
- Replaced blocky, heavy and administrative CSS styles for textareas across agency views in `CastingPanel.css`, `zones.css`, `BoardsPage.css`, and `CastingPage.css`.
- Swapped out the inline Tailwind classes on `<textarea>` components in `NotesPanel.jsx`, `InterviewCard.jsx`, `InterviewScheduler.jsx`, and `ReminderCreator.jsx` to adopt the `.agency-textarea` class.
- Successfully built the React client app (`npm run client:build`) to confirm compilation safety and check for regressions.
- Refactored the elements on the Talent Thread component (Conversation, Notes, Follow-up) inside `TalentThread.css`:
  - Composer container (`.tt-composer`) and composer input styles have been updated to match the premium, minimal hairline border and 2px border radius.
  - Follow-up container (`.tt-followform`) background and borders have been stripped away to be transparent with a clean bottom border divider.
  - Follow-up input fields (`.tt-field`) have been refactored to align with the same premium visual treatment.

---

# Remove Dot from Status Badge in Agency Talent Panel

## Plan

- [x] Add a `hideDot` prop support to `TalentStatusBadge.jsx`.
- [x] Pass the `hideDot` prop to `<TalentStatusBadge>` inside `TalentPanel.jsx` to hide the status indicator dot.
- [x] Build the client and run tests to ensure everything is correct and there are no regressions.
- [x] Document the change in the Review section.

## Review

- Added the `hideDot` boolean prop to `TalentStatusBadge.jsx`. When true, it conditionally prevents rendering of the `.ts-dot` element.
- Passed `hideDot` in `TalentPanel.jsx` to hide the status indicator dot inside the agency dashboard's talent detail panel.
- Successfully built the React client (`npm run client:build`) and ran the test suite.

---

# Swap Casting and Applicants Pages in Agency Dashboard

## Plan

- [x] Swap the file contents of `ApplicantsPage.jsx` and `CastingPage.jsx` to match their actual routing/naming expectations:
  - `ApplicantsPage.jsx` will contain the Candidate/Applicants Kanban Board (currently in `CastingPage.jsx`).
  - `CastingPage.jsx` will contain the Casting Briefs list (currently in `ApplicantsPage.jsx`).
- [x] Rename the exported component wrapper names inside both files:
  - Rename `CastingPageWrapper` inside `ApplicantsPage.jsx` to `ApplicantsPageWrapper` (or `ApplicantsPage`).
  - Rename `CastingPage` inside `CastingPage.jsx` to `CastingPage`.
- [x] Make sure that page route/imports inside `App.jsx` are correct (or verify if we need to adjust them to point to correct wrapper components).
- [x] Compile the client (`npm run client:build`) to verify no compilation errors.
- [x] Run end-to-end tests to ensure everything is correct.
- [x] Document the changes in a Review section.

## Review

- Swapped the file contents of `client/src/domains/agency/pages/ApplicantsPage.jsx` and `client/src/domains/agency/pages/CastingPage.jsx`.
- In the new `ApplicantsPage.jsx` (which has the Kanban Board code): renamed `CastingPageWrapper` and `CastingPage` to `ApplicantsPageWrapper` and `ApplicantsPage`, updating the default export to export `ApplicantsPageWrapper`.
- In the new `CastingPage.jsx` (which has the Casting Briefs list code): renamed/restructured default export to export `CastingPage`.
- Verified that default imports in `App.jsx` resolve correctly without any adjustments.
- Successfully built the client app and ran the test suite.

---

# Refactor global.css Leaking Input and Textarea Styles

## Plan

- [x] Modify `client/src/styles/global.css` to update the generic tag selectors for inputs (`input[type="text"]`, etc.) and `textarea` to use the premium, minimal styling with `border-radius: 2px` and thin subtle borders.
- [x] Update `textarea:focus` and input focus states in `global.css` to use the premium hairline gold ring focus instead of the heavy gold halo.
- [x] Build the client (`npm run client:build`) to verify no compilation errors.
- [x] Document results in a Review section.

## Review

- Refactored generic element styles inside `client/src/styles/global.css` to prevent leaking properties into SPA views.
- Changed generic `input[type="text"]`, `input[type="email"]`, `input[type="tel"]`, `select`, and `textarea` border radius to `2px` (from `999px` / `24px`).
- Set their default borders to thin hairline rules (`1px solid rgba(26, 26, 26, 0.08)`) and white backgrounds.
- Replaced the clunky focused state (`rgba(201, 165, 90, 0.65)` border with a `4px` gold halo shadow) with the premium minimal focus rules (`rgba(201, 165, 90, 0.5)` hairline border with a tight `1px` gold highlight shadow), ensuring inputs globally align with the talent dashboard's elegant "About You" design language.
- Checked client compilation safety via `npm run client:build` with zero bundle errors.

---

# Refactor Talent Action Bar in Agency Dashboard

## Plan

- [x] Modify `TalentActionBar.jsx` to group **Accept** and **Decline** buttons next to each other.
- [x] Change the **Decline** button from an icon-only button to a text button (e.g. "Decline" with an X icon) to match the "Accept" button.
- [x] Update `TalentActionBar.css` to prevent wrapping (`flex-wrap: nowrap`) and adjust padding/gaps to fit perfectly in a single horizontal line.
- [x] Update `TalentPanel.css` to increase the drawer width to `580px` (or suitable width) and adjust horizontal padding of the action strip to ensure all actions fit.
- [x] Compile the client (`npm run client:build`) to verify no compilation errors.
- [x] Run end-to-end tests to ensure all tests pass.
- [x] Document the changes in a Review section.

## Review

- Modified `TalentActionBar.jsx` to place the `Decline` button immediately after the `Accept` button within the pipeline context block.
- Promoted the `Decline` button to a standard text button with the label "Decline" and the X icon (removing its separate layout block at the end).
- Set `flex-wrap: nowrap` and `width: 100%` on `.tact-row` inside `TalentActionBar.css`, reducing gaps to `7px` and button padding to `0 12px` to fit everything horizontally.
- Increased the `.talent-panel` drawer width in `TalentPanel.css` from `524px` to `580px` and reduced horizontal padding on `.tp-action-strip` to `16px` to widen the usable space.
- Successfully built the client app bundle (`npm run client:build`) and ran the test suite.

---

# Audit global.css for Agency Dashboard Conflicts

## Plan

- [x] Scan `client/src/styles/global.css` to locate any style declarations or generic element overrides targeting the agency dashboard.
- [x] Audit conflicting styles against the design language of the overview tab and core dashboard shell.
- [x] Document the findings in a new Audit Report artifact (`global_css_audit.md`).

---

# Isolate global.css Styling Overrides for the Agency Dashboard

## Plan

- [x] Add class toggle for `.is-agency` on the body element inside `client/src/shared/layouts/AgencyLayout.jsx` during mount/unmount lifecycle.
- [x] Refactor generic selectors in `client/src/styles/global.css` for `button`, `form`, `label`, and `table` so they are disabled when the body has the `.is-agency` class.
- [x] Compile the client (`npm run client:build`) to verify no compilation errors.
- [x] Run E2E tests to ensure everything compiles and functions cleanly.
- [x] Document results in a Review section.

## Review

- Successfully toggled `.is-agency` on the HTML `<body>` inside [AgencyLayout.jsx](file:///Users/lenquanhone/projects/pholio-app/client/src/shared/layouts/AgencyLayout.jsx) via a mount/unmount `useEffect` cleanup hook.
- Refactored [global.css](file:///Users/lenquanhone/projects/pholio-app/client/src/styles/global.css) to scope all conflicting generic element styling overrides (`button`, `form`, `label`, `table`, inputs, select, textareas) with the `body:not(.is-agency)` selector namespace. This ensures that the original bubble/capsule designs remain active for the marketing pages and authentication/onboarding portals.
- Provided premium minimal styling for generic inputs, select elements, and textareas inside the agency dashboard under the `body.is-agency` selector namespace (aligning them with the 2px rounded corners and subtle hairline borders of the "About You" editorial input).
- Compiled the Vite React client build (`npm run client:build`) successfully with zero bundle errors.
- Verified that the core casting call / onboarding E2E test suite (`tests/e2e-casting-to-dashboard.test.js`) passes cleanly.

---

# Discover Semantic Search Backend

## Plan

- [x] Add `buildDiscoverIndexText()` + `discover_index` upsert in `embeddings.js`; export `isPostgresKnex`
- [x] Create `src/domains/agency/lib/intent-parser.js` with `parseIntentToFilters()`
- [x] Create `discover-search.js` with multi-vector fused retrieval, threshold, and browse fallback
- [x] Refactor `inbox.js` GET `/discover` to delegate to discover-search service
- [x] Wire `discover_index` re-index on profile save, groq-casting reveal, and vision analysis
- [x] Create `scripts/backfill-discover-embeddings.js` with rate limiting and `--dry-run`
- [x] Improve `seed-agency-demo.js` with diverse discover profiles + `profile_status: active`
- [x] Add `tests/integration/agency-discover-search.test.js` with mocked `embed()`

## Review

- Multi-vector fusion (0.6 text `discover_index` + 0.4 Scout image) with distance threshold (`DISCOVER_MAX_DISTANCE`, default 0.55).
- Server-side intent parser maps facets to SQL hard filters; full query string still embedded for soft/visual terms.
- Browse fallback on SQLite / missing API key with `meta.semantic_unavailable_reason`.
- `npx jest tests/integration/agency-discover-search.test.js` — 6 passed, 3 Postgres-only skipped on SQLite.








---

# Post-login premium loading screen (AuthEntrySplash rebuild) — 2026-06-09

Final direction (after user correction): dramatically minimalist. No checklist, no
status lines, no progress thread, no shell skeletons — shell *design language* only.
Single loader: the talent shell's gold sweep line translated into a circular spinner
orbiting the profile icon's border.

- Talent: ink #050505 + grain + faint gold glow; profile icon (116px) wrapped by the
  rotating gold sweep ring on a hairline track.
- Agency: cream #F7F3EC + grain + glow; Pholio serif wordmark | gradient divider |
  agency name lockup above the same icon + ring treatment (100px).
- Exit: splash crossfades (850ms) over the real shell mounted beneath; min display 1800ms.
- index.html: html background #050505 kills the white flash on the login → dashboard
  hard navigation.
- Helpers moved to domains/auth/lib/entry-identity.js (react-refresh lint).

## Review
- [x] entry-transition.js: min 1800ms, AUTH_ENTRY_EXIT_MS 850ms
- [x] useAuthEntryTransition: derived exiting state (React 19 hook lint compliant)
- [x] AuthEntrySplash.jsx/.css rewritten (minimal, one loader)
- [x] DashboardLayoutShell + AgencySessionGate: splash overlays mounted shell during exit
- [x] index.html background fix
- [x] Verified: eslint clean, vite build passes, Playwright screenshots confirm ring
      renders + rotates in both variants (/dev/preview/auth-entry)

---

# Agency Overview: MatchScore core, Today's Docket, Stronger Counts — 2026-06-10

Plan: ~/.claude/plans/ancient-jumping-willow.md

- [ ] Part 1a: Rename MatchScoreBadge → MatchScore (jsx+css, classes), export normalizeScore/resolveTier
- [ ] Part 1b: Roll out MatchScore to 10 render sites, delete one-off CSS, fix .ap-match mobile rule
- [ ] Part 2a: overviewData.js — delete attention/hero builders, add buildDocket()
- [ ] Part 2b: TodayDocket.jsx + ov-docket-* CSS
- [ ] Part 2c: Rewire OverviewPage.jsx; delete OverviewPulse.jsx, IncomingList.jsx + dead CSS
- [ ] Part 3: .ov-module-count → ink serif figure
- [ ] Verify: grep leftovers, client lint + build

---

# Front-Page Intelligence v4 — P1/P3/P4 (2026-06-13, multi-agent)

Proposal+status: docs/comp-card-frontpage-intelligence-proposal.md.
- [x] P2 core (prior): front-program/synthesize.js — design-program grammar,
      seeded sampler, negative-space placement, aesthetics scorer, signature.
- [x] P1 perception (agent): perception/text-metrics.js (opentype.js, real
      glyph metrics + estimate fallback), matte.js + faces.js (fail-soft
      stubs; heavy ONNX deps don't install in sandbox). Wired uploader →
      metadata → route matteById → composeCompCard.
- [x] P3 mask-dependent layers (inline): cutout structure gated on matte,
      matte-aware negative-space placement (fit-not-area maximal rect),
      knockout band; cutout proven via synthetic matte.
- [x] P4 vision jury MODULE (agent): front-program/jury.js (llama-4-scout,
      rubric, 0.6 vision/0.4 aesthetics blend, null-on-failure, 18 tests).
- [x] Wordmark consults program occupied rects (least-crowded corner).
- [x] 324 PDF-domain tests green (2 skipped); client lint/build clean;
      live renders verified (cutout, knockout, wordmark reposition).
- [ ] REMAINING: wire the jury into the live path (render K candidate PNGs →
      rank → final render); opt-in (latency + one Groq call/card). Bundle
      TTFs (@fontsource) to activate real opentype metrics. Install matte/
      face deps in a real env to light up cutout/behind-subject + exact faces.

---

# Comp Card v5 — Back-page architecture grammar + front fixes (2026-06-13)

Research: back pages run 3–9 photos, H/V, stats as column/band/integrated,
all front/back combos valid (Backstage, Sedcard24, models.com show packages).
- [x] back-program/synthesize.js — solveBackProgram: a GRAMMAR of back
      architectures (uniform-grid / feature-column / feature-row / mosaic /
      filmstrip / editorial-stagger / restrained-duo / high-density), sampled
      + parameterized, photo-set responsive (count from density; full-length
      anchors a portrait feature), emitting the SAME BackLayout contract so
      the renderer + crop-healing are unchanged. Director uses it (falls back
      to solveBackPartition → fixed layout).
- [x] Hard-won fixes: full-length never lands wide (portrait guarantee +
      bleed-AFTER-assign, never bleeding the FL cell — bleeds were widening it
      post-check); grids reject extreme-aspect/sub-MIN cells (3-full-height-
      columns made 0.15-aspect slivers that crop-healing matted into voids);
      density drives photo COUNT (restrained vs dense); float-epsilon on the
      MIN boundary.
- [x] Front fixes: split hugs the name to the photo seam (kills the #2 gap);
      photo-dominant tightened to near-full-bleed with a tight name strip
      (fixes #5/#6 dead space + weak positioning).
- [x] back-program.test.js (8 tests: ≥5 architectures, ≥10 signatures, 200-run
      validity incl. FL portrait, photo-set response, determinism). 332
      PDF-domain tests green; 6-card live batch shows feature-row / mosaic /
      uniform-grid / feature-column backs + filled fronts.

---

# Talent Profile Socials: OnlyFans Link — 2026-06-24

- [x] Replace the Website / Portfolio social card with OnlyFans.
- [x] Add persisted `onlyfans_url` profile field through migration, API, and validation.
- [x] Verify targeted UI/helper lint, backend syntax, diff whitespace, and local migration apply.
- [ ] Note: full client validation lint is blocked by pre-existing unused vars in `client/src/shared/lib/validation.js`; TypeScript schema is ignored by current ESLint config.

## Review
- Socials grid now renders OnlyFans in the former Website / Portfolio slot.
- Saving uses `onlyfans_url`, leaving existing public portfolio behavior untouched.
- OnlyFans card now has its own brand treatment instead of reusing portfolio gold.

---

# Talent Profile Tab: Remove Website Analytics + Index Redesign — 2026-06-24

- [x] Remove Studio+ website analytics section from the profile tab.
- [x] Remove the profile tab analytics hook/imports and dead derived metrics.
- [x] Redesign the left Profile Index as an editorial Pholio navigation surface.
- [x] Verify targeted lint, diff whitespace, and client production build.

## Review
- Profile tab no longer fetches or renders website analytics.
- Left index now has a serif title, contextual intro, vertical rule, and crafted active row styling.

# Contextual Readiness Narratives — 2026-06-24

- [ ] Spec reviewed and approved
- [ ] R1: Server templates + GET route (no Groq)
- [ ] R2: Groq polish + cache + invalidation hooks
- [ ] R3: Overview + sidebar UI
- [ ] R4: Dashboard API + monitoring

## Docs

- Spec: `docs/superpowers/specs/2026-06-24-contextual-readiness-narratives-design.md`
- Plan: `docs/superpowers/plans/2026-06-24-contextual-readiness-narratives.md`
- Depends on: PITS + Package Intelligence (`docs/superpowers/plans/2026-06-24-pits-package-intelligence-final.md`)

# Measurement Manual Entry Affordance — 2026-06-24

- [x] Add a native, low-clutter hint that measurement values support manual entry.
- [x] Preserve the existing double-click editing interaction.
- [x] Run focused frontend lint for the touched component.

## Review
- Added a muted inline pencil hint beside measuring tape values that reads "Double-click" and brightens on hover/focus.
- Left the existing double-click edit, blur commit, Enter commit, Escape cancel, drag, and scroll behavior unchanged.
- Verification: focused ESLint passed for `PholioMeasuringTape.jsx`.
- Verification: client production build passed; Vite still reports the existing large-chunk warning.

---

# Apply Draft Persistence — 2026-06-26

- [x] Harden the draft data model with a saved workflow position, schema version,
      optimistic concurrency version, client identity, and timestamps.
- [x] Validate and normalize draft payloads server-side, including owned media
      sets, image references, comp-card presets, current agency boards, and note
      limits.
- [x] Add authenticated draft read/write/delete APIs with explicit stale-write
      conflicts and test coverage.
- [x] Make final submission transactional so the application/package/message
      commit and obsolete draft cleanup succeed or fail together.
- [x] Persist every meaningful apply field, checkpoint on page navigation,
      auto-save after idle edits, and keep a local crash buffer subordinate to
      the server draft.
- [x] Restore the saved page and valid media choices on route re-entry; surface
      an explicit choice when a device-local recovery conflicts with a newer
      server version.
- [x] Add quiet Draft / Saving / Saved / Last saved / Save failed UI, explicit
      Save draft and Save and exit actions, and unload warnings only while
      critical changes are genuinely unsaved.
- [x] Audit refresh, tab close, device switch, back navigation, failed save,
      stale references, stale writes, and final submission with focused tests,
      lint, build, and migration verification.
- [ ] Complete browser visual QA when the in-app browser connection is available.

## Review

- Added a dedicated server-side draft aggregate that remains invisible to agency
  inbox queries, with workflow position, schema and concurrency versions, client
  identity, and authoritative save timestamps.
- Draft reads and writes normalize agency boards and talent-owned image sets,
  image IDs, digitals selections, and comp-card presets. Stale writes return the
  latest server representation instead of silently applying last-write-wins.
- The apply client now checkpoints page movement, auto-saves after 1.5 seconds
  idle, writes an immediate same-device crash buffer, restores the latest draft
  and saved page, and requires an explicit choice for divergent local/server
  versions.
- Header and footer UI expose Draft, Saving, Saved/Last saved, Save failed,
  explicit Save draft, and Save and exit states without badges, glass, or status
  dots. A 30-day-old draft gets a review reminder.
- Final submission validates canonical server-owned references and commits the
  application, package snapshot, first message, and draft deletion in one
  transaction. A changed draft version aborts submission without deleting it.
- Added `20260626180000_harden_application_drafts.js` because the original draft
  migration had already been applied. Verified the active SQLite migration
  ledger and actual columns after applying it.
- Verification passed: focused ESLint; backend syntax checks; client Vite build;
  3 application-draft integration tests including conflict and transactional
  submit; 9 submission-program regression tests; `git diff --check`.
- Browser visual QA could not run because the in-app browser connection rejected
  setup before a tab opened. No external browser fallback was used.

---

# Apply Draft UI Refinement — 2026-06-27

- [x] Remove the restored-draft banner and its dead state/styles.
- [x] Keep the compact draft status beside Save and exit at responsive widths.
- [x] Remove the footer Save draft action and its dead handler/styles.
- [x] Confirm displayed save timestamps use the browser's local timezone.
- [x] Run focused lint, build, and diff verification.

## Review

- Removed the restored/recovered draft banner, its state, component, and styles.
- The only persistent draft UI is now the compact status immediately left of
  Save and exit in the top-right workspace actions.
- Removed the footer Save draft action, handler, icon import, and styles.
- Mobile workspace chrome now reserves the right side for draft status and Save
  and exit, hiding the centered agency line when horizontal space is limited.
- Save timestamps use `Intl.DateTimeFormat` without a fixed `timeZone`, which
  converts the server's timestamp to the browser user's local timezone.
- Verification passed: focused ESLint, client Vite build, removed-UI scan, and
  `git diff --check`. Vite retains the existing large-chunk warning.

---

# Apply Draft Timestamp Correction — 2026-06-27

- [x] Trace the four-hour save-time shift to API timestamp serialization.
- [x] Parse timezone-less SQLite draft timestamps as UTC.
- [x] Add and run a regression assertion against the current instant.
- [x] Run focused syntax, test, and diff verification.

## Review

- Root cause was server serialization, not the browser formatter: SQLite stored
  `2026-06-27 03:16:32` as UTC, while Node parsed the missing offset as EDT.
- Draft timestamp mapping now appends `Z` only to timezone-less database values,
  while preserving `Date` objects and values with explicit offsets.
- Verified the affected draft now maps to `2026-06-27T03:16:32.000Z`, which
  formats in America/New_York as June 26 at 11:16 PM.
- Verification passed: backend syntax checks, 3 focused integration tests
  including a fresh-timestamp proximity assertion, and `git diff --check`.

---

# Apply Button System Redesign — 2026-06-27

- [x] Replace the round black Next button with a dedicated editorial treatment.
- [x] Give Back a coordinated lower-emphasis treatment.
- [x] Restore shell, board, submit, retry, chooser, and conflict actions to their
      original state after scope correction.
- [x] Verify the redesign selectors match only explicit Back / Next controls.
- [x] Run focused lint, build, and diff quality checks.

## Review

- The new geometry and restrained gold-outline treatment now applies only to
  `apply-nav-button--back` and `apply-nav-button--next`.
- Header Save and exit, Page 1 board selectors, submission, retry, chooser,
  conflict, and all other button variants are restored to their prior styling
  and behavior.
- Verification passed: targeted selector scan, focused ESLint, client Vite
  build, and `git diff --check`. Vite retains its existing large-chunk warning.
- Browser visual QA remained unavailable because the in-app browser connection
  rejected setup before opening a tab.

---

# Apply Draft Lifecycle Audit — 2026-06-27

- [x] Inventory the draft data model, APIs, client state machine, tests, and
      `/applications` integration.
- [x] Research current save/resume, unload, concurrency, retention, and explicit
      deletion guidance.
- [x] Exercise create, resume, update, conflict, abandon, delete, submit, expiry,
      and recovery paths without touching user-owned drafts.
- [x] Audit accessibility, failure recovery, observability, security, privacy,
      and multi-device behavior.
- [x] Produce a prioritized product/engineering/QA/UX findings report and an
      executable lifecycle test matrix with acceptance criteria.

## Review

- Full report: `tasks/apply-draft-lifecycle-audit.md`.
- Verdict: the server-backed save foundation is sound, but the lifecycle is not
  product-complete. `/applications` has no draft surface, delete has no UI or
  reliable contract, expiry is not implemented, and route-level resume makes
  `Apply New` ambiguous.
- Two release-blocking server boundaries were identified: final submission can
  omit the draft version and delete a newer draft, and final consent is not
  enforced server-side.
- Verified 3/3 existing draft integration tests, zero pending migrations, a
  successful client production build, and isolated delete/stale behavior with
  synthetic records only.
- Live browser, mobile lifecycle, production data, and PostgreSQL concurrency
  remain explicitly unverified and are covered by release-gate test cases in
  the report.

---

# Apply Draft Production Readiness — 2026-06-27

## Lifecycle contract

- Active drafts are server-authoritative, one per profile and agency, and use
  both an edit `version` and lifecycle `generation`.
- Every save, delete, recovery, and submit mutation is conditional. Stale
  clients receive the latest representation and never silently overwrite,
  delete, submit, or recreate another client's work.
- Delete is a seven-day recoverable soft delete. Deleted rows are tombstones;
  an old local copy cannot recreate them through PUT.
- Drafts expire after 90 days of inactivity, remain recoverable for seven days,
  and are then purged. Expired/deleted drafts never auto-resume.
- Final submit requires explicit consent, a current draft precondition, and an
  idempotency key. Conversion and draft retirement remain transactional.
- `/applications` owns draft discovery and management. Drafts are separate from
  submitted history and never affect submitted counts or monthly limits.
- `Apply New` always opens the agency chooser. Resume is always an explicit
  draft action.
- Browser-local data is a bounded crash buffer only. It is cleared on logout,
  account deletion, confirmed draft deletion, and expiry/recovery replacement.

## Work tracks

- [ ] Backend: add lifecycle columns/migration, list/delete/recover/purge
      semantics, mandatory conditional submit and consent, idempotency,
      canonical media validation, schema migration handling, private caching,
      export coverage, telemetry, and API tests.
- [ ] `/applications`: add separate draft section, accurate states/counts,
      explicit resume, delete confirmation, restore/undo, unavailable/expired
      handling, scoped errors, and `Apply New` chooser semantics.
- [ ] `/apply`: harden save durability, reconnect retry, in-app navigation,
      truthful Save and exit behavior, tombstone/expiry conflicts, consent
      invalidation, repair feedback, local-storage failure handling, and
      logout/account cleanup.
- [ ] Integration: reconcile shared API contracts and cache invalidation across
      all three tracks.
- [ ] Verification: apply migrations, run focused and full backend tests,
      frontend lint/build/tests, synthetic lifecycle probes, and document any
      browser/PostgreSQL limitations.

## Review

- Pending implementation.
