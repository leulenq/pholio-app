# Analytics (Intel) Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the Analytics (Intel) page into a premium editorial intelligence layer with four named chapters (The Reach, The Signal, The Market, The Pattern), a dark ink masthead, cream body, and meaningful free vs Studio+ differentiation.

**Architecture:** Complete rewrite of `AnalyticsView.jsx` (all sub-components inline) and `AnalyticsPage.css`. No new API routes or hooks — all data comes from the existing `useAnalytics` hook and a single `useQuery` call for applications. The masthead stays dark ink (`#050505`); body transitions to cream (`#FAF7F2`) via a gold hairline.

**Tech Stack:** React 19, Framer Motion, Recharts (AreaChart), Lucide React, React Router v7, TanStack Query v5, existing `useAnalytics` hook, existing `CohortHeatmap` and `SessionsBarChart` components.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `client/src/domains/talent/pages/AnalyticsPage/AnalyticsPage.css` | **Rewrite** | All Intel page styles — masthead, KPI row, four chapters, activity feed, responsive |
| `client/src/domains/talent/components/AnalyticsView.jsx` | **Rewrite** | All sub-components inline: helpers, ChapterHeader, TimeRangeSelector, HeroKPIRow, IntelMasthead, ReachChapter, SignalChapter, MarketChapter, PatternChapter, ActivityFeed, root AnalyticsView |

`AnalyticsPage/index.jsx` is **not touched** — it already imports `./AnalyticsPage.css` and renders `<AnalyticsView />`.

---

## Task 1: CSS Foundation

**Files:**
- Rewrite: `client/src/domains/talent/pages/AnalyticsPage/AnalyticsPage.css`

- [ ] **Step 1: Replace the entire CSS file with the Intel design system**

```css
/* AnalyticsPage.css — Intel page design system */

@keyframes intel-entrance {
  from { opacity: 0; }
  to   { opacity: 1; }
}

@keyframes intel-shimmer {
  0%   { background-position: -200% 0; }
  100% { background-position:  200% 0; }
}

/* ── Page shell ─────────────────────────────────────────────────────────── */

.analytics-page {
  min-height: 100%;
  background: #FAF7F2;
  animation: intel-entrance 0.4s ease both;
}

/* ── Masthead (dark ink) ─────────────────────────────────────────────────── */

.intel-masthead {
  background: #050505;
  padding: clamp(48px, 5vw, 80px) clamp(32px, 5.4vw, 72px) 0;
  position: relative;
  overflow: hidden;
}

.intel-masthead::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle at 30% 50%, rgba(201,165,90,0.06) 0%, transparent 60%);
  pointer-events: none;
}

.intel-masthead-inner {
  position: relative;
  z-index: 1;
  max-width: 1200px;
}

.intel-masthead-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 40px;
}

.intel-masthead-copy { flex: 1; }

.intel-kicker {
  display: block;
  font-family: 'JetBrains Mono', 'SF Mono', monospace;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.32em;
  text-transform: uppercase;
  color: #C9A55A;
  margin-bottom: 20px;
}

.intel-display {
  font-family: 'Noto Serif Display', Georgia, serif;
  font-size: clamp(2.8rem, 6vw, 5rem);
  font-weight: 400;
  letter-spacing: -0.02em;
  line-height: 1.02;
  color: rgba(245,240,230,0.92);
  margin: 0 0 20px;
}

.intel-display em {
  font-style: italic;
  color: #C8A96E;
}

.intel-lede {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 15px;
  font-weight: 300;
  line-height: 1.65;
  color: rgba(245,240,230,0.42);
  margin: 0 0 24px;
  max-width: 44ch;
}

.intel-tier-pill {
  display: inline-block;
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 4px 12px;
  border-radius: 100px;
  border: 1px solid rgba(255,255,255,0.12);
  color: rgba(245,240,230,0.5);
}

.intel-tier-pill--studio {
  border-color: #C9A55A;
  color: #C9A55A;
}

/* Time range selector */

.intel-time-range {
  display: flex;
  gap: 4px;
  align-items: center;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px;
  padding: 3px;
  flex-shrink: 0;
}

.intel-time-btn {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.08em;
  padding: 6px 14px;
  border-radius: 6px;
  border: none;
  background: transparent;
  color: rgba(245,240,230,0.38);
  cursor: pointer;
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.intel-time-btn:hover:not(:disabled) { color: rgba(245,240,230,0.8); }

.intel-time-btn--active {
  background: rgba(201,165,90,0.15);
  color: #C9A55A;
}

.intel-time-btn:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.intel-time-lock { opacity: 0.5; }

/* Hero KPI row */

.intel-kpi-row {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  border-top: 1px solid rgba(255,255,255,0.06);
  margin-top: 32px;
}

.intel-kpi {
  padding: 28px 24px;
  border-right: 1px solid rgba(255,255,255,0.06);
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.intel-kpi:last-child { border-right: none; }

.intel-kpi-icon { color: rgba(245,240,230,0.2); }

.intel-kpi-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  font-weight: 500;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: rgba(245,240,230,0.35);
}

.intel-kpi-value {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: clamp(1.6rem, 3vw, 2.2rem);
  font-weight: 500;
  color: rgba(245,240,230,0.92);
  letter-spacing: -0.02em;
  line-height: 1;
}

.intel-kpi-delta {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  font-weight: 500;
}

.intel-kpi-delta--up   { color: #C9A55A; }
.intel-kpi-delta--down { color: rgba(245,240,230,0.35); }

/* Loading skeleton */

.intel-skel {
  border-radius: 4px;
  background: rgba(255,255,255,0.07);
  background-image: linear-gradient(90deg,
    rgba(255,255,255,0.05) 0%,
    rgba(255,255,255,0.12) 50%,
    rgba(255,255,255,0.05) 100%);
  background-size: 200% 100%;
  animation: intel-shimmer 1.8s linear infinite;
}

.intel-skel--title {
  height: clamp(2.8rem, 6vw, 5rem);
  width: 240px;
  margin-bottom: 24px;
}

.intel-skel--kpi { height: 2rem; width: 80px; }

/* Hairline transition */

.intel-hairline {
  height: 1px;
  background: linear-gradient(to right, transparent, rgba(201,165,90,0.38), transparent);
}

/* ── Body (cream) ────────────────────────────────────────────────────────── */

.intel-body {
  background: #FAF7F2;
  padding: clamp(40px, 4.4vw, 64px) clamp(32px, 5.4vw, 72px) 80px;
}

/* ── Chapter shared ──────────────────────────────────────────────────────── */

.intel-chapter {
  margin-bottom: 72px;
  padding-bottom: 72px;
  border-bottom: 1px solid rgba(26,26,26,0.06);
}

.intel-chapter:last-of-type { border-bottom: none; margin-bottom: 0; }

.intel-chapter-header { margin-bottom: 40px; }

.intel-chapter-kicker {
  display: block;
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  font-weight: 500;
  letter-spacing: 0.32em;
  text-transform: uppercase;
  color: #C9A55A;
  margin-bottom: 12px;
}

.intel-chapter-title {
  font-family: 'Noto Serif Display', Georgia, serif;
  font-size: clamp(2rem, 4vw, 3.2rem);
  font-weight: 400;
  letter-spacing: -0.02em;
  line-height: 1.02;
  color: #1A1A1A;
  margin: 0 0 12px;
}

.intel-chapter-title em {
  font-style: italic;
  color: #C8A96E;
}

.intel-chapter-lede {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 15px;
  font-weight: 300;
  color: rgba(26,26,26,0.52);
  line-height: 1.6;
  max-width: 48ch;
  margin: 0;
}

/* ── The Reach ───────────────────────────────────────────────────────────── */

.reach-chart {
  background: #FFFFFF;
  border: 1px solid rgba(26,26,26,0.06);
  border-radius: 12px;
  padding: 24px 24px 16px;
  margin-bottom: 20px;
}

.reach-stats-row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

.reach-stat {
  background: #FFFFFF;
  border: 1px solid rgba(26,26,26,0.06);
  border-radius: 10px;
  padding: 20px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.reach-stat-value {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 1.6rem;
  font-weight: 500;
  color: #1A1A1A;
  letter-spacing: -0.02em;
}

.reach-stat-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba(26,26,26,0.38);
}

.reach-source-pills {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}

.reach-source-pill {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  letter-spacing: 0.08em;
  padding: 6px 14px;
  border: 1px solid rgba(201,165,90,0.3);
  border-radius: 100px;
  color: rgba(26,26,26,0.6);
}

.reach-source-pill--empty {
  border-color: rgba(26,26,26,0.1);
  color: rgba(26,26,26,0.3);
}

.reach-upgrade-link {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 13px;
  color: rgba(201,165,90,0.8);
  text-decoration: none;
  transition: color 0.2s;
}

.reach-upgrade-link:hover { color: #C9A55A; }

/* Studio+: source bar chart */

.reach-source-bars {
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: #FFFFFF;
  border: 1px solid rgba(26,26,26,0.06);
  border-radius: 12px;
  padding: 20px 24px;
  margin-bottom: 20px;
}

.reach-source-bar-row {
  display: grid;
  grid-template-columns: 140px 1fr 48px 56px;
  align-items: center;
  gap: 12px;
}

.reach-source-label {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 13px;
  color: rgba(26,26,26,0.68);
}

.reach-source-track {
  height: 4px;
  background: rgba(26,26,26,0.06);
  border-radius: 2px;
  overflow: hidden;
}

.reach-source-fill {
  height: 100%;
  background: #C9A55A;
  border-radius: 2px;
  transition: width 0.8s cubic-bezier(0.22, 1, 0.36, 1);
}

.reach-source-pct {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  color: rgba(26,26,26,0.55);
  text-align: right;
}

.reach-source-count {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  color: rgba(26,26,26,0.32);
}

/* Theme table */

.reach-theme-table {
  background: #FFFFFF;
  border: 1px solid rgba(26,26,26,0.06);
  border-radius: 12px;
  overflow: hidden;
  margin-top: 20px;
}

.reach-theme-header,
.reach-theme-row {
  display: grid;
  grid-template-columns: 1fr 80px 80px;
  padding: 12px 20px;
  border-bottom: 1px solid rgba(26,26,26,0.05);
}

.reach-theme-header {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(26,26,26,0.32);
  background: rgba(26,26,26,0.02);
}

.reach-theme-row {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 13px;
  color: rgba(26,26,26,0.72);
}

.reach-theme-row:last-child { border-bottom: none; }

/* ── The Signal ──────────────────────────────────────────────────────────── */

.signal-funnel {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 24px;
}

.signal-funnel-row {
  display: grid;
  grid-template-columns: 160px 1fr 56px;
  align-items: center;
  gap: 16px;
}

.signal-funnel-label {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 13px;
  color: rgba(26,26,26,0.62);
}

.signal-funnel-track {
  height: 28px;
  background: rgba(26,26,26,0.04);
  border-radius: 4px;
  border-left: 3px solid #C9A55A;
  overflow: hidden;
  position: relative;
}

.signal-funnel-fill {
  position: absolute;
  inset: 0;
  background: rgba(201,165,90,0.12);
  border-radius: 0 4px 4px 0;
}

.signal-funnel-pct {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  font-weight: 500;
  color: rgba(26,26,26,0.52);
  text-align: right;
}

.signal-chips {
  display: flex;
  gap: 12px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.signal-chip {
  background: #FFFFFF;
  border: 1px solid rgba(26,26,26,0.08);
  border-radius: 8px;
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 120px;
}

.signal-chip-value {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 1.1rem;
  font-weight: 500;
  color: #1A1A1A;
}

.signal-chip-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  letter-spacing: 0.2em;
  text-transform: uppercase;
  color: rgba(26,26,26,0.36);
}

.signal-interpretation {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 14px;
  font-weight: 300;
  line-height: 1.6;
  color: rgba(26,26,26,0.52);
  padding: 14px 18px;
  border-left: 2px solid rgba(201,165,90,0.28);
  background: rgba(201,165,90,0.04);
  border-radius: 0 8px 8px 0;
  margin-bottom: 28px;
}

/* Studio+ gate */

.signal-lock-card {
  background: #050505;
  border-radius: 12px;
  padding: 48px 40px;
  text-align: center;
  position: relative;
  overflow: hidden;
}

.signal-lock-card::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(120deg,
    transparent 20%,
    rgba(201,165,90,0.05) 50%,
    transparent 80%);
  background-size: 200% 100%;
  animation: intel-shimmer 2.6s linear infinite;
}

.signal-lock-card-inner {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
}

.signal-lock-icon  { color: rgba(201,165,90,0.55); }

.signal-lock-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: rgba(201,165,90,0.58);
}

.signal-lock-desc {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 14px;
  font-weight: 300;
  color: rgba(245,240,230,0.42);
  max-width: 40ch;
  line-height: 1.6;
}

.signal-lock-link {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 13px;
  color: rgba(201,165,90,0.68);
  text-decoration: none;
  margin-top: 4px;
  transition: color 0.2s;
}

.signal-lock-link:hover { color: #C9A55A; }

/* Studio+: pro row */

.signal-pro-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-top: 24px;
}

.signal-return-card {
  background: #FFFFFF;
  border: 1px solid rgba(26,26,26,0.06);
  border-radius: 12px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.signal-return-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  letter-spacing: 0.24em;
  text-transform: uppercase;
  color: rgba(26,26,26,0.36);
}

.signal-return-value {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 2.4rem;
  font-weight: 500;
  color: #1A1A1A;
  letter-spacing: -0.03em;
  line-height: 1;
}

.signal-return-desc {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 13px;
  font-weight: 300;
  color: rgba(26,26,26,0.48);
  line-height: 1.55;
}

/* ── The Market ──────────────────────────────────────────────────────────── */

.market-summary-chips {
  display: flex;
  gap: 8px;
  margin-bottom: 28px;
  flex-wrap: wrap;
}

.market-chip {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  letter-spacing: 0.08em;
  padding: 6px 14px;
  border: 1px solid rgba(26,26,26,0.1);
  border-radius: 100px;
  color: rgba(26,26,26,0.52);
}

.market-app-list { display: flex; flex-direction: column; }

.market-app-row {
  display: grid;
  grid-template-columns: 1fr auto auto;
  align-items: center;
  gap: 16px;
  padding: 16px 0;
  border-bottom: 1px solid rgba(26,26,26,0.06);
}

.market-app-row:last-child { border-bottom: none; }

.market-app-agency {
  font-family: 'Noto Serif Display', Georgia, serif;
  font-size: 15px;
  font-weight: 400;
  color: #1A1A1A;
  display: block;
  margin-bottom: 3px;
}

.market-app-location {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.12em;
  color: rgba(26,26,26,0.32);
  display: block;
}

.market-status-pill {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 11px;
  font-weight: 500;
  padding: 4px 12px;
  border-radius: 100px;
  letter-spacing: 0.04em;
  white-space: nowrap;
}

.market-status--pending  { background: rgba(201,165,90,0.10); color: #A8894E;                border: 1px solid rgba(201,165,90,0.25); }
.market-status--reviewing{ background: rgba(26,26,26,0.05);   color: rgba(26,26,26,0.58);   border: 1px solid rgba(26,26,26,0.12); }
.market-status--accepted { background: rgba(80,140,90,0.08);  color: rgba(50,100,60,0.82);  border: 1px solid rgba(80,140,90,0.2); }
.market-status--declined { background: rgba(26,26,26,0.04);   color: rgba(26,26,26,0.35);   border: 1px solid rgba(26,26,26,0.08); }

.market-app-date {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.08em;
  color: rgba(26,26,26,0.3);
  white-space: nowrap;
}

.market-see-all {
  display: inline-block;
  margin-top: 20px;
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 13px;
  color: rgba(201,165,90,0.8);
  text-decoration: none;
  transition: color 0.2s;
}

.market-see-all:hover { color: #C9A55A; }

.market-empty {
  padding: 40px 0;
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 14px;
  font-weight: 300;
  color: rgba(26,26,26,0.42);
  line-height: 1.6;
}

.market-empty a { color: rgba(201,165,90,0.8); text-decoration: none; }

/* Studio+: momentum timeline */

.market-timeline {
  margin-top: 28px;
  position: relative;
  padding-left: 20px;
}

.market-timeline::before {
  content: '';
  position: absolute;
  left: 6px; top: 8px; bottom: 8px;
  width: 1px;
  background: rgba(201,165,90,0.18);
}

.market-timeline-item {
  position: relative;
  padding: 0 0 18px 20px;
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 13px;
  color: rgba(26,26,26,0.58);
}

.market-timeline-item::before {
  content: '';
  position: absolute;
  left: -8px; top: 6px;
  width: 6px; height: 6px;
  border-radius: 50%;
  background: rgba(201,165,90,0.48);
}

.market-timeline-agency { font-weight: 500; color: #1A1A1A; }

.market-timeline-date {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.12em;
  color: rgba(26,26,26,0.3);
  margin-left: 8px;
}

/* ── The Pattern ─────────────────────────────────────────────────────────── */

.pattern-ghost-card {
  background: #050505;
  border-radius: 12px;
  padding: 40px;
  position: relative;
  overflow: hidden;
  min-height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.pattern-ghost-bg {
  position: absolute;
  inset: 24px;
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  grid-template-rows: repeat(4, 1fr);
  gap: 4px;
  filter: blur(3px);
  pointer-events: none;
}

.pattern-ghost-cell {
  border-radius: 3px;
  background: rgba(201,165,90,0.65);
}

.pattern-ghost-shimmer {
  position: absolute;
  inset: 0;
  background: linear-gradient(120deg,
    transparent 20%,
    rgba(201,165,90,0.05) 50%,
    transparent 80%);
  background-size: 200% 100%;
  animation: intel-shimmer 2.6s linear infinite;
}

.pattern-ghost-overlay {
  position: relative;
  z-index: 2;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

.pattern-lock-icon  { color: rgba(201,165,90,0.52); }

.pattern-lock-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.28em;
  text-transform: uppercase;
  color: rgba(201,165,90,0.58);
}

.pattern-lock-desc {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 14px;
  font-weight: 300;
  color: rgba(245,240,230,0.38);
  max-width: 38ch;
  line-height: 1.6;
}

.pattern-lock-link {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 13px;
  color: rgba(201,165,90,0.65);
  text-decoration: none;
  margin-top: 6px;
  transition: color 0.2s;
}

.pattern-lock-link:hover { color: #C9A55A; }

/* Studio+ cohort stats */

.pattern-cohort-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
  margin-bottom: 24px;
}

.pattern-cohort-stat {
  background: #FFFFFF;
  border: 1px solid rgba(26,26,26,0.06);
  border-radius: 10px;
  padding: 20px;
}

.pattern-cohort-stat-value {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 1.8rem;
  font-weight: 500;
  color: #1A1A1A;
  letter-spacing: -0.02em;
  display: block;
  margin-bottom: 6px;
}

.pattern-cohort-stat-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: 9px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: rgba(26,26,26,0.36);
}

.pattern-cohort-read {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 14px;
  font-weight: 300;
  color: rgba(26,26,26,0.48);
  padding: 14px 18px;
  border-left: 2px solid rgba(201,165,90,0.24);
  margin-bottom: 24px;
  line-height: 1.6;
}

/* ── Activity Feed ───────────────────────────────────────────────────────── */

.intel-activity { padding-top: 48px; }

.intel-activity-header { margin-bottom: 32px; }

.intel-activity-list { display: flex; flex-direction: column; }

.intel-activity-row {
  display: grid;
  grid-template-columns: 32px 1fr;
  gap: 12px;
  padding: 14px 0;
  border-bottom: 1px solid rgba(26,26,26,0.05);
  align-items: start;
}

.intel-activity-row:last-child { border-bottom: none; }

.intel-activity-icon {
  width: 32px; height: 32px;
  border-radius: 8px;
  background: rgba(201,165,90,0.08);
  border: 1px solid rgba(201,165,90,0.14);
  display: flex;
  align-items: center;
  justify-content: center;
  color: rgba(201,165,90,0.68);
  flex-shrink: 0;
}

.intel-activity-msg {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 13px;
  color: rgba(26,26,26,0.72);
  display: block;
  margin-bottom: 4px;
}

.intel-activity-time {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px;
  letter-spacing: 0.1em;
  color: rgba(26,26,26,0.3);
}

.intel-empty-activity {
  font-family: 'Inter', system-ui, sans-serif;
  font-size: 14px;
  font-weight: 300;
  color: rgba(26,26,26,0.38);
  padding: 32px 0;
}

/* ── Responsive ──────────────────────────────────────────────────────────── */

@media (max-width: 900px) {
  .intel-kpi-row { grid-template-columns: repeat(2, 1fr); }
  .intel-kpi:nth-child(2) { border-right: none; }
  .intel-kpi:nth-child(1),
  .intel-kpi:nth-child(2) { border-bottom: 1px solid rgba(255,255,255,0.06); }
  .signal-pro-row { grid-template-columns: 1fr; }
  .pattern-cohort-stats { grid-template-columns: 1fr 1fr; }
}

@media (max-width: 640px) {
  .intel-masthead-top { flex-direction: column; }
  .intel-kpi-row { grid-template-columns: 1fr 1fr; }
  .reach-stats-row { grid-template-columns: 1fr; }
  .signal-funnel-row { grid-template-columns: 110px 1fr 48px; }
  .market-app-row { grid-template-columns: 1fr auto; }
  .market-app-date { display: none; }
  .pattern-cohort-stats { grid-template-columns: 1fr; }
  .reach-source-bar-row { grid-template-columns: 100px 1fr 40px; }
  .reach-source-count { display: none; }
}
```

- [ ] **Step 2: Run lint to verify no syntax errors**

```bash
cd client && npm run lint -- --max-warnings=0 2>&1 | head -20
```

Expected: No CSS-related errors (ESLint doesn't lint CSS, so this just confirms JS is clean).

- [ ] **Step 3: Commit**

```bash
git add client/src/domains/talent/pages/AnalyticsPage/AnalyticsPage.css
git commit -m "feat: write Intel page CSS design system (masthead, chapters, components)"
```

---

## Task 2: Pure Helpers, Constants, and Shared Sub-Components

**Files:**
- Rewrite: `client/src/domains/talent/components/AnalyticsView.jsx` (top half — imports through IntelMasthead)

The helpers and shared components are the stable foundation every chapter depends on. Write them first so all later tasks can reference them.

- [ ] **Step 1: Replace the entire AnalyticsView.jsx with this content** (imports + helpers + ChapterHeader + TimeRangeSelector + HeroKPIRow + IntelMasthead — chapters and root AnalyticsView will be added in Task 3+):

```jsx
import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart, Area, XAxis, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import {
  Eye, Download, Briefcase, TrendingUp, Lock, Activity,
  CheckCircle, FileText,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAnalytics } from '../hooks/useAnalytics';
import { useAuth } from '../../auth/hooks/useAuth';
import { talentApi } from '../api/talent';
import CohortHeatmap from './CohortHeatmap';
import SessionsBarChart from './SessionsBarChart';

// ── Motion preset shared across all chapters ────────────────────────────────
const CHAPTER_MOTION = {
  initial: { opacity: 0, y: 24 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] },
};

// Deterministic opacity values for the ghost cohort preview (no Math.random)
const GHOST_OPACITIES = [
  0.12, 0.45, 0.65, 0.28, 0.08, 0.22,
  0.55, 0.32, 0.75, 0.18, 0.42, 0.60,
  0.80, 0.25, 0.14, 0.68, 0.38, 0.22,
  0.10, 0.52, 0.30, 0.48, 0.62, 0.20,
];

const STATUS_LABELS = {
  PENDING: 'Pending', REVIEWING: 'Reviewing',
  ACCEPTED: 'Accepted', DECLINED: 'Declined',
};

const STATUS_CLASS = {
  PENDING: 'market-status--pending', REVIEWING: 'market-status--reviewing',
  ACCEPTED: 'market-status--accepted', DECLINED: 'market-status--declined',
};

const ACTIVITY_ICONS = {
  view: Eye, download: Download, application: CheckCircle, profile_update: FileText,
};

// ── Pure helpers ────────────────────────────────────────────────────────────

function asNum(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function asArray(v) {
  return Array.isArray(v) ? v : [];
}

export function computeFunnel(engagementCounts, viewsTotal) {
  const bioReads      = asNum(engagementCounts?.bio_read);
  const contactClicks = asNum(engagementCounts?.social_click) + asNum(engagementCounts?.portfolio_click);
  const bioReadPct    = viewsTotal > 0 ? Math.round((bioReads      / viewsTotal) * 100) : 0;
  const contactPct    = viewsTotal > 0 ? Math.round((contactClicks / viewsTotal) * 100) : 0;
  return { bioReads, bioReadPct, contactClicks, contactPct };
}

export function computeInterpretation(bioReadPct, contactPct) {
  if (bioReadPct === 0 && contactPct === 0)
    return 'Build up your profile to start collecting engagement signals.';
  if (bioReadPct >= 50 && contactPct < 10)
    return 'Most visitors read your bio — fewer click through. Strengthen your social links or portfolio URL.';
  if (bioReadPct < 20)
    return "Visitors aren't reaching your bio. A stronger headline or cover image may help pull them in.";
  if (contactPct >= 20)
    return 'Strong contact rate — visitors are actively looking for ways to reach you.';
  return 'Solid engagement. Keep your bio and contact links current for best results.';
}

export function computeCohortSummary(cohorts) {
  const list = asArray(cohorts);
  if (list.length === 0) return { avgW1Retention: 0, bestCohortLabel: '—', totalUnique: 0 };
  const w1Values = list.map(c => asNum(c.retention?.[1])).filter(v => v > 0);
  const avgW1Retention = w1Values.length > 0
    ? Math.round(w1Values.reduce((a, b) => a + b, 0) / w1Values.length) : 0;
  const bestIdx = list.reduce(
    (best, c, i) => asNum(c.retention?.[1]) > asNum(list[best]?.retention?.[1]) ? i : best, 0,
  );
  const bestCohortLabel = list[bestIdx]?.label ?? '—';
  const totalUnique     = list.reduce((sum, c) => sum + asNum(c.users ?? c.count), 0);
  return { avgW1Retention, bestCohortLabel, totalUnique };
}

function applicationsArray(payload) {
  if (Array.isArray(payload)) return payload;
  if (payload?.data && Array.isArray(payload.data)) return payload.data;
  return [];
}

// ── ChapterHeader ───────────────────────────────────────────────────────────

function ChapterHeader({ number, slug, title, lede }) {
  return (
    <div className="intel-chapter-header">
      <span className="intel-chapter-kicker">
        {number != null ? `${String(number).padStart(2, '0')} · ` : ''}{slug}
      </span>
      <h2 className="intel-chapter-title">The <em>{title}</em></h2>
      {lede && <p className="intel-chapter-lede">{lede}</p>}
    </div>
  );
}

// ── TimeRangeSelector ───────────────────────────────────────────────────────

function TimeRangeSelector({ value, onChange, isPro }) {
  const ranges = [
    { label: '7d',  days: 7,  proOnly: false },
    { label: '30d', days: 30, proOnly: true  },
    { label: '90d', days: 90, proOnly: true  },
  ];
  return (
    <div className="intel-time-range">
      {ranges.map(r => (
        <button
          key={r.days}
          className={`intel-time-btn${value === r.days ? ' intel-time-btn--active' : ''}`}
          onClick={() => onChange(r.days)}
          disabled={r.proOnly && !isPro}
          aria-label={`Show ${r.label} analytics`}
        >
          {r.label}
          {r.proOnly && !isPro && <Lock size={9} className="intel-time-lock" aria-hidden />}
        </button>
      ))}
    </div>
  );
}

// ── HeroKPIRow ──────────────────────────────────────────────────────────────

function HeroKPIRow({ views, viewsDelta, downloads, completeness, appsCount, appsLoading, isPro, isLoading }) {
  const kpis = [
    { label: 'Profile Views',        value: isLoading   ? '—' : views.toLocaleString(),     delta: isPro ? viewsDelta : null, Icon: Eye       },
    { label: 'Comp Card Downloads',  value: isLoading   ? '—' : downloads.toLocaleString(),  delta: null,                     Icon: Download  },
    { label: 'Agency Submissions',   value: appsLoading ? '—' : String(appsCount),           delta: null,                     Icon: Briefcase },
    { label: 'Visibility Score',     value: isLoading   ? '—' : `${completeness}%`,          delta: null,                     Icon: TrendingUp},
  ];
  return (
    <div className="intel-kpi-row">
      {kpis.map(({ label, value, delta, Icon }) => (
        <div key={label} className="intel-kpi">
          <Icon size={14} className="intel-kpi-icon" aria-hidden />
          <span className="intel-kpi-label">{label}</span>
          <span className="intel-kpi-value">{value}</span>
          {isPro && delta !== null && delta !== 0 && (
            <span className={`intel-kpi-delta ${delta > 0 ? 'intel-kpi-delta--up' : 'intel-kpi-delta--down'}`}>
              {delta > 0 ? '↑' : '↓'} {Math.abs(delta)}%
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

// ── IntelMasthead ───────────────────────────────────────────────────────────

function IntelMasthead({ profile, summary, subscription, appsCount, appsLoading, timeRange, onTimeRangeChange, isLoading }) {
  const isPro         = !!subscription?.isPro;
  const views         = asNum(summary?.views?.total);
  const viewsDelta    = asNum(summary?.views?.changePct ?? summary?.views?.changePercent ?? summary?.views?.deltaPct);
  const downloads     = asNum(summary?.downloads?.total);
  const completeness  = asNum(summary?.completeness?.percentage);
  const profileId     = profile?.id?.slice(0, 3)?.toUpperCase() ?? '···';

  return (
    <header className="intel-masthead">
      <div className="intel-masthead-inner">
        <div className="intel-masthead-top">
          <div className="intel-masthead-copy">
            <span className="intel-kicker">Intel · PH-{profileId}</span>
            {isLoading
              ? <div className="intel-skel intel-skel--title" aria-hidden />
              : <h1 className="intel-display">The <em>Intel.</em></h1>}
            <p className="intel-lede">Profile signals, agency interest, and performance intelligence.</p>
            <span className={`intel-tier-pill${isPro ? ' intel-tier-pill--studio' : ''}`}>
              {isPro ? 'Studio+ Member' : 'Free'}
            </span>
          </div>
          <TimeRangeSelector value={timeRange} onChange={onTimeRangeChange} isPro={isPro} />
        </div>

        <HeroKPIRow
          views={views}
          viewsDelta={viewsDelta}
          downloads={downloads}
          completeness={completeness}
          appsCount={appsCount}
          appsLoading={appsLoading}
          isPro={isPro}
          isLoading={isLoading}
        />
      </div>
      <div className="intel-hairline" />
    </header>
  );
}

// ── PLACEHOLDER — chapters added in Tasks 3–5 ───────────────────────────────

function ReachChapter()   { return null; }
function SignalChapter()  { return null; }
function MarketChapter()  { return null; }
function PatternChapter() { return null; }
function ActivityFeed()   { return null; }

// ── AnalyticsView root ──────────────────────────────────────────────────────

export default function AnalyticsView() {
  const { profile, subscription, completeness } = useAuth();
  const isPro = !!(subscription?.isPro ||
    new URLSearchParams(window.location.search).get('debug') === 'pro');
  const [timeRange, setTimeRange] = useState(isPro ? 30 : 7);

  const { analytics, activities, summary, timeseries, detailedStats, sessions, cohorts,
    isLoading, isError, refetch } = useAnalytics(timeRange, { includeAdvanced: isPro });

  const { data: appsPayload, isPending: appsLoading } = useQuery({
    queryKey: ['applications'],
    queryFn: () => talentApi.getApplications(),
    staleTime: 60_000,
    retry: 1,
  });
  const applications = applicationsArray(appsPayload);

  if (isError && !isLoading) {
    return (
      <div className="intel-masthead" style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', padding: '48px clamp(32px,5.4vw,72px)' }}>
        <div>
          <span className="intel-kicker">Intel</span>
          <h1 className="intel-display" style={{ marginBottom: 16 }}>Something went <em>wrong.</em></h1>
          <p className="intel-lede">We couldn't load your Intel right now.</p>
          <button onClick={() => refetch()} style={{
            marginTop: 24, padding: '10px 24px', borderRadius: 8,
            background: 'rgba(201,165,90,0.14)', border: '1px solid rgba(201,165,90,0.28)',
            color: '#C9A55A', fontFamily: 'Inter', fontSize: 13, cursor: 'pointer',
          }}>Try again</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <IntelMasthead
        profile={profile}
        summary={summary}
        subscription={subscription}
        appsCount={applications.length}
        appsLoading={appsLoading}
        timeRange={timeRange}
        onTimeRangeChange={setTimeRange}
        isLoading={isLoading}
      />
      <div className="intel-body">
        <ReachChapter   timeseries={timeseries}   analytics={analytics}  isPro={isPro} />
        <SignalChapter  analytics={analytics}      sessions={sessions}    detailedStats={detailedStats} isPro={isPro} />
        <MarketChapter  applications={applications} appsLoading={appsLoading} isPro={isPro} />
        <PatternChapter cohorts={cohorts}           isPro={isPro} />
        <ActivityFeed   activities={activities} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Run lint**

```bash
cd client && npm run lint -- --max-warnings=0 2>&1 | head -30
```

Expected: Clean (unused `completeness` from useAuth may warn — suppress with `// eslint-disable-line` or remove the destructure if unused at this stage).

- [ ] **Step 3: Start dev server and verify masthead renders**

```bash
npm run dev:all
```

Open `http://localhost:5173/dashboard/talent/analytics`. Expected: dark ink masthead with "The Intel." heading, 4 KPI numbers, time range pills. Body area is blank (chapters return null). No console errors.

- [ ] **Step 4: Commit**

```bash
git add client/src/domains/talent/components/AnalyticsView.jsx
git commit -m "feat: Intel page scaffold — masthead, KPI row, helpers, chapter stubs"
```

---

## Task 3: The Reach. + The Signal. Chapters

**Files:**
- Modify: `client/src/domains/talent/components/AnalyticsView.jsx`

Replace the `ReachChapter` and `SignalChapter` stubs with real implementations.

- [ ] **Step 1: Replace the `ReachChapter` stub with the full implementation**

Find `function ReachChapter()   { return null; }` and replace with:

```jsx
function ReachChapter({ timeseries, analytics, isPro }) {
  const viewsData     = analytics?.views    || {};
  const downloadsData = analytics?.downloads || {};
  const sourceBreakdown = asArray(viewsData.latestSourceBreakdown);
  const byTheme         = asArray(downloadsData.byTheme);
  const downloadsTotal  = asNum(downloadsData.total);

  const chartData = asArray(timeseries).map(item => ({
    date: new Date(item.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    views: asNum(item.views),
    ...(isPro && { downloads: asNum(item.downloads) }),
  }));

  return (
    <motion.section className="intel-chapter" {...CHAPTER_MOTION}>
      <ChapterHeader
        number={1} slug="Reach" title="Reach."
        lede="How far your profile travels and where it lands."
      />

      <div className="reach-chart">
        <ResponsiveContainer width="100%" height={220}>
          <AreaChart data={chartData} margin={{ top: 8, right: 0, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="reach-views-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#C9A55A" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#C9A55A" stopOpacity={0}    />
              </linearGradient>
              {isPro && (
                <linearGradient id="reach-dl-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.12} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}    />
                </linearGradient>
              )}
            </defs>
            <XAxis
              dataKey="date" axisLine={false} tickLine={false}
              tick={{ fontSize: 10, fill: 'rgba(26,26,26,0.36)', fontFamily: 'JetBrains Mono' }}
            />
            <Tooltip contentStyle={{
              background: '#fff', border: 'none', borderRadius: 8,
              fontSize: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
            }} />
            {isPro && <Legend wrapperStyle={{ fontSize: 11, paddingTop: 12 }} />}
            <Area type="monotone" dataKey="views"
              stroke="#C9A55A" strokeWidth={1.5} fill="url(#reach-views-fill)"
              name="Views" dot={false} />
            {isPro && (
              <Area type="monotone" dataKey="downloads"
                stroke="#6366f1" strokeWidth={1.5} fill="url(#reach-dl-fill)"
                name="Downloads" dot={false} />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="reach-stats-row">
        <div className="reach-stat">
          <span className="reach-stat-value">{asNum(viewsData.thisWeek).toLocaleString()}</span>
          <span className="reach-stat-label">Views This Week</span>
        </div>
        <div className="reach-stat">
          <span className="reach-stat-value">{asNum(downloadsData.thisMonth ?? downloadsData.total).toLocaleString()}</span>
          <span className="reach-stat-label">Downloads (30d)</span>
        </div>
        <div className="reach-stat">
          <span className="reach-stat-value">{byTheme[0]?.theme ?? '—'}</span>
          <span className="reach-stat-label">Top Comp Card Theme</span>
        </div>
      </div>

      {isPro ? (
        <>
          <div className="reach-source-bars">
            {sourceBreakdown.length > 0 ? sourceBreakdown.map(src => (
              <div key={src.label} className="reach-source-bar-row">
                <span className="reach-source-label">{src.label}</span>
                <div className="reach-source-track">
                  <div className="reach-source-fill" style={{ width: `${src.percentage}%` }} />
                </div>
                <span className="reach-source-pct">{src.percentage}%</span>
                <span className="reach-source-count">({src.count})</span>
              </div>
            )) : (
              <span style={{ fontSize: 13, color: 'rgba(26,26,26,0.36)' }}>Accumulating source data…</span>
            )}
          </div>
          {byTheme.length > 0 && (
            <div className="reach-theme-table">
              <div className="reach-theme-header">
                <span>Comp Card Theme</span><span>Downloads</span><span>Share</span>
              </div>
              {byTheme.map(t => (
                <div key={t.theme} className="reach-theme-row">
                  <span>{t.theme || 'Unknown'}</span>
                  <span>{t.count}</span>
                  <span>{downloadsTotal > 0 ? Math.round((t.count / downloadsTotal) * 100) : 0}%</span>
                </div>
              ))}
            </div>
          )}
        </>
      ) : (
        <div className="reach-source-pills">
          {sourceBreakdown.length > 0 ? sourceBreakdown.map(src => (
            <span key={src.label} className="reach-source-pill">{src.label} · {src.percentage}%</span>
          )) : (
            <span className="reach-source-pill reach-source-pill--empty">Accumulating source data…</span>
          )}
          <a href="/pricing" className="reach-upgrade-link">See full breakdown →</a>
        </div>
      )}
    </motion.section>
  );
}
```

- [ ] **Step 2: Replace the `SignalChapter` stub with the full implementation**

Find `function SignalChapter()  { return null; }` and replace with:

```jsx
function SignalChapter({ analytics, sessions, detailedStats, isPro }) {
  const viewsTotal       = asNum(analytics?.views?.total);
  const engagementCounts = analytics?.engagement?.counts || {};
  const funnel           = computeFunnel(engagementCounts, viewsTotal);
  const interpretation   = computeInterpretation(funnel.bioReadPct, funnel.contactPct);
  const returnRate       = asNum(detailedStats?.retention?.value);

  const funnelBars = [
    { label: 'Profile Views',   pct: 100 },
    { label: 'Bio Reads',       pct: funnel.bioReadPct  },
    { label: 'Contact Clicks',  pct: funnel.contactPct  },
  ];

  return (
    <motion.section className="intel-chapter" {...CHAPTER_MOTION}>
      <ChapterHeader
        number={2} slug="Signal" title="Signal."
        lede="How visitors engage when they land — and where they go next."
      />

      <div className="signal-funnel">
        {funnelBars.map(bar => (
          <div key={bar.label} className="signal-funnel-row">
            <span className="signal-funnel-label">{bar.label}</span>
            <div className="signal-funnel-track">
              <motion.div
                className="signal-funnel-fill"
                initial={{ width: 0 }}
                animate={{ width: `${bar.pct}%` }}
                transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
            <span className="signal-funnel-pct">{bar.pct}%</span>
          </div>
        ))}
      </div>

      <div className="signal-chips">
        <div className="signal-chip">
          <span className="signal-chip-value">{funnel.bioReadPct}%</span>
          <span className="signal-chip-label">Bio Read Rate</span>
        </div>
        <div className="signal-chip">
          <span className="signal-chip-value">{funnel.contactPct}%</span>
          <span className="signal-chip-label">Contact Rate</span>
        </div>
        <div className="signal-chip">
          <span className="signal-chip-value">{asNum(engagementCounts.scroll_depth)}</span>
          <span className="signal-chip-label">Scroll Events</span>
        </div>
      </div>

      <p className="signal-interpretation">{interpretation}</p>

      {isPro ? (
        <div className="signal-pro-row">
          <SessionsBarChart data={sessions} />
          <div className="signal-return-card">
            <span className="signal-return-label">Return Visitor Rate</span>
            <span className="signal-return-value">{returnRate}%</span>
            <span className="signal-return-desc">
              {returnRate >= 30
                ? 'Strong retention — agencies are coming back to review your profile.'
                : 'Growing your retention means agencies are considering you over time.'}
            </span>
          </div>
        </div>
      ) : (
        <div className="signal-lock-card">
          <div className="signal-lock-card-inner">
            <Lock size={20} className="signal-lock-icon" aria-hidden />
            <span className="signal-lock-label">Studio+ · When agencies view you</span>
            <p className="signal-lock-desc">
              See which hours your profile gets the most attention — and plan your updates accordingly.
            </p>
            <a href="/pricing" className="signal-lock-link">Upgrade to Studio+</a>
          </div>
        </div>
      )}
    </motion.section>
  );
}
```

- [ ] **Step 3: Verify in dev server**

Dev server should already be running. Hard-refresh `http://localhost:5173/dashboard/talent/analytics`.

Expected:
- The Reach. chapter renders with an area chart and stat row
- Source breakdown pills appear (or "Accumulating…" if no data yet)
- The Signal. chapter renders with funnel bars animating in
- Studio+ lock card appears (or session heatmap if using `?debug=pro`)
- No console errors

- [ ] **Step 4: Commit**

```bash
git add client/src/domains/talent/components/AnalyticsView.jsx
git commit -m "feat: add The Reach. and The Signal. chapters to Intel page"
```

---

## Task 4: The Market., The Pattern., and Activity Feed

**Files:**
- Modify: `client/src/domains/talent/components/AnalyticsView.jsx`

Replace the remaining three stubs.

- [ ] **Step 1: Replace the `MarketChapter` stub**

Find `function MarketChapter()  { return null; }` and replace with:

```jsx
function MarketChapter({ applications, appsLoading, isPro }) {
  const apps    = asArray(applications).slice(0, 5);
  const allApps = asArray(applications);

  const lastActive = allApps.length > 0
    ? new Date(allApps[0].updated_at ?? allApps[0].created_at)
        .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    : null;

  if (appsLoading) {
    return (
      <motion.section className="intel-chapter" {...CHAPTER_MOTION}>
        <ChapterHeader number={3} slug="Market" title="Market."
          lede="Agency submissions, application status, and where you stand." />
        <div style={{ height: 120, background: 'rgba(26,26,26,0.04)', borderRadius: 8 }} />
      </motion.section>
    );
  }

  return (
    <motion.section className="intel-chapter" {...CHAPTER_MOTION}>
      <ChapterHeader
        number={3} slug="Market" title="Market."
        lede="Agency submissions, application status, and where you stand."
      />

      <div className="market-summary-chips">
        <span className="market-chip">{allApps.length} Submitted</span>
        {lastActive && <span className="market-chip">Last activity: {lastActive}</span>}
      </div>

      {apps.length === 0 ? (
        <p className="market-empty">
          No submissions yet.{' '}
          <Link to="/dashboard/talent/profile">Complete your profile</Link>{' '}
          to get discovered by agencies.
        </p>
      ) : (
        <>
          <div className="market-app-list" role="list">
            {apps.map(app => {
              const status    = (app.status ?? 'PENDING').toUpperCase();
              const submitted = new Date(app.created_at)
                .toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
              return (
                <div key={app.id} className="market-app-row" role="listitem">
                  <div>
                    <span className="market-app-agency">{app.agency_name ?? 'Agency'}</span>
                    {app.agency_location && (
                      <span className="market-app-location">{app.agency_location}</span>
                    )}
                  </div>
                  <span className={`market-status-pill ${STATUS_CLASS[status] ?? 'market-status--pending'}`}>
                    {STATUS_LABELS[status] ?? status}
                  </span>
                  <span className="market-app-date">{submitted}</span>
                </div>
              );
            })}
          </div>

          {allApps.length > 5 && (
            <Link to="/dashboard/talent/applications" className="market-see-all">
              See all {allApps.length} applications →
            </Link>
          )}

          {isPro && (
            <div className="market-timeline" aria-label="Application momentum">
              {allApps.slice(0, 6).map(app => {
                const status  = (app.status ?? 'PENDING').toUpperCase();
                const changed = new Date(app.updated_at ?? app.created_at)
                  .toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                return (
                  <div key={`tl-${app.id}`} className="market-timeline-item">
                    <span className="market-timeline-agency">{app.agency_name ?? 'Agency'}</span>
                    <span className="market-timeline-date">{changed}</span>
                    {' — '}{STATUS_LABELS[status] ?? status}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </motion.section>
  );
}
```

- [ ] **Step 2: Replace the `PatternChapter` stub**

Find `function PatternChapter() { return null; }` and replace with:

```jsx
function PatternChapter({ cohorts, isPro }) {
  if (!isPro) {
    return (
      <motion.section className="intel-chapter" {...CHAPTER_MOTION}>
        <ChapterHeader
          number={4} slug="Pattern" title="Pattern."
          lede="Retention, cohorts, and the shape of your audience over time."
        />
        <div className="pattern-ghost-card" aria-label="Studio+ feature: Cohort Retention Analysis">
          <div className="pattern-ghost-bg" aria-hidden>
            {GHOST_OPACITIES.map((opacity, i) => (
              <div key={i} className="pattern-ghost-cell" style={{ opacity }} />
            ))}
          </div>
          <div className="pattern-ghost-shimmer" aria-hidden />
          <div className="pattern-ghost-overlay">
            <Lock size={20} className="pattern-lock-icon" aria-hidden />
            <span className="pattern-lock-label">Studio+ · Cohort Retention Analysis</span>
            <p className="pattern-lock-desc">
              See which weeks your viewers come back — and which cohorts lose interest.
            </p>
            <a href="/pricing" className="pattern-lock-link">Upgrade to Studio+</a>
          </div>
        </div>
      </motion.section>
    );
  }

  const summary = computeCohortSummary(cohorts);

  return (
    <motion.section className="intel-chapter" {...CHAPTER_MOTION}>
      <ChapterHeader
        number={4} slug="Pattern" title="Pattern."
        lede="Retention, cohorts, and the shape of your audience over time."
      />

      <div className="pattern-cohort-stats">
        <div className="pattern-cohort-stat">
          <span className="pattern-cohort-stat-value">{summary.avgW1Retention}%</span>
          <span className="pattern-cohort-stat-label">Avg. W1 Retention</span>
        </div>
        <div className="pattern-cohort-stat">
          <span className="pattern-cohort-stat-value">{summary.bestCohortLabel}</span>
          <span className="pattern-cohort-stat-label">Best Cohort Week</span>
        </div>
        <div className="pattern-cohort-stat">
          <span className="pattern-cohort-stat-value">{summary.totalUnique.toLocaleString()}</span>
          <span className="pattern-cohort-stat-label">Total Unique Visitors</span>
        </div>
      </div>

      {summary.bestCohortLabel !== '—' && (
        <p className="pattern-cohort-read">
          Your strongest cohort was the week of <strong>{summary.bestCohortLabel}</strong>.
          {summary.avgW1Retention > 0 && ` Visitors from that week returned at ${summary.avgW1Retention}%.`}
        </p>
      )}

      <CohortHeatmap data={cohorts} />
    </motion.section>
  );
}
```

- [ ] **Step 3: Replace the `ActivityFeed` stub**

Find `function ActivityFeed()   { return null; }` and replace with:

```jsx
function ActivityFeed({ activities }) {
  const list = asArray(activities);
  return (
    <section className="intel-activity">
      <div className="intel-activity-header intel-chapter-header">
        <span className="intel-chapter-kicker">Activity</span>
        <h2 className="intel-chapter-title">Recent <em>Events.</em></h2>
      </div>
      {list.length === 0 ? (
        <p className="intel-empty-activity">No recent events recorded.</p>
      ) : (
        <div className="intel-activity-list">
          {list.map((item, i) => {
            const Icon = ACTIVITY_ICONS[item.type] ?? Activity;
            return (
              <div key={item.id ?? i} className="intel-activity-row">
                <div className="intel-activity-icon" aria-hidden>
                  <Icon size={14} />
                </div>
                <div>
                  <span className="intel-activity-msg">{item.message}</span>
                  <span className="intel-activity-time">{item.timeAgo}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
```

- [ ] **Step 4: Verify the complete page in dev server**

Hard-refresh `http://localhost:5173/dashboard/talent/analytics`.

Expected:
- All four chapters render in sequence: The Reach. / The Signal. / The Market. / The Pattern.
- Activity Feed appears at the bottom
- Free users: Pattern shows ghost preview with shimmer + lock. Signal shows Studio+ lock card.
- Studio+ (`?debug=pro`): full SessionsBarChart + CohortHeatmap visible. 30d/90d time range enabled. Dual-layer chart in The Reach.
- No console errors or React warnings about keys or undefined props

- [ ] **Step 5: Check on mobile viewport**

In browser DevTools, switch to a 375px wide viewport.

Expected:
- KPI row wraps to 2×2 grid
- Funnel rows remain readable
- Application rows drop the date column (hidden via CSS)
- No horizontal overflow

- [ ] **Step 6: Run lint**

```bash
cd client && npm run lint -- --max-warnings=0 2>&1 | head -30
```

Expected: Clean.

- [ ] **Step 7: Commit**

```bash
git add client/src/domains/talent/components/AnalyticsView.jsx
git commit -m "feat: add The Market., The Pattern., and Activity Feed chapters to Intel page"
```

---

## Self-Review Against Spec

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| Dark ink masthead with gold hairline transition | Task 1 (CSS) + Task 2 (IntelMasthead) |
| 4 Hero KPIs (views, downloads, applications, completeness) | Task 2 (HeroKPIRow) |
| Time range selector (7d free, 30d/90d Studio+) | Task 2 (TimeRangeSelector) |
| The Reach.: area chart + stats row + source breakdown | Task 3 |
| The Reach. Studio+: dual-layer chart + bar breakdown + theme table | Task 3 |
| The Signal.: engagement funnel + chips + interpretation | Task 3 |
| The Signal. Studio+: SessionsBarChart + return visitor rate | Task 3 |
| The Signal. free gate: shimmer lock card | Task 3 |
| The Market.: application list + status pills + zero-state | Task 4 |
| The Market. Studio+: momentum timeline | Task 4 |
| The Pattern. free: ghost preview with shimmer + lock | Task 4 |
| The Pattern. Studio+: CohortHeatmap + cohort stats | Task 4 |
| Activity Feed: last 10 events, Lucide icons | Task 4 |
| Framer Motion chapter entrances | Tasks 3–4 (CHAPTER_MOTION) |
| No emoji icons | All tasks — Lucide only |
| Editorial naming convention | All ChapterHeader calls |
| Responsive: 2-col KPI on mobile | Task 1 (CSS media queries) |
| Error state | Task 2 (AnalyticsView root) |
| Loading skeleton in masthead | Task 2 (IntelMasthead) |
| `?debug=pro` Studio+ bypass | Task 2 (AnalyticsView root) |

All spec requirements covered. No gaps found.

**Placeholder scan:** No TBD, TODO, or stub patterns in implementation code. The only placeholder-style elements are the chapter stubs in Task 2 Step 1 — which are explicitly replaced in Tasks 3 and 4.

**Type consistency:** `computeFunnel` returns `{ bioReads, bioReadPct, contactClicks, contactPct }` — all four properties used correctly in SignalChapter. `computeCohortSummary` returns `{ avgW1Retention, bestCohortLabel, totalUnique }` — used exactly as named in PatternChapter. No naming drift.
