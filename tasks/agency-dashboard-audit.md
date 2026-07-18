# Agency Dashboard — Frontend Audit & Redesign Direction

**Scope:** `/dashboard/agency/*` — shell, rail, and all 16 routed pages, plus the components behind them.
**Anchors (visual DNA to preserve):** the dashboard shell, the sidebar rail, and the Overview tab.
**Method:** full source read of every routed agency page and its CSS, plus the deterministic anti-pattern detector (87 raw findings; the signal: 3× gradient text, 4× colored side-stripes, cold gray-on-blue utility classes in `NotesPanel`, layout-property transitions in the shell).

---

## 1. High-level audit

This dashboard is two products wearing one coat. The shell, the rail, and the Overview tab are genuinely distinctive — a dark ink rail with film grain, a cream broadsheet canvas, Playfair mastheads, serif figures, hairline rules. "Today's Brief" is the single best idea in the app: the day's work written as an editorial front page instead of a KPI grid. Nobody would mistake it for a template.

Then you leave the Overview, and the product falls off a cliff — in three distinct ways:

1. **Fiction shipped as product.** Roster (the flagship operational surface) renders 22 hardcoded Unsplash models with fabricated insights, fabricated boards, a dead "Add Talent" button, and no-op bulk actions. RosterWorkspace generates **fake commission and day-rate figures from the talent's ID number**. Analytics is 100% static fiction ("4 applicants have been in Under Review for 14+ days") styled as live intelligence. The masthead says "SS26 Season" — hardcoded. The notifications bell is wired to `notifications={[]}` — permanently empty. For a tool whose entire pitch is *agency operations you can trust*, this is the most serious problem in the codebase. Not a polish issue; a credibility issue.

2. **Three-plus design languages.** Messages and Activity are built in an alien `st-` class system with its own grain layer and cold accent colors (emerald `#10b981`, indigo `#6366f1`, cyan `#06b6d4` — the exact "cold SaaS admin" the design docs ban). Reminders is a legacy admin template on a *third* token family (`--agency-*`, 285 usages vs. 667 `--ag-*`) with a 0.8s page-entrance choreography the agency motion rules forbid. Boards is a generic icon-card grid that duplicates Casting. NotesPanel uses raw Tailwind utilities (`text-gray-600 bg-blue-50`). Even the cream disagrees with itself: `agency-tokens.css` says canvas is `#FAF8F5`, the shell says `#F7F3EC`.

3. **The banned-pattern list is violated by the flagship surfaces.** Gradient text (`background-clip: text`) on the Overview lead figure, on every MatchScore numeral, and in dead `PlaceholderPage.css`. Colored side-stripes ≥2px on Next Moves cards, reminder cards, TalentThread, and zones.css. A "New" corner chip on Casting Detail photo cards. An Open/Closed status pill on the board header. Count bubbles on tabs and filter chips on effectively every list page — the global ban explicitly includes tabs. Dot-plus-badge combos on Analytics conversion badges. Two banned components (`TalentStatusBadge`, `TalentTypePill`) still live in `ui/`, unused but shipping.

There is also a structural redundancy problem: two boards pages (Casting, Boards), two roster pages (Roster with mock data, Signed permanently empty), orphan routes reachable only by URL, an unused Kanban implementation while DESIGN.md calls the casting Kanban the "signature component," and the same stat-ledger pattern re-implemented five times in five CSS files (`ap-ledger`, `cas-ledger`, `iv-ledger`, `ro-hero-stats`, `tfv-ledger`).

**Verdict:** the identity is real and worth building on. The Overview proves the "editorial ledger" concept works as software. But roughly half the routed surface is either demo-ware, off-system, or both. This is a strong art direction with an unfinished product underneath it.

---

## 2. Strongest pages — the ones that should define the system

1. **Overview** — the reference, as briefed. Today's Brief (lead figure + face fan + ruled ledger of beats), the module scaffold (`ov-module-head` with serif title + hairline rule + quiet uppercase link), and the Boards table with its per-row pipeline minibar are the house vocabulary. Needs a compliance pass (see §4.0), not a rethink.
2. **Team** — the best secondary page. The co-brand masthead ("PHOLIO | agency"), "together since {year}", leadership/members grouping, real skeletons, real empty state. This is what "same product as the Overview" looks like on an interior page.
3. **Interviews** — the best *operational* page. Derived lifecycle lanes (Needs Action / Scheduled / Awaiting), collapsed Completed, honest empty/error/retry states. The bones of the triage pattern the whole Pipeline section should share.
4. **Settings** — right structure: grouped side rail, panel masthead with description, skeleton loading, the Team tab correctly deported to its own page.
5. **TalentFullView** — a credible editorial talent profile: portrait hero, serif name, ledger stats, measurements. Good foundation.

**Honorable exception: Scout/Discover.** The dark "Signal" surface is deliberate (spec-frozen) and well-crafted, but it's a *fourth* language inside the app. Keep it as the one sanctioned "dark room" — and let it justify itself by contrast with an otherwise perfectly consistent cream system. It only reads as intentional if everything else is coherent.

---

## 3. Weakest pages — and why

Ranked worst first.

1. **Roster + RosterWorkspace** — a movie set. Hardcoded cast of 22, fake AI insights, fake financials, dead buttons, no API. Also off-palette: cold status colors (`#16A34A` green, `#3B82F6` blue, `#9CA3AF` gray) and an insight *dot* (banned pattern). The flagship page for the agency's core asset — their book — is a demo.
2. **Analytics** — fabricated numbers presented as live analytics, with cold Tailwind palette (`#16a34a/#d97706/#dc2626/#64748b/#94a3b8`), dot+badge conversion chips (banned combo), no page masthead, and a roster panel that admits its own data ignores the selected time range. Fake analytics are worse than no analytics.
3. **Messages** — an entirely different product. `st-` design system, chat-app bubbles, its own grain, spinner states. Also a real UX bug: it auto-opens the first thread and marks it read on page load — the agency never chose to read it.
4. **Reminders** — legacy template. Third token family, `pageEntrance 0.8s` choreography (banned on agency surfaces), 3px red side-stripe (banned), inline-styled spinner, fixed 400px sidebar, and it's an orphan route not present in the nav.
5. **Activity** — right idea, wrong wardrobe. Cold icon-bubble colors, status-tag chips, `st-` classes, spinner loading, no filtering — and it duplicates the Overview's "What changed" module without sharing a line of its visual language.
6. **Boards** — a redundant, weaker Casting. Generic icon-card grid, `●`/`○` as status indicators, hand-rolled fetch instead of React Query, orphan route.
7. **Signed** — a permanently-empty static page that promises "accepted talent will appear here" while Roster shows fake talent. Two half-pages where one real page should be.
8. **Applications** — mid-tier, not weak-weak, but overloaded: 7 tabs × count chips + 5 board chips × 2 counts each + a 5-stat ledger that *repeats the tab counts* — three renditions of the same numbers before the first applicant row. Icon-only row actions, text-string loading, no pagination, and a fiddly collapsible "Brief" side tab.
9. **Casting Detail** — good bones, three compliance violations ("New" photo chip, Open/Closed pill, count chips), and the promised Kanban view is nowhere — the "Board" view is a plain grid.

---

## 4. Redesign directions

### 4.0 Overview — compliance pass only (protect the DNA)
- Replace the gradient-metallic lead figure with a **solid ink or solid gold serif numeral**. The 92px Playfair number carries the drama by scale alone; the gradient+drop-shadow is the one AI-tell on the page.
- Next Moves: kill the 2px gold/red/green left-stripes → full hairline border + a warm background tint per tone, or fold Next Moves into the Brief's ledger column entirely (it competes with Today's Brief for the same job).
- Activity dots → tone via text or the existing avatar pip only; drop the bare colored dot fallback.
- MatchScore numeral: solid color (ink on paper, cream on photo). Same component, one line of CSS, removes a ban violation from every surface at once.
- BoardsTable minibar: `#2D2A26` vs `#050505` segments are indistinguishable — use ink / gold / ghost.

### 4.1 Roster → "The Book"
The roster *is* the agency. Treat the page like the printed casting book the DESIGN.md invokes — and make it real.
- **Wire it to real data** (signed/accepted applications). Delete the Signed page; `/signed` redirects here. One roster, one truth.
- **Grid view = comp cards.** Portrait-ratio photo, name in small serif, one spec line in mono (`Editorial · 178 · Paris`), availability as plain text set by the existing `AvailabilityCell` treatment. No corner chips, no insight dots, no cold status greens/blues — the warm semantic set only.
- **List view = the measurement ledger.** Agencies think in cm and B·W·H. Make the row read like a book entry: serif name, mono measurements column, last-booking recency in plain text with the warm danger tone only when genuinely stale. Sortable, keyboard-navigable, virtualized.
- **Insights strip:** only when a real signal exists (computed from actual bookings/activity). An empty intelligence strip is more premium than an invented one.
- **Workspace:** keep the full-screen matrix concept — it's a good, bold pattern — but strip fake commissions/day rates until the commissions domain feeds it. Show what's true: boards, thread, portfolio, measurements, notes.

### 4.2 Analytics → "The Season Report"
Kill the fiction, then rebuild the page as an editorial quarterly, not a BI toy.
- **Masthead:** Playfair title ("The Season"), range control as quiet text tabs, one *written* lead insight in the Today's-Brief voice — computed from real pipeline events, in prose, with a serif figure.
- **Funnel as a typographic ledger:** five serif numerals on a ruled line with plain-text conversion percentages beneath — no boxes, no SVG arrows, no dot-badges. The Overview's funnel bar already shows how this system charts data.
- **Velocity as a ruled table:** `Under Review → Shortlisted · 18 days · up from 11` in plain text; tone carried by the warm semantic ink colors, not chips.
- **Roster growth:** thin gold line on cream (the one chart worth keeping), real data, and honest about its range.
- If real analytics can't ship yet, ship a beautiful empty state that teaches what will appear. Never invented numbers.

### 4.3 Messages → the correspondence desk
Rebuild inside the agency system; this is correspondence between a house and its talent, not iMessage.
- Thread list as **ledger rows on cream** (avatar, name, board context, one-line preview, time in mono) — the Overview row vocabulary, unread carried by weight + a single ink marker, not dots.
- Thread pane as a **white paper panel**: date rules as hairlines, agency messages distinguished by alignment + a warm tint, not bubble chrome on dark.
- Context header links to the application/TalentPanel — the thread is always *about* a submission.
- Fix behavior: never auto-select-and-mark-read; mark read on genuine view/focus.

### 4.4 Activity → "The Wire"
- One activity vocabulary product-wide: reuse the Overview `ActivityFeed` row (avatar + pip, strong name, quiet meta) at page scale.
- Day groups with small serif date headers; filters (type / board / member) as quiet text controls.
- Warm tones only. No icon bubbles in emerald/indigo/cyan, no status chips, no spinner — skeleton rows.

### 4.5 Reminders → a desk drawer, not a destination
Reminders are follow-ups attached to talent, not a place you visit.
- Fold due reminders into **Today's Brief** (they are literally "today's moves") and a masthead popover.
- Keep a lightweight page only if workflows demand it — rebuilt on `--ag-*` tokens, ledger rows, snooze/complete as quiet inline actions, no side-stripes, no entrance choreography.

### 4.6 Boards → delete
Redirect `/boards` → `/casting`. One boards concept. Migrate nothing visual; Casting already won.

### 4.7 Applications → the triage desk
- **Collapse the numbers to one voice.** The stat ledger *becomes* the filter: five editorial stats (New / Shortlisted / New Faces / Signed / Pass rate), each clickable as the filter tab. Delete the separate 7-chip tab row and its count bubbles. Counts render as plain text inside the stat, per the ban.
- Board context as a **select or quiet text row**, not a chip strip with double counters.
- **Keyboard triage:** J/K to move, S shortlist, A sign, X pass, Enter open. The `KeyboardShortcutOverlay` component already exists — wire it. This is the single biggest efficiency win for a booker processing 50 submissions.
- Row actions: visible text-on-hover labels ("Shortlist · Sign · Pass") instead of bare icons with tooltips.
- Brief rail → a **board context header band** above the list (brief excerpt + "Where it stands") instead of a collapsible side tab fighting for width.
- Skeleton rows, pagination/virtualization, optimistic mutations.

### 4.8 Casting Detail → the actual signature board
- Ship the **Kanban** DESIGN.md promises: stage columns (New → Shortlisted → New Faces → Booked), flat photo-led cards, plain inline text for type/score, gold only on the dragged/selected card. The components exist unused in `components/Kanban*` — finish or rewrite them, but the board view must be a board.
- Remove the "New" corner chip (recency = sort order + plain text "2h ago"), the Open/Closed pill (plain text next to close date), and tab count bubbles.
- Grid view remains as the "book view" toggle.

---

## 5. Shared design system recommendations

1. **One token source.** `agency-tokens.css` becomes law; delete the parallel `:root` in `AgencyLayout.css`, migrate all `--agency-*` and `--ss-*` usages, and purge raw hex from page CSS. Resolve the two creams (`#FAF8F5` vs `#F7F3EC`) — pick one canvas (recommend the warmer `#F7F3EC` the shell actually ships, since it *is* the current identity) and update DESIGN.md to match reality.
2. **Extract the five-times-duplicated primitives** into `domains/agency/components/ui/`:
   - `PageMasthead` (serif title, sub-line, primary action) — every page gets one; Analytics currently has none.
   - `StatLedger` (the serif-figure stat row) — replaces `ap-ledger`, `cas-ledger`, `iv-ledger`, `ro-hero-stats`, `tfv-ledger`.
   - `ModuleHead` (serif title + count-as-text + hairline + quiet link) from the Overview.
   - `LedgerRow`/`LedgerTable` (the Overview `ov-tr` grid-row vocabulary) for every list surface.
   - `Skeleton` + consistent use of `AgencyEmptyState`/`EmptyErrorState` (they exist; half the pages ignore them).
3. **Kill dead and banned code:** `TalentStatusBadge`, `TalentTypePill`, `PlaceholderPage.css` (gradient text in a dead file), duplicate `Grainient` (exists in both `components/` and `pages/`), unused Kanban files if the Kanban isn't shipped.
4. **Type + contrast floor.** The system leans on 8.5–9px uppercase micro-labels; `#9b9082` on cream at that size will not pass 4.5:1. Set a 10px floor for tracked labels, bump quiet meta toward `#6b6256`, and document the scale (mono for meta/timestamps, serif for figures/mastheads, Inter for everything operational — already the de-facto rule; write it down and enforce it).
5. **Motion contract.** Agency = 150–250ms state motion; springs allowed on entrance of *one* hero element per page (Today's Brief has earned it). Ban page-load choreography (`pageEntrance 0.8s`), and don't transition `width` on the rail — animate a transform/grid track instead (detector flagged the layout-property transition).
6. **Fonts via `<link>` preload**, not CSS `@import` in `AgencyLayout.css` — it's render-blocking on every dashboard load.
7. **Count language.** The ban on count bubbles (nav, tabs, cards) is the house style: counts are plain text after the label ("Shortlisted 12") or serif module counts. Apply it to the masthead unread badge too — make unread state weight/dot-free text in the dropdown trigger's label or the dropdown itself.

---

## 6. Making it feel production-ready (not an admin template)

- **Truth or nothing.** Every number on screen must be real or explicitly labeled sample data during onboarding. Fake commissions, fake insights, fake season labels, and a decorative notifications bell are the fastest way for a working agency to stop trusting the product. Empty states that *teach* ("Your book is empty — sign your first talent from Applications") are premium; invented data is not.
- **First-run narrative.** The Overview already greets by name. Extend that: a brand-new agency should see Today's Brief composed of setup moves (finish setup, open your first board, share your open call link) — the same editorial machinery, driven by onboarding state.
- **Keyboard as a luxury feature.** Bookers live in this tool for hours. J/K triage, `/` to search, `g r` go-to-roster, and the existing shortcut overlay surfaced under `?`. This is what separates "working tool" from "template."
- **State completeness per component:** default, hover, focus-visible (gold ring — already specified), loading (skeleton, never spinner-in-content), empty (instructive), error (retry). Interviews and Team already do this; make it the bar everywhere.
- **Micro-truthfulness:** real season/date computation for the masthead status line, live "in pipeline" figures (already wired), notification feed backed by the activity stream.
- **Performance hygiene:** virtualize Applications/Roster lists, `loading="lazy"` everywhere (mostly done), preloaded fonts, no WebGL grain outside Discover.
- **Route hygiene:** every routed page is in the nav or is a detail view of one; delete or redirect the rest. Orphan half-pages are the strongest "unfinished admin template" smell there is.

---

## 7. Prioritized action plan

**P0 — Truth & bans (credibility):**
1. Kill fabricated data: Roster mock cast, RosterWorkspace fake financials, Analytics static fiction, hardcoded "SS26", dead notifications wiring. Wire real data or ship honest empty states.
2. Banned-pattern purge (small diffs, big compliance): MatchScore + Overview gradient text → solid; side-stripes in NextMoves/Reminders/TalentThread/zones → hairline+tint; Casting "New" chip + Open/Closed pill → plain text; count bubbles off tabs/chips; delete `TalentStatusBadge`, `TalentTypePill`, `PlaceholderPage.css`.
3. Route consolidation: delete Boards (redirect → Casting) and Signed (redirect → Roster).

**P1 — One system (coherence):**
4. Token unification (single source, one cream, purge `--agency-*`/hex) + extract `PageMasthead`, `StatLedger`, `ModuleHead`, `LedgerRow`, `Skeleton`.
5. Re-skin the alien pages into the agency system: Messages, Activity, Reminders (or fold Reminders into the Brief).

**P2 — Operational depth (the working tool):**
6. Roster rebuilt on real data — "The Book" (grid comp cards + measurement ledger + workspace on truth).
7. Applications triage upgrade: ledger-as-tabs, keyboard triage, context header, virtualization.
8. Casting Detail Kanban — ship the signature component.

**P3 — Polish (the last 10%):**
9. Analytics rebuilt as "The Season Report" on real events.
10. Contrast/type-floor pass, motion audit (kill width transitions + long choreography), font loading, responsive sweep, focus-visible audit.

The order matters: P0 makes the product honest, P1 makes it one product, P2 makes it a tool agencies run their business on, P3 makes it feel inevitable.
