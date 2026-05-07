# Talent Dashboard — Design Spec
**Date:** 2026-05-07
**Status:** Approved
**Scope:** Visual system, app shell, component primitives, and Overview page (reference implementation)

---

## 1. Design Intent

The talent dashboard is a professional workspace for models and other talent to manage their presence on Pholio. It is not a generic SaaS dashboard with fashion styling applied on top. It is a premium identity platform — calm, editorial, and fashion-aware — where the interface itself communicates that a talent's professional presentation is taken seriously.

The design inherits the spirit of the Pholio marketing site (its brand tone, typographic sensibility, and restrained gold character) while adapting it into a denser operational context. The dashboard does not reproduce the marketing site's cinematic dark aesthetic wholesale. Instead it uses a warm cream canvas with a single intentional dark surface — the Identity Presence Panel — as the page's emotional center.

**Key principles:**
- Whitespace is brand language, not empty space to fill
- Restraint creates the premium feel — fewer modules with stronger hierarchy beats a complete but cluttered page
- Typography carries the editorial character, not decoration
- The dark presence panel is earned by the content, not imposed by the chrome
- One primary message per page; supporting modules assist, not compete

---

## 2. Visual Foundation

### 2.1 Color Roles

| Role | Value | Usage |
|---|---|---|
| Canvas | `#FAF8F5` | Page background |
| Surface 1 | `rgba(255,255,255,0.82)` | Sidebar, module cards |
| Surface 2 | `#F5F2EE` | Hover states, input backgrounds |
| Ink | `#1A1815` | Headlines, active nav |
| Ink Deep | `#141210` | Presence panel background |
| Text 0 | `#1A1815` | Page headings |
| Text 1 | `#2D2A26` | Body, module content |
| Text 2 | `#6B6560` | Secondary labels |
| Text 3 | `#9C958E` | Muted, eyebrows, module titles |
| Text 4 | `#C8C2BA` | Ghost, disabled, metadata |
| Gold | `#C9A55A` | Active nav rule, high-priority action bar, tier badge, logo |
| Gold muted | `rgba(201,165,90,0.10)` | Tier badge background, active nav background |
| Gold ghost | `rgba(201,165,90,0.09)` | Presence panel border, sidebar border-right |
| Success | `#2D8A56` | Accepted count, positive delta |
| Warning | `#C2850E` | Pending count, medium-priority actions |
| Neutral | `rgba(156,149,142,0.40)` | Low-priority action bars |
| Panel text | `rgba(245,242,236,0.82)` | Action main text on dark |
| Panel text muted | `rgba(245,242,236,0.32)` | Action sub-text on dark |
| Panel text dim | `rgba(245,242,236,0.28)` | Score denominator on dark |
| Panel gold | `rgba(201,165,90,0.50)` | Eyebrow labels on dark |
| Panel gold ambient | `rgba(201,165,90,0.06)` | Background radial glow in panel |

### 2.2 Typography

| Role | Family | Size | Weight | Tracking | Transform |
|---|---|---|---|---|---|
| Page greeting | Playfair Display | `3.25rem` | 400 | `−0.025em` | Title |
| Section header | Playfair Display | `1.5rem` | 400 | `−0.02em` | Title |
| Presence score | Inter | `6rem` | 700 | `−0.04em` | — |
| Panel interpretation | Playfair Display italic | `1.0625rem` | 400 | `−0.01em` | — |
| Module stat number | Playfair Display | `2.25rem` | 400 | `−0.03em` | — |
| Action text (main) | Inter | `0.8125rem` | 500 | `0` | — |
| Body | Inter | `0.875rem` | 400 | `0` | — |
| Section eyebrow | Inter | `0.5625rem` | 700 | `+0.14em` | Uppercase |
| Nav label | Inter | `0.625rem` | 600 | `+0.09em` | Uppercase |
| Module label | Inter | `0.5625rem` | 700 | `+0.14em` | Uppercase |
| Action sub-text | Inter | `0.625rem` | 400 | `+0.01em` | — |
| Meta / muted | Inter | `0.625rem` | 400 | `+0.01em` | — |

### 2.3 Spacing Scale

Base unit: `4px`. Scale: `4, 8, 12, 16, 20, 24, 28, 32, 40, 48, 56, 64`.

### 2.4 Corner Radius

| Token | Value | Usage |
|---|---|---|
| `sm` | `4px` | Small UI elements |
| `md` | `8px` | Input fields, small buttons |
| `lg` | `12px` | Dropdowns, tooltips |
| `xl` | `16px` | Module cards |
| `2xl` | `20px` | Presence panel, shell |
| `full` | `100px` | Badges, pills, avatar |
| Nav item | `10px` | Sidebar nav items |
| Photo frame | `10px` | Portrait accent in panel |

### 2.5 Shadows and Elevation

Elevation is communicated through background color contrast and borders, not box shadows. Box shadows are reserved for the outer app chrome only.

- **Module cards:** `border: 1px solid rgba(26,24,21,0.06)` — no box-shadow
- **Presence panel:** no box-shadow; the `#141210` background against the `#FAF8F5` canvas is the elevation signal. Ambient glow via `background-image: radial-gradient(ellipse ... rgba(201,165,90,0.06))` only.
- **App shell (outermost):** `box-shadow: 0 40px 120px rgba(20,18,15,0.22), 0 2px 4px rgba(20,18,15,0.08)` — chrome-level only, not repeated on content
- **Sidebar:** `border-right: 1px solid rgba(201,165,90,0.09)` — no shadow

### 2.6 Motion

- **Standard easing:** `cubic-bezier(0.4, 0, 0.2, 1)` — color, opacity, border transitions
- **Spring easing:** `cubic-bezier(0.16, 1, 0.3, 1)` — entrance animations, scale transforms
- **Duration — hover:** `150ms`
- **Duration — state change:** `200ms`
- **Duration — entrance:** `400ms`

Only state changes that carry meaning get transitions. No gratuitous animation. Page section entrances use staggered fade-up (`translateY(12px) → 0`, `opacity: 0 → 1`, spring easing).

---

## 3. App Shell

### 3.1 Layout Dimensions

| Token | Value |
|---|---|
| Sidebar width | `185px` |
| Top bar height | `52px` |
| Content padding X | `60px` |
| Content padding top | `56px` |
| Content padding bottom | `64px` |
| Module gap | `24px` |
| Section gap (between page sections) | `40px` |
| Presence panel internal padding | `48px` top/bottom, `52px` sides |

### 3.2 Top Utility Bar

Height `52px`. `background: rgba(250,248,245,0.97)`. `border-bottom: 1px solid rgba(26,24,21,0.06)`. Sits above both sidebar and content. Not a floating element — no backdrop blur.

**Left zone** (width matches sidebar: `185px`): `PHOLIO.` wordmark in Playfair Display `0.9375rem/400`, `letter-spacing: 0.2em`, `#C9A55A`. The logo only appears here, not repeated in the sidebar body.

**Right zone:** date string (Inter `0.5625rem/600/uppercase`, `#C8C2BA`) → `1px` divider → notification bell icon with gold pip when unread → settings icon → `1px` divider → user avatar (`30px`, gold gradient `#C9A55A → #A8894E`). Icons: Lucide, `15px`, `stroke-width: 1.75`, `#B8B2AA`.

### 3.3 Sidebar

`185px` wide. `background: rgba(255,255,255,0.82)`. `backdrop-filter: blur(20px)`. `border-right: 1px solid rgba(201,165,90,0.09)`. `padding: 28px 0 24px`. Never collapses on desktop.

**Nav items** inside `padding: 0 10px`. Each: `border-radius: 10px`, `padding: 9px 12px`. Default: `rgba(26,24,21,0.38)`. Hover: `rgba(26,24,21,0.65)`, `background: rgba(26,24,21,0.03)`. Active: `#1A1815`, `background: rgba(201,165,90,0.07)`, plus `2px × 18px` gold left rule (positioned against sidebar left edge, `border-radius: 0 2px 2px 0`). Active icon bg: `rgba(201,165,90,0.14)`. Default icon bg: `rgba(26,24,21,0.05)`. Icons: Lucide, `10px`, `stroke-width: 2`.

**Section labels** between groups: Inter `0.5rem/700/uppercase`, `letter-spacing: 0.16em`, `rgba(26,24,21,0.28)`. `padding: 16px 12px 6px`.

**Nav structure:**
- Group "Workspace": Overview, Portfolio, Applications, Analytics
- Group "Profile": My Profile, Comp Card

**Footer:** profile mini-card at bottom. `border-top: 1px solid rgba(26,24,21,0.06)`, `margin: 0 10px`, `padding: 16px 14px 0`. Avatar `26px` gold gradient, name Inter `0.625rem/600` `#2D2A26`, tier Inter `0.5rem/600/uppercase` `#C9A55A`.

### 3.4 Content Area

`background: #FAF8F5`. Scrolls independently. Sidebar and top bar remain fixed. No max-width constraint — the `60px` horizontal padding creates the inset feel.

---

## 4. Component Primitives

### 4.1 Greeting Header

Used at the top of every primary page. Margin below: `40px`.

- Left: eyebrow label (Inter `0.625rem/600/uppercase`, `#9C958E`, `letter-spacing: 0.16em`) stacked above the page subject in Playfair Display `3.25rem/400`, `letter-spacing: -0.025em`. Subject may include inline Tier Badge.
- Right: contextual metadata — label (Inter `0.5625rem/600/uppercase`, `#C8C2BA`) above a value in Playfair Display `1.25rem/400`, `#6B6560`.
- `align-items: flex-end` so right metadata aligns to the name baseline.

### 4.2 Identity Presence Panel

The only dark surface in the dashboard. Appears once per page maximum. Full content width.

```
background: #141210
border-radius: 20px
padding: 48px 52px
border: 1px solid rgba(201,165,90,0.09)
background-image:
  radial-gradient(ellipse 60% 50% at 8% 0%, rgba(201,165,90,0.06), transparent 70%),
  radial-gradient(ellipse 40% 60% at 95% 100%, rgba(201,165,90,0.04), transparent 60%)
```

**Internal layout:** three horizontal zones.

**Score zone** (`200px` fixed, `padding-right: 48px`):
- Eyebrow: Inter `0.5rem/700/uppercase`, `rgba(201,165,90,0.50)`
- Number: Inter `6rem/700`, `letter-spacing: -0.04em`, `#F5F2EC`
- Denominator: Inter `0.875rem/400`, `rgba(245,242,236,0.28)`, `margin-top: -4px`
- Status row: `6px` colored pip + Inter `0.5625rem/600/uppercase` status text

Score status brackets:
- ≥ 70: green pip `rgba(45,138,86,0.9)`, text `"STRONG FOUNDATION"`
- 40–69: amber pip `rgba(194,133,14,0.8)`, text `"NEEDS ATTENTION"`
- < 40: muted pip `rgba(156,149,142,0.6)`, text `"INCOMPLETE"`

**Vertical divider:** `width: 1px`, `background: rgba(201,165,90,0.12)`, full panel height.

**Content zone** (flex `1`, `padding-left: 48px`):
- Eyebrow: `"HOW YOU'RE PRESENTING"`, Inter `0.5rem/700/uppercase`, `rgba(201,165,90,0.50)`
- Interpretation: Playfair Display italic `1.0625rem/400`, `letter-spacing: -0.01em`, `rgba(245,242,236,0.72)`, `line-height: 1.5`, `max-width: 380px`, `margin-bottom: 28px`
- Action list: `display: flex; flex-direction: column; gap: 14px`
  - 2–4 items max, ordered by impact descending
  - Each item: `2px` priority bar + text block (main + sub)
  - Main text: Inter `0.8125rem/500`, `rgba(245,242,236,0.82)`
  - Sub text: Inter `0.625rem/400`, `rgba(245,242,236,0.32)`, `line-height: 1.4`
  - When score ≥ 95 and no gaps exist: action list is hidden; interpretation reads `"Your profile is complete and presenting well."` No empty list rendered.

**Photo accent** (`90px` fixed, `margin-left: 48px`, optional):
- Frame: `82px × 108px`, `border-radius: 10px`, `background: rgba(201,165,90,0.12)`, `border: 1px solid rgba(201,165,90,0.12)`
- Renders the talent's first portfolio image (by sort order) cropped to portrait if available
- Falls back to silhouette placeholder icon when no images exist

### 4.3 Module Card

```
background: rgba(255,255,255,0.75)
border: 1px solid rgba(26,24,21,0.06)
border-radius: 16px
padding: 28px 32px
```

No box-shadow. Module label at top: Inter `0.5625rem/700/uppercase`, `#C8C2BA`, `letter-spacing: 0.14em`, `margin-bottom: 22px`.

### 4.4 Stat Block

Used inside Module Cards.

- Number: Playfair Display `2.25rem/400`, `letter-spacing: -0.03em`
- Label: Inter `0.5625rem/700/uppercase`, `letter-spacing: 0.10em`
- Delta badge (optional): Inter `0.5625rem/600`, success green, inline after number
- Sub-line (optional): Inter `0.625rem/400`, `#9C958E`

Multiple stat blocks sit side by side separated by `1px solid rgba(26,24,21,0.06)` vertical dividers, `24px` padding on each side.

### 4.5 Priority Bar

`width: 2px`, `min-height: 34px`, `border-radius: 2px`. Three tiers:
- High: `#C9A55A` (gold)
- Medium: `rgba(194,133,14,0.65)` (amber)
- Low: `rgba(156,149,142,0.40)` (muted)

Used exclusively inside the Presence Panel action list.

### 4.6 Tier Badge

```
display: inline-flex; align-items: center; gap: 4px
background: rgba(201,165,90,0.10)
border: 1px solid rgba(201,165,90,0.18)
border-radius: 100px
padding: 4px 10px
font: Inter 0.5625rem/700/uppercase; letter-spacing: 0.10em; color: #B8946A
```

Optional `7px` star icon (filled `#C9A55A`). Used in greeting row and inside the presence panel when needed.

### 4.7 Section Eyebrow

Standalone label for naming sections without adding visual weight.

- On dark (presence panel): Inter `0.5rem/700/uppercase`, `letter-spacing: 0.16em`, `rgba(201,165,90,0.50)`
- On light (module cards): Inter `0.5625rem/700/uppercase`, `letter-spacing: 0.14em`, `#C8C2BA`

### 4.8 Empty State

Used inside Module Cards when data is absent.

```
padding: 40px 0; text-align: center
font: Inter 0.875rem/400; color: #9C958E
```

Short, plain sentence. No illustration, no icon, no CTA — just the text. Example: `"No applications yet."` / `"Stats appear after your first week active."`

---

## 5. Overview Page — Reference Implementation

### 5.1 Purpose

The Overview is the first page talent sees after login. Its sole job: help the talent understand the current strength of their professional presentation on Pholio — what is strong, what is missing, and what would most improve how they appear to agencies.

### 5.2 Layout Structure

```
Content area (padding: 56px top, 60px sides, 64px bottom)
│
├── Greeting row                            margin-bottom: 40px
│    Left: "WELCOME BACK," + first name + Tier Badge
│    Right: "Member since" + join month/year
│
├── Identity Presence Panel                 margin-bottom: 40px
│    Score zone | divider | Content zone | Photo accent
│
└── Supporting modules (grid 2-col, gap 24px)
     ├── Applications module (left)
     └── Traction module (right)
```

### 5.3 Greeting Row

- Eyebrow: `"WELCOME BACK,"`
- Name: talent's first name in Playfair Display `3.25rem`
- Tier Badge: inline, `margin-bottom: 6px` to optically align with name baseline
- Right side: label `"MEMBER SINCE"` + value in Playfair `1.25rem` (e.g. `"April 2025"`)

### 5.4 Identity Presence Panel

**Score zone:**
- Eyebrow: `"PROFILE STRENGTH"`
- Number: computed score (0–100)
- Denominator: `"/ 100"`
- Status: bracket-dependent (see 4.2)

**Content zone:**
- Eyebrow: `"HOW YOU'RE PRESENTING"`
- Interpretation: one sentence, Playfair italic, describing the specific situation — generated or template-matched from profile completeness state
- Actions: 2–4 highest-impact improvements, ordered by impact, with priority bars and sub-text explaining why each matters

**Photo accent:** talent's primary portfolio photo if available, otherwise placeholder.

### 5.5 Applications Module

- Label: `"APPLICATIONS"`
- Three stat blocks: Pending (amber), Accepted (green), Declined (muted)
- No chart, table, or list — the three numbers only
- Empty state: `"No applications yet."`

### 5.6 Traction Module

- Label: `"TRACTION THIS WEEK"`
- Two stat blocks: Profile Views (with `+X%` delta if positive week-over-week) / Portfolio Opens (with sub-line `"From X agencies this week"`)
- Empty state: `"Stats appear after your first week active."`

### 5.7 What This Page Excludes

The following are intentionally absent from the Overview:

- Recent activity feed
- Next-steps checklist
- Notification cards or inline alerts
- Profile completion progress bar
- Floating action buttons
- A grid of KPI cards

The Presence Panel is the profile completion signal. Supporting modules add two signals. Nothing else.

---

## 6. Responsive Behavior (Out of Scope for v1)

The v1 build targets `1280px+` desktop. The component and token system must not block these future adaptations:

- Modules stack to single column at `< 900px`
- Presence panel score and content zones stack vertically at `< 900px`; photo accent hides
- Sidebar collapses to icon-only at `< 900px`

These are not built in v1. They are noted here so the component structure doesn't prevent them.

---

## 7. Reference Mockup

A browser-viewable reference mockup was produced during brainstorming at:
`/tmp/pholio-dashboard-v2.html`

This file is not committed to the repo (it is a `/tmp` artifact) but reflects the approved visual direction.
