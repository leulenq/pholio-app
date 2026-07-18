# Agency Dashboard — Implementation Plan

Source: `tasks/agency-dashboard-audit.md` (audit on this branch).
Scope: `/dashboard/agency/*` frontend, `client/src/domains/agency/**`, `client/src/shared/layouts/AgencyLayout.*`, plus one small backend addition in Phase 3.

## Ground rules

- **Frozen DNA (do not restyle):** the shell (`AgencyLayout`), the rail (`RailNav`, `CoBrandLockup`, member footer), and the Overview's Today's Brief / module scaffold / Boards table composition. Compliance fixes listed below may touch these files but must not change their character.
- **Sanctioned exceptions (owner decision — keep as-is):**
  - The Overview lead figure gradient (`.ov-brief-figure`, `OverviewPage.css:29–41`) stays.
  - The MatchScore gradient numeral (`MatchScore.css:26`) stays.
- Every other item on the banned-UI list is enforced.
- All new/edited CSS uses `--ag-*` tokens; no new raw hex, no `--agency-*`, no Tailwind utilities in agency components.
- Agency motion: 150–250ms state transitions; no page-load choreography; `prefers-reduced-motion` fallbacks preserved.

## Decisions needed / made

| # | Decision | Recommendation | Status |
|---|----------|----------------|--------|
| D1 | Canvas color: tokens say `#FAF8F5`, shell ships `#F7F3EC` | Keep `#F7F3EC` (it is the shipped identity); update `agency-tokens.css` + `DESIGN.md` | Proposed |
| D2 | Analytics interim state | Wire to existing `getAgencyAnalytics()`; anything the endpoint can't provide renders an instructive empty module, never static numbers | Proposed |
| D3 | Reminders page | Keep a lightweight page (rebuilt) AND surface due reminders in Today's Brief | Proposed |
| D4 | Masthead unread indicator | Unread state = gold tint on the icon + count as plain text inside the dropdown header; no bubble | Proposed |

---

## Phase 0 — Truth & bans

### T1. Kill fabricated data and dead wiring
- [ ] **RosterPage.jsx**: delete `ROSTER`, `TALENT_BOARDS`, `TALENT_INSIGHTS`, `TALENT_STUDIO_PLUS`, `ROSTER_STATS`, and the Unsplash `u()` helper. Fetch via React Query → existing `fetchRoster()` (`api/agency.js:276`). Map real fields (name, archetype, city, measurements, images, status, last activity). Hero stats compute from the fetched list. Keep grid/list views and filters working against real fields; intent-parser chips only for fields that exist.
- [ ] **RosterPage.jsx**: remove the dead `Add Talent` button or point it at a real flow (Discover invite / open-call link). Bulk actions: hide any action not yet implemented instead of `() => {}` no-ops.
- [ ] **RosterWorkspace.jsx**: delete `getMockStats`, `getMockActivity`, `getPortfolioImages`, `ALL_BOARDS`, `BRANDS`. Load via `fetchRosterProfile(profileId)` (`api/agency.js:283`). Render only real data: portfolio images, boards, activity, notes, thread. **Remove commission/day-rate/booking-rate cards entirely** until a commissions API exists.
- [ ] **AnalyticsPage.jsx**: delete `SIGNALS`, `FUNNEL_DATA`, `VELOCITY_DATA`, `ROSTER_DATA`. Wire to `getAgencyAnalytics()` (`api/agency.js:132`) — verify its server shape first (`src/domains/agency/routes/`). Sections without real backing render an instructive empty state ("Signals appear once your pipeline has 30 days of activity"). Full redesign lands in Phase 3 (T10); this task only makes the page honest.
- [ ] **AgencyLayout.jsx**: compute the season label from the current date (`SS{yy}` Jan–Jun, `FW{yy}` Jul–Dec) instead of hardcoded `'SS26'`.
- [ ] **AgencyLayout.jsx**: back `NotificationsDropdown` with real data — map recent `useAgencyActivity()` items into notifications (title, meta, link, read state persisted locally). If judged out of scope, remove the bell rather than shipping a decorative one.
- Acceptance: no Unsplash URLs, no `getMock*`, no static analytics arrays, no hardcoded season anywhere in `domains/agency`.

### T2. Banned-pattern purge (excluding the two sanctioned gradients)
- [ ] `OverviewPage.css` `.ov-move` / `--urgent` / `--positive`: replace 2px left-stripes with full 1px hairline border + tone-tinted background (`gold-ghost` / `danger-dim` / `success-dim`).
- [ ] `RichRow.css`: `.ag-rich-row.is-selected` currently colors a 3px left stripe gold — remove the stripe; selection = existing `gold-ghost` background + 1px full gold-tinted border.
- [ ] `TalentThread.css:164`: 2px gold left border → background tint or 1px full border.
- [ ] `zones.css:407`: 3px gold left border → same treatment. Review `zones.css:207` (2px neutral) — if it functions as a structural divider keep at 1px, otherwise remove.
- [ ] `RemindersPage.css:135`: 3px danger stripe → superseded by T6 rebuild; if T6 slips, quick-fix to full border + `danger-dim` bg.
- [ ] **CastingPage.css / CastingDetailPage.jsx**: remove the `cd-new` corner chip on candidate photos → recency as plain text in the card body (`New · 2h ago`) and default sort newest-first. Remove `cd-statuspill` → plain text `Open` / `Closed` beside the close date, tone via text color only.
- [ ] **ApplicantsPage.jsx**: `ap-brief-pill` / `--mute` → plain text line under the brief title (`Open · 14 in pipeline`).
- [ ] `InterviewsPage.css` `.iv-lane-count` (bordered/filled bubble) → plain text count matching `ap-tab-count`'s treatment (already compliant). Check `tm-group-count` and normalize the same way.
- [ ] **AgencyLayout.css/jsx** `ag-icon-badge` (masthead count bubble) → per D4: gold-tinted icon when unread + count as text inside the dropdown; keep `aria-label` with the count.
- [ ] Delete dead banned components: `components/ui/TalentStatusBadge.jsx/.css`, `components/ui/TalentTypePill.jsx`, `pages/PlaceholderPage.css`, and the unused `components/Grainient.jsx/.css` (only `pages/Grainient.jsx` is imported, by DiscoverPage).
- [ ] `NotesPanel.jsx:196,207`: replace Tailwind `text-gray-600 bg-blue-50` / `bg-red-50` with `--ag-*` semantic tokens (`info-dim`/`danger-dim` + readable ink).
- Acceptance: detector run (`node .claude/skills/impeccable/scripts/detect.mjs client/src/domains/agency`) shows zero side-tab/gray-on-color findings and gradient-text findings only at the two sanctioned locations.

### T3. Route consolidation
- [ ] `App.jsx`: `/dashboard/agency/boards` → `<Navigate to="/dashboard/agency/casting" replace />`; delete `BoardsPage.jsx/.css` + lazy import.
- [ ] `App.jsx`: `/dashboard/agency/signed` → `<Navigate to="/dashboard/agency/roster" replace />`; delete `SignedPage.jsx/.css` + lazy import.
- [ ] Grep for internal links to `/boards` and `/signed`; repoint to the canonical routes.
- Acceptance: every remaining agency route is in `agencyNav.js`, is a detail view of one, or is reachable from the masthead (messages/settings).

**Phase 0 verification:** `cd client && npm run lint && npm run build`; manual pass through Overview, Casting (+detail), Applications, Roster, Interviews with the dev server; screenshot the touched surfaces.

---

## Phase 1 — One system

### T4. Token unification
- [ ] Make `client/src/styles/agency-tokens.css` the single source: fold in the shell variables from `AgencyLayout.css` `:root` (rail widths, ink, cream, rule) and delete that `:root` block.
- [ ] Resolve D1: set canvas token to the chosen cream; update `client/src/domains/agency/DESIGN.md` color table to match shipped values.
- [ ] Migrate all `--agency-*` usages (≈285, concentrated in `RemindersPage.css`, reminder components, `BulkActionToolbar`, etc.) to `--ag-*` equivalents; delete the `--agency-*` definitions once zero usages remain.
- [ ] Sweep page CSS for raw hex that duplicates a token (`#C9A55A`, `#16130D`, `#9b9082`, `#F7F3EC`…) → token references. New hex allowed only for values that genuinely aren't tokens.
- [ ] Move font loading from CSS `@import` (`AgencyLayout.css:5`) to preloaded `<link>` tags in `client/index.html`; remove the import.

### T5. Extract shared primitives (`components/ui/`)
- [ ] `PageMasthead` — serif title, optional sub-line, optional primary action slot. Adopt on: Applications, Casting, Casting Detail, Interviews, Roster, Team, Settings, Messages, Activity, Reminders, Analytics.
- [ ] `StatLedger` — the serif-figure stat row (tones: ink/gold/mute). Replace `ap-ledger`, `cas-ledger`, `iv-ledger`, `ro-hero-stats`, `tfv-ledger` and delete the five CSS copies.
- [ ] `ModuleHead` — serif title + count-as-text + hairline + quiet uppercase link (lift from `ov-module-head`). Reuse on Overview and all list sections.
- [ ] `LedgerRow` — the `ov-tr` grid-row vocabulary generalized (avatar/stack slot, primary cell, meta cells, trailing affordance) for Applications rows, Activity rows, Messages thread list, Reminders.
- [ ] `Skeleton` (row + card variants) — replace every text-string loader (`Loading applicants…`, `Loading casting boards…`, `tfv-loading`) and every spinner-in-content (Messages, Activity, ReminderList inline spinner).
- [ ] Enforce `AgencyEmptyState` / `EmptyErrorState` on every list surface (Applications, Casting Detail, Messages, Activity, Roster).

### T6. Re-skin the alien pages
- [ ] **Messages** (`MessagesPage.jsx/.css`): rebuild on `--ag-*` — thread list as `LedgerRow`s on cream (unread = ink weight, no dot), thread pane as white paper panel with hairline date rules, agency messages = alignment + warm tint (no dark bubbles, no `st-` grain). Composer uses the standard input vocabulary. Context header links to the application (`/dashboard/agency/talent/:applicationId`). **Fix behavior:** do not auto-select the first thread; mark read only when the user opens a thread.
- [ ] **Activity** (`ActivityPage.jsx/.css`): rebuild on the Overview `ActivityFeed` row vocabulary at page scale — day groups with small serif date headers, warm tones only (delete the emerald/indigo/cyan `ACTIVITY_STYLES` map and status-tag chips), quiet text filters (type / board), `Skeleton` loading. Extract the shared row so Overview and this page render one component.
- [ ] **Reminders** (`RemindersPage.jsx/.css`, `ReminderList`, `DueReminders`, `ReminderCard`): rebuild on `--ag-*` with `PageMasthead` + `LedgerRow`s; snooze/complete as quiet inline text actions; kill `pageEntrance 0.8s` and all `--agency-*` styling. Add a "Due today" beat source to Today's Brief docket builder (`overviewData.js buildDocket`) per D3.

**Phase 1 verification:** lint + build; visual diff pass on all re-skinned pages; grep asserts: zero `--agency-` references, zero `st-page-grain` in agency domain, zero CSS `@import` fonts.

---

## Phase 2 — Operational depth

### T7. Roster → "The Book" (builds on T1's real data)
- [ ] Grid card = comp card: portrait, small serif name, mono spec line (`Editorial · 178 · Paris`), availability as plain text (existing `AvailabilityCell` treatment). Remove insight pips/dots and the cold `STATUS_COLORS` map — warm semantic tones only.
- [ ] List view = measurement ledger: serif name, mono B·W·H column, last-activity recency in plain text (danger tone only when genuinely stale); sortable; virtualized (`@tanstack/react-virtual` or equivalent).
- [ ] Insights strip renders only computed-from-real-data signals (e.g., inactivity > 90d from real activity); otherwise render nothing.
- [ ] Workspace: keep the full-screen matrix; sections limited to real data (portfolio, boards, activity, notes, thread, measurements).

### T8. Applications → triage desk
- [ ] Ledger-as-tabs: `StatLedger` stats become the filter control (New / Shortlisted / New Faces / Signed / All); delete the separate 7-tab row. Counts as plain text within each stat.
- [ ] Board context: quiet select or text row replacing the double-counter chip strip; selected board's brief renders as a context band above the list (brief excerpt + "Where it stands"), replacing the collapsible `BriefRail`.
- [ ] Keyboard triage: J/K navigate, S shortlist, A sign, X pass, Enter open, `?` help — wire the existing `KeyboardShortcutOverlay`. Focus management on the row list; actions announce via toast (already present).
- [ ] Row actions: text labels on hover (`Shortlist · Sign · Pass`) instead of icon-only buttons with `title` tooltips.
- [ ] `Skeleton` rows + list virtualization; optimistic mutation updates for shortlist/sign/pass.

### T9. Casting Detail → the signature Kanban
- [ ] Ship the board view as a real Kanban: stage columns (New → Shortlisted → New Faces → Booked/Signed), @dnd-kit drag between stages calling `updateCastingApplicationStage` / `bulkUpdateCastingApplicationStage` (`api/agency.js:337,344`). Start from the unused `Kanban.css` / `KanbanCard` / `KanbanColumn` components — refactor to current data shapes or rewrite; delete whatever remains unused.
- [ ] Cards: flat, photo-led, plain inline text for type/score; gold only on the dragged/selected card. Column min-width 220px, 8px gap (per DESIGN.md).
- [ ] Keep the current grid as a "Book" view toggle; "Fit Briefs" tab unchanged.
- [ ] Per-stage counts as plain text in column headers.

**Phase 2 verification:** lint + build + `npm test` (root); manual drag-and-drop pass on the Kanban; keyboard triage walkthrough; virtualized lists checked at 200+ rows (seeded).

---

## Phase 3 — Polish

### T10. Analytics → "The Season Report"
- [ ] Backend: extend the agency analytics endpoint to return real aggregates — funnel counts by stage (from `applications`), stage-transition velocity (from `activities` timestamps), roster growth by month. New/extended route in `src/domains/agency/routes/` following existing patterns.
- [ ] Frontend: `PageMasthead` ("The Season") + range as quiet text tabs; one written lead insight in the Today's-Brief voice derived from the strongest real signal; funnel as a typographic ledger (serif numerals on a ruled line, plain-text conversion rates — no boxes/arrows/dot-badges); velocity as a ruled table with plain-text deltas; roster growth as the thin gold line on cream. Warm semantic tones only.

### T11. Type, contrast, motion, loading
- [ ] Label floor: raise 8.5–9px tracked labels to ≥10px across agency CSS; bump quiet meta from `#9b9082` toward `--ag-text-secondary` (`#6b6560`) where used at <12px. Verify 4.5:1 for body-size text on canvas.
- [ ] Motion audit: confirm no entrance animation exceeds ~250ms except Today's Brief; remove residual choreography; verify `prefers-reduced-motion` on every new animation. Rail `width` transition: acceptable if kept (it's structural and already `will-change`d), else move to a `grid-template-columns` transition on the shell.
- [ ] Responsive sweep at 1280 / 1024 (drawer) / 768: tables get an overflow strategy, `ov-grid-3` and settings console stack cleanly, Kanban scrolls horizontally within the page.
- [ ] Focus-visible audit: gold ring on every interactive element added in Phases 0–2; icon-only buttons all have `aria-label`.

**Phase 3 verification:** full manual pass of all agency routes; detector re-run (expect: sanctioned gradients only); lint, build, tests; screenshots archived.

---

## Sequencing & sizing

| Task | Size | Depends on |
|------|------|-----------|
| T1 truth purge | L | — |
| T2 ban purge | M | — |
| T3 routes | S | — |
| T4 tokens | M | T2 |
| T5 primitives | M | T4 |
| T6 re-skins | L | T4, T5 |
| T7 Roster book | L | T1, T5 |
| T8 Applications | M | T5 |
| T9 Kanban | L | — (after T2 touches Casting CSS) |
| T10 Analytics | L | T1, T5, backend |
| T11 polish | M | all |

Suggested PR slicing: **PR1** = T2+T3 (small, high-visibility compliance). **PR2** = T1 (truth). **PR3** = T4+T5. **PR4** = T6. **PR5** = T7. **PR6** = T8. **PR7** = T9. **PR8** = T10. **PR9** = T11.

## Review log

**Phase 0 — landed** (`f3351f9` ban purge + routes, `3b59e9c` truth purge + shell). Detector reached zero non-sanctioned findings; all fabricated data (mock roster, fake financials, static analytics, hardcoded season, decorative bell) removed or wired to real endpoints; /boards and /signed deleted with redirects.

**Upstream merge (`d8833e5`)** absorbed a parallel implementation stream (~46 commits): IA rename (Applications→Submissions, Casting→Signing), agency component kit (AgencyModal/Row/Skeleton/StatusText/FilterChips), roster on real data + roster_memberships tables, Booking Desk page, notifications wiring, money features stripped, RBAC hardening, CI workflow. Consequences for this plan:
- T7 (Roster book) — superseded: upstream rebuilt Roster on `fetchRoster` + React Query; RosterWorkspace deleted.
- T9 (Casting Kanban) — cut by the upstream launch scope (Kanban components deleted). Not resurrected; revisit only on explicit request.
- T10 (Analytics) — deferred by upstream scope (page removed from nav; backend funnel/velocity aggregates exist for a future rebuild).
- Both formerly sanctioned gradients (Overview lead figure, MatchScore) were removed/rebuilt upstream — left as shipped.
- Merge regressions re-fixed in `6212585` (hardcoded SS26 returned; cd-statuspill JSX restored without its CSS, rendering unstyled).

**Phase 1 — landed** (`e4dba22` tokens + fonts, `eb7ed61` re-skins). Single token source (shell :root folded in); D1 resolved with evidence — `--ag-surface-0 #FAF8F5` is consumed by talent/auth/moderation so it stays; `--ag-canvas #F7F3EC` documented as the agency shell cream. Fonts load once via index.html links (JetBrains Mono included); both CSS @imports removed. Messages/Activity/Reminders rebuilt in the editorial system on the new kit; Messages auto-mark-read bug fixed; legacy `--agency-*` alias family deleted after a zero-consumer grep (four runtime branding hooks + cross-domain font aliases kept).

**Phase 2 — landed** (PR5): Submissions rebuilt as a triage desk — the stat ledger is now the stage filter (gold hairline active state, plain-text counts; Represented folded into Signed, Passed/On-file in a quiet secondary row), board chips replaced by a select + context band linking to /signing/:boardId, J/K/S/A/X/Enter/?/Esc keyboard triage with visible gold-ghost selection and typing guards, text-labeled row actions, skeleton/empty/error states, and dependency-free incremental rendering (60-row windows via IntersectionObserver). T7/T9/T10 status above — remaining plan work (T9 Kanban, T10 Analytics rebuild, T11 polish sweep) is deferred pending owner scope decisions.

**T11 static sweep — landed (this session):** label floor raised — all 61 sub-10px tracked labels across 20 agency CSS files now ≥10px; every `#9b9082` quiet-meta literal replaced with `var(--ag-text-2)` (#6B6560, 4.5:1+ on canvas); the three >250ms entrance animations (AgencyEmptyState fadeIn, AgencyStatCard/AgencyCard cardEntrance, all 0.6s) cut to 0.22s with 6px offsets and `prefers-reduced-motion` blocks added; TalentActionBar icon buttons gained `aria-label`s and a `--agency-shadow-focus` focus ring. Static responsive audit: ov-grid-3 collapses at 1180/980/720, settings console at 860/720/560, tables carry `overflow-x: auto`. Verified separately: the remaining `var(--agency-*)` consumers are the intentional runtime branding hooks (defined in the shell `:root`, driven by `agency-branding.js` and onboarding inline styles), not orphans. Fresh-database launch bug fixed en route: `users.avatar_url` was selected by setup/inbox team queries and the seed but never migrated — added guarded migration `20260718090000_add_users_avatar_url.js`.

**Lessons:** (1) Backgrounded shell commands keep the session cwd — two concurrent npm installs collided; serialize installs and use explicit `cd` inside the command. (2) A merge that "prefers" one side can silently orphan CSS from the other — after any large merge, grep for restored class names whose rules were deleted (`cd-statuspill` rendered unstyled). (3) Parallel agents + strict file ownership works, but reserve global resources (package.json, token files, index.css) for the orchestrator.
