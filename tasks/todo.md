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
- [ ] Reorganize navigation around the primary workflow: submissions, scouting, castings, and roster management.
- [ ] Demote secondary surfaces so analytics and summary pages do not compete with daily work areas.
- [ ] Collapse redundant or legacy navigation paths where possible.
- [ ] Disable/bypass agency onboarding redirects on backend (require-auth middleware, auth routes)
- [ ] Disable/bypass agency onboarding redirects on client (AgencySessionGate, AgencyLayout)
- [ ] Remove the unused/broken agency onboarding route and imports in App.jsx
- [ ] Verify route behavior and document the final IA review.

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

- Pending implementation.

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









