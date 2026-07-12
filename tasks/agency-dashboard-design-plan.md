# Agency Dashboard — Final Frontend Design Plan

**Date:** 2026-07-12
**Companion doc:** `tasks/agency-dashboard-audit.md` (the audit that found the problems; this plan is the design answer). Backend, security, and legal remediation are owned elsewhere and are **out of scope** here — this document assumes the APIs named in it exist or will exist per the audit roadmap.
**Design system of record:** `client/src/domains/agency/DESIGN.md` ("The Editorial Ledger"). This plan applies it; it does not replace it. Where this plan is more specific, this plan wins; where it is silent, DESIGN.md wins.
**Product constraint (owner decision):** no money anywhere — no commissions, fees, rates, billing, or earnings UI. Operational data only.

**The parity bar.** "Catch up to the talent dashboard" means matching its *craft*, not its voice. The talent studio earns trust with cinematic spring motion and staged reveals; the agency ledger must earn the same trust the opposite way — composure, density, immaculate states, and zero dead interface. Concretely, parity means: every surface reads real data or doesn't exist; every interactive element has all seven states (default/hover/focus/active/disabled/loading/error); every list has skeleton, empty, error, and zero-result treatments; every animation conveys state and has a reduced-motion fallback; nothing on screen is a stub, a "Soon" promise, or a scripted fake. A booker should never wonder whether the software is telling the truth.

---

## 1. Final information architecture

### 1.1 Navigation (the rail, final)

```
[Wordmark / agency co-brand lockup]

Overview                    /dashboard/agency

PIPELINE
  Submissions               /dashboard/agency/submissions      (rename of /applicants)
  Signing                   /dashboard/agency/signing          (rename of /casting; board pipelines)
  Interviews                /dashboard/agency/interviews
  Scout                     /dashboard/agency/discover

ROSTER
  Roster                    /dashboard/agency/roster
  Calendar                  /dashboard/agency/calendar         (new — Booking Desk)

ORGANIZATION
  Team                      /dashboard/agency/team
  Activity                  /dashboard/agency/activity

[collapse control after PIPELINE group — existing behavior, keep]
```

**Masthead (top bar), final:** page title zone (owned by each page) · search affordance where the page defines one · Messages icon · Notifications icon · Settings gear · member account chip. No count bubbles anywhere (see §4.9 for the unread treatment).

**Decisions:**
- **Rename "Applications" → "Submissions"** everywhere (nav, headings, empty states, toasts). Talent submit digitals to an agency; they don't file job applications. Route: add `/submissions`, keep `/applicants` and `/inbox` as redirects.
- **Rename "Casting" → "Signing"** for the current board-pipeline feature (its stages are Applied → Shortlisted → Offered → Represented → Passed — that is a signing pipeline). The word "Casting" is reserved for the future client-brief surface (audit §10.2) so it never lies to a booker. Route: `/signing`, redirect `/casting`.
- **Analytics leaves the rail** until it renders real data (audit P0-2). The route can 302 to Overview in the interim.
- **Reminders has no rail item.** It is a workflow, not a destination: due reminders surface in the Overview docket (§8.1) and in each talent's thread (already built in `TalentThread`). The `/reminders` route stays for deep links.
- **Boards (`/boards`) and Signed (`/signed`) routes are deleted** (superseded; audit P0-4).
- **Messages and Settings stay masthead-only** (current pattern, correct — they are cross-cutting, not pipeline stations).
- Nav permission gating stays exactly as built (`agencyNav.js` + `useAgencyPermissions`). Remove the dead `counts`/`countKey` plumbing.

### 1.2 Page inventory (final state)

| Page | Route | Status in this plan |
|---|---|---|
| Overview | `/dashboard/agency` | Refine (§8.1) |
| Submissions | `/submissions` | Refine + rename (§8.2) |
| Signing | `/signing`, `/signing/:boardId` | Refine + rename (§8.3) |
| Interviews | `/interviews` | Refine (§8.4) |
| Scout (Discover) | `/discover` | Protect; minor fixes (§8.5) |
| Roster | `/roster` | **Rebuild** (§8.6) |
| Talent workspace | drawer + `/talent/:id` | Consolidate (§8.7) |
| Calendar | `/calendar` | **New** (§8.8) |
| Messages | `/messages` | Refine (§8.9) |
| Team | `/team` | Keep; minor fixes (§8.10) |
| Settings | `/settings?tab=…` | Prune + refine (§8.11) |
| Setup | `/setup` | Keep as-is (§8.12) |
| Activity | `/activity` | Keep; unify CSS prefix (§8.13) |
| Analytics | `/analytics` | Deferred; design parked in §8.14 |

---

## 2. The shell

**Structure (keep):** deep-ink command rail (`ag-rail`) · content column with masthead (`ag-masthead`) + `<main>` on cream canvas. The rail is the only dark surface in the product — it frames the ledger.

**Additions:**
1. **Skip link** as the first focusable element: "Skip to content" → `#ag-main`. Visually hidden until focused; on focus it appears as a gold-ring pill at top-left of the masthead.
2. **Page-title contract:** every page renders exactly one `<h1>` in Playfair at the masthead tier (Display for Overview only; Headline elsewhere). Long agency/board names truncate with `clamp()` + `min-width: 0` (the lesson already learned in `tasks/lessons.md` — codify it).
3. **Content max-width:** 1560px, centered, `--ag-page-x` (40px) gutters; full-bleed only for the Discover hero and the Calendar grid.
4. **Density grid:** standard row height 56px; compact rows 44px; card grids `repeat(auto-fill, minmax(280px, 1fr))`; the ledger stat strip is a single 64px row of figures separated by hairlines — never a grid of stat cards (the hero-metric template is banned).

**Breakpoints (structural, not fluid type — product register):**

| Width | Shell behavior |
|---|---|
| ≥1440 | Full rail (labels), drawer panels 480px |
| 1200–1439 | Full rail; side panels 420px; 3-col grids drop to 2 |
| 1024–1199 | Rail auto-collapses to icon rail (existing `useRailCollapsed`, make width-aware); masthead search collapses to icon |
| 768–1023 | Rail becomes the existing hamburger drawer; drawers/panels become full-screen sheets; tables → stacked rows (§4.4) |
| <768 | Single column; masthead reduces to wordmark + hamburger + account; sticky page-level action bar at bottom where a page has a primary action |

The agency product is desktop-first by usage, but nothing may be *broken* below 1024 — the standard is "operable and legible," not "optimized."

---

## 3. Interaction model (cross-cutting, non-negotiable)

### 3.1 The selection model — one pattern everywhere
Clicking any talent anywhere (submission row, signing card, roster card, Discover result, docket item) opens the **TalentPanel drawer** (right side, 480px, Overlay LG shadow, scrim). The drawer is the quick-work surface: photos strip, stats, status, notes, tags, actions. "Open full profile" in the drawer footer navigates to the full-page talent workspace. Never navigate directly to the full page from a list click — the drawer preserves list context (scroll position, filters, selection). `DiscoverDetail`'s full-frame modal is the one sanctioned exception (image-first evaluation earns the bigger stage) and keeps its ←/→ candidate paging.

### 3.2 Bulk actions
Selection via row/card checkboxes (visible on hover/focus-within, always visible once ≥1 selected). A **selection bar** slides up from the bottom of the content area (not a floating pill): "{n} selected · Shortlist · Pass · Keep on file · Tag · Assign board · Clear". Bulk actions confirm only when destructive (Pass, Archive); everything else executes with an undo-toast (§3.5). Every bulk action must be wired or absent — no `() => {}` handlers survive this plan.

### 3.3 Modal policy
Modals are for **create** flows only: New board, Schedule interview, Add teammate, Add talent, New open-call link. Everything else is inline, a drawer, or a popover. All modals use **one primitive** (§4.6) with focus trap, Escape, scrim click, and focus-return. Confirmation dialogs are allowed for destructive/irreversible acts only (revoke link, archive talent, delete board) and must name the object: "Archive Sofia Marchetti?" never "Are you sure?".

### 3.4 Keyboard
- Everything clickable is focusable and Enter/Space-activatable (shared `useCardButton` hook — audit §12.2; this is the single highest-leverage a11y fix).
- Drawers/modals: Escape closes, focus trapped, focus returns to invoker.
- Lists: Tab reaches rows; Enter opens drawer. (j/k roving focus is a v2 nicety — defer.)
- `/` focuses the page's primary search where one exists (Submissions, Roster, Interviews, Discover).
- The dead `KeyboardShortcutOverlay` stays dead; a shortcut overlay ships only when there are shortcuts worth documenting.

### 3.5 Feedback policy
- Mutations: optimistic where reversal is cheap (tag, shortlist, keep-on-file, reminder complete) with an **undo toast** (sonner, bottom-right, 6s); pessimistic with inline spinner-in-button for accept/pass/archive.
- Toast copy pattern: past-tense verb + object — "Moved Amara Okafor to Shortlisted · Undo". Never "Success!".
- Errors: inline at the point of failure (field error, row-level failure note) + toast only when the failing surface isn't visible. Every React Query error path renders something — silence is forbidden.

---

## 4. The component kit (canonical, one vocabulary)

Everything below lives in `components/ui/` or is promoted there. Anything not on this list that duplicates a slot on this list gets deleted (the audit's Appendix A dead-code purge is a precondition of this plan).

| # | Component | Spec |
|---|---|---|
| 4.1 | **AgencyButton** (exists) | Variants: primary (gold fill, ink-deep text), secondary (white, hairline), ghost, destructive (danger text, ghost until hover), icon. 40px height, 8px radius, 200ms ease. Add missing `loading` (inline spinner replaces label, width locked) and `disabled` states. One primary per view. |
| 4.2 | **Ledger strip** (promote from per-page CSS) | The stat row: Inter figures 1.5rem/600, 0.6875rem uppercase labels *below* figures, hairline separators. No cards, no icons, no deltas-with-arrows unless the delta is real data. |
| 4.3 | **AgencyRow** (new; replaces per-page row CSS) | 56px list row: leading 40px photo (4px radius), name (Inter 600), meta line (text-2), trailing status text + chevron affordance. Hover = surface-hover tint; selected = gold 2px full inset ring (not a side stripe). Checkbox slot. Compact 44px variant. |
| 4.4 | **AgencyTable** (new) | For Team, Activity, future Analytics: real `<table>` semantics, sticky header, 0.8125rem cells, row hover tint. Below 1024px each row re-stacks into a two-line card (CSS only, no separate mobile component). |
| 4.5 | **TalentPanel** (exists — canonical drawer) | Keep structure; add focus trap + `aria-modal` + labelled-by the talent name; standardize width per §2. |
| 4.6 | **AgencyModal** (new primitive) | Portal, scrim (`rgba ink 0.4`, blur allowed — full-screen scrim), 12px radius panel, Overlay LG, focus trap, Escape, scrim-click close, `role="dialog"`. `CastingNewModal`, `InterviewScheduleModal`, `TeamAddModal` refactor onto it; `BoardsPage` modals die with the page. Delete the agency-local `ConfirmationDialog` (inferior duplicate); build `AgencyConfirm` on this primitive. |
| 4.7 | **AgencyEmptyState** (exists) | Enforce the three-part contract: what this surface is → why it's empty → one action. Icon optional, never illustration-as-filler. Copy per surface in §8. |
| 4.8 | **AgencySkeleton** (new) | Primitives: `.sk-row`, `.sk-card`, `.sk-figure`, `.sk-strip` — shimmer via 1.2s opacity pulse (no gradient sweep), reduced-motion: static tint. Every page's loading state composes these; spinners are allowed only inside buttons and the initial session gate. |
| 4.9 | **Unread/attention treatment** (replaces `.ag-icon-badge` count bubble — banned pattern) | Icon at full ink weight + 6px gold underline beneath the icon when unread > 0; the count lives inside the dropdown header ("Messages · 3 unread"). No absolutely-positioned corner chip. |
| 4.10 | **MatchScore** (exists — restyle) | Solid gold (`--ag-gold`) Playfair numeral on the neutral mount; **delete the gradient `background-clip: text` fill** (banned). Same component everywhere a score renders; tier text ("Strong fit") in Inter beside/below, plain text. |
| 4.11 | **Status text** (new tiny component `StatusText`) | Availability/pipeline state as plain Inter 500 text in the semantic color, optionally preceded by a 3px full-height *tonal* left **background** block only if inside a filled cell — never a pill, never a dot-pill combo, never a badge. Single source for status → label + color mapping (kills the five ad-hoc maps found in the audit). |
| 4.12 | **FilterChips** (promote Discover's chip rack pattern) | Rectangular chips, 6px radius, hairline border, gold border + gold-ghost fill when active. Used by Submissions tabs-as-filters, Roster filters, Interview lanes. `aria-pressed` semantics. |
| 4.13 | **BriefUnderstanding, FitBriefsPanel, RosterIntelligenceStrip (shell)** | Keep as-is (Discover trust UI is the quality benchmark). RosterIntelligenceStrip keeps its layout but only ever renders computed signals (§8.6) — zero-state: "No signals this week." |

**Kill list (delete; most already in audit Appendix A):** TalentStatusBadge, TalentTypePill, corner-chip TalentCard, Kanban family (the pipeline stays tabbed — calmer, accessible, on-brand; a drag board is not reintroduced), legacy Interview/Reminder/Tag/Overview-2.0 families, duplicate Grainient, `PlaceholderPage.css`, agency-local ConfirmationDialog.

---

## 5. State doctrine (per-surface contract)

Every data surface implements all five, reviewed in PR against this table:

| State | Treatment |
|---|---|
| **Loading (first)** | AgencySkeleton composition mirroring the real layout (rows where rows will be, strip where the strip is). Never a centered spinner in content. |
| **Loading (refresh)** | Keep stale content; 2px gold progress hairline under the masthead (`aria-busy` on main). |
| **Empty (no data yet)** | AgencyEmptyState teach-copy + one action. E.g. Submissions: "Submissions land here. Talent apply directly, through your open-call links, or by Scout invitation. · Create an open-call link". |
| **Zero results (filtered)** | Distinct from empty: "No submissions match — {filter summary}. · Clear filters". Discover's honest-zero (reason + loosen CTA) is the model. |
| **Error** | `EmptyErrorState` with retry; never silent fallthrough to empty-copy (Submissions currently does this — fix), never a zeroed dashboard (Overview currently does this — fix). |

---

## 6. Motion spec

Agency motion is **state-conveying, quick, and quiet** — the deliberate opposite of the talent studio's choreography. It must still exist: a static ledger is a dead ledger.

**Tokens (exist in `agency-tokens.css` — enforce):** `--ag-duration-fast: 150ms`, `--ag-duration: 200ms`, `--ag-duration-slow: 300ms`, ease `cubic-bezier(0.4, 0, 0.2, 1)`; spring reserved for drawer/panel entrances only (framer `stiffness 380, damping 32` — brisk, no bounce).

| Element | Motion |
|---|---|
| Hover (rows, cards, buttons) | Tone shift (surface-hover) 150ms; interactive *cards* may add Ambient→Float shadow step; **no translateY lifts on rows** (that's talent vocabulary) |
| Drawer / panel | Slide-in 24px + fade, 200ms spring; scrim fade 150ms |
| Modal | Fade + 4px rise, 200ms |
| List updates (add/remove/reorder) | framer `AnimatePresence` height+opacity collapse, 200ms — a row leaving after "Pass" visibly closes ranks |
| Tab/filter switches | Content crossfade 150ms; no slide carousels |
| Status change in place | The status text crossfades; on shortlist/keep-on-file, a single 300ms gold-ghost background pulse on the row — the ledger acknowledging the entry (one pulse, no loop) |
| Numbers (ledger strip) | Count-up on first load only, 300ms, from stale→fresh value on refetch; skip under reduced motion |
| Page load | Content fades in 200ms as one unit. **No staggered section choreography** (banned for agency surfaces) |
| Celebrations | None. Signing talent gets a quietly confident toast — "Amara Okafor joined the roster" — not confetti. Restraint *is* the agency brand's celebration. |

**Reduced motion (global, one mechanism):** wrap the agency tree in `<MotionConfig reducedMotion="user">` inside `AgencyLayout`, plus one CSS block in `agency-tokens.css`: `@media (prefers-reduced-motion: reduce) { [class*="ag-"], [class*="ag-"]::before, [class*="ag-"]::after { animation-duration: 0.01ms !important; transition-duration: 0.01ms !important; } }`. The Discover Grainient WebGL background renders a static gradient frame under reduced motion and on `!matchMedia('(min-width: 768px)')`.

---

## 7. Visual language enforcement

1. **One token family.** Migrate all `--agency-*` legacy aliases and hardcoded hex to `--ag-*`. Order of attack (worst first, from the audit): `InterviewsPage.css` (123 hex), `SettingsPage.css` (108), `CastingPage.css` (98), `TeamPage.css` (92), `OverviewPage.css`, `zones.css`. New rule: agency CSS may not contain a raw hex color — semantic or scale token only. Also collapse the stray `st-*` class prefix (Activity, Messages) into `ag-*`.
2. **Gold budget:** ≤10% of any screen. Gold marks: the one primary action, current selection, focus ring, active nav, high-score numerals. Audit each page after build with a squint test — if gold reads as a theme rather than a marker, remove instances.
3. **Typography:** Playfair only at `<h1>`/section-title tier; Inter everywhere else; the 0.6875rem uppercase label style is legal *only* as a field/metadata key below or beside content — never above a heading (eyebrow ban). Fixed rem scale; no clamp on in-app type except the masthead `<h1>` overflow guard.
4. **Fix the standing violations** (from the audit, all frontend): gradient-text numerals (`OverviewPage.css:34`, `MatchScore.css:26`) → solid; side-stripes (`OverviewPage.css:183`, `zones.css:407`, `MessagesPage.css:108`, `TalentThread.css:164`) → full hairline borders or background tints; `.ag-icon-badge` count bubble → §4.9 treatment.
5. **Photography treatment:** talent photos are the only saturated elements on the page; 4px radius in rows, 8px in cards; never overlaid with chips; name/score render *below or beside* the photo as text. Duotone/desaturation effects are forbidden — the ledger presents talent honestly.
6. **Contrast floor:** body text ≥4.5:1 on its surface. `--ag-text-3` (#9C958E) and `--ag-text-4` fail on cream — restrict them to non-essential ornament labels ≥14px/600 or bump usage to `--ag-text-2`. Placeholder text uses #A39E99 minimum (per DESIGN.md), verified against the white input fill, not the canvas.

---

## 8. Page-by-page specifications

### 8.1 Overview — "Today at the house"
**Purpose:** the 8:30am sweep. Answer, in order: what needs me now → what's moving → who's new → what the team did.
**Layout (keep the current good bones, tighten):**
1. Masthead `<h1>`: agency name (Playfair Display tier). Under it, one Inter line: date + docket summary ("Tuesday · 3 submissions to review, 1 interview at 2:00").
2. **Today's Docket** (exists) — the hero. Merge **due reminders** into it as docket entries (this replaces the Reminders rail item): each entry = icon-free row with action verb, subject, one-click action. Zero state: "All clear. Next: {nearest upcoming interview/closing board}."
3. **Ledger strip** (§4.2): Pending review · Active boards · Roster size · This-week interviews. Real figures only; the KPI numeral is solid ink (fix the gradient).
4. **Pipeline band:** the existing pipeline distribution as a single horizontal segmented bar with plain-text legend (counts + share). Clicking a segment → Submissions filtered to that status.
5. Two-column lower deck: **Boards table** (active signing boards: name, candidates, closes) · **Activity feed** (existing) + **Team module** (existing).
6. TalentStrip ("Top matches today") stays only if fed by real `match_evaluations`; otherwise cut until Calendar/matching work lands.
**States:** full skeleton composition; page-level error panel with retry (fixes audit P0-11); every module has its own zero copy (already good).
**Interactions:** every row opens the TalentPanel drawer or navigates to its board; docket actions execute inline with undo toasts.

### 8.2 Submissions (rename of Applicants)
**Purpose:** triage. The daily sweep of inbound digitals.
**Keep:** overall structure (search/sort header, board selector chips, ledger, list + BriefRail + TalentPanel), React Query wiring, bulk mutations.
**Change:**
- Tabs become FilterChips (§4.12): **All · New · Shortlisted · On file · New Faces · Represented · Passed**. "On file" is new — `kept_on_file` exists in the backend enum and is the industry's most common soft outcome; hiding it makes the pipeline lie. Chip includes count when loaded ("On file · 14" — count inside the chip text, not a bubble).
- Row = AgencyRow: photo, name, meta ("Editorial · NYC · 178cm / 5'10" · submitted 2d ago"), trailing status text. Dual-unit height always.
- **Row quick-actions** on hover/focus-within (Shortlist · Keep on file · Pass) — the triage verbs one keystroke away; all three exist as API calls today.
- Bulk selection bar (§3.2).
- Real error state (currently falls through to empty copy).
- Keyboard: rows focusable, Enter opens drawer (§3.4).
**Empty copy:** teach the three intake channels + open-call CTA (§5).

### 8.3 Signing (rename of Casting)
**Purpose:** run a board's signing pipeline from submission to represented.
**Keep:** CastingPage list + CastingDetailPage grid + FitBriefsPanel (the decision-support ranked view is a differentiator — protect it), CastingNewModal (onto AgencyModal primitive).
**Change:**
- All "Casting" strings → "Signing"; "Booked" tab label → "Represented" (matches Submissions vocabulary; "booked" means a confirmed job in the trade).
- Candidate cards get keyboard activation (§3.4) and stage moves via an inline stage menu on the card (popover, not drag).
- Board status chips (Active/In Review/Draft/Closed) stay; derive server-side eventually, visual treatment unchanged.
- Detail page: the Board/Fit-Briefs tab switch stays (`role="tablist"` already correct — extend arrow-key support).
**States:** skeleton grid; board-level error state exists (keep); per-tab zero states ("No one at this stage — move candidates from New").

### 8.4 Interviews
**Keep:** lane model (Needs Action / Scheduled / Awaiting Response / Completed / Cancelled) — it's genuinely good triage design; the state derivation (`interview-state.js`) stays the single source.
**Change:** rows onto AgencyRow compact variant; schedule modal onto AgencyModal; add inline "Add meeting link" affordance on video interviews missing one (state already detected); token migration (worst hex offender). Empty state: "No interviews yet. Schedule one from any submission or roster profile."

### 8.5 Scout (Discover)
**The benchmark page — change as little as possible.** Fixes only:
- Result card keyboard access (`role="button"`, Enter opens detail).
- Grainient reduced-motion/static fallback (§6).
- The invite action gets the standard undo-toast treatment ("Invited Amara Okafor to submit · Undo" if the API supports revoke; otherwise confirmation-free but explicit toast).
- Keep the dark "Threshold" hero exactly as designed — it is the one sanctioned dramatic moment in the agency product and it earns it.

### 8.6 Roster — full rebuild (the centerpiece of this plan)
**Purpose:** the living casting book. Who we represent, what state they're in, what needs attention.
**Data:** real `GET /api/agency/roster` (post-audit shape: no money fields; availability derived from commitments + talent-set status). Server search/pagination when available; until then, client-side over the real payload.
**Layout:**
1. Masthead `<h1>` "Roster" + Add Talent (primary, gold — opens Add Talent modal once `talent_records` lands; until then this button does not render. **No dead buttons.**)
2. **Ledger strip:** Available · On option · On booking · Booked out · Inactive (real counts from availability derivation).
3. **Intelligence strip (shell kept, content computed):** three signal slots max, each backed by a real query — idle 90+ days (no board submission), incomplete measurements, stale measurements (>6mo since `measurements_updated_at`). Zero state: "No signals this week." Delete every scripted string.
4. **Controls row:** search (`/` focus) · board/division filter · availability filter · sort (name / newest / last activity) · grid–row toggle (keep).
5. **Grid card:** photo-led 3:4, name (Inter 600) below, one meta line ("Editorial · Women's board"), availability as StatusText. Hover: Ambient→Float. Keyboard-activatable. **No corner chips, no workspace mock stats.**
6. **Row view:** AgencyRow with measurements meta (dual-unit) + "measured in person ✓" plain-text mark when confirmed (API exists).
7. **Bulk bar:** Message · Assign board · Tag · Archive — each wired to its real endpoint or absent this release.
**Talent click →** TalentPanel drawer (same as everywhere), full workspace via §8.7. The separate full-screen `RosterWorkspace` view-swap is **deleted**; its best ideas (large portrait header, board memberships, activity) fold into the full talent page.
**Empty state (first-run):** "Your roster builds from your signing pipeline. Accept a submission and the talent appears here. · Review submissions". This replaces the deleted SignedPage's only job.

### 8.7 Talent workspace (drawer + full page, consolidated)
One mental model, two sizes:
- **TalentPanel drawer** (quick): photo strip, stats block (dual-unit, `measurements_updated_at` staleness line — "Measured 4 months ago" in warning tone when >6mo), availability, boards, latest note, quick actions (message, schedule interview, add reminder, change stage).
- **Full page** (`TalentFullView`, existing route): hero portrait row, ledger (submissions, boards, interviews — counts, no money), PortfolioGrid (add keyboard-openable lightbox), bio, full measurements table, SubmissionPackageDetails, TalentThread (messages/notes/follow-ups — already good).
Both surfaces read the same query cache keys so drawer edits appear on the page instantly.

### 8.8 Calendar (new — the Booking Desk)
The one genuinely new page. Design now, build against the commitments API when it lands (audit §10.1). **Strictly non-financial.**
- **Views:** Week (default) and Month. Left column = roster talent grouped by board (sticky, searchable); columns = days.
- **Spans:** option (hairline gold outline, "1st option — Vogue IT" label), booking (filled surface-active with ink text), bookout (neutral hatched tint, "Booked out — school"). Kind is encoded by fill treatment + text, never by a badge. Overlaps stack within the row.
- **Create:** click-drag a range on a talent row → popover form (kind, tier, market, client ref, notes). Popover, not modal — keep the calendar visible.
- **Conflict flow:** a 2nd option requested over a 1st renders both spans with a "Challenge — confirm or release" plain-text flag; resolving is a one-click choice in the span popover.
- **Header ledger:** This week — options · bookings · bookouts · available talent.
- **Empty state:** "The desk is quiet. Place an option or record a bookout from any talent row."
- **Motion:** span create/delete = 200ms height/opacity; no drag-to-move in v1 (edit via popover).
- **Responsive:** below 1024px the week view becomes a per-talent agenda list (day-grouped rows) — a grid this dense doesn't survive small screens and shouldn't pretend to.

### 8.9 Messages
**Keep:** two-pane layout, polling, read receipts, date dividers.
**Change:** unread treatment per §4.9 (masthead icon + dropdown header count); "Mark all read" wired (the TODO in `MessagesDropdown.jsx:56`); thread list rows onto AgencyRow compact; the 2px gold `border-right` active-thread marker → full-surface `surface-active` tint (side-stripe ban); composer: `resize: none` textarea (global rule), Enter sends / Shift+Enter newline, 4000-char counter appearing at 3500.

### 8.10 Team
**Keep:** role-ranked grouping, role labels ("Principal", "Managing Agent", "Agent · Booker", "Scout · Junior", "Observer" — excellent), TeamRolesGuide, permissions modal.
**Change:** modals onto AgencyModal; when email invites ship, the add flow becomes email-first with a pending state row ("Invited · awaiting acceptance"); until then the modal keeps its honest "must already have a Pholio agency login" hint — honest limitation beats fake affordance.

### 8.11 Settings
**Prune to true:** keep Profile, Branding, Open Call, Notifications (live toggles only — the five disabled "Soon" booking-desk toggles are removed until Calendar ships), Security. **Divisions panel** becomes a real manager over the boards API (list, create, rename, archive divisions; the New Faces → Development → Main Board ladder copy stays — it's the best copy in the product). **Representation panel is removed** (static, and its commission-split content violates the no-money rule).
Tab rail + `?tab=` param pattern stays; panel forms follow one pattern: field grid → dirty-state save bar (already built in ProfilePanel — promote as the standard).

### 8.12 Setup
Keep as-is. It's the most complete flow in the domain (live mutations, per-step ledger, minor-data gate). Only change: adopt AgencyModal/skeleton primitives if it currently hand-rolls them, and the terminology sweep (Submissions).

### 8.13 Activity
Keep. Migrate `st-*` → `ag-*` classes, rows onto AgencyRow compact, keep 60s polling and date grouping.

### 8.14 Analytics (deferred — parked design)
When real queries exist: one page, four modules max — Submission funnel (segmented horizontal bar, counts + conversion between stages) · Time-in-stage (median days per stage, plain figures) · Intake sources (open-call / direct / Scout-invited, single bar) · Roster growth (26-week sparkline). All figures live, every module with zero states. No date-range theater beyond 30/90/365 presets. Recharts, styled to tokens (single ink line, gold current-period emphasis, no gradients, no legends where direct labeling works).

---

## 9. Copy & terminology (final)

| Concept | Use | Never |
|---|---|---|
| Inbound talent interest | **Submission** | Application (except code identifiers) |
| Recruiting pipeline | **Signing** | Casting (reserved for client briefs) |
| Division grouping | **Board / Division** | Category, tag, type |
| `kept_on_file` | **On file** | Rejected, archived |
| `development` | **New Face — Development** | Trainee, beginner |
| Talent-declared unavailability | **Booked out** | Unavailable, away |
| Soft calendar claim | **Option (1st/2nd) / Hold** | Reserved, pending |
| Raw assessment photos | **Digitals / Polaroids** | Selfies, casual photos |
| Curated work | **Book / Portfolio** | Gallery, album |
| Agency↔talent meeting | **Interview** (fine) or **Meeting** | — |
| Voice | Calm, confident, specific. "3 submissions need review." | Exclamation marks, "Success!", "Oops!", gamified praise |

Empty states teach; errors say what happened and what to do; buttons are verb-first ("Place option", "Keep on file"); destructive confirmations name the object.

---

## 10. Accessibility requirements (design-level)

1. Skip link (§2) · one `<h1>` per page · landmark roles already present (keep).
2. Focus: gold ring (`0 0 0 3px rgba(201,165,90,0.35)` — bump alpha from 0.15; the spec'd ring fails visibility on cream) on `:focus-visible` for every interactive element; focus trap in every overlay (§4.6); focus return on close.
3. Keyboard: §3.4 in full. `useCardButton` on every clickable card/row; lightbox openable and dismissable by keyboard; tablists get arrow-key movement.
4. Contrast: §7.6 floor enforced in review; status colors paired with text labels always (color is never the only signal — StatusText guarantees this).
5. Motion: §6 reduced-motion mechanism; no content gated behind animation completion.
6. Live regions: toast container `aria-live="polite"`; ledger strip figures update silently (no announcement spam); drawer opening announced via focus move to its `<h2>`.
7. Images: talent photos get `alt` = talent name; decorative canvases (`Grainient`) `aria-hidden`.

---

## 11. Implementation order & acceptance

Sequenced for a single frontend developer; each stage leaves the app shippable. (Data dependencies reference the audit roadmap; where an API isn't ready, the design ships behind its loading/empty states, never behind fakes.)

**Stage A — Foundation (unblocks everything)**
1. Dead-code purge (audit Appendix A) + delete `/boards`, `/signed`, RosterWorkspace, RepresentationPanel.
2. Component kit: AgencyModal, AgencySkeleton, AgencyRow, StatusText, FilterChips, `useCardButton`, AgencyButton loading/disabled states, §4.9 unread treatment.
3. Shell: skip link, MotionConfig + reduced-motion CSS, focus-ring alpha, breakpoint pass on the rail.
4. Violation fixes: gradient numerals, side-stripes, icon count bubble.
5. Terminology sweep + route renames with redirects.

**Stage B — Truth**
6. Overview: error/skeleton states, docket+reminders merge, ledger strip refactor.
7. Submissions: On-file chip, row quick-actions, bulk bar, error state, AgencyRow adoption.
8. Notifications wiring (masthead) + Messages fixes (§8.9).
9. Roster rebuild on the real API (§8.6, minus Add Talent until its API exists).
10. Cut Analytics from nav.

**Stage C — Depth**
11. Talent workspace consolidation (§8.7), Signing refinements (§8.3), Interviews/Activity/Settings refactors, Divisions manager.
12. Token/hex migration, file by file.
13. Calendar (§8.8) when the commitments API lands; Analytics (§8.14) when its queries land; Add Talent when `talent_records` lands.

**Acceptance checklist (every page, before it's called done):**
- [ ] Reads only real data; zero mock constants, zero dead buttons, zero "Soon" labels.
- [ ] Skeleton, empty, zero-result, and error states all reachable and designed.
- [ ] Fully keyboard-operable; focus visible; overlays trap and return focus.
- [ ] All motion ≤300ms, state-conveying, reduced-motion-safe.
- [ ] No banned patterns (badge pills, corner chips, count bubbles, eyebrows, gradient text, side-stripes, glass, serif in controls).
- [ ] Gold ≤10%; one primary action; tokens only, no raw hex.
- [ ] Long names/labels tested (the "Marilyn Agency" rule); operable at 768px.
- [ ] Terminology matches §9.
- [ ] The squint test: does it still read as a calm, warm, editorial ledger — and would a working booker trust it?
