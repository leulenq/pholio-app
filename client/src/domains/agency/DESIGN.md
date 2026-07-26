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
whether Pholio is serious. It therefore gets a staged entry the working screens are
explicitly denied — the global ban on over-choreographed page-load sequences (#14)
governs the dashboard, not this threshold.

**The Threshold.** A dark ink stage (`#0B0906`) holds one lit paper panel. The paper
is the work: cream stock (`--ag-surface-0`), white fields, the agency system's own
typography. The stage beside it holds the sequence, the house voice for the current
chapter, and the agency lockup as it forms. The frame never moves between beats —
only the chapter body and the voice change.

- **Why dark.** Both Pholio audiences enter through a dark stage: talent through the
  screen test (`domains/onboarding/DESIGN.md`), agencies through this. Landing on the
  cream command center is the arrival, and it only reads as arrival if the threshold
  is a different room.
- **Chapters, not sections.** The seven backend setup steps are grouped into five
  chapters; each commits its own steps on Continue. No per-section save buttons, and
  never more than one chapter of forms on screen.
- **One selection vocabulary.** Boards, agency type, roster path, open-call choice,
  and the custody acknowledgement all use the same ruled `thr-row` — a real
  checkbox/radio wearing a list row. No chips, no mixed control styles.
- **The dock is fixed.** The chapter body scrolls inside the frame; the primary
  action has one home and never moves between beats.
- **Motion budget.** One shell entrance (560ms) and one crossfade-plus-rise per beat
  (440ms), on `cubic-bezier(0.16, 1, 0.3, 1)`. Stage lighting is static gradient — no
  looping ambient animation. Everything collapses under `prefers-reduced-motion`.
- **Still bound by the bans.** No glass, no badges, no chips, no gradient text, no
  side stripes, no decorative ornament. Gold stays rare: the current chapter, the
  selected row, the primary action, the focus ring.

Once setup completes, the agency lands in the cream command center and this system
does not appear again.
