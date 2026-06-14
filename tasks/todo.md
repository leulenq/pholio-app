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
