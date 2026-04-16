# Talent Dashboard Visual Redesign
**Date:** 2026-04-16  
**Scope:** Shared dashboard design system + Overview tab (first full implementation)  
**Approach:** CSS token-first refactor — structural JSX unchanged, CSS overhauled  

---

## Goals

Make the talent dashboard feel like a natural extension of the Pholio marketing site: same aesthetic DNA, same editorial taste level, but adapted for a product dashboard context. Prioritize whitespace, hierarchy, and visual calm over decoration. The Overview tab is the first fully redesigned screen and the reference implementation for all subsequent tabs.

## Non-Goals

- Redesigning any tab other than Overview right now
- Adding Framer Motion or new JS animation dependencies
- Changing routing, data fetching, or component business logic
- Scroll-tied, cursor-driven, or marketing-style motion effects

---

## 1. Shared Design System

### 1.1 Canvas & Shell

**Background treatment (Option B — warm cream + single ambient glow):**
```css
.dashboard-root {
  background: #FAF8F5;
  position: relative;
}
.dashboard-root::before {
  content: '';
  position: absolute;
  top: 0; right: 0;
  width: 700px; height: 700px;
  background: radial-gradient(ellipse 55% 55% at 100% 0%,
    rgba(201,165,90,0.07) 0%, transparent 70%);
  pointer-events: none;
  z-index: 0;
}
```
- Remove noise texture SVG background-image (adds complexity, unnoticeable)
- Remove multi-stop gradient — flat `#FAF8F5` + single glow only
- All content in `dashboard-content` sits above the glow via `position: relative; z-index: 1`

**Content area:**
```css
.dashboard-content {
  padding: 0 48px;   /* was var(--spacing-xl) ≈ 32px */
  max-width: 1200px;
  margin: 0 auto;
}
```

### 1.2 Shared Card Class

New utility class `.pholio-card` to replace ad-hoc card styles across all tabs:

```css
.pholio-card {
  background: #FFFFFF;
  border: 1px solid rgba(26,24,21,0.05);
  border-radius: 20px;
  box-shadow:
    0 2px 8px rgba(26,24,21,0.04),
    0 8px 24px -8px rgba(26,24,21,0.06),
    inset 0 1px 0 rgba(255,255,255,1);
  transition: box-shadow 200ms cubic-bezier(0.16,1,0.3,1),
              transform  200ms cubic-bezier(0.16,1,0.3,1);
}
.pholio-card:hover {
  box-shadow:
    0 4px 16px rgba(26,24,21,0.08),
    0 16px 40px -12px rgba(26,24,21,0.08),
    inset 0 1px 0 rgba(255,255,255,1);
  transform: translateY(-1px);
}
```

Standard padding: `28px 26px`. Compact variant (sidebar): `padding: 14px 16px; border-radius: 14px`.

### 1.3 Section Label

New utility class `.pholio-label` — replaces scattered `.ov-label`, `.ag-label`, etc.:

```css
.pholio-label {
  font-family: var(--ag-font-body);
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.12em;
  color: var(--ag-text-3);   /* #9C958E */
  margin: 0 0 14px;
}
```

### 1.4 Section Heading

New utility class `.pholio-section-heading` for in-dashboard section titles:

```css
.pholio-section-heading {
  font-family: var(--ag-font-display);   /* Playfair Display */
  font-size: 1.25rem;
  font-weight: 400;
  color: var(--ag-text-0);
  letter-spacing: -0.01em;
  margin: 0;
}
```

### 1.5 Motion System (CSS-only, spring easing)

All entrances use `--ag-ease-spring: cubic-bezier(0.16, 1, 0.3, 1)`. No scroll-tied or cursor effects.

```css
/* Standard page section entrance */
@keyframes dash-entrance {
  from { opacity: 0; transform: translateY(10px); }
  to   { opacity: 1; transform: translateY(0); }
}
/* Apply with: animation: dash-entrance 400ms cubic-bezier(0.16,1,0.3,1) both; */
```

Staggered children use `animation-delay` via `nth-child` — no JS.

Hover transitions: `150ms --ag-ease` for color changes, `200ms --ag-ease-spring` for transforms and shadows.

---

## 2. Header Redesign

### 2.1 Surface

```css
.header-transparent {
  height: 64px;                              /* was 80px */
  background: rgba(250,248,245,0.88);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-bottom: 1px solid rgba(26,24,21,0.06);
  box-shadow: 0 1px 0 rgba(255,255,255,0.8),
              0 2px 16px rgba(26,24,21,0.04);
  position: sticky;
  top: 0;
  z-index: 50;
}
```

### 2.2 Wordmark

```css
/* The PHOLIO span in Header.jsx */
font-family: var(--ag-font-display);
font-size: 1rem;
font-weight: 400;
letter-spacing: 0.22em;
color: #C9A55A;
```

No structural change — just size reduced from `24px` to `1rem` (16px). More restrained for a `64px` header.

### 2.3 Navigation — Underline Indicator System

Replaces solid-gold-pill active state:

```css
.nav-pill {
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--ag-text-2);          /* #6B6560 inactive */
  padding: 0 4px;
  height: 64px;
  display: inline-flex;
  align-items: center;
  border-bottom: 2px solid transparent;
  transition: color 150ms var(--ag-ease),
              border-color 150ms var(--ag-ease);
  background: transparent;
  border-radius: 0;
}
.nav-pill:hover {
  color: var(--ag-text-0);          /* #1A1815 */
}
.nav-pill.active {
  color: var(--ag-text-0);
  font-weight: 600;
  border-bottom-color: var(--ag-gold);   /* #C9A55A */
}
.nav-pill.is-disabled {
  color: var(--ag-text-4);          /* #C8C2BA */
  cursor: default;
}
```

The `2px` border-bottom on active tab sits flush with the header's `border-bottom` — they visually merge into a single editorial underline.

### 2.4 Right Zone (left to right)

**Studio+ pill (free users):**
```css
.upgrade-pill {
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  padding: 5px 12px;
  border-radius: 100px;
  border: 1px solid rgba(201,165,90,0.35);
  color: var(--ag-gold);
  background: transparent;
  transition: background 150ms var(--ag-ease);
}
.upgrade-pill:hover {
  background: rgba(201,165,90,0.08);
}
```

**Date string:** `0.75rem / font-weight: 500 / color: --ag-text-3`. Hidden at `< 900px`.

**Notification bell:** `32px` hit target, `border-radius: 8px`, hover: `background: rgba(26,24,21,0.05)`.

**Avatar trigger:** `32px` circle. Subscription dot: `4px`, gold for Pro / `#C8C2BA` for Free, positioned `bottom: 0 right: 0`. Chevron: `10px`, `color: --ag-text-3`.

### 2.5 Dropdown Panels

Profile dropdown and notifications enter with:
```css
animation: panel-drop 180ms cubic-bezier(0.16,1,0.3,1) both;

@keyframes panel-drop {
  from { opacity: 0; transform: translateY(-4px); }
  to   { opacity: 1; transform: translateY(0); }
}
```

---

## 3. Overview Tab Redesign

File: `client/src/domains/talent/components/OverviewView.css`  
Component: `client/src/domains/talent/components/OverviewView.jsx`

### 3.1 Hero

**Structure change — tier badge moves inline with eyebrow:**

```jsx
<header className="ov-hero">
  <div className="ov-hero-meta">
    <span className="ov-eyebrow">Welcome back</span>
    <span className="ov-eyebrow-sep" aria-hidden>·</span>
    <span className="ov-tier-inline">{tier}</span>
  </div>
  <h1 className="ov-hero-name">{profile?.first_name || 'Talent'}</h1>
  <p className="ov-hero-tagline">
    You're <span className="ov-tagline-gold">shining opportunities</span>{' '}
    in the creative industry.
  </p>
</header>
```

The floating pill badge is removed. Tier label becomes inline text beside the eyebrow, separated by a dot. Less visual noise.

**Hero CSS:**
```css
.ov-hero {
  padding: 80px 0 64px;          /* outer padding comes from .dashboard-content */
  border-bottom: 1px solid rgba(26,24,21,0.05);
  margin-bottom: 0;
  animation: dash-entrance 400ms cubic-bezier(0.16,1,0.3,1) both;
}
.ov-hero-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 18px;
}
.ov-eyebrow {
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  color: var(--ag-text-3);
}
.ov-eyebrow-sep {
  color: var(--ag-text-4);
  font-weight: 300;
}
.ov-tier-inline {
  font-size: 0.6875rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.10em;
  color: var(--ag-text-3);
}
.ov-hero-name {
  font-family: var(--ag-font-display);
  font-size: clamp(3.75rem, 6vw, 5.25rem);
  font-weight: 400;
  color: var(--ag-text-0);
  margin: 0 0 22px;
  letter-spacing: -0.03em;
  line-height: 1.05;
}
.ov-hero-tagline {
  font-size: 1rem;
  color: var(--ag-text-1);
  font-weight: 400;
  line-height: 1.6;
  max-width: 440px;
  margin: 0;
}
.ov-tagline-gold {
  color: var(--ag-gold);
  font-weight: 500;
}
```

### 3.2 KPI Grid

```css
.ov-kpi-section {
  padding: 40px 0 56px;
  /* No container-level entrance — card stagger animations own the entrance */
}
.ov-kpi-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 20px;
}
.ov-kpi {
  /* extends .pholio-card */
  background: #FFFFFF;
  border: 1px solid rgba(26,24,21,0.05);
  border-radius: 20px;
  box-shadow:
    0 2px 8px rgba(26,24,21,0.04),
    0 8px 24px -8px rgba(26,24,21,0.06),
    inset 0 1px 0 rgba(255,255,255,1);
  padding: 28px 26px;
  display: flex;
  flex-direction: column;
  transition: box-shadow 200ms cubic-bezier(0.16,1,0.3,1),
              transform  200ms cubic-bezier(0.16,1,0.3,1);
}
.ov-kpi:hover {
  box-shadow:
    0 4px 16px rgba(26,24,21,0.08),
    0 16px 40px -12px rgba(26,24,21,0.08),
    inset 0 1px 0 rgba(255,255,255,1);
  transform: translateY(-1px);
}
/* Staggered entrance */
.ov-kpi:nth-child(1) { animation: dash-entrance 400ms cubic-bezier(0.16,1,0.3,1) 120ms both; }
.ov-kpi:nth-child(2) { animation: dash-entrance 400ms cubic-bezier(0.16,1,0.3,1) 180ms both; }
.ov-kpi:nth-child(3) { animation: dash-entrance 400ms cubic-bezier(0.16,1,0.3,1) 240ms both; }
.ov-kpi:nth-child(4) { animation: dash-entrance 400ms cubic-bezier(0.16,1,0.3,1) 300ms both; }

.ov-kpi-ico {
  color: var(--ag-gold);
  margin-bottom: 16px;
  flex-shrink: 0;
}
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
```

### 3.3 Bottom Grid

```css
.ov-bottom {
  display: grid;
  grid-template-columns: 1fr 280px;
  gap: 48px;
  padding: 0 0 80px;
  align-items: start;
  animation: dash-entrance 400ms cubic-bezier(0.16,1,0.3,1) 200ms both;
}
```

### 3.4 Next Steps

The steps container uses `.pholio-card` surface. Each row:

```css
.ov-step {
  padding: 20px 24px;          /* was 18px 22px */
  gap: 18px;                   /* was 16px */
  border-bottom: 1px solid rgba(26,24,21,0.04);
}
.ov-step:hover { background: rgba(201,165,90,0.025); }
.ov-step-check {
  border-color: var(--ag-border);   /* token instead of hardcoded #E0DAD3 */
}
```

Progress pill margin-left auto, `font-size: 0.625rem`.

### 3.5 Quick Actions (aside)

Each action is its own compact card (replaces grouped container):

```css
.ov-action {
  /* compact .pholio-card */
  background: #FFFFFF;
  border: 1px solid rgba(26,24,21,0.05);
  border-radius: 14px;
  box-shadow:
    0 2px 8px rgba(26,24,21,0.04),
    0 8px 24px -8px rgba(26,24,21,0.06),
    inset 0 1px 0 rgba(255,255,255,1);
  padding: 12px 16px;
  transition: box-shadow 200ms cubic-bezier(0.16,1,0.3,1),
              transform  200ms cubic-bezier(0.16,1,0.3,1);
}
.ov-action:hover {
  border-color: rgba(201,165,90,0.22);
  box-shadow:
    0 4px 16px rgba(26,24,21,0.08),
    0 16px 40px -12px rgba(26,24,21,0.08),
    inset 0 1px 0 rgba(255,255,255,1);
  transform: translateY(-1px);
}
.ov-actions { gap: 8px; }
```

Primary action (Comp Card) keeps gold gradient background, white icon container, white text.

### 3.6 Activity Feed

Empty state refinement:
```css
.ov-activity-empty {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 20px 0;
  color: var(--ag-text-4);
}
/* Replace icon+text stack with single centered line: — Nothing yet — */
```

### 3.7 Studio+ Promo Card

```css
.ov-promo {
  border-radius: 20px;         /* was 18px, matches card system */
  padding: 26px 24px;
  min-height: 190px;           /* was 210px */
}
.ov-promo-glow {
  width: 120px; height: 120px; /* tighter glow */
  top: -20px; right: -20px;
}
.ov-promo-body {
  color: rgba(255,255,255,0.45);  /* was 0.38, more legible */
}
.ov-promo-cta {
  border-radius: 100px;        /* pill shape, was 9px */
}
```

### 3.8 Spacing Summary

| Location | Before | After |
|---|---|---|
| Hero padding top | 72px | 80px |
| Hero padding bottom | 52px | 64px |
| KPI section padding bottom | 56px | 56px (unchanged) |
| KPI card gap | 16px | 20px |
| Bottom grid gap | 40px | 48px |
| Bottom grid padding bottom | 64px | 80px |
| Step row padding | 18px 22px | 20px 24px |

### 3.9 Responsive Breakpoints (unchanged structure, updated values)

```css
@media (max-width: 1100px) {
  .ov-bottom { grid-template-columns: 1fr; gap: 32px; }
}
@media (max-width: 900px) {
  .ov-kpi-grid { grid-template-columns: repeat(2,1fr); }
  .dashboard-content { padding: 0 28px; }
}
@media (max-width: 640px) {
  .ov-hero { padding: 56px 0 44px; }
  .ov-hero-name { font-size: clamp(2.75rem, 10vw, 4rem); }
  .ov-kpi-grid { gap: 12px; }
  .dashboard-content { padding: 0 20px; }
}
```

### 3.10 Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  .ov-hero, .ov-kpi-section, .ov-bottom,
  .ov-kpi, .ov-container { animation: none; }
  .ov-kpi, .ov-action { transition: none; }
  .ov-kpi:hover, .ov-action:hover { transform: none; }
}
```

---

## 4. Files to Change

| File | Change type |
|---|---|
| `client/src/styles/dashboard-shell.css` | Rework canvas background, content padding |
| `client/src/shared/components/Header/Header.css` | Full header rework (height, surface, nav pills) |
| `client/src/domains/talent/components/OverviewView.css` | Full rework per spec above |
| `client/src/domains/talent/components/OverviewView.jsx` | Hero structure: inline tier badge |
| `client/src/styles/agency-tokens.css` | Add `--ag-ease-spring` if not present; verify token completeness |
| `client/src/styles/utilities.css` | Add `.pholio-card`, `.pholio-label`, `.pholio-section-heading`, `@keyframes dash-entrance`, `@keyframes panel-drop` |

## 5. Files NOT to Change

- All other tab components (Profile, Media, Analytics, Applications, Settings)
- Any backend/API files
- React Router config, auth hooks, data fetching logic
- `landing/` directory

---

## 6. Success Criteria

- Dashboard canvas feels warm, atmospheric, and premium without being decorative
- Header reads as distinctly Pholio — frosted, elegant, editorial
- Active nav tab is immediately obvious via gold underline indicator
- Overview hero has strong visual presence; tier badge integrated not floating
- KPI cards feel elevated, breathing, and consistent
- Spacing between sections is noticeably more generous than before
- All values reference CSS tokens — no hardcoded hex in new/updated rules
- `prefers-reduced-motion` respected throughout
- No visual regressions on Profile, Media, Analytics, Applications tabs
