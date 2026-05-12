# Talent Dashboard Overview Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the talent Overview page as a dark editorial dashboard matching the reference site's art direction — oversized serif identity, portfolio book grid, readiness audit panel, exposure stats — implemented cleanly inside Pholio's existing patterns.

**Architecture:** The dark theme lives entirely inside `OverviewView.jsx` / `OverviewView.css`. The outer TalentLayout shell (topbar + sidebar) stays untouched. OverviewView uses a full-bleed `#050505` container that fills the `tl-content` scroll area, with scoped CSS custom properties for dark ink tokens. No new hooks, no new routes, no new API endpoints.

**Tech Stack:** React 19, framer-motion (already installed), existing hooks (`useAuth`, `useAnalytics`, `useQuery`), TanStack Query v5, Lucide React, Sonner toasts.

---

## File Map

| Action | File | Responsibility |
|--------|------|---------------|
| Modify | `client/src/index.css` | Add JetBrains Mono + Noto Serif Display italic to Google Fonts import |
| Rewrite | `client/src/domains/talent/components/OverviewView.css` | Complete dark editorial CSS — ink tokens, typography, grid, all component styles |
| Rewrite | `client/src/domains/talent/components/OverviewView.jsx` | Five-section dark layout: hero identity, portfolio book, readiness guide, exposure intelligence, identity artifacts |

---

## Task 1: Update Font Imports

**Files:**
- Modify: `client/src/index.css:1`

- [ ] **Step 1: Replace the Google Fonts import line**

Open `client/src/index.css`. The current first line is:

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Noto+Serif+Display:wght@400;500;600;700&family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400;1,500;1,600&display=swap');
```

Replace it with:

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&family=Noto+Serif+Display:ital,wght@0,300;0,400;0,500;1,300;1,400;1,500&family=JetBrains+Mono:wght@400;500;600&family=Playfair+Display:ital,wght@0,400;0,600;0,700;1,400;1,500;1,600&display=swap');
```

Changes: adds `JetBrains Mono` for mono labels; adds italic variants for `Noto Serif Display` (needed for `<em>` serif italic gold styling in the hero name and section heads).

- [ ] **Step 2: Verify the page still loads without console errors**

Run `npm run dev:all` (or the already-running dev server), open `http://localhost:5173/dashboard/talent` in a browser, open DevTools console — no new font loading errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/index.css
git commit -m "feat(fonts): add JetBrains Mono and Noto Serif Display italic variants"
```

---

## Task 2: Rewrite OverviewView.css

**Files:**
- Rewrite: `client/src/domains/talent/components/OverviewView.css`

This task writes all styles from scratch. The file is divided into sections: dark canvas tokens → typography utilities → page layout → hero → portfolio book → readiness guide → exposure intelligence → identity artifacts → footer → skeletons → responsive → reduced motion.

- [ ] **Step 1: Write the complete CSS file**

Replace the entire contents of `client/src/domains/talent/components/OverviewView.css` with:

```css
/* ============================================================
   OVERVIEW — Talent Dashboard (Dark Editorial)
   Dark ink canvas · serif identity · gold accents
   ============================================================ */

/* ─── Animations ─── */
@keyframes ov-entrance {
  from { opacity: 0; transform: translateY(16px); }
  to   { opacity: 1; transform: translateY(0); }
}

@keyframes ov-shimmer {
  0%   { background-position: -600px 0; }
  100% { background-position:  600px 0; }
}

@keyframes ov-spin {
  to { transform: rotate(360deg); }
}

@keyframes ov-bar-fill {
  from { width: 0; }
}

/* ─── Dark Canvas Tokens ─── */
.ov-container {
  --ov-ink: #050505;
  --ov-ink-soft: #0F0F0F;
  --ov-ink-panel: #141414;
  --ov-ink-panel-hover: #1A1A1A;
  --ov-gold: #C9A55A;
  --ov-gold-warm: #C8A96E;
  --ov-gold-glow: rgba(201, 165, 90, 0.4);
  --ov-cream: #F5F0E8;
  --ov-text: rgba(245, 240, 230, 0.92);
  --ov-text-soft: rgba(245, 240, 230, 0.55);
  --ov-text-faint: rgba(245, 240, 230, 0.22);
  --ov-border: rgba(255, 255, 255, 0.07);
  --ov-border-gold: rgba(201, 165, 90, 0.18);
  --ov-ease: cubic-bezier(0.22, 1, 0.36, 1);
  --ov-ease-std: cubic-bezier(0.4, 0, 0.2, 1);
  --ov-radius: 10px;

  background: var(--ov-ink);
  color: var(--ov-text);
  min-height: 100%;
  font-family: 'Inter', -apple-system, sans-serif;
  padding: 0;
  margin: 0;
  animation: ov-entrance 0.6s var(--ov-ease) both;
  position: relative;
  overflow: hidden;
}

/* Grain texture overlay */
.ov-container::before {
  content: '';
  position: fixed;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  opacity: 0.028;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.65' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
  mix-blend-mode: multiply;
}

/* ─── Typography Utilities ─── */
.ov-mono {
  font-family: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: var(--ov-gold);
}

.ov-label {
  font-family: 'Inter', -apple-system, sans-serif;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ov-gold);
  margin: 0;
}

.ov-serif {
  font-family: 'Noto Serif Display', Georgia, serif;
  font-weight: 300;
}

/* ─── Inner content wrapper ─── */
.ov-inner {
  position: relative;
  z-index: 2;
  padding: 52px 64px 80px;
  max-width: 1320px;
  margin: 0 auto;
}

/* ═══════════════════════════════════════════
   HERO — Identity Header
═══════════════════════════════════════════ */
.ov-hero {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 60px;
  gap: 32px;
}

.ov-hero-left {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.ov-hero-eyebrow {
  display: flex;
  align-items: center;
  gap: 16px;
}

.ov-hero-name {
  font-family: 'Noto Serif Display', Georgia, serif;
  font-size: clamp(3rem, 6vw, 4.5rem);
  font-weight: 300;
  letter-spacing: -0.02em;
  line-height: 1.0;
  color: var(--ov-text);
  margin: 0;
}

.ov-hero-name em {
  font-style: italic;
  color: var(--ov-gold-warm);
}

.ov-hero-right {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 10px;
  flex-shrink: 0;
}

.ov-status-pill {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  border-radius: 100px;
  border: 1px solid var(--ov-border);
  background: rgba(255, 255, 255, 0.02);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: rgba(245, 240, 230, 0.75);
}

.ov-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #4ade80;
  box-shadow: 0 0 8px rgba(74, 222, 128, 0.5);
  flex-shrink: 0;
}

.ov-discovery-line {
  font-size: 10px;
  font-weight: 500;
  color: var(--ov-text-faint);
  letter-spacing: 0.15em;
  text-transform: uppercase;
}

/* Tier pill — FREE / Studio+ */
.ov-tier-pill {
  display: inline-flex;
  align-items: center;
  border-radius: 100px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  padding: 5px 12px;
  transition: all 0.2s var(--ov-ease-std);
}

.ov-tier-pill--free {
  border: 1px solid rgba(245, 240, 230, 0.15);
  color: rgba(245, 240, 230, 0.4);
  background: transparent;
}

.ov-tier-pill--studio {
  border: 1px solid var(--ov-gold);
  background: var(--ov-gold);
  color: #050505;
}

/* Gold gradient hairline separator */
.ov-hairline {
  width: 100%;
  height: 1px;
  background: linear-gradient(to right, transparent, var(--ov-gold), transparent);
  margin-bottom: 56px;
  opacity: 0.28;
}

/* ═══════════════════════════════════════════
   MAIN GRID — 12-column
═══════════════════════════════════════════ */
.ov-grid {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: 24px;
  margin-bottom: 24px;
}

.ov-col-8 { grid-column: span 8; }
.ov-col-4 { grid-column: span 4; }
.ov-col-6 { grid-column: span 6; }

/* ═══════════════════════════════════════════
   PORTFOLIO BOOK
═══════════════════════════════════════════ */
.ov-book {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.ov-book-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
}

.ov-book-title-group {
  display: flex;
  align-items: center;
  gap: 16px;
}

.ov-book-title {
  margin: 0;
}

.ov-book-title-text {
  display: block;
  font-family: 'Noto Serif Display', Georgia, serif;
  font-size: 2rem;
  font-weight: 300;
  color: var(--ov-text);
  line-height: 1.1;
}

.ov-book-title-text em {
  font-style: italic;
  color: var(--ov-gold-warm);
}

.ov-book-sep {
  width: 1px;
  height: 32px;
  background: var(--ov-border);
  flex-shrink: 0;
}

.ov-book-tags {
  display: flex;
  gap: 8px;
}

.ov-tag {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 100px;
  border: 1px solid var(--ov-border);
  background: rgba(255, 255, 255, 0.03);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: rgba(245, 240, 230, 0.55);
}

.ov-tag--faded { opacity: 0.4; }

.ov-tag::before {
  content: '';
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: rgba(245, 240, 230, 0.2);
  flex-shrink: 0;
}

.ov-book-manage {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--ov-gold);
  background: none;
  border: none;
  cursor: pointer;
  text-decoration: none;
  transition: color 0.2s var(--ov-ease-std);
  padding: 0;
}

.ov-book-manage:hover {
  color: var(--ov-gold-warm);
}

/* Image grid */
.ov-book-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-template-rows: auto auto;
  gap: 12px;
}

.ov-book-featured {
  grid-column: span 2;
  grid-row: span 2;
  position: relative;
  overflow: hidden;
  border-radius: var(--ov-radius);
  border: 1px solid var(--ov-border);
  background: var(--ov-ink-panel);
  aspect-ratio: 3/4;
  cursor: pointer;
}

.ov-book-featured:hover { transform: translateY(-3px); }
.ov-book-featured { transition: transform 0.4s var(--ov-ease); }

.ov-book-img-small {
  position: relative;
  overflow: hidden;
  border-radius: var(--ov-radius);
  border: 1px solid var(--ov-border);
  background: var(--ov-ink-panel);
  aspect-ratio: 1/1;
  cursor: pointer;
  transition: transform 0.3s var(--ov-ease);
}

.ov-book-img-small:hover { transform: scale(1.02); }

.ov-book-more {
  border-radius: var(--ov-radius);
  border: 1px solid rgba(255, 255, 255, 0.07);
  background: var(--ov-ink-panel);
  aspect-ratio: 1/1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  cursor: pointer;
  transition: background 0.2s var(--ov-ease-std);
  text-decoration: none;
}

.ov-book-more:hover { background: rgba(255, 255, 255, 0.04); }

.ov-book-more-count {
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  font-weight: 500;
  color: rgba(245, 240, 230, 0.2);
  transition: color 0.2s var(--ov-ease-std);
  text-transform: uppercase;
}

.ov-book-more-label {
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: rgba(245, 240, 230, 0.1);
}

.ov-book-more:hover .ov-book-more-count { color: var(--ov-gold); }

.ov-book-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  border-radius: var(--ov-radius);
  border: 1px dashed rgba(255, 255, 255, 0.1);
  aspect-ratio: 1/1;
  cursor: pointer;
  text-decoration: none;
  background: transparent;
  transition: border-color 0.2s var(--ov-ease-std);
  border-style: dashed;
}

.ov-book-empty:hover { border-color: var(--ov-gold-border); }

.ov-book-photo {
  width: 100%;
  height: 100%;
  object-fit: cover;
  /* Default: desaturated and dimmed */
  filter: grayscale(100%);
  opacity: 0.4;
  transition: filter 700ms ease-out, opacity 700ms ease-out;
  display: block;
}

.ov-book-featured:hover .ov-book-photo,
.ov-book-img-small:hover .ov-book-photo {
  filter: grayscale(0);
  opacity: 1;
}

/* Featured overlay (visible on hover) */
.ov-book-featured-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(to top, rgba(5, 5, 5, 0.88) 0%, transparent 55%);
  opacity: 0;
  transition: opacity 0.4s var(--ov-ease-std);
  padding: 24px;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  pointer-events: none;
}

.ov-book-featured:hover .ov-book-featured-overlay { opacity: 1; }

.ov-book-featured-eyebrow {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  color: var(--ov-gold);
  margin-bottom: 4px;
}

.ov-book-featured-caption {
  font-family: 'Noto Serif Display', Georgia, serif;
  font-size: 1.125rem;
  font-weight: 300;
  color: var(--ov-text);
  line-height: 1.3;
}

/* ═══════════════════════════════════════════
   READINESS GUIDE
═══════════════════════════════════════════ */
.ov-readiness {
  display: flex;
  flex-direction: column;
  border-radius: 14px;
  border: 1px solid var(--ov-border);
  background: var(--ov-ink-soft);
  padding: 28px 24px;
}

.ov-readiness-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 24px;
}

.ov-readiness-title {
  margin: 4px 0 0;
  font-family: 'Noto Serif Display', Georgia, serif;
  font-size: 1.625rem;
  font-weight: 300;
  color: var(--ov-text);
  line-height: 1.15;
}

.ov-readiness-title em {
  font-style: italic;
  color: var(--ov-gold-warm);
}

.ov-readiness-pct {
  font-family: 'Noto Serif Display', Georgia, serif;
  font-size: 2.25rem;
  font-weight: 300;
  color: rgba(245, 240, 230, 0.5);
  line-height: 1;
  flex-shrink: 0;
}

.ov-readiness-pct sup {
  font-size: 0.875rem;
  opacity: 0.35;
  vertical-align: super;
  line-height: 0;
}

/* Checklist */
.ov-checklist {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.ov-check-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: background 0.15s var(--ov-ease-std),
              border-color 0.15s var(--ov-ease-std),
              transform 0.15s var(--ov-ease-std);
  text-decoration: none;
}

.ov-check-item:hover {
  background: rgba(255, 255, 255, 0.025);
  border-color: var(--ov-border);
  transform: translateX(4px);
}

.ov-check-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.ov-check-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}

.ov-check-dot--critical { background: #f87171; }
.ov-check-dot--success  { background: #4ade80; box-shadow: 0 0 8px rgba(74, 222, 128, 0.35); }
.ov-check-dot--none     { background: rgba(255, 255, 255, 0.1); }

.ov-check-label {
  font-size: 11px;
  font-weight: 500;
  color: rgba(245, 240, 230, 0.7);
  transition: color 0.15s var(--ov-ease-std);
}

.ov-check-item:hover .ov-check-label {
  color: var(--ov-text);
}

.ov-check-right {
  display: flex;
  align-items: center;
  gap: 14px;
}

.ov-check-status {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--ov-text-faint);
}

.ov-check-arrow {
  color: rgba(255, 255, 255, 0.1);
  transition: color 0.15s var(--ov-ease-std);
  flex-shrink: 0;
}

.ov-check-item:hover .ov-check-arrow {
  color: var(--ov-gold);
}

/* Continue Audit CTA */
.ov-audit-cta {
  margin-top: 20px;
  width: 100%;
  padding: 14px;
  border-radius: 100px;
  background: #fff;
  color: #050505;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.3em;
  text-transform: uppercase;
  border: none;
  cursor: pointer;
  transition: background 0.2s var(--ov-ease-std),
              box-shadow 0.2s var(--ov-ease-std),
              transform 0.2s var(--ov-ease-std);
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.4);
}

.ov-audit-cta:hover {
  background: var(--ov-gold);
  box-shadow: 0 8px 28px rgba(201, 165, 90, 0.35);
  transform: scale(1.02);
}

.ov-audit-cta:active { transform: scale(0.98); }

/* ═══════════════════════════════════════════
   EXPOSURE INTELLIGENCE
═══════════════════════════════════════════ */
.ov-exposure {
  border-radius: 14px;
  border: 1px solid var(--ov-border);
  background: var(--ov-ink-soft);
  padding: 28px;
}

.ov-exposure-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 36px;
}

.ov-exposure-title {
  margin: 4px 0 0;
  font-family: 'Noto Serif Display', Georgia, serif;
  font-size: 1.625rem;
  font-weight: 300;
  color: var(--ov-text);
  line-height: 1.15;
}

.ov-exposure-title em {
  font-style: italic;
  color: var(--ov-gold-warm);
}

.ov-ranking-chip {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 7px 14px;
  border-radius: 100px;
  border: 1px solid var(--ov-border);
  background: rgba(255, 255, 255, 0.04);
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(245, 240, 230, 0.55);
  flex-shrink: 0;
  white-space: nowrap;
}

.ov-stats-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 28px 48px;
}

.ov-stat-number {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin-bottom: 6px;
}

.ov-stat-value {
  font-size: 2.5rem;
  font-weight: 300;
  letter-spacing: -0.03em;
  line-height: 1;
  color: var(--ov-text);
}

.ov-stat-value--gold { color: var(--ov-gold); }

.ov-stat-delta-positive {
  font-size: 10px;
  font-weight: 700;
  color: #4ade80;
}

.ov-stat-delta-neutral {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.15em;
  text-transform: uppercase;
  color: var(--ov-text-faint);
}

.ov-stat-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: var(--ov-text-faint);
}

/* Visibility Index bar */
.ov-visibility {
  grid-column: span 2;
}

.ov-visibility-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  margin-bottom: 10px;
}

.ov-visibility-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(245, 240, 230, 0.38);
}

.ov-visibility-note {
  font-family: 'Noto Serif Display', Georgia, serif;
  font-size: 11px;
  font-style: italic;
  color: var(--ov-gold-warm);
  letter-spacing: 0.04em;
}

.ov-vis-track {
  height: 6px;
  width: 100%;
  background: rgba(255, 255, 255, 0.05);
  border-radius: 100px;
  overflow: hidden;
}

.ov-vis-fill {
  height: 100%;
  background: var(--ov-gold);
  border-radius: 100px;
  box-shadow: 0 0 12px rgba(201, 165, 90, 0.4);
  animation: ov-bar-fill 1.4s cubic-bezier(0.22, 1, 0.36, 1) both;
}

/* ═══════════════════════════════════════════
   IDENTITY ARTIFACTS
═══════════════════════════════════════════ */
.ov-artifacts {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

/* Comp Card — white card */
.ov-artifact-card {
  border-radius: 14px;
  padding: 22px 20px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  min-height: 200px;
  cursor: pointer;
  transition: transform 0.3s var(--ov-ease);
  text-decoration: none;
  color: inherit;
  border: none;
  background: none;
  text-align: left;
  width: 100%;
}

.ov-artifact-card:hover { transform: translateY(-3px); }

.ov-artifact-card--light {
  background: #fff;
  color: #050505;
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
}

.ov-artifact-card--dark {
  background: var(--ov-ink-panel);
  border: 1px solid var(--ov-border);
  color: var(--ov-text);
}

.ov-artifact-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 16px;
}

.ov-artifact-card--light .ov-artifact-icon {
  background: rgba(5, 5, 5, 0.05);
  color: rgba(5, 5, 5, 0.4);
}

.ov-artifact-card--dark .ov-artifact-icon {
  background: rgba(255, 255, 255, 0.05);
  color: rgba(245, 240, 230, 0.2);
}

.ov-artifact-card--dark:hover .ov-artifact-icon {
  color: var(--ov-gold);
}

.ov-artifact-card--dark .ov-artifact-icon {
  transition: color 0.2s var(--ov-ease-std);
}

.ov-artifact-title {
  font-family: 'Noto Serif Display', Georgia, serif;
  font-size: 1.25rem;
  font-weight: 300;
  line-height: 1.2;
  margin: 0 0 8px;
}

.ov-artifact-title em { font-style: italic; }

.ov-artifact-card--light .ov-artifact-title em { color: rgba(5, 5, 5, 0.6); }
.ov-artifact-card--dark  .ov-artifact-title em { color: var(--ov-gold-warm); }

.ov-artifact-desc {
  font-size: 10px;
  font-weight: 500;
  line-height: 1.6;
  margin: 0;
}

.ov-artifact-card--light .ov-artifact-desc { color: rgba(5, 5, 5, 0.55); }
.ov-artifact-card--dark  .ov-artifact-desc { color: rgba(245, 240, 230, 0.28); }

.ov-artifact-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 24px;
}

.ov-artifact-badge {
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  padding: 4px 8px;
  border-radius: 4px;
}

.ov-artifact-card--light .ov-artifact-badge {
  background: rgba(5, 5, 5, 0.05);
  color: rgba(5, 5, 5, 0.5);
}

.ov-artifact-badge--missing {
  font-family: 'Noto Serif Display', Georgia, serif;
  font-style: italic;
  font-size: 10px;
  font-weight: 400;
  letter-spacing: 0.04em;
  color: var(--ov-gold);
  background: none;
  padding: 0;
}

.ov-artifact-action {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.2em;
  text-transform: uppercase;
}

.ov-artifact-card--light .ov-artifact-action {
  color: rgba(5, 5, 5, 0.35);
  transition: color 0.2s var(--ov-ease-std);
}

.ov-artifact-card--light:hover .ov-artifact-action { color: rgba(5, 5, 5, 0.85); }

.ov-artifact-card--dark .ov-artifact-action {
  color: rgba(245, 240, 230, 0.12);
  transition: color 0.2s var(--ov-ease-std);
}

.ov-artifact-card--dark:hover .ov-artifact-action { color: var(--ov-gold); }

/* ═══════════════════════════════════════════
   FOOTER
═══════════════════════════════════════════ */
.ov-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: 52px;
  padding-top: 24px;
  border-top: 1px solid var(--ov-border);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.4em;
  text-transform: uppercase;
  color: rgba(245, 240, 230, 0.2);
}

.ov-footer-nav {
  display: flex;
  gap: 32px;
  flex-wrap: wrap;
}

.ov-footer-link {
  cursor: pointer;
  transition: color 0.3s var(--ov-ease-std),
              letter-spacing 0.3s var(--ov-ease-std);
  padding: 4px;
  color: inherit;
  text-decoration: none;
  border: none;
  background: none;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.4em;
  text-transform: uppercase;
}

.ov-footer-link:hover,
.ov-footer-link--active {
  color: var(--ov-gold);
  letter-spacing: 0.55em;
}

.ov-footer-meta {
  display: flex;
  align-items: center;
  gap: 16px;
  font-family: 'JetBrains Mono', monospace;
  opacity: 0.6;
}

.ov-footer-node {
  display: flex;
  align-items: center;
  gap: 8px;
}

.ov-footer-dot {
  width: 4px;
  height: 4px;
  border-radius: 50%;
  background: var(--ov-gold);
  flex-shrink: 0;
}

.ov-footer-sep {
  width: 1px;
  height: 12px;
  background: rgba(255, 255, 255, 0.18);
}

/* ═══════════════════════════════════════════
   LOADING STATES
═══════════════════════════════════════════ */
.ov-skel {
  border-radius: 6px;
  background: linear-gradient(
    90deg,
    rgba(255, 255, 255, 0.04) 0%,
    rgba(255, 255, 255, 0.08) 22%,
    rgba(255, 255, 255, 0.04) 44%,
    rgba(255, 255, 255, 0.04) 100%
  );
  background-size: 1200px 100%;
  animation: ov-shimmer 2s linear infinite;
}

.ov-skel--name   { height: 4rem; width: 280px; border-radius: 8px; }
.ov-skel--label  { height: 10px; width: 100px; margin-bottom: 8px; }
.ov-skel--img    { width: 100%; height: 100%; position: absolute; inset: 0; border-radius: inherit; }
.ov-skel--line   { height: 10px; }

.ov-spinner {
  width: 18px;
  height: 18px;
  border: 2px solid rgba(255, 255, 255, 0.08);
  border-top-color: var(--ov-gold);
  border-radius: 50%;
  animation: ov-spin 0.8s linear infinite;
}

.ov-error-inline {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  border-radius: 8px;
  background: rgba(248, 113, 113, 0.08);
  border: 1px solid rgba(248, 113, 113, 0.18);
  font-size: 12px;
  color: rgba(245, 240, 230, 0.6);
}

.ov-retry-btn {
  padding: 4px 10px;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(245, 240, 230, 0.55);
  border-radius: 6px;
  font-size: 11px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s var(--ov-ease-std);
  white-space: nowrap;
}

.ov-retry-btn:hover:not(:disabled) {
  border-color: var(--ov-gold);
  color: var(--ov-gold);
}

.ov-retry-btn:disabled { opacity: 0.45; cursor: not-allowed; }

/* ═══════════════════════════════════════════
   RESPONSIVE
═══════════════════════════════════════════ */
@media (max-width: 1100px) {
  .ov-inner { padding: 40px 40px 64px; }
  .ov-col-8 { grid-column: span 12; }
  .ov-col-4 { grid-column: span 12; }
  .ov-col-6 { grid-column: span 12; }
}

@media (max-width: 800px) {
  .ov-inner { padding: 28px 20px 48px; }
  .ov-hero { flex-direction: column; align-items: flex-start; gap: 20px; }
  .ov-hero-right { align-items: flex-start; }
  .ov-book-grid { grid-template-columns: repeat(2, 1fr); }
  .ov-book-featured { grid-column: span 2; grid-row: span 1; aspect-ratio: 16/9; }
  .ov-artifacts { grid-template-columns: 1fr; }
}

/* ═══════════════════════════════════════════
   REDUCED MOTION
═══════════════════════════════════════════ */
@media (prefers-reduced-motion: reduce) {
  .ov-container { animation: none; }
  .ov-book-photo { transition: none; }
  .ov-book-featured, .ov-book-img-small, .ov-artifact-card { transition: none; }
  .ov-vis-fill { animation: none; width: var(--fill-target, 0); }
  .ov-skel { animation: none; background: rgba(255, 255, 255, 0.05); }
}
```

- [ ] **Step 2: Verify no CSS parse errors**

Open the browser DevTools Console — no red CSS errors.

- [ ] **Step 3: Commit**

```bash
git add client/src/domains/talent/components/OverviewView.css
git commit -m "feat(overview): write dark editorial CSS — ink tokens, grid, all component styles"
```

---

## Task 3: Rewrite OverviewView.jsx

**Files:**
- Rewrite: `client/src/domains/talent/components/OverviewView.jsx`

This is the main implementation. We write the complete JSX file with five sections and all data wiring. The component uses existing hooks (`useAuth`, `useAnalytics`) and React Query (`useQuery` for applications). We do NOT add new API calls.

- [ ] **Step 1: Write the complete component file**

Replace the entire contents of `client/src/domains/talent/components/OverviewView.jsx` with:

```jsx
import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import {
  ArrowUpRight,
  Camera,
  ChevronRight,
  Download,
  FileText,
  Activity,
  TrendingUp,
  AlertCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../auth/hooks/useAuth';
import { useAnalytics } from '../hooks/useAnalytics';
import { talentApi } from '../api/talent';
import './OverviewView.css';

// ── Helpers ────────────────────────────────────────────────────────────────

function imageUrl(img) {
  if (!img) return null;
  const src = img.public_url || img.path;
  if (!src) return null;
  if (src.startsWith('http')) return src;
  return src.startsWith('/') ? src : `/uploads/${src}`;
}

function asNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function applicationsCount(payload) {
  if (Array.isArray(payload)) return { ok: true, count: payload.length };
  if (payload?.data && Array.isArray(payload.data)) return { ok: true, count: payload.data.length };
  return { ok: false };
}

// Derive readiness checklist from profile + images
function buildChecklist(images, completeness, profile) {
  const hasPhotos = Array.isArray(images) && images.length > 0;
  const profilePct = asNum(completeness?.percentage);
  const hasMeasurements = !!(
    profile?.height || profile?.measurements || profile?.chest || profile?.waist || profile?.hips
  );
  const hasResume = profilePct >= 40; // rough proxy

  return [
    {
      id: 'photos',
      label: 'Casting Polaroids',
      status: hasPhotos ? 'Verified' : 'Required',
      urgency: hasPhotos ? 'success' : 'critical',
      link: '/dashboard/talent/media',
    },
    {
      id: 'profile',
      label: 'Digital Resume',
      status: hasResume ? 'In Sync' : 'Incomplete',
      urgency: hasResume ? 'success' : 'critical',
      link: '/dashboard/talent/profile',
    },
    {
      id: 'measurements',
      label: 'Measurements & Specs',
      status: hasMeasurements ? 'Verified' : 'Required',
      urgency: hasMeasurements ? 'success' : 'critical',
      link: '/dashboard/talent/profile',
    },
    {
      id: 'reel',
      label: 'Intro Reel (30s)',
      status: 'Optional',
      urgency: 'none',
      link: '/dashboard/talent/media',
    },
  ];
}

// ── Component ──────────────────────────────────────────────────────────────

export default function OverviewView() {
  const { profile, subscription, completeness, images, isLoading: profileLoading } = useAuth();
  const {
    summary,
    summaryError,
    isLoading: analyticsLoading,
    refetch: refetchAnalytics,
    isAnalyticsRefetching,
  } = useAnalytics();

  const {
    data: applicationsPayload,
    isPending: appsPending,
    isError: appsError,
    refetch: refetchApps,
    isFetching: appsFetching,
  } = useQuery({
    queryKey: ['applications'],
    queryFn: () => talentApi.getApplications(),
    staleTime: 60 * 1000,
    retry: 1,
  });

  const firstName = profile?.first_name || '';
  const lastName = profile?.last_name || '';
  const displayName = firstName || 'Talent';

  const isPro = !!subscription?.isPro;
  const views = asNum(summary?.views?.total);
  const downloads = asNum(summary?.downloads?.total);
  const viewsDelta = asNum(summary?.views?.changePct);
  const readinessPct = asNum(completeness?.percentage);
  const visibilityPct = Math.min(100, readinessPct);
  const appsParsed = applicationsCount(applicationsPayload);
  const appsCount = appsParsed.ok ? appsParsed.count : 0;

  const checklist = buildChecklist(images, completeness, profile);

  // Portfolio images (first 5 slots)
  const photoSlots = Array.isArray(images) ? images.slice(0, 5) : [];
  const extraCount = Math.max(0, (Array.isArray(images) ? images.length : 0) - 5);

  const handleCompCard = () => {
    toast.info('Comp card download is not available yet — coming in a future update.');
  };

  return (
    <div className="ov-container">
      <div className="ov-inner">

        {/* ════════════════════════════════
            HERO — Identity
        ════════════════════════════════ */}
        <header className="ov-hero">
          <motion.div
            className="ov-hero-left"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="ov-hero-eyebrow">
              <span className="ov-mono">Dashboard</span>
              <span className={`ov-tier-pill ${isPro ? 'ov-tier-pill--studio' : 'ov-tier-pill--free'}`}>
                {isPro ? 'Studio+ Member' : 'Free'}
              </span>
            </div>

            {profileLoading ? (
              <div className="ov-skel ov-skel--name" />
            ) : (
              <h1 className="ov-hero-name">
                {firstName}{firstName && lastName ? ' ' : ''}
                {lastName && <em>{lastName}</em>}
                {!firstName && !lastName && 'Your Portfolio'}
              </h1>
            )}
          </motion.div>

          <div className="ov-hero-right">
            <div className="ov-status-pill">
              <span className="ov-status-dot" aria-hidden />
              Actively Seeking Work
            </div>
            <p className="ov-discovery-line">Global Discovery Primary</p>
          </div>
        </header>

        {/* ════════════════════════════════
            GOLD HAIRLINE SEPARATOR
        ════════════════════════════════ */}
        <div className="ov-hairline" aria-hidden />

        {/* ════════════════════════════════
            ROW 1: Portfolio Book (8) + Readiness Guide (4)
        ════════════════════════════════ */}
        <div className="ov-grid" style={{ marginBottom: '24px' }}>

          {/* ── Portfolio Book ── */}
          <div className="ov-col-8">
            <div className="ov-book">
              <div className="ov-book-header">
                <div className="ov-book-title-group">
                  <div className="ov-book-title">
                    <span className="ov-label" style={{ display: 'block', marginBottom: '6px' }}>Portfolio</span>
                    <span className="ov-book-title-text">The <em>Book.</em></span>
                  </div>
                  <div className="ov-book-sep" aria-hidden />
                  <div className="ov-book-tags">
                    <span className="ov-tag">Editorial</span>
                    <span className="ov-tag ov-tag--faded">Casting</span>
                  </div>
                </div>

                <Link to="/dashboard/talent/media" className="ov-book-manage" aria-label="Manage portfolio frames">
                  Manage Frames <ArrowUpRight size={12} aria-hidden />
                </Link>
              </div>

              <div className="ov-book-grid" role="list" aria-label="Portfolio images">

                {/* Featured — col 2×2 */}
                {photoSlots[0] ? (
                  <Link
                    to="/dashboard/talent/media"
                    className="ov-book-featured"
                    role="listitem"
                    aria-label="Featured portfolio image"
                  >
                    <img
                      src={imageUrl(photoSlots[0])}
                      alt="Featured portfolio"
                      className="ov-book-photo"
                    />
                    <div className="ov-book-featured-overlay" aria-hidden>
                      <span className="ov-book-featured-eyebrow">Featured Cover</span>
                      <p className="ov-book-featured-caption">Your best work</p>
                    </div>
                  </Link>
                ) : (
                  <Link to="/dashboard/talent/media" className="ov-book-featured ov-book-empty" role="listitem">
                    <Camera size={22} color="rgba(245,240,230,0.15)" aria-hidden />
                    <span className="ov-book-more-label">Add Photo</span>
                  </Link>
                )}

                {/* Small slots 1–3 */}
                {[1, 2, 3].map((idx) => {
                  const img = photoSlots[idx];
                  if (img) {
                    return (
                      <Link
                        key={idx}
                        to="/dashboard/talent/media"
                        className="ov-book-img-small"
                        role="listitem"
                        aria-label={`Portfolio image ${idx + 1}`}
                      >
                        <img
                          src={imageUrl(img)}
                          alt=""
                          className="ov-book-photo"
                        />
                      </Link>
                    );
                  }
                  return (
                    <Link
                      key={idx}
                      to="/dashboard/talent/media"
                      className="ov-book-img-small ov-book-empty"
                      role="listitem"
                      aria-label="Add portfolio image"
                    >
                      <Camera size={16} color="rgba(245,240,230,0.1)" aria-hidden />
                    </Link>
                  );
                })}

                {/* "+N more" or 4th image */}
                {photoSlots[4] && extraCount > 0 ? (
                  <Link to="/dashboard/talent/media" className="ov-book-more" role="listitem" aria-label={`View ${extraCount} more images`}>
                    <span className="ov-book-more-count">+{extraCount}</span>
                    <span className="ov-book-more-label">Frames</span>
                  </Link>
                ) : photoSlots[4] ? (
                  <Link to="/dashboard/talent/media" className="ov-book-img-small" role="listitem">
                    <img src={imageUrl(photoSlots[4])} alt="" className="ov-book-photo" />
                  </Link>
                ) : (
                  <Link to="/dashboard/talent/media" className="ov-book-more" role="listitem" aria-label="Add more images">
                    <Camera size={16} color="rgba(245,240,230,0.1)" aria-hidden />
                    <span className="ov-book-more-label">Add</span>
                  </Link>
                )}

              </div>
            </div>
          </div>

          {/* ── Readiness Guide ── */}
          <div className="ov-col-4">
            <div className="ov-readiness">
              <div className="ov-readiness-header">
                <div>
                  <span className="ov-label" style={{ display: 'block', marginBottom: '6px' }}>Readiness Guide</span>
                  <h2 className="ov-readiness-title">The <em>Audit.</em></h2>
                </div>
                <div className="ov-readiness-pct" aria-label={`${readinessPct}% complete`}>
                  {readinessPct}<sup>%</sup>
                </div>
              </div>

              <div className="ov-checklist" role="list">
                {checklist.map((item) => (
                  <Link
                    key={item.id}
                    to={item.link}
                    className="ov-check-item"
                    role="listitem"
                    aria-label={`${item.label}: ${item.status}`}
                  >
                    <div className="ov-check-left">
                      <div
                        className={`ov-check-dot ov-check-dot--${item.urgency}`}
                        aria-hidden
                      />
                      <span className="ov-check-label">{item.label}</span>
                    </div>
                    <div className="ov-check-right">
                      <span className="ov-check-status">{item.status}</span>
                      <ChevronRight size={12} className="ov-check-arrow" aria-hidden />
                    </div>
                  </Link>
                ))}
              </div>

              <Link to="/dashboard/talent/profile" className="ov-audit-cta">
                Continue Audit
              </Link>
            </div>
          </div>

        </div>

        {/* ════════════════════════════════
            ROW 2: Exposure Intelligence (6) + Identity Artifacts (6)
        ════════════════════════════════ */}
        <div className="ov-grid">

          {/* ── Exposure Intelligence ── */}
          <div className="ov-col-6">
            <div className="ov-exposure">
              <div className="ov-exposure-header">
                <div>
                  <span className="ov-label" style={{ display: 'block', marginBottom: '6px' }}>Exposure Intelligence</span>
                  <h2 className="ov-exposure-title">The <em>Market.</em></h2>
                </div>
                <div className="ov-ranking-chip">
                  <TrendingUp size={12} aria-hidden />
                  <span>Top 12% in Editorial</span>
                </div>
              </div>

              {analyticsLoading ? (
                <div className="ov-stats-grid">
                  {[0, 1, 2, 3].map(i => (
                    <div key={i}>
                      <div className="ov-skel ov-skel--line" style={{ width: '80px', height: '2.5rem', marginBottom: '8px' }} />
                      <div className="ov-skel ov-skel--line" style={{ width: '120px', height: '9px' }} />
                    </div>
                  ))}
                </div>
              ) : summaryError ? (
                <div className="ov-error-inline" role="alert">
                  <AlertCircle size={14} aria-hidden />
                  <span>Couldn't load analytics.</span>
                  <button
                    type="button"
                    className="ov-retry-btn"
                    onClick={() => refetchAnalytics()}
                    disabled={isAnalyticsRefetching}
                  >
                    {isAnalyticsRefetching ? '…' : 'Retry'}
                  </button>
                </div>
              ) : (
                <div className="ov-stats-grid">
                  <div>
                    <div className="ov-stat-number">
                      <span className="ov-stat-value">{views.toLocaleString()}</span>
                      {viewsDelta > 0 && (
                        <span className="ov-stat-delta-positive">+{viewsDelta}%</span>
                      )}
                    </div>
                    <p className="ov-stat-label">Global Views (30d)</p>
                  </div>

                  <div>
                    <div className="ov-stat-number">
                      <span className="ov-stat-value ov-stat-value--gold">
                        {appsPending ? '—' : appsError ? '—' : appsCount}
                      </span>
                      <span className="ov-stat-delta-neutral">Active</span>
                    </div>
                    <p className="ov-stat-label">Agency Submissions</p>
                  </div>

                  <div>
                    <div className="ov-stat-number">
                      <span className="ov-stat-value">{downloads.toLocaleString()}</span>
                    </div>
                    <p className="ov-stat-label">Comp Card Downloads</p>
                  </div>

                  <div className="ov-visibility">
                    <div className="ov-visibility-head">
                      <span className="ov-visibility-label">Visibility Index</span>
                      {visibilityPct >= 60 && (
                        <span className="ov-visibility-note">Above Category Avg</span>
                      )}
                    </div>
                    <div className="ov-vis-track" role="progressbar" aria-valuenow={visibilityPct} aria-valuemin={0} aria-valuemax={100} aria-label="Profile visibility index">
                      <motion.div
                        className="ov-vis-fill"
                        style={{ '--fill-target': `${visibilityPct}%` }}
                        initial={{ width: 0 }}
                        animate={{ width: `${visibilityPct}%` }}
                        transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* ── Identity Artifacts ── */}
          <div className="ov-col-6">
            <div className="ov-artifacts">

              {/* Comp Card — light */}
              <button
                type="button"
                className="ov-artifact-card ov-artifact-card--light"
                onClick={handleCompCard}
                aria-label="Download comp card"
              >
                <div>
                  <div className="ov-artifact-icon" aria-hidden>
                    <FileText size={20} />
                  </div>
                  <h3 className="ov-artifact-title">Digital <em>Comp Card</em></h3>
                  <p className="ov-artifact-desc">
                    Generate professional specs with latest polaroids for agency submission.
                  </p>
                </div>
                <div className="ov-artifact-footer">
                  <span className="ov-artifact-badge">Ready</span>
                  <div className="ov-artifact-action">
                    <span>Export</span>
                    <Download size={13} aria-hidden />
                  </div>
                </div>
              </button>

              {/* Intro Reel — dark */}
              <Link
                to="/dashboard/talent/media"
                className="ov-artifact-card ov-artifact-card--dark"
                aria-label="Add intro reel"
              >
                <div>
                  <div className="ov-artifact-icon" aria-hidden>
                    <Activity size={20} />
                  </div>
                  <h3 className="ov-artifact-title">Intro <em>Reel</em></h3>
                  <p className="ov-artifact-desc">
                    Capture a quick 30s screen-test to verify presence and personality.
                  </p>
                </div>
                <div className="ov-artifact-footer">
                  <span className="ov-artifact-badge ov-artifact-badge--missing">Missing</span>
                  <div className="ov-artifact-action">
                    <ArrowUpRight size={14} aria-hidden />
                  </div>
                </div>
              </Link>

            </div>
          </div>

        </div>

        {/* ════════════════════════════════
            FOOTER
        ════════════════════════════════ */}
        <footer className="ov-footer">
          <nav className="ov-footer-nav" aria-label="Dashboard sections">
            <Link to="/dashboard/talent" className="ov-footer-link ov-footer-link--active">Overview</Link>
            <Link to="/dashboard/talent/media" className="ov-footer-link">The Book</Link>
            <Link to="/dashboard/talent/applications" className="ov-footer-link">Market</Link>
            <Link to="/dashboard/talent/analytics" className="ov-footer-link">Intel</Link>
          </nav>

          <div className="ov-footer-meta">
            <div className="ov-footer-node">
              <span className="ov-footer-dot" aria-hidden />
              <span>Identity Node · PH-{profile?.id?.slice(0, 3)?.toUpperCase() || '···'}</span>
            </div>
            <div className="ov-footer-sep" aria-hidden />
            <span>© 2026</span>
          </div>
        </footer>

      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify the page renders without console errors**

Open `http://localhost:5173/dashboard/talent` in the browser. Check:
- The overview page is dark (ink `#050505` background)
- Hero section shows: "DASHBOARD" label, FREE/Studio+ pill, first name in regular weight, last name in italic gold
- Portfolio book grid shows images if any exist, or empty placeholder tiles
- Readiness guide shows the 4 checklist items with correct dot colors
- Exposure intelligence shows view counts and visibility bar
- Identity artifacts shows the two cards (white Comp Card + dark Intro Reel)
- Footer shows nav links and identity node

- [ ] **Step 3: Check light/dark contrast**

Verify the dark overview inside the light TalentLayout shell looks intentional:
- The topbar (cream, light) + sidebar (light) + dark content area should feel like a deliberate design choice
- The cream-to-dark transition at the content area edge should not look broken

If the `tl-content` background bleeds outside the dark container, open `TalentLayout.css` and check `.tl-content` — it currently has `background: #FAF8F5`. The dark OverviewView container uses `min-height: 100%` which will fill it. This is correct.

- [ ] **Step 4: Commit**

```bash
git add client/src/domains/talent/components/OverviewView.jsx
git commit -m "feat(overview): rebuild as dark editorial dashboard — portfolio book, readiness guide, exposure intel"
```

---

## Task 4: Polish and Verify

**Files:** No file changes — verification only.

- [ ] **Step 1: Check image hover effect**

If images exist in the portfolio book grid, hover over each one. The image should transition from desaturated/dim (`grayscale(100%) opacity: 0.4`) to full color (`grayscale(0) opacity: 1`) over 700ms. This is a CSS-only transition defined in `ov-book-photo`.

- [ ] **Step 2: Verify checklist accuracy**

Log in with a partially complete profile. Confirm:
- "Casting Polaroids" shows red dot if no images, green dot if images exist
- "Digital Resume" shows red dot below 40% profile completion, green above
- "Measurements & Specs" shows red if `profile.height`/`profile.measurements`/`profile.chest` are all null
- "Intro Reel" always shows the gray dot with "Optional" status

- [ ] **Step 3: Verify audit CTA links correctly**

Click "Continue Audit" → should navigate to `/dashboard/talent/profile`.

- [ ] **Step 4: Verify comp card click triggers toast**

Click the white Comp Card artifact tile → Sonner toast appears: "Comp card download is not available yet — coming in a future update."

- [ ] **Step 5: Verify responsive breakpoints**

Resize window to 900px wide. The 12-column grid should collapse: portfolio book goes full width (span 12), readiness guide goes full width below it, same for the bottom row.

Resize to 640px. The portfolio book grid should go 2-column with the featured image spanning full width.

- [ ] **Step 6: Accessibility check**

- Each image in the book grid has `role="listitem"` and an `aria-label`
- The portfolio grid has `role="list"` and `aria-label`
- The visibility bar has `role="progressbar"` with `aria-valuenow/min/max`
- The "Continue Audit" button is an `<a>` with accessible text
- All icon-only elements have `aria-hidden`

- [ ] **Step 7: Final commit**

```bash
git add -p  # stage only intentional changes
git commit -m "feat(overview): talent dashboard dark editorial redesign complete"
```

---

## Spec Coverage Check

| Reference site element | Plan task |
|---|---|
| Identity header: serif name with italic gold surname | Task 3, Hero section |
| `DASHBOARD` mono label + Studio+ pill | Task 3, Hero section |
| `Actively Seeking Work` status pill | Task 3, Hero section |
| Portfolio book: 4-column grid, featured 2×2 | Task 3, PortfolioBook |
| Grayscale-to-color hover on images (700ms) | Task 2, `.ov-book-photo` styles |
| Featured image overlay with caption | Task 2, `.ov-book-featured-overlay` |
| `+N more` overflow tile | Task 3, portfolio grid |
| Readiness Guide: 4 checklist items, dot colors | Task 3, ReadinessGuide |
| Readiness percentage top-right | Task 3, `.ov-readiness-pct` |
| "Continue Audit" full-width CTA | Task 3, `.ov-audit-cta` |
| Exposure Intelligence: 2-col stats grid | Task 3, ExposureIntelligence |
| Visibility index animated bar | Task 3, Framer Motion `animate` |
| Identity Artifacts: white Comp Card + dark Reel | Task 3, IdentityArtifacts |
| JetBrains Mono for `ov-mono` labels | Task 1 + Task 2 |
| Noto Serif Display italic for names/section heads | Task 1 + Task 2 |
| Gold hairline separator | Task 2, `.ov-hairline` |
| Grain texture overlay | Task 2, `.ov-container::before` |
| Footer: mono nav links + identity node | Task 3, footer |
| Dark `#050505` canvas background | Task 2, `--ov-ink` token |
| `#0F0F0F` ink-soft card surfaces | Task 2, `--ov-ink-soft` token |
| 10px border-radius on cards | Task 2, `--ov-radius: 10px` |
| Responsive: grid collapse at 1100px | Task 2, responsive breakpoints |
