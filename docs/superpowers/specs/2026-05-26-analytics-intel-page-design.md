# Analytics (Intel) Page — Design Spec
**Date:** 2026-05-26  
**Status:** Approved  
**Scope:** Full redesign of `AnalyticsView.jsx` and `AnalyticsPage.css` / `AnalyticsView.css`

---

## Overview

The Analytics page — branded "Intel" — is the full intelligence layer of the Pholio talent dashboard. It is not an expanded Overview. It is where a talent user goes to **study** their performance in depth: trends, engagement patterns, agency interest, and audience behaviour over time.

The current `AnalyticsView.jsx` is a rough scaffold (emoji icons, generic SaaS stat cards). This spec defines a ground-up redesign that is visually native to the rest of the dashboard, premium, editorial, and clearly useful to both free and Studio+ users.

---

## Visual Direction

**Canvas:** Split — dark ink masthead (`#050505`) transitioning to warm cream body (`#FAF7F2`). A full-bleed gold hairline gradient marks the transition, matching the OverviewView pattern.

**Typography:**
- Display headings: `Noto Serif Display` (italic gold `em` for emphasis)
- Body: `Inter 300`
- Labels/kickers: `JetBrains Mono`, 10–11px, 0.28–0.4em letter-spacing, uppercase, gold `#C9A55A`
- Numbers: `Inter 500` or `600`, large scale

**Tokens (from OverviewView):**
```css
--ink: #050505
--gold: #C9A55A
--gold-warm: #C8A96E
--cream: #FAF7F2
--text-soft: rgba(26,26,26,0.62)
--text-faint: rgba(26,26,26,0.42)
--ease: cubic-bezier(0.22, 1, 0.36, 1)
```

**Motion:** Framer Motion `initial/animate` entrances on each chapter — `opacity: 0 → 1`, `y: 20 → 0`, staggered per section. Spring physics on interactive elements.

**Icons:** Lucide React only — no emoji.

---

## Page Architecture

```
┌─────────────────────────────────────────────────┐
│ MASTHEAD (dark ink, #050505)                     │
│  Mono kicker · Serif display · Tier pill         │
│  Time range selector (Studio+: 30d/90d unlocked) │
│  4 Hero KPI numbers                              │
│─────────── gold hairline gradient ──────────────│
│                                                  │
│ [01 · REACH]  The Reach.                         │
│  Timeseries area chart · source breakdown pills  │
│  Studio+: dual-layer chart + source bar chart    │
│                                                  │
│ [02 · SIGNAL]  The Signal.                       │
│  Engagement funnel bars · engagement stat chips  │
│  Studio+: session heatmap + return visitor rate  │
│                                                  │
│ [03 · MARKET]  The Market.                       │
│  Application list (status, agency, date)         │
│  Studio+: momentum timeline + market position    │
│                                                  │
│ [04 · PATTERN]  The Pattern.                     │
│  Free: ghost preview of cohort heatmap (locked)  │
│  Studio+: full CohortHeatmap + cohort stats      │
│                                                  │
│ ACTIVITY FEED  Recent Events.                   │
│  Last 10 events, always visible, both tiers      │
└─────────────────────────────────────────────────┘
```

---

## Section 1 — Masthead

**Canvas:** Dark ink `#050505`, same as OverviewView hero.

**Layout:**
```
[mono kicker]  Intel  ·  PH-{profile.id.slice(0,3).toUpperCase()}
[serif display h1]  The  <em>Intel.</em>
[body]  Profile signals, agency interest, and performance intelligence.
[tier pill]  Free  |  Studio+ Member
[time range selector]  7d · 30d · 90d   (30d/90d locked for free users)
```

**Hero KPIs** — 4-column horizontal row at the bottom of the masthead, above the gold hairline:

| KPI | Label (mono) | Free | Studio+ |
|---|---|---|---|
| Profile Views | `PROFILE VIEWS` | Total (all time) | Total + `±X%` trend delta vs prior period |
| Comp Card Downloads | `COMP CARD DOWNLOADS` | Total | Total + `±X%` trend delta |
| Active Applications | `AGENCY SUBMISSIONS` | Count | Count + "Last activity N days ago" |
| Profile Completeness | `VISIBILITY SCORE` | Percentage | Percentage (same) |

Trend deltas: small `↑ +12%` / `↓ -4%` in gold (positive) or `rgba(245,240,230,0.45)` (negative/neutral). Never red — this is not a stock ticker.

**Time range selector:** Pill group — `7d` always active for free, `30d` and `90d` show a mono lock glyph and are disabled. Studio+ users control the global time range from here; all chapter charts respond.

---

## Section 2 — The Reach. (Chapter 01)

**Chapter header pattern** (shared across all chapters):
```jsx
<div className="intel-chapter-header">
  <span className="intel-chapter-kicker">01 · Reach</span>
  <h2 className="intel-chapter-title">The <em>Reach.</em></h2>
  <p className="intel-chapter-lede">How far your profile travels and where it lands.</p>
</div>
```

**Free tier:**
- Full-width Recharts `AreaChart` — 7 days of `timeseries` data. Gold `#C9A55A` stroke, `rgba(201,165,90,0.08)` fill gradient, no grid lines, cream background, no axis borders.
- Below chart: 3-column stat row — **Views This Week** / **Comp Card Downloads (30d)** / **Top Download Theme** (e.g. "Classic: 4")
- Source breakdown as pill chips: "Direct · 62% — Social Media · 28% — Search · 10%". Pills: gold outline, mono text.
- Upgrade prompt: inline text link "See full source breakdown →" routes to `/pricing`. No banner.

**Studio+ additions:**
- Time range extends to 30d/90d (controlled by masthead selector).
- Second area layer on chart for downloads (indigo `#6366f1` stroke, matching existing pattern), with legend.
- Source breakdown expands to horizontal bar breakdown chart with counts and percentages (replacing pills).
- Downloads by Comp Card Theme: small 3-column table (Theme · Count · % of total).

---

## Section 3 — The Signal. (Chapter 02)

**Chapter header:**
```
[kicker]  02 · Signal
[title]  The  Signal.
[lede]  How visitors engage when they land — and where they go next.
```

**Free tier:**
- **Engagement Funnel** — vertical stacked bars:
  ```
  Profile Views    ████████████████  100%
  Bio Reads        [bio_read/views × 100]%
  Contact Clicks   [(social_click + portfolio_click)/views × 100]%
  ```
  Each bar: warm cream fill, 3px gold left-border accent, labels in Inter 300, percentages in JetBrains Mono.
- **3 engagement stat chips** below funnel: `Bio Read Rate` · `Contact Rate` · `Avg Scroll Depth`
- **Contextual interpretation line** — dynamically generated from funnel numbers (not hardcoded). Examples:
  - High bio read, low contact: *"Most visitors read your bio — fewer click through. Strengthen your social links."*
  - Low bio read: *"Visitors aren't reaching your bio. Consider a stronger profile headline."*

**Studio+ additions:**
- **Session Heatmap** (existing `SessionsBarChart`, restyled to Pholio tokens) — time-of-day viewing patterns.
- Editorial callout derived from data: *"Your profile peaks at 2–4pm on weekdays."*
- **Return Visitor Rate** — large number with sparkline (from cohort W1 retention in `useAnalytics`).

**Free gate for Studio+ zone:**
A single locked card where the heatmap would appear:
- Dark ink surface, shimmer animation
- Gold lock glyph + mono label: `Studio+ · When agencies view you`
- One sentence: *"See which hours your profile gets the most attention — and plan your updates accordingly."*
- Text link: `Upgrade to Studio+` → `/pricing`

---

## Section 4 — The Market. (Chapter 03)

**Chapter header:**
```
[kicker]  03 · Market
[title]  The  Market.
[lede]  Agency submissions, application status, and where you stand.
```

**Free tier:**
- **Application list** — last 5 applications, each as a row:
  - Agency name (Noto Serif Display, 16px)
  - Location (mono faint)
  - Status pill: `Pending` (gold outline) / `Reviewing` (warm amber) / `Accepted` (subtle green) / `Declined` (neutral faint)
  - Submitted date (mono faint)
- Rows separated by gold hairline rules, no card chrome — clean editorial list.
- **Zero state:** *"No submissions yet. Agencies discover talent through Pholio's discovery feed — a complete profile gets you in."* + link to `/dashboard/talent/profile`
- **2 summary chips:** `N Submitted` · `Last activity: X days ago`
- "See all applications →" link to `/dashboard/talent/applications`

**Studio+ additions:**
- **Application Momentum** — small horizontal timeline: each application as a node on a line, showing submitted date and last status change. Visual rhythm communicates activity or stagnation.
- **Market Position chip** inline with chapter header: `Top 12% in Editorial` (uses existing `ov-ranking-chip` pattern from OverviewView; omitted if no percentile data).

---

## Section 5 — The Pattern. (Chapter 04)

**Chapter header:**
```
[kicker]  04 · Pattern
[title]  The  Pattern.
[lede]  Retention, cohorts, and the shape of your audience over time.
```

**Free tier:**
- Full-width **ghost preview card** — dark ink surface (`#050505`), occupying the space the heatmap would use.
- Blurred ghost rendering of a cohort heatmap cells (CSS `filter: blur(6px)` + `opacity: 0.3` on a placeholder grid).
- Gold shimmer animation across the ghost (`@keyframes shimmer` linear gradient sweep).
- Overlay content:
  - Gold lock glyph (Lucide `Lock`, 20px)
  - Mono label: `Studio+ · Cohort Retention Analysis`
  - One sentence: *"See which weeks your viewers come back — and which cohorts lose interest."*
  - Text link only: `Upgrade to Studio+` → `/pricing`

**Studio+ content:**
- Full `CohortHeatmap` component (existing, restyled to cream cells / gold heat scale instead of generic blue).
- **3 cohort summary stats** above the heatmap: `Avg. W1 Retention` · `Best Cohort Week` · `Total Unique Visitors`.
- Editorial read: dynamically derived — *"Your strongest cohort was the week of [date]. Visitors from that week returned at [X]%."*

---

## Section 6 — Activity Feed

**Always visible, both tiers.**

```
[mono kicker]  Activity
[serif]  Recent  Events.
```

- Vertical list of last 10 events, separated by hairline rules.
- Each row: Lucide icon (contextual: `Eye` for views, `Download` for downloads, `FileText` for comp cards, `CheckCircle` for applications) + event description + mono timestamp.
- No card chrome — clean rows on cream background.
- No "Pro Tip" sidebar — that pattern is removed.

---

## Data Sources

All data from existing `useAnalytics` hook — no new API routes required.

| Chapter | Data | Hook property |
|---|---|---|
| Masthead KPIs | Views total, downloads total, completeness | `summary`, `analytics` |
| The Reach. | Timeseries, source breakdown, download themes | `timeseries`, `analytics.views.latestSourceBreakdown`, `analytics.downloads.byTheme` |
| The Signal. | Engagement counts, session heatmap, retention | `analytics.engagement.counts`, `sessions`, `detailedStats.retention` |
| The Market. | Applications list | Via `talentApi.getApplications()` + `useQuery` |
| The Pattern. | Cohort heatmap, cohort stats | `cohorts` |
| Activity Feed | Recent events | `activities` |

**Hook call:** `useAnalytics(timeRange, { includeAdvanced: isStudioPlus })` — same as current.

---

## Free vs Studio+ Differentiation

| Area | Free | Studio+ |
|---|---|---|
| Time range | 7 days only | 7 / 30 / 90 days |
| Trend deltas on KPIs | Hidden | Visible |
| The Reach. chart | Single-layer (views) | Dual-layer (views + downloads) |
| Source breakdown | Pill chips (% only) | Horizontal bar chart (count + %) |
| Download themes table | Hidden | Visible |
| Session heatmap | Locked ghost card | Full `SessionsBarChart` |
| Return visitor rate | Hidden | Visible with sparkline |
| Application momentum timeline | Hidden | Visible |
| The Pattern. / cohort heatmap | Ghost preview | Full `CohortHeatmap` |

**Philosophy:** Free users get the complete page structure and real data in every chapter. Studio+ adds depth, trend context, and pattern intelligence — not access to different sections. The difference feels like resolution, not restriction.

---

## Component Changes

**Files changed:**
- `client/src/domains/talent/components/AnalyticsView.jsx` — full rewrite
- `client/src/domains/talent/components/AnalyticsView.css` (or `AnalyticsPage.css`) — full rewrite with Pholio design tokens
- `client/src/domains/talent/pages/AnalyticsPage/AnalyticsPage.css` — minimal shell styles only

**Existing components reused:**
- `SessionsBarChart` — restyled via CSS tokens
- `CohortHeatmap` — restyled via CSS tokens
- `SparklineChart` — used for return visitor rate sparkline
- `useAnalytics` hook — unchanged
- `talentApi.getApplications` — used directly in AnalyticsView via `useQuery`

**New sub-components (defined inline in AnalyticsView.jsx):**
- `IntelMasthead` — rewrite of existing masthead
- `HeroKPIRow` — 4-column KPI strip
- `TimeRangeSelector` — existing logic, restyled
- `ChapterHeader` — shared header pattern for all 4 chapters
- `ReachChapter` — The Reach. section
- `SignalChapter` — The Signal. section, includes `EngagementFunnel`
- `MarketChapter` — The Market. section, includes `ApplicationRow`
- `PatternChapter` — The Pattern. section, includes `GhostPatternLock`
- `ActivityFeed` — always-visible event list

---

## Out of Scope

- Per-image analytics (backend does not track per-photo events)
- Specific agency viewer identification (backend tracks profile-level events only)
- Export functionality (was in old design; deferred — can be added in a future iteration)
- Dashboard customization / widget toggles (removed — adds complexity without value)
