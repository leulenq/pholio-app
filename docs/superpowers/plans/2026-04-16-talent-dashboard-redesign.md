# Talent Dashboard Visual Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the talent dashboard's shared visual system and Overview tab so the product feels like a premium, editorial extension of the Pholio marketing site.

**Architecture:** CSS token-first approach — structural JSX is unchanged except for one hero tweak. All visual changes live in CSS files. Shared utility classes (`.pholio-card`, `.pholio-label`, `.pholio-section-heading`) encode the design system for reuse across future tabs. The shell, header, and Overview are each updated in their own files.

**Tech Stack:** CSS custom properties (`agency-tokens.css`), plain CSS keyframe animations, React 19 (JSX), no new JS dependencies.

> **Note on testing:** This is a pure visual/CSS implementation. There are no meaningful unit tests to write — correctness is verified visually. Each task ends with a visual check instruction instead of a test run.

---

## File Map

| File | What changes |
|---|---|
| `client/src/styles/utilities.css` | Add `.pholio-card`, `.pholio-label`, `.pholio-section-heading`, `@keyframes dash-entrance`, `@keyframes panel-drop` |
| `client/src/styles/dashboard-shell.css` | Rework canvas background, remove noise texture, update content padding |
| `client/src/shared/components/Header/Header.css` | Full rework: frosted surface, underline nav, refined right zone, height 64px |
| `client/src/domains/talent/components/OverviewView.css` | Full rework: hero, KPI grid, bottom grid, steps, aside, promo |
| `client/src/domains/talent/components/OverviewView.jsx` | Hero structure only: move tier badge inline with eyebrow |

---

## Task 1: Shared Design System Utilities

**Files:**
- Modify: `client/src/styles/utilities.css`

- [ ] **Step 1: Append shared utility classes and keyframes to utilities.css**

Open `client/src/styles/utilities.css` and append the following block at the very end of the file (after line 105):

```css
/* ─── Pholio Dashboard Design System ──────────────────────────────────────── */

/* Shared keyframes */
@keyframes dash-entrance {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes panel-drop {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* Standard elevated card */
.pholio-card {
  background: #FFFFFF;
  border: 1px solid rgba(26, 24, 21, 0.05);
  border-radius: 20px;
  box-shadow:
    0 2px 8px rgba(26, 24, 21, 0.04),
    0 8px 24px -8px rgba(26, 24, 21, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 1);
  transition:
    box-shadow 200ms cubic-bezier(0.16, 1, 0.3, 1),
    transform  200ms cubic-bezier(0.16, 1, 0.3, 1);
}

.pholio-card:hover {
  box-shadow:
    0 4px 16px rgba(26, 24, 21, 0.08),
    0 16px 40px -12px rgba(26, 24, 21, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 1);
  transform: translateY(-1px);
}

/* Section label (all-caps metadata label above sections) */
.pholio-label {
  font-family: var(--ag-font-body);
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--ag-text-3);
  margin: 0 0 14px;
}

/* Section heading (Playfair Display, dashboard scale) */
.pholio-section-heading {
  font-family: var(--ag-font-display);
  font-size: 1.25rem;
  font-weight: 400;
  color: var(--ag-text-0);
  letter-spacing: -0.01em;
  margin: 0;
}
```

- [ ] **Step 2: Visual check**

Run `npm run client:dev` (port 5173). Open any talent dashboard page. Confirm no visual regressions — these classes are not yet used anywhere so nothing should change visually.

- [ ] **Step 3: Commit**

```bash
git add client/src/styles/utilities.css
git commit -m "feat(dashboard): add shared pholio-card, pholio-label, and dash-entrance utilities"
```

---

## Task 2: Dashboard Shell — Canvas & Content Area

**Files:**
- Modify: `client/src/styles/dashboard-shell.css`

- [ ] **Step 1: Replace .dashboard-root styles**

Find the `.dashboard-root` rule (lines 3–19 in `dashboard-shell.css`). Replace the entire rule and its `::before` pseudo-element with:

```css
.dashboard-root {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  font-family: var(--font-family);
  background: #FAF8F5;
  position: relative;
}

/* Single ambient gold glow — top-right corner only */
.dashboard-root::before {
  content: '';
  position: absolute;
  top: 0;
  right: 0;
  width: 700px;
  height: 700px;
  background: radial-gradient(
    ellipse 55% 55% at 100% 0%,
    rgba(201, 165, 90, 0.07) 0%,
    transparent 70%
  );
  pointer-events: none;
  z-index: 0;
}
```

- [ ] **Step 2: Update .dashboard-content padding**

Find the `.dashboard-content` rule (around line 204 in `dashboard-shell.css`). Update the padding:

```css
.dashboard-content {
  flex: 1;
  padding: 0 48px;
  max-width: 1200px;
  width: 100%;
  margin: 0 auto;
  position: relative;
  z-index: 1;
}
```

The `position: relative; z-index: 1` ensures content sits above the `::before` glow.

- [ ] **Step 3: Update responsive padding in .dashboard-content**

Find the `@media (max-width: 1024px)` block and update the padding fallback for `.dashboard-content`:

```css
@media (max-width: 1024px) {
  .dashboard-content {
    padding: 0 28px;
  }
}
```

At the bottom of the file, add a narrow mobile breakpoint:

```css
@media (max-width: 640px) {
  .dashboard-content {
    padding: 0 20px;
  }
}
```

- [ ] **Step 4: Visual check**

Reload the dashboard. The background should be flat warm cream (`#FAF8F5`) with a very subtle gold glow in the top-right corner. The noise texture and multi-stop gradient should be gone. Content should have `48px` horizontal breathing room on each side.

- [ ] **Step 5: Commit**

```bash
git add client/src/styles/dashboard-shell.css
git commit -m "feat(dashboard): refine canvas to warm cream with single ambient gold glow"
```

---

## Task 3: Header Redesign

**Files:**
- Modify: `client/src/shared/components/Header/Header.css`

This is a complete rework of the header visual system. The approach is to find each named rule and replace it in place. Work section by section.

- [ ] **Step 1: Update .header-transparent (main bar)**

Find `.header-transparent` (line 3) and replace the rule:

```css
.header-transparent {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
  padding: 0 2rem;
  gap: 1rem;
  background: rgba(250, 248, 245, 0.88);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(26, 24, 21, 0.06);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.8),
    0 2px 16px rgba(26, 24, 21, 0.04);
  position: sticky;
  top: 0;
  z-index: 50;
  max-width: 1440px;
  margin: 0 auto;
  width: 100%;
}
```

- [ ] **Step 2: Update PHOLIO wordmark styles**

The wordmark is rendered as an inline `<span>` in `Header.jsx` (around line 233–240). Its styles are applied inline in JSX — update the inline style in `Header.jsx`:

Find this block in `Header.jsx` (lines 233–239):
```jsx
<span style={{
  fontFamily: "var(--font-display, 'Playfair Display', serif)",
  fontWeight: 400,
  letterSpacing: "0.2em",
  color: "#C8A96E",
  fontSize: "24px"
}}>
```

Replace with:
```jsx
<span style={{
  fontFamily: "var(--ag-font-display, 'Playfair Display', serif)",
  fontWeight: 400,
  letterSpacing: "0.22em",
  color: "#C9A55A",
  fontSize: "1rem"
}}>
```

- [ ] **Step 3: Replace nav pill container and pills (underline system)**

Find `.nav-pills-container` and `.nav-pill` rules and replace both:

```css
/* Center: Nav — underline indicator system */
.header-center {
  flex: 0 1 auto;
  display: flex;
  justify-content: center;
  margin: 0 auto;
}

.nav-pills-container {
  display: inline-flex;
  gap: 0;
  background: transparent;
  border-radius: 0;
  box-shadow: none;
  padding: 0;
  align-items: stretch;
}

.nav-pill {
  text-decoration: none;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--ag-text-2, #6B6560);
  padding: 0 16px;
  height: 64px;
  display: inline-flex;
  align-items: center;
  border-bottom: 2px solid transparent;
  border-top: 2px solid transparent; /* balances height */
  background: transparent;
  border-radius: 0;
  transition:
    color 150ms cubic-bezier(0.4, 0, 0.2, 1),
    border-color 150ms cubic-bezier(0.4, 0, 0.2, 1);
  white-space: nowrap;
  position: relative;
}

.nav-pill:hover {
  color: var(--ag-text-0, #1A1815);
  background: transparent;
}

.nav-pill.active {
  color: var(--ag-text-0, #1A1815);
  font-weight: 600;
  border-bottom-color: var(--ag-gold, #C9A55A);
  background: transparent;
  box-shadow: none;
}

.nav-pill.is-disabled {
  color: var(--ag-text-4, #C8C2BA);
  border-bottom-color: transparent;
  opacity: 1;
  cursor: pointer;
  border: none;
  border-bottom: 2px solid transparent;
  border-top: 2px solid transparent;
  background: transparent;
}

.nav-pill.is-disabled:hover {
  color: var(--ag-text-3, #9C958E);
  background: transparent;
}
```

- [ ] **Step 4: Update .upgrade-pill**

Find `.upgrade-pill` and replace:

```css
.upgrade-pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  padding: 5px 12px;
  background: transparent;
  border: 1px solid rgba(201, 165, 90, 0.35);
  color: var(--ag-gold, #C9A55A);
  text-decoration: none;
  border-radius: 100px;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  transition: background 150ms cubic-bezier(0.4, 0, 0.2, 1);
}

.upgrade-pill:hover {
  background: rgba(201, 165, 90, 0.08);
  color: var(--ag-gold, #C9A55A);
  border-color: rgba(201, 165, 90, 0.35);
  transform: none;
  box-shadow: none;
}

.upgrade-pill svg {
  color: var(--ag-gold, #C9A55A);
  transition: none;
}

.upgrade-pill:hover svg {
  color: var(--ag-gold, #C9A55A);
}
```

- [ ] **Step 5: Update .header-date**

Find `.header-date` and replace:

```css
.header-date {
  font-size: 0.75rem;
  font-weight: 500;
  color: var(--ag-text-3, #9C958E);
  white-space: nowrap;
}
```

- [ ] **Step 6: Update notification bell**

Find `.notification-bell` and replace just the base rule (keep `.notification-bell-badge` unchanged):

```css
.notification-bell {
  position: relative;
  color: var(--ag-text-2, #6B6560);
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: none;
  background: transparent;
  transition: background 150ms cubic-bezier(0.4, 0, 0.2, 1),
              color 150ms cubic-bezier(0.4, 0, 0.2, 1);
  padding: 0;
}

.notification-bell:hover,
.notification-bell.active {
  background: rgba(26, 24, 21, 0.05);
  color: var(--ag-text-0, #1A1815);
  border-color: transparent;
}
```

- [ ] **Step 7: Update dropdown entrance animations**

Find `@keyframes dropdownIn` (line 739) and replace with the panel-drop timing:

```css
@keyframes dropdownIn {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

Also update `animation` duration in `.profile-dropdown-refined` and `.notification-dropdown-refined` from `0.25s` to `180ms`:

In `.profile-dropdown-refined`:
```css
animation: dropdownIn 180ms cubic-bezier(0.16, 1, 0.3, 1);
```

In `.notification-dropdown-refined`:
```css
animation: dropdownIn 180ms cubic-bezier(0.16, 1, 0.3, 1);
```

- [ ] **Step 8: Fix mobile nav top offset (was 80px, now 64px)**

The mobile backdrop and panel use `top: 80px` (the old header height). Find all occurrences and update:

In `.header-mobile-nav-backdrop`: change `top: 80px` → `top: 64px`
In `.header-mobile-nav-panel`: change `top: 80px` → `top: 64px`

- [ ] **Step 9: Update responsive breakpoints**

Find `@media (max-width: 1024px)` at the bottom and update:

```css
@media (max-width: 1024px) {
  .header-transparent {
    padding: 0 1.5rem;
  }
}

@media (max-width: 768px) {
  .header-center { display: none; }
  .header-date { display: none; }
  .header-mobile-nav { display: flex; }
  .header-left { align-items: center; }
}
```

- [ ] **Step 10: Visual check**

Reload the dashboard. Verify:
- Header is `64px` tall with frosted warm-white background
- PHOLIO wordmark is `1rem`, gold, Playfair Display, more spaced
- Nav tabs show gold `2px` bottom underline on active, no pill background
- Studio+ pill is minimal with gold outline only
- Date text is subtle muted color
- Notification bell is flat (no circle border)
- Profile dropdown/notifications open with a faster, spring-like entrance
- Mobile hamburger panel opens from `64px` top (not `80px`)

- [ ] **Step 11: Commit**

```bash
git add client/src/shared/components/Header/Header.css client/src/shared/components/Header/Header.jsx
git commit -m "feat(header): frosted surface, underline nav indicator, refined right zone"
```

---

## Task 4: Overview Tab — JSX Hero Structure

**Files:**
- Modify: `client/src/domains/talent/components/OverviewView.jsx`

This is a small structural change only: the tier badge moves from a floating pill in `ov-hero-top` to an inline element beside the eyebrow.

- [ ] **Step 1: Replace the hero JSX**

Find the `<header className="ov-hero">` block (lines 137–153 in `OverviewView.jsx`). Replace with:

```jsx
<header className="ov-hero">
  <div className="ov-hero-meta">
    <span className="ov-eyebrow">Welcome back</span>
    <span className="ov-eyebrow-sep" aria-hidden="true">·</span>
    <span className="ov-tier-inline">{tier}</span>
  </div>

  <h1 className="ov-hero-name">
    {profile?.first_name || 'Talent'}
  </h1>

  <p className="ov-hero-tagline">
    You're{' '}
    <span className="ov-tagline-gold">
      shining opportunities
    </span>{' '}
    in the creative industry.
  </p>
</header>
```

The `ov-hero-top`, `ov-tier-badge` classes are removed. The `ov-eyebrow-sep` and `ov-tier-inline` classes are new — they'll be styled in Task 5.

- [ ] **Step 2: Visual check (before CSS)**

The tier badge will temporarily be unstyled inline text next to the eyebrow. That's expected — it gets styled in Task 5.

- [ ] **Step 3: Commit**

```bash
git add client/src/domains/talent/components/OverviewView.jsx
git commit -m "feat(overview): move tier badge inline with hero eyebrow"
```

---

## Task 5: Overview Tab — Full CSS Rework

**Files:**
- Modify: `client/src/domains/talent/components/OverviewView.css`

This is a complete replacement of `OverviewView.css`. Replace the entire file contents with the following:

- [ ] **Step 1: Replace the entire OverviewView.css**

```css
/* ============================================================
   OVERVIEW — Talent Dashboard
   Warm cream canvas · editorial serif hero · gold accents
   Token-first: all colors via --ag-* custom properties
   ============================================================ */

/* ── Keyframes (also defined in utilities.css; safe to duplicate) ── */
@keyframes ov-shimmer {
  0%   { background-position: -600px 0; }
  100% { background-position:  600px 0; }
}

@keyframes ov-spin {
  to { transform: rotate(360deg); }
}

/* ── Page wrapper ── */
.ov-container {
  max-width: 1200px;
  margin: 0 auto;
}

/* ═══════════════════════════════════════════
   HERO
   Editorial serif name, inline tier badge
═══════════════════════════════════════════ */
.ov-hero {
  padding: 80px 0 64px;
  border-bottom: 1px solid rgba(26, 24, 21, 0.05);
  animation: dash-entrance 400ms cubic-bezier(0.16, 1, 0.3, 1) both;
}

/* Eyebrow row: "WELCOME BACK · FREE" */
.ov-hero-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 18px;
}

.ov-eyebrow {
  font-family: var(--ag-font-body);
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--ag-text-3);
  margin: 0;
}

.ov-eyebrow-sep {
  color: var(--ag-text-4);
  font-weight: 300;
  font-size: 0.875rem;
  line-height: 1;
}

.ov-tier-inline {
  font-family: var(--ag-font-body);
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.10em;
  color: var(--ag-text-3);
}

/* Massive editorial name */
.ov-hero-name {
  font-family: var(--ag-font-display);
  font-size: clamp(3.75rem, 6vw, 5.25rem);
  font-weight: 400;
  color: var(--ag-text-0);
  margin: 0 0 22px;
  letter-spacing: -0.03em;
  line-height: 1.05;
}

/* Tagline */
.ov-hero-tagline {
  font-size: 1rem;
  color: var(--ag-text-1);
  margin: 0;
  font-weight: 400;
  line-height: 1.6;
  max-width: 440px;
}

.ov-tagline-gold {
  color: var(--ag-gold);
  font-weight: 500;
}

/* ═══════════════════════════════════════════
   KPI SECTION — 4 equal columns
═══════════════════════════════════════════ */
.ov-kpi-section {
  padding: 40px 0 56px;
}

.ov-kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
}

/* Card */
.ov-kpi {
  background: #FFFFFF;
  border: 1px solid rgba(26, 24, 21, 0.05);
  border-radius: 20px;
  box-shadow:
    0 2px 8px rgba(26, 24, 21, 0.04),
    0 8px 24px -8px rgba(26, 24, 21, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 1);
  padding: 28px 26px;
  display: flex;
  flex-direction: column;
  cursor: default;
  transition:
    box-shadow 200ms cubic-bezier(0.16, 1, 0.3, 1),
    transform  200ms cubic-bezier(0.16, 1, 0.3, 1);
}

.ov-kpi:hover {
  box-shadow:
    0 4px 16px rgba(26, 24, 21, 0.08),
    0 16px 40px -12px rgba(26, 24, 21, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 1);
  transform: translateY(-1px);
}

/* Staggered card entrances */
.ov-kpi:nth-child(1) { animation: dash-entrance 400ms cubic-bezier(0.16, 1, 0.3, 1) 80ms  both; }
.ov-kpi:nth-child(2) { animation: dash-entrance 400ms cubic-bezier(0.16, 1, 0.3, 1) 140ms both; }
.ov-kpi:nth-child(3) { animation: dash-entrance 400ms cubic-bezier(0.16, 1, 0.3, 1) 200ms both; }
.ov-kpi:nth-child(4) { animation: dash-entrance 400ms cubic-bezier(0.16, 1, 0.3, 1) 260ms both; }

.ov-kpi--skeleton { pointer-events: none; }

/* Gold icon */
.ov-kpi-ico {
  color: var(--ag-gold);
  margin-bottom: 16px;
  flex-shrink: 0;
}

/* Large metric */
.ov-kpi-number {
  font-size: 2.25rem;
  font-weight: 700;
  color: var(--ag-text-0);
  line-height: 1;
  letter-spacing: -0.03em;
  margin-bottom: 10px;
  min-height: 2.25rem;
  display: flex;
  align-items: center;
}

.ov-kpi-label {
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.09em;
  color: var(--ag-text-1);
  margin-bottom: 5px;
}

.ov-kpi-sub {
  font-size: 0.8125rem;
  color: var(--ag-text-2);
  font-weight: 500;
}

.ov-kpi-err-inline {
  display: flex;
  align-items: center;
}

/* Non-blocking summary error bar */
.ov-summary-err {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 12px;
  padding: 10px 14px;
  background: rgba(201, 165, 90, 0.06);
  border: 1px solid rgba(201, 165, 90, 0.18);
  border-radius: 10px;
  font-size: 0.8125rem;
  color: var(--ag-text-2);
}

/* ═══════════════════════════════════════════
   BOTTOM — 2-column: main + aside
═══════════════════════════════════════════ */
.ov-bottom {
  display: grid;
  grid-template-columns: 1fr 280px;
  gap: 48px;
  padding: 0 0 80px;
  align-items: start;
  animation: dash-entrance 400ms cubic-bezier(0.16, 1, 0.3, 1) 200ms both;
}

.ov-bottom-main { min-width: 0; }

/* ── Sections ── */
.ov-section { margin-bottom: 32px; }

.ov-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
}

/* Section label — matches .pholio-label */
.ov-label {
  font-family: var(--ag-font-body);
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--ag-text-3);
  margin: 0 0 14px;
}

/* Progress pill */
.ov-progress-pill {
  font-size: 0.625rem;
  font-weight: 600;
  color: var(--ag-gold);
  background: var(--ag-gold-muted);
  border: 1px solid var(--ag-border-gold);
  padding: 3px 10px;
  border-radius: 100px;
  white-space: nowrap;
}

/* ── Next Steps card ── */
.ov-steps-card {
  background: #FFFFFF;
  border: 1px solid rgba(26, 24, 21, 0.05);
  border-radius: 20px;
  box-shadow:
    0 2px 8px rgba(26, 24, 21, 0.04),
    0 8px 24px -8px rgba(26, 24, 21, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 1);
  overflow: hidden;
}

.ov-step {
  display: flex;
  align-items: center;
  gap: 18px;
  padding: 20px 24px;
  border-bottom: 1px solid rgba(26, 24, 21, 0.04);
  position: relative;
  transition: background 180ms cubic-bezier(0.4, 0, 0.2, 1);
}

.ov-step:last-child { border-bottom: none; }

.ov-step::before {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 3px;
  background: linear-gradient(180deg, var(--ag-gold) 0%, #E3CD91 100%);
  opacity: 0;
  transition: opacity 180ms cubic-bezier(0.4, 0, 0.2, 1);
}

.ov-step:hover::before { opacity: 1; }
.ov-step:hover { background: rgba(201, 165, 90, 0.025); }
.ov-step--done { opacity: 0.6; }
.ov-step--skeleton { pointer-events: none; }

.ov-step-check {
  width: 28px; height: 28px;
  border-radius: 50%;
  border: 2px solid var(--ag-border);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  background: #FFFFFF;
  color: var(--ag-text-3);
  transition: all 200ms cubic-bezier(0.16, 1, 0.3, 1);
}

.ov-step-check.checked {
  background: linear-gradient(135deg, var(--ag-gold) 0%, #E3CD91 100%);
  border-color: transparent;
  color: #FFFFFF;
}

.ov-step-num {
  font-size: 0.6875rem;
  font-weight: 700;
  color: var(--ag-text-3);
}

.ov-step-body { flex: 1; min-width: 0; }

.ov-step-title {
  font-size: 0.9375rem;
  font-weight: 600;
  color: var(--ag-text-0);
  margin: 0 0 3px;
  letter-spacing: -0.01em;
}

.ov-step-desc {
  font-size: 0.8125rem;
  color: var(--ag-text-2);
  margin: 0;
}

.ov-step-cta {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 7px 13px;
  background: transparent;
  border: 1.5px solid var(--ag-border-strong);
  color: var(--ag-text-2);
  border-radius: 10px;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 180ms cubic-bezier(0.4, 0, 0.2, 1);
  text-decoration: none;
  white-space: nowrap;
  flex-shrink: 0;
}

.ov-step-cta:hover {
  background: var(--ag-text-0);
  border-color: var(--ag-text-0);
  color: #FFFFFF;
}

/* ═══════════════════════════════════════════
   ASIDE (right column)
═══════════════════════════════════════════ */
.ov-bottom-aside {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.ov-aside-block {}

/* Quick Actions — each action is its own compact card */
.ov-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.ov-action {
  display: flex;
  align-items: center;
  gap: 13px;
  padding: 12px 16px;
  background: #FFFFFF;
  border: 1px solid rgba(26, 24, 21, 0.05);
  border-radius: 14px;
  box-shadow:
    0 2px 8px rgba(26, 24, 21, 0.04),
    0 8px 24px -8px rgba(26, 24, 21, 0.06),
    inset 0 1px 0 rgba(255, 255, 255, 1);
  cursor: pointer;
  transition:
    box-shadow 200ms cubic-bezier(0.16, 1, 0.3, 1),
    transform  200ms cubic-bezier(0.16, 1, 0.3, 1),
    border-color 150ms cubic-bezier(0.4, 0, 0.2, 1);
  text-decoration: none;
  color: inherit;
  width: 100%;
  text-align: left;
}

.ov-action:hover {
  border-color: rgba(201, 165, 90, 0.22);
  box-shadow:
    0 4px 16px rgba(26, 24, 21, 0.08),
    0 16px 40px -12px rgba(26, 24, 21, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 1);
  transform: translateY(-1px);
}

/* Primary action: gold gradient */
.ov-action--primary {
  background: linear-gradient(135deg, var(--ag-gold) 0%, #B8944A 100%);
  border-color: transparent;
  box-shadow: 0 4px 14px -4px rgba(201, 165, 90, 0.38);
}

.ov-action--primary:hover {
  box-shadow: 0 8px 22px -4px rgba(201, 165, 90, 0.48);
  border-color: transparent;
}

.ov-action--primary .ov-action-title,
.ov-action--primary .ov-action-sub,
.ov-action--primary .ov-action-arrow { color: #FFFFFF; }

.ov-action--primary .ov-action-icon {
  background: rgba(255, 255, 255, 0.2);
  color: #FFFFFF;
}

.ov-action-icon {
  width: 34px; height: 34px;
  border-radius: 9px;
  background: var(--ag-surface-2);
  color: var(--ag-text-2);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  transition: transform 180ms cubic-bezier(0.16, 1, 0.3, 1);
}

.ov-action:hover .ov-action-icon { transform: scale(1.06); }

.ov-action-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ov-action-title {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--ag-text-0);
  letter-spacing: -0.01em;
}

.ov-action-sub {
  font-size: 0.6875rem;
  color: var(--ag-text-2);
}

.ov-action-arrow {
  color: var(--ag-text-4);
  flex-shrink: 0;
  transition: transform 180ms cubic-bezier(0.4, 0, 0.2, 1);
}

.ov-action:hover .ov-action-arrow { transform: translateX(2px); }

/* Activity feed */
.ov-activity-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ov-activity-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 9px;
  transition: background 150ms cubic-bezier(0.4, 0, 0.2, 1);
  cursor: default;
}

.ov-activity-item:hover { background: var(--ag-surface-2); }

.ov-activity-dot {
  width: 7px; height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-top: 5px;
}

.ov-activity-body { flex: 1; min-width: 0; }

.ov-activity-msg {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--ag-text-0);
  margin: 0 0 3px;
  line-height: 1.4;
}

.ov-activity-time {
  font-size: 0.6875rem;
  color: var(--ag-text-3);
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.ov-activity-loading {
  display: flex;
  justify-content: center;
  padding: 18px 0;
}

/* Refined empty state — single centered line */
.ov-activity-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 20px 0;
  color: var(--ag-text-4);
}

.ov-activity-empty p {
  font-size: 0.8125rem;
  margin: 0;
  color: var(--ag-text-3);
}

/* Studio+ promo card */
.ov-promo {
  position: relative;
  background: linear-gradient(145deg, #0B0D10 0%, #141820 100%);
  border-radius: 20px;
  padding: 26px 24px;
  overflow: hidden;
  min-height: 190px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
}

.ov-promo-glow {
  position: absolute;
  top: -20px; right: -20px;
  width: 120px; height: 120px;
  background: radial-gradient(circle, rgba(201, 165, 90, 0.18) 0%, transparent 70%);
  pointer-events: none;
}

.ov-promo-content { position: relative; z-index: 1; }

.ov-promo-eyebrow {
  font-size: 0.5625rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--ag-gold);
  margin: 0 0 10px;
}

.ov-promo-title {
  font-family: var(--ag-font-display);
  font-size: 1.375rem;
  font-weight: 400;
  color: #FFFFFF;
  margin: 0 0 8px;
  line-height: 1.2;
  letter-spacing: -0.01em;
}

.ov-promo-body {
  font-size: 0.8125rem;
  color: rgba(245, 243, 240, 0.45);
  margin: 0 0 18px;
  line-height: 1.55;
}

.ov-promo-cta {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 18px;
  background: var(--ag-gold);
  color: #FFFFFF;
  border-radius: 100px;
  font-size: 0.8125rem;
  font-weight: 600;
  text-decoration: none;
  transition: all 200ms cubic-bezier(0.4, 0, 0.2, 1);
}

.ov-promo-cta:hover {
  background: var(--ag-gold-hover);
  transform: translateY(-1px);
  box-shadow: 0 4px 14px rgba(201, 165, 90, 0.38);
}

/* ═══════════════════════════════════════════
   UTILITIES
═══════════════════════════════════════════ */
.ov-retry-btn {
  padding: 5px 12px;
  background: transparent;
  border: 1.5px solid var(--ag-border-strong);
  color: var(--ag-text-2);
  border-radius: 8px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 180ms cubic-bezier(0.4, 0, 0.2, 1);
  white-space: nowrap;
}

.ov-retry-btn:hover:not(:disabled) {
  background: var(--ag-text-0);
  border-color: var(--ag-text-0);
  color: #FFFFFF;
}

.ov-retry-btn:disabled { opacity: 0.55; cursor: not-allowed; }

.ov-spinner {
  width: 20px; height: 20px;
  border: 2px solid var(--ag-surface-4);
  border-top-color: var(--ag-gold);
  border-radius: 50%;
  animation: ov-spin 0.7s linear infinite;
}

/* Skeletons */
.ov-skel {
  background: linear-gradient(
    90deg,
    var(--ag-surface-4) 0%,
    var(--ag-surface-3) 22%,
    var(--ag-surface-4) 44%,
    var(--ag-surface-4) 100%
  );
  background-size: 1200px 100%;
  animation: ov-shimmer 2s linear infinite;
  border-radius: 10px;
}

.ov-skel--icon   { width: 22px; height: 22px; border-radius: 6px; margin-bottom: 16px; }
.ov-skel--num    { height: 2.25rem; width: 40%; border-radius: 10px; margin-bottom: 10px; }
.ov-skel--num-inline { display: inline-block; height: 1.5rem; width: 3rem; border-radius: 6px; }
.ov-skel--label  { height: 11px; width: 60%; }
.ov-skel--sub    { height: 11px; width: 44%; }
.ov-skel--line   { height: 11px; }
.ov-skel--circle { width: 28px; height: 28px; border-radius: 50%; flex-shrink: 0; }

/* Screen reader only */
.overview-sr-only {
  position: absolute;
  width: 1px; height: 1px;
  padding: 0; margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* ═══════════════════════════════════════════
   RESPONSIVE
═══════════════════════════════════════════ */
@media (max-width: 1100px) {
  .ov-bottom {
    grid-template-columns: 1fr;
    gap: 32px;
  }
}

@media (max-width: 900px) {
  .ov-kpi-grid { grid-template-columns: repeat(2, 1fr); }
}

@media (max-width: 640px) {
  .ov-hero { padding: 56px 0 44px; }
  .ov-hero-name { font-size: clamp(2.75rem, 10vw, 4rem); }
  .ov-kpi-grid { grid-template-columns: repeat(2, 1fr); gap: 12px; }
  .ov-bottom { padding-bottom: 56px; }
}

@media (max-width: 400px) {
  .ov-kpi-grid { grid-template-columns: 1fr; }
}

/* ═══════════════════════════════════════════
   REDUCED MOTION
═══════════════════════════════════════════ */
@media (prefers-reduced-motion: reduce) {
  .ov-hero,
  .ov-bottom,
  .ov-kpi:nth-child(1),
  .ov-kpi:nth-child(2),
  .ov-kpi:nth-child(3),
  .ov-kpi:nth-child(4) {
    animation: none;
  }

  .ov-kpi,
  .ov-action,
  .ov-step-cta,
  .ov-promo-cta,
  .ov-action-icon,
  .ov-action-arrow,
  .ov-step::before,
  .ov-step-check {
    transition: none;
  }

  .ov-kpi:hover,
  .ov-action:hover,
  .ov-promo-cta:hover {
    transform: none;
  }

  .ov-spinner { animation: none; opacity: 0.7; }
  .ov-skel    { animation: none; background: var(--ag-surface-3); }
}
```

- [ ] **Step 2: Visual check**

Reload the Overview tab. Verify:
- Hero has generous top padding (`80px`), inline "WELCOME BACK · FREE" eyebrow, massive Playfair name, restrained tagline with gold accent
- KPI cards stagger in on load with spring-like entrance
- KPI cards are `20px` apart, softer shadow, hover lifts with spring
- Bottom grid has `48px` gap between main and aside
- Next Steps rows have more breathing room (`20px 24px` padding)
- Quick Actions are individual cards, each lifts on hover
- Activity empty state is a single centered line
- Studio+ promo has pill CTA and tighter glow
- No hardcoded hex colors — all values should resolve through `--ag-*` tokens

- [ ] **Step 3: Check other tabs for regressions**

Click through Profile, Portfolio, Analytics, Applications tabs. None of their CSS was changed — confirm they look unchanged.

- [ ] **Step 4: Check mobile breakpoints**

Resize browser to 900px (2-column KPI), 640px (smaller hero, 12px gaps), 400px (1-column KPI). Confirm layout holds.

- [ ] **Step 5: Commit**

```bash
git add client/src/domains/talent/components/OverviewView.css
git commit -m "feat(overview): full CSS rework — editorial hero, breathing room, token-first system"
```

---

## Task 6: Final Verification

- [ ] **Step 1: Full dashboard walkthrough**

With `npm run client:dev` running:

1. Log in as a talent user
2. Land on Overview — confirm hero entrance animation, KPI stagger, gold glow in top-right corner of the page
3. Hover each KPI card — confirm lift
4. Hover Quick Action rows — confirm card-level lift
5. Check the header — frosted bar at `64px`, gold underline on "Overview", PHOLIO wordmark is small and refined
6. Click Profile tab — confirm gold underline moves to Profile, Overview loses underline
7. Click back to Overview — animation re-runs cleanly on remount
8. Open profile dropdown — confirm spring-entrance panel animation
9. Confirm no layout breaks on other tabs

- [ ] **Step 2: Reduced motion check**

In browser DevTools → Rendering → Emulate CSS media feature `prefers-reduced-motion: reduce`. Confirm no animations run, all elements appear in final state immediately.

- [ ] **Step 3: Final commit if any cleanup needed**

```bash
git add -p
git commit -m "fix(dashboard): cleanup from final review pass"
```

---

## Summary of All Files Changed

| File | What changed |
|---|---|
| `client/src/styles/utilities.css` | Added `.pholio-card`, `.pholio-label`, `.pholio-section-heading`, keyframes |
| `client/src/styles/dashboard-shell.css` | Canvas → flat cream + single ambient glow; content padding → `48px` |
| `client/src/shared/components/Header/Header.css` | Frosted header `64px`; underline nav; refined upgrade pill, date, bell |
| `client/src/shared/components/Header/Header.jsx` | Wordmark inline style: size `1rem`, spacing `0.22em`, font token |
| `client/src/domains/talent/components/OverviewView.jsx` | Hero: tier badge inline with eyebrow (structural tweak only) |
| `client/src/domains/talent/components/OverviewView.css` | Full replacement: token-first, breathing room, card system, spring easing |
