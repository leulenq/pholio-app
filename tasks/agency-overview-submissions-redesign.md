# Agency Overview + Submissions — Design Audit & Redesign (2026-07)

Fresh-lens audit of `/dashboard/agency` and `/dashboard/agency/submissions`, followed by the
redesign that shipped on this branch. Rules preserved: the global banned-UI list and the shell/rail
visual DNA (ink rail, cream canvas, gold accent, Playfair mastheads). Everything else was open.

## Audit — what was actually wrong

### Overview

1. **Module counts (`— 20`, `— 04`, `— 08`).** A decorative gold em-dash + serif numeral bolted
   onto Playfair section titles. Inconsistently applied (zero-padded on two modules, absent on
   three), it reads as a stray fragment rather than information: the strip already shows its
   cards, the table already shows its rows. Deleted everywhere — headings stand alone, counts
   live in content when they matter.
2. **Top-matches cards buried the score.** Match arrived as the tail of a tracked-caps micro
   line (`EDITORIAL · MIAMI · 93 MATCH`) that wrapped mid-value, while a 72%-black bottom scrim
   darkened every portrait for no payload. The score now uses the approved talent-panel language
   — the ink-chip `MatchScore` — set into the photo's top-right (owner-requested placement);
   the dead scrim is gone so portraits read bright and editorial.
3. **"Next moves" was a third visual system.** Tone-bordered alert boxes (rust/green
   color-mixed borders, translucent fills, tracked-caps gold CTAs) on a page whose language is
   serif figures + hairline-ruled rows. Rebuilt as **the agenda**: ruled rows in the Overview's
   own vocabulary — serif figure, statement, destination — the whole row is the link, urgency
   carried by the figure's tone only. Moved to the first column of the bottom grid (actions
   before feed).

### Submissions (critical)

1. **Six strata before the first face** — masthead+controls, ledger tabs, "More" row, board
   band, floating keyboard-hint sentence, table head — each in a different idiom (bordered
   select, boxed search, segmented pill, underlined tabs, plain-text row, uppercase header).
   Collapsed to three: masthead + one uniform command bar; the stage ledger with a quiet
   right-aligned outcomes cluster; content.
2. **The ink-chip match score is wrong for a ledger.** Forty dark chips with neon tier tones
   (pink/cyan/orange) were the heaviest ink on a warm cream page — the chip column dominated the
   table and the neon vocabulary is cold against the editorial system. The chip stays where it
   belongs (photo contexts: talent panel, overview cards). Submissions gets its own data-native
   expression, **MatchMeasure**: tabular numeral + 2px filled rule, warm tones only
   (gold = exceptional, ink = strong, muted = fair/low), same tiers via `matchTier`.
3. **Taxonomy noise.** Per-type colored underlines (TypeSpec) read as links and injected six
   hues into rows already carrying semantic status colors and neon chips. Type is now quiet
   tracked text; `StatusText` is the *only* colored text in a row.
4. **Actions were inconsistent.** Hover-expanding labels animated row layout, and the focused
   row showed labels while the rest didn't. Now icon-only 30px buttons everywhere, with CSS
   tooltips on hover/focus — no layout shift; the redundant per-row chevron is gone (the row
   itself opens the panel).
5. **48×62 photos on a judging surface.** The page's job is judging digitals; the photo is the
   data. The rebuilt page is photo-led.

## Direction — "The Light Table"

Submissions is now a review desk with two densities and one opinionated default:

- **Book (default):** a contact-sheet grid of 3:4 portraits (auto-fill ≥190px), serif name +
  MatchMeasure, quiet spec line, time + status only when it says something. Hover/focus raises
  an ink action bar (icon-only shortlist/sign/pass) over the photo's lower edge. Selection is
  the gold ring; J/K/S/A/X/Enter triage drives it unchanged.
- **Ledger (toggle):** the dense scanning list — 52×68 portrait, serif name, quiet spec, time,
  measure, status, icon actions. View choice persists per browser.
- **One command bar:** board select · search · Newest/Match · Book/Ledger · `?` (shortcut help)
  — one height, one border, one radius family.
- **Gold means one thing:** the active stage. The "New" numeral no longer idles in gold; the
  fake-tab pass-rate stat moved into the masthead sub-line as plain text; On file / Passed sit
  as quiet toggles on the ledger rail's right edge.

## Also fixed en route

- `scripts/seed-agency-demo.js` wrote `images.status = "ready"`, which
  `applyImageVisibility` excludes (`NULL`/`'active'` only) — every demo submission rendered
  photo-less. Seed now writes `active`.
