---
name: Pholio Agency Command Center
description: Warm editorial luxury for agency roster operations — cream, gold, and serif authority.
colors:
  ink: "#1A1815"
  ink-deep: "#141210"
  canvas: "#F7F3EC"
  surface: "#FFFFFF"
  surface-hover: "#F5F2EE"
  surface-active: "#EDE9E3"
  gold: "#C9A55A"
  gold-hover: "#B8956A"
  gold-muted: "#F4ECDC"
  text-body: "#2D2A26"
  text-secondary: "#6B6560"
  text-tertiary: "#9C958E"
  text-ghost: "#C8C2BA"
  border: "#1A18151F"
  border-strong: "#1A181524"
  success: "#2D8A56"
  danger: "#C0392B"
  warning: "#C2850E"
  info: "#3B7DD8"
typography:
  display:
    fontFamily: "Playfair Display, Georgia, Times New Roman, serif"
    fontSize: "3.5rem"
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: "-0.02em"
  headline:
    fontFamily: "Playfair Display, Georgia, serif"
    fontSize: "2.5rem"
    fontWeight: 600
    lineHeight: 1.1
    letterSpacing: "-0.01em"
  title:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "normal"
  body:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "0.08em"
  mono:
    fontFamily: "SF Mono, Fira Code, Consolas, monospace"
    fontSize: "0.8125rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
  xl: "20px"
  full: "100px"
spacing:
  gap-sm: "16px"
  gap: "24px"
  card-pad: "24px"
  card-pad-lg: "32px"
  page-x: "40px"
  page-y: "48px"
components:
  button-primary:
    backgroundColor: "{colors.gold}"
    textColor: "{colors.ink-deep}"
    rounded: "{rounded.md}"
    padding: "0 18px"
    height: "40px"
    typography: "{typography.title}"
  button-primary-hover:
    backgroundColor: "{colors.gold-hover}"
    textColor: "{colors.ink-deep}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-body}"
    rounded: "{rounded.md}"
    padding: "0 18px"
    height: "40px"
  card:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.text-body}"
    rounded: "{rounded.lg}"
    padding: "{spacing.card-pad}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "10px 14px"
    height: "44px"
---

# Design System: Pholio Agency Command Center

## 1. Overview

**Creative North Star: "The Editorial Ledger"**

The agency surface is a luxury casting book rendered as software. Imagine a high-end agency's printed roster catalogue — warm cream stock, gold-foil detailing, a confident serif masthead — given the density and speed of a modern operations tool. A booker should be able to scan a hundred talent, triage an inbox, and move cards across a casting board without the interface ever raising its voice. Authority comes from typography and restraint, not from chrome.

This system is **calm, dense, and composed**. It carries more discrete elements than a marketing page — tables, panels, kanban columns, score readouts — so contrast is dialed down and rhythm is held steady. Depth is conveyed with soft, warm-toned shadows and tonal layering of cream surfaces, never with frosted glass or hard drop shadows. It is deliberately a *separate design system* from the talent dashboard: same material (warm neutrals, one gold, Inter body) but its own serif (Playfair Display), tighter motion, and a working-tool density that the talent side never reaches for.

What it explicitly rejects: cold blue-and-white admin chrome, status-badge dot soup, corner metadata chips on cards, glassmorphism, count bubbles on nav, and any small uppercase eyebrow floating above a heading. The agency tool should feel like an asset an agency is proud to run its business on — not a generic SaaS CRM.

**Key Characteristics:**
- Warm cream canvas (`#F7F3EC`), white panels, a single gold accent used sparingly.
- Playfair Display serif for headlines; Inter for everything operational.
- Density with composure — many signals, low visual noise.
- Soft warm shadows + tonal cream layering for depth; never glass.
- Motion is quick and state-conveying (150–200ms), not choreographed.

## 2. Colors

A warm-neutral foundation (cream → white → sand) carrying a single editorial gold accent, with a muted but legible semantic set for operational states.

### Primary
- **Pholio Gold** (`#C9A55A`): The one brand voice. Primary actions, current selection, active nav, focus halos, high-score readouts, and thin accent strokes. Hover deepens to **Gilt** (`#B8956A`). This gold is the *platform* gold and is never overridden by agency branding.

### Neutral
- **Ink** (`#1A1815`): Headlines and primary text; the warm near-black that anchors the system.
- **Ink Deep** (`#141210`): Reserved deepest tone — the command-rail ground and text on gold buttons.
- **Canvas** (`#F7F3EC`, token `--ag-canvas`): The warm cream page background of the command-center shell (`.ag-shell`, `.ag-main`). The single most identity-defining surface. Distinct from `--ag-surface-0` (`#FAF8F5`), the lighter cream shared platform-wide with the talent/auth surfaces — sub-pages, modals, and drawers inside the agency shell still lean on `--ag-surface-0` for panel backgrounds.
- **Surface** (`#FFFFFF`): Sidebar, cards, panels — the "paper" laid on the canvas.
- **Surface Hover / Active** (`#F5F2EE` / `#EDE9E3`): Tonal cream steps for hover and pressed/input states — depth by tone, not shadow.
- **Body** (`#2D2A26`), **Secondary** (`#6B6560`), **Tertiary** (`#9C958E`), **Ghost** (`#C8C2BA`): The text ramp, warm-tinted top to bottom.
- **Border** (`rgba(26,24,21,0.08)`) and **Border Strong** (`rgba(26,24,21,0.14)`): Hairline dividers; full borders, never colored side-stripes.

### Tertiary (Semantic — muted, operational)
- **Success** (`#2D8A56`), **Info** (`#3B7DD8`), **Warning** (`#C2850E`), **Danger** (`#C0392B`): Used for genuine state and meaning only, each with a `-dim` tinted-background companion. Desaturated on purpose so they read as information, not decoration.

### Named Rules
**The One Voice Rule.** Gold appears on ≤10% of any screen. It marks the single most important action or the current selection — its rarity is what makes it read as luxury. A screen drenched in gold has lost the plot.

**The Tone-Not-Badge Rule.** Talent availability and pipeline state are carried by plain text or a single non-badge dot/stripe in a semantic color — never a colored pill badge. The banned status-badge pattern stays banned.

## 3. Typography

**Display Font:** Playfair Display (with Georgia, Times New Roman fallback)
**Body Font:** Inter (with system-ui fallback)
**Label/Mono Font:** SF Mono / Fira Code (data and monospace readouts)

**Character:** A high-contrast editorial serif paired with a neutral workhorse sans. Playfair carries the masthead authority of a printed catalogue; Inter handles every operational label, row, and control without competing. The contrast is the point — serif for identity moments, sans for the working surface.

### Hierarchy
- **Display** (Playfair 600, 3.5rem, line-height 1.05): Page mastheads and hero moments on the overview. Used sparingly.
- **Headline** (Playfair 600, 2.5rem, line-height 1.1): Section and page titles.
- **Title** (Inter 600, 1.125rem): Card titles, panel headers, primary-button text.
- **Body** (Inter 400, 0.875rem, line-height 1.6): The default operational text size. Prose blocks cap at 65–75ch; data rows may run denser.
- **Label** (Inter 600, 0.6875rem, letter-spacing 0.08em, uppercase): Field labels and metadata keys — the *only* sanctioned uppercase tracked text, and never floated above a heading as an eyebrow.

### Named Rules
**The Serif-For-Identity Rule.** Playfair appears only at the masthead/section-title tier. It is forbidden in buttons, labels, table cells, and data — display fonts in UI controls read as costume, not craft.

## 4. Elevation

Hybrid: depth comes first from **tonal layering of warm cream surfaces** (canvas → surface → surface-hover → surface-active), with soft, warm-toned shadows added only to lift true overlays. The system reads mostly flat at rest; shadows are a response to elevation (panels, dropdowns, modals), not a default decoration. Frosted glass is forbidden on content surfaces.

### Shadow Vocabulary
- **Ambient SM** (`box-shadow: 0 1px 3px rgba(26,24,21,0.06)`): Resting cards that need the faintest separation from canvas.
- **Float MD** (`box-shadow: 0 4px 20px rgba(26,24,21,0.08)`): Dropdowns, popovers, hover-lifted cards.
- **Overlay LG** (`box-shadow: 0 12px 40px rgba(26,24,21,0.12)`): Side panels and modals — true overlays above the surface.
- **Gold Glow** (`box-shadow: 0 0 20px rgba(201,165,90,0.15)`): Reserved emphasis for a selected or celebrated element; never ambient.

### Named Rules
**The Flat-By-Default Rule.** Surfaces are flat at rest and lift by tone on hover. A shadow is earned by a state change (hover, elevation, focus) or by being a literal overlay — never applied to make a resting card look "designed."

**The No-Glass Rule.** `backdrop-filter: blur()` is permitted only on a full-screen functional scrim (`position: fixed; inset: 0`). On any card, panel, toolbar, or button it is forbidden.

## 5. Components

### Buttons
- **Shape:** Rounded rectangle, medium radius (8px); height 40px.
- **Primary:** Gold (`#C9A55A`) fill, ink-deep (`#141210`) text, weight 600, padding `0 18px`. The single highest-priority action per view.
- **Hover / Focus:** Background deepens to Gilt (`#B8956A`); transitions `200ms cubic-bezier(0.4,0,0.2,1)`. Keyboard focus shows the gold ring (`0 0 0 3px rgba(201,165,90,0.15)`).
- **Secondary:** White surface, hairline border, body text; hover shifts background to surface-hover cream and strengthens the border. Ghost/icon buttons drop the border entirely and tint on hover.

### Cards / Containers
- **Corner Style:** Large radius (12px); panels and rails may run to 20px.
- **Background:** White (`#FFFFFF`) on the cream canvas.
- **Shadow Strategy:** Flat at rest (Ambient SM at most); lift to Float MD on hover via tone + shadow. See Elevation.
- **Border:** Optional hairline (`rgba(26,24,21,0.08)`) — full borders only, never a colored left/right stripe.
- **Internal Padding:** 24px standard (`card-pad`), 32px for feature panels.
- **Forbidden:** corner metadata chips, nested cards, frosted-glass backgrounds.

### Inputs / Fields
- **Style:** White fill, 1px warm border (`rgba(26,24,21,0.12)`), 8px radius, 44px height, faint inset shadow for a "pressed paper" feel.
- **Focus:** Border shifts to gold and a soft gold halo appears (`0 0 0 3px rgba(201,165,90,0.15)`) plus the inset.
- **Hover:** Border darkens to `rgba(26,24,21,0.22)`.
- **Labels:** Uppercase Inter 600 at 0.6875rem, letter-spacing 0.08em — beside/above the field as a key, never as a section eyebrow.
- **Placeholder:** `#A39E99` — kept legible, not faint.

### Navigation
- **Style:** A vertical command rail on the deep ink ground. Items are Inter, quiet by default; the active item is marked with gold (text + a thin marker), never a count bubble or pill badge.
- **States:** Hover tints the row; active carries the gold accent; focus shows the gold ring.
- **Mobile:** The rail collapses structurally (icon-only / drawer), not by shrinking type.
- **Forbidden:** `ag-nav-count` style counter bubbles attached to nav items.

### Signature Component — Division Marks

`components/status/DivisionMark` + `DivisionSet`. The one sanctioned way to show
which boards a talent sits on and where they stand on each.

**Three layers, in order of what carries what:**

- **Typesetting identifies the board.** Each division has an authored setting —
  Editorial is a tracked serif (the masthead voice), Commercial is plain Inter
  (commercial work is plain), Fit is mono caps (booked on measurement, not on
  look), Kids & Teens is deliberately unstyled. This is the *accessible*
  identifier: it survives colour blindness, greyscale, and print.
- **The ground carries the standing** — represented / active / developing /
  shortlisted / on file / inactive / ended / passed / unknown.
- **Colour is a family-level recall aid, never the identifier.**

**Why colour is not the identifier.** 22 mutually CVD-distinct hues do not exist
in sRGB — red-green deficiency collapses the usable gamut to roughly a
blue-yellow axis plus lightness, and the practical ceiling is ~10–12 colours. An
earlier version of this palette held lightness fixed across all divisions on an
"equality" argument and scored 57 confusable pairs of 231 under deuteranopia,
*worse* than the ad-hoc pigments it replaced. Lightness is now solved per
division across a narrow band. **Do not reintroduce fixed lightness, and do not
make hue load-bearing.**

**Serif at the identity tier is a sanctioned exception** to the agency system's
"no serif in dense controls" rule — the serif does semantic work here. It is
capped at `md`/`lg`; `sm` (the roster-table size) drops serif entirely and
degrades every treatment to weight, tracking and case, because Playfair's
hairlines fall under one device pixel below ~12px. `sm` also normalises
font-size so a row of marks shares one baseline.

- **Shape:** square corners (radius 0), 1px border, no internal divider.
- **Every rung differs in ground lightness AND border treatment**, so standing
  never depends on hue. The low rungs are 6–12% tints measuring ~1.05:1 against
  the cream canvas — the border is what makes the field a field, and it is held
  at 3:1 (WCAG 1.4.11).
- **Grounds:** paper/canvas by default; `onDark` for the drawer hero.
- **Motion:** only the interactive filter variant animates, with a
  reduced-motion fallback.
- **Forced colors:** each rung carries a distinct border style, because
  backgrounds are stripped.
- **Board names are agency-authored free text.** `resolveDivision` never returns
  null, never renames an agency's board, matches aliases on whole tokens (never
  substrings), and keeps non-Latin names intact.
- **Absence is never a positive claim.** An unrecognised or missing standing
  resolves to `unknown` and renders as a visible gap — never as "Active".

**Verification (run all three after touching this component):**
- `node scripts/build-division-palette.mjs` — regenerates the palette, fails on
  contrast or on two boards rendering as literally the same colour under CVD.
- `node scripts/check-division-contrast.mjs` — checks the *actual shipped* CSS
  pairs, text at 4.5:1 and borders at 3:1.
- `npm test -- tests/agency/division-palette-parity.test.js` and
  `npx vitest run src/domains/agency` (from `client/`).

### Signature Component — Casting Kanban
The roster casting board: columns of talent cards moved across pipeline stages via @dnd-kit. Cards stay flat and compact, photo-led, with type and match-score rendered as **plain inline text** (no corner chips, no score badge). Column min-width 220px, 8px card gap. The board is the densest expression of the "ledger" idea — many talent, calm surface, gold only on the active/selected card.

## 6. Do's and Don'ts

### Do:
- **Do** keep the canvas warm cream (`#F7F3EC`) with white paper panels — the warmth is the brand.
- **Do** reserve gold (`#C9A55A`) for the single most important action or the current selection (≤10% of a screen).
- **Do** use Playfair Display only at masthead/section-title tier; Inter for every control, label, and data cell.
- **Do** convey depth by tonal cream layering first, soft warm shadows second.
- **Do** render talent status as plain text or one non-badge dot/stripe.
- **Do** show match score and talent type as plain inline text on cards.
- **Do** provide `prefers-reduced-motion` fallbacks and keep `:focus-visible` gold rings.

### Don't:
- **Don't** place a small uppercase / letter-spaced eyebrow or kicker above any heading. Use the heading alone.
- **Don't** use status badges — no green/yellow/red dot or pill encoding "available / on booking / inactive."
- **Don't** add New / Beta / Live / AI-powered feature badges, or accent-dot-plus-badge metadata combos.
- **Don't** overlay tiny metadata chips in card corners or on photo thumbnails (no MatchScoreBadge, TalentTypePill).
- **Don't** use `backdrop-filter: blur()` on cards, panels, toolbars, or buttons — glass is only for full-screen scrims.
- **Don't** attach count-bubble badges to nav items or cards.
- **Don't** use a `border-left`/`border-right` greater than 1px as a colored accent stripe — use full borders or a background tint.
- **Don't** use gradient text (`background-clip: text`) — emphasis comes from weight, size, and the gold accent.
- **Don't** let the surface go cold blue-and-white; this is not a generic SaaS admin panel.

## 7. Threshold surface — agency setup (`/dashboard/agency/setup`)

Agency setup is the one agency route that is **not** an operational screen. It is
crossed once, before the command center exists, and it is where an agency decides
whether Pholio is serious. It therefore gets a staged, one-decision-at-a-time
pace the working screens are denied — the global ban on over-choreographed
page-load sequences (#14) governs the dashboard, not this threshold.

**The setup environment.** The cream surface **is** the page. There is no card, no
shell, no panel, and no split composition — the masthead, the progress rule, the
chapter index, and the dock all run the full width of the viewport, and the work
sits in a generous column with the house voice in the margin beside it. What makes
it feel cinematic is scale, space, and pacing, not a frame around it.

- **Never re-introduce a container.** No centered card, no bordered shell, no
  second panel, no dark side. If the composition could be described as "a panel on
  a background", it is wrong.
- **The progress rule is the signature.** A single hairline across the entire
  viewport under the masthead, filling gold as chapters complete. It is the
  strongest signal that this is an environment rather than a module.
- **Chapters, not sections.** The seven backend setup steps are grouped into five
  chapters; each commits its own steps on Continue. No per-section save buttons,
  and never more than one chapter of forms on screen.
- **The margin note.** The house voice for each chapter sits in the right margin —
  same surface, no fill, no border, a short gold rule above it. Below 1160px it
  folds in as a standfirst between the lede and the work.
- **One selection vocabulary.** Boards, agency type, roster path, open-call choice,
  and the custody acknowledgement all use the same ruled `stg-row` — a real
  checkbox/radio wearing a list row. No chips, no mixed control styles.
- **One work measure.** Fields, option rows, and supporting blocks share a 780px
  cap so every element in a chapter aligns, while the page stays full-bleed.
- **The dock is fixed.** Sticky to the bottom, full width, with the primary action
  in one home across every beat.
- **Motion budget.** A surface fade on load and one crossfade-plus-rise per beat
  (460ms) on `cubic-bezier(0.16, 1, 0.3, 1)`. Everything collapses under
  `prefers-reduced-motion`.
- **Still bound by the bans.** No glass, no badges, no chips, no gradient text, no
  side stripes, no decorative ornament. Gold stays rare: the current chapter, the
  selected row, the primary action, the focus ring, the progress rule.

Loading, error, and the closing "workspace is open" beat all render on the same
cream surface. Once setup completes, the agency lands in the command center and
this system does not appear again.

## 8. Setup information architecture

Setup runs **after** review and approval. The agency already submitted an access
request (`agency_access_requests`) that Pholio read, assessed, and accepted. Setup
therefore **confirms the record** and collects only what the request never asked.
Re-interrogating an approved agency is the failure mode this IA exists to prevent.

### Chapter map

| # | Chapter | Backend steps | Collects |
|---|---------|---------------|----------|
| — | Welcome | none | Nothing. Access-granted arrival. |
| 1 | The record | `profile`, `defaults` | Name, market, website, agency type (all pre-filled from the request) + time zone, currency, measurements |
| 2 | The boards | `boards` | Standing divisions, pre-selected from `primary_boards` |
| 3 | The roster | `roster` | How talent arrives, pre-selected from `migration_interest` |
| 4 | The team | `team` | Real invitations via `POST /api/agency/team` |
| 5 | Intake | `open_call` | Open-call link, inbound email, what talent see |
| 6 | Custody | `privacy` | Minor-record declaration + custody acknowledgement |

### Placement rules

- **Workspace-level facts belong in The record.** Time zone, currency, and units
  are administrative properties of the workspace, not intake routing.
- **Anything talent-facing belongs in Intake.** The public note is what a talent
  reads when submitting, so it sits with open-call routing, not with identity.
- **Inbound email is not the owner's login.** Approval seeds `support_email` with
  the reviewed contact address; Intake is where it is corrected to a published
  agency address.
- **Minors are declared once, in Custody.** Selecting the Kids/Teens board implies
  the declaration and locks the control; the acknowledgement gates completion.
- **The profile endpoint writes every column it reads.** Any chapter that saves
  profile fields must send the complete record or it will null another chapter's
  work.

## 9. Access and activation

**Model: one-time invitation link, password set before setup (Option A).** Already
implemented in `agency-request-review.js` and correct — do not replace it with
temporary credentials.

On approval, `ensureIdentityForRequest` creates the Firebase user with a random
password that is **never disclosed or transmitted**, then `deliverApprovalInvite`
emails a Firebase action link the owner redeems to set their own password.
Redeeming the link is what proves control of the reviewed inbox, which is why the
account is created `emailVerified: true`.

Consequences for setup UI:

- **Setup must not contain a credentials step.** The password already exists by the
  time the owner can reach `/dashboard/agency/setup` — they could not have signed
  in otherwise. A "set your password" screen inside setup would be dead UI.
- The correct place to strengthen access is the **invitation email and the login
  screen**, not the setup flow.
