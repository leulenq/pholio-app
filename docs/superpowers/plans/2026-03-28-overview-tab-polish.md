# Overview Tab Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Polish the Talent Dashboard Overview tab to feel premium and on-brand — improving visual hierarchy, interactive clarity, data utility, and empty-state UX without theatrical effects or motion complexity.

**Architecture:** All changes are isolated to `OverviewView.jsx` and `OverviewView.css`. Existing data is already available via `useAnalytics()` (`detailedStats.profileViews.trend`) and `summary` — no new API calls or hooks required. One new inline helper component (`TrendDelta`) lives in the same JSX file.

**Tech Stack:** React 19, Lucide React (already installed), custom CSS tokens (`--talent-*`), existing `useAnalytics` hook.

---

## File Map

| File | Change Type | What Changes |
|------|------------|--------------|
| `client/src/domains/talent/components/OverviewView.jsx` | Modify | Greeting fallback, activity icon, ArrowRight links, TrendDelta component, analytics card data wiring, zero-state logic |
| `client/src/domains/talent/components/OverviewView.css` | Modify | Remove false hover affordance, add bento lift, applications gold border, upsell card treatment, fluid hero type, ArrowRight hover animation, TrendDelta styles |

No new files. No new dependencies. No changes to hooks, API, or other components.

---

## Task 1: CSS Micro-Fixes (Visual Quality + Correct Affordances)

**Files:**
- Modify: `client/src/domains/talent/components/OverviewView.css`

These are 6 isolated CSS changes committed together.

- [ ] **Step 1: Remove hover state from non-interactive KPI cards**

Replace the generic `.kpi-card:hover` rule so only the cards that contain navigation links respond to hover. The Views and Downloads cards are display-only.

In `OverviewView.css`, replace:
```css
.kpi-card:hover {
  box-shadow: var(--talent-shadow-3);
  border: var(--talent-border-hover);
}
```
With:
```css
.kpi-card--interactive:hover {
  box-shadow: var(--talent-shadow-3);
  border: var(--talent-border-hover);
}
```

- [ ] **Step 2: Add `kpi-card--interactive` class to navigable KPI cards in JSX (preview only — full JSX changes in Task 2)**

Note: The Applications and Profile Strength KPI cards need `className="kpi-card kpi-card--interactive"` — this will be applied in Task 2. Don't change JSX yet.

- [ ] **Step 3: Add hover lift to bento cards**

In `OverviewView.css`, update `.bento-card:hover`:
```css
.bento-card:hover {
  border: var(--talent-border-hover);
  box-shadow: var(--talent-shadow-2);
  transform: translateY(-2px);
}
```

- [ ] **Step 4: Add left gold accent border to Applications card**

In `OverviewView.css`, add to `.bento-card--applications`:
```css
.bento-card--applications {
  grid-column: span 2;
  grid-row: span 2;
  border-left: 3px solid var(--talent-accent-gold);
}
```

- [ ] **Step 5: Strengthen Upsell card background and border**

In `OverviewView.css`, update `.bento-card--upsell`:
```css
.bento-card--upsell {
  grid-column: span 2;
  background: rgba(201, 165, 90, 0.10);
  border: 1px solid rgba(201, 165, 90, 0.30);
}
```

- [ ] **Step 6: Fluid hero typography**

In `OverviewView.css`, update `.overview-greeting`:
```css
.overview-greeting {
  font-family: var(--talent-font-display);
  font-size: clamp(2rem, 4vw, 3.5rem);
  font-weight: 400;
  color: var(--talent-text-primary);
  line-height: 1.2;
  margin: 0 0 var(--talent-space-2) 0;
  letter-spacing: -0.02em;
}
```

Remove the media query override for `.overview-greeting` since `clamp` handles it:
```css
/* Remove this from the @media (max-width: 768px) block: */
/* .overview-greeting { font-size: 2.25rem; } */
```

- [ ] **Step 7: Add ArrowRight icon hover animation CSS (used in Task 2)**

Add to end of `OverviewView.css`:
```css
/* ── Arrow link icon nudge ── */
.arrow-link-icon {
  flex-shrink: 0;
  transition: transform 0.15s ease-out;
}
.bento-footer-link:hover .arrow-link-icon,
.kpi-cta-link:hover .arrow-link-icon,
.bento-link:hover .arrow-link-icon {
  transform: translateX(3px);
}
```

- [ ] **Step 8: Add TrendDelta CSS (used in Task 3)**

Add to end of `OverviewView.css`:
```css
/* ── Trend Delta badge ── */
.trend-delta {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: var(--talent-radius-sm);
  white-space: nowrap;
}
.trend-delta--positive {
  background: var(--talent-success-bg);
  color: var(--talent-success);
}
.trend-delta--negative {
  background: var(--talent-error-bg);
  color: var(--talent-error);
}
.trend-delta--neutral {
  background: rgba(0, 0, 0, 0.05);
  color: var(--talent-text-secondary);
}
```

- [ ] **Step 9: Upsell CTA button full-width**

Add to `OverviewView.css`:
```css
.upsell-cta {
  align-self: flex-start;
  width: 100%;
  justify-content: center;
}
```

*(This replaces the existing `.upsell-cta { align-self: flex-start; }` rule.)*

- [ ] **Step 10: Verify the CSS file has no duplicate rules for the above selectors, then commit**

```bash
cd /Users/lenquanhone/Projects/pholio-app
git add client/src/domains/talent/components/OverviewView.css
git commit -m "style(overview): visual hierarchy polish — lift, gold border, fluid type, upsell treatment"
```

---

## Task 2: JSX Micro-Fixes

**Files:**
- Modify: `client/src/domains/talent/components/OverviewView.jsx`

- [ ] **Step 1: Add `ArrowRight` to the Lucide import**

Replace the existing import line:
```jsx
import { Download, Share2, Eye, TrendingUp, ExternalLink,
         Sparkles, CheckCircle, Clock, AlertCircle, BarChart2 } from 'lucide-react';
```
With:
```jsx
import { Download, Share2, Eye, TrendingUp, ExternalLink,
         Sparkles, CheckCircle, Clock, AlertCircle, BarChart2,
         ArrowRight, Zap } from 'lucide-react';
```

- [ ] **Step 2: Fix greeting name fallback**

Replace:
```jsx
{getGreeting()}, {profile?.first_name || 'Talent'}
```
With:
```jsx
{getGreeting()}{profile?.first_name ? `, ${profile.first_name}` : ''}
```

- [ ] **Step 3: Fix activity icon — use `Zap` for strength events**

Replace the `getActivityIcon` function:
```jsx
const getActivityIcon = (activity) => {
  const type = String(activity?.type || activity?.activity_type || '').toLowerCase();
  if (type.includes('view')) return <Eye size={14} aria-hidden />;
  if (type.includes('download')) return <Download size={14} aria-hidden />;
  if (type.includes('share')) return <Share2 size={14} aria-hidden />;
  if (type.includes('strength') || type.includes('complete')) return <Zap size={14} aria-hidden />;
  return <Clock size={14} aria-hidden />;
};
```

- [ ] **Step 4: Mark Applications and Profile Strength KPI cards as interactive**

Add `kpi-card--interactive` class to the two navigable KPI cards:

Applications card — replace:
```jsx
<div className="kpi-card" role="listitem"
     aria-busy={applicationsPending ? true : undefined}>
```
With:
```jsx
<div className="kpi-card kpi-card--interactive" role="listitem"
     aria-busy={applicationsPending ? true : undefined}>
```

Profile Strength card — replace:
```jsx
<div className="kpi-card kpi-card--strength" role="listitem">
```
With:
```jsx
<div className="kpi-card kpi-card--strength kpi-card--interactive" role="listitem">
```

- [ ] **Step 5: Replace `→` text with `ArrowRight` icon on all navigation links**

Find every instance of `→` used as link text in the JSX and replace with the icon. There are 6 locations:

1. Applications KPI card `kpi-cta-link`:
```jsx
<Link to="/dashboard/talent/applications" className="kpi-cta-link">
  View All <ArrowRight size={12} className="arrow-link-icon" aria-hidden />
</Link>
```

2. Profile Strength KPI card `kpi-cta-link`:
```jsx
<Link to="/dashboard/talent/profile" className="kpi-cta-link">
  Complete Profile <ArrowRight size={12} className="arrow-link-icon" aria-hidden />
</Link>
```

3. Bento card A header `bento-link`:
```jsx
<Link to="/dashboard/talent/applications" className="bento-link">
  View All <ArrowRight size={12} className="arrow-link-icon" aria-hidden />
</Link>
```

4. Bento card A footer `bento-footer-link`:
```jsx
<Link to="/dashboard/talent/applications" className="bento-footer-link">
  View All Applications <ArrowRight size={14} className="arrow-link-icon" aria-hidden />
</Link>
```

5. Analytics card `bento-footer-link`:
```jsx
<Link to="/dashboard/talent/analytics" className="bento-footer-link">
  View Full Analytics <ArrowRight size={14} className="arrow-link-icon" aria-hidden />
</Link>
```

6. Activity footer `bento-footer-link`:
```jsx
<Link to="/dashboard/talent/analytics" className="bento-footer-link">
  View More Activity <ArrowRight size={14} className="arrow-link-icon" aria-hidden />
</Link>
```

- [ ] **Step 6: Replace `→` step-link buttons in Next Steps card**

Replace the step-link `→` character:
```jsx
{!step.completed && (
  step.link
    ? <Link to={step.link} className="step-link" aria-label={`Start: ${step.title}`}>
        <ArrowRight size={14} aria-hidden />
      </Link>
    : <button type="button" className="step-link" onClick={step.onClick}>
        <ArrowRight size={14} aria-hidden />
      </button>
)}
```

- [ ] **Step 7: Upgrade upsell card headline and icon size, add benefit bullets**

Replace the upsell card contents (inside `.bento-card--upsell`):
```jsx
<div className="bento-card bento-card--upsell">
  <Sparkles size={24} aria-hidden className="upsell-icon" />
  <h3 className="upsell-headline">Unlock Studio Plus</h3>
  <ul className="upsell-benefits" aria-label="Studio Plus benefits">
    <li>AI-powered photo analysis and scoring</li>
    <li>Advanced analytics with audience insights</li>
    <li>Priority placement in agency discovery</li>
  </ul>
  <a href="https://www.pholio.studio/pricing"
     className="overview-btn overview-btn--primary upsell-cta">
    Learn More
  </a>
</div>
```

- [ ] **Step 8: Add `.upsell-benefits` CSS**

Add to `OverviewView.css`:
```css
.upsell-benefits {
  list-style: none;
  margin: 0 0 var(--talent-space-4) 0;
  padding: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: var(--talent-space-2);
  font-size: 0.8125rem;
  color: var(--talent-text-secondary);
}
.upsell-benefits li::before {
  content: '✓ ';
  color: var(--talent-accent-gold);
  font-weight: 700;
}
```

- [ ] **Step 9: Verify the app renders correctly**

```bash
cd /Users/lenquanhone/Projects/pholio-app && npm run dev:all
```

Open http://localhost:5173/dashboard/talent and visually check:
- Greeting shows without "Talent" fallback
- KPI card hover only activates on Applications + Profile Strength
- All `→` replaced with Lucide icons
- Upsell card shows 3 bullet benefits

- [ ] **Step 10: Commit**

```bash
git add client/src/domains/talent/components/OverviewView.jsx \
        client/src/domains/talent/components/OverviewView.css
git commit -m "fix(overview): JSX micro-fixes — greeting fallback, icons, ArrowRight links, upsell upgrade"
```

---

## Task 3: Analytics Card Trend Delta

**Files:**
- Modify: `client/src/domains/talent/components/OverviewView.jsx`
- Modify: `client/src/domains/talent/components/OverviewView.css`

The `useAnalytics()` hook already returns `detailedStats.profileViews.trend` (views `changePct`) and `summary` which can contain `downloads.changePct`. No new API calls needed.

- [ ] **Step 1: Destructure `detailedStats` from `useAnalytics` in `OverviewView`**

In `OverviewView.jsx`, update the `useAnalytics` destructure:
```jsx
const {
  activities,
  isLoading: activitiesLoading,
  summary,
  summaryError,
  activityError,
  refetch: refetchAnalytics,
  isAnalyticsRefetching,
  detailedStats,
  isSummaryLoading,
} = useAnalytics();
```

- [ ] **Step 2: Add a `TrendDelta` helper component above `OverviewView`**

Insert before the `export default function OverviewView()` line:
```jsx
/** Displays a coloured trend delta like "+12%" or "−3%" */
function TrendDelta({ value }) {
  if (!Number.isFinite(value) || value === 0) {
    return (
      <span className="trend-delta trend-delta--neutral" aria-label="No change">
        — vs last week
      </span>
    );
  }
  const isPositive = value > 0;
  const label = `${isPositive ? '+' : ''}${Math.round(value)}% vs last week`;
  return (
    <span
      className={`trend-delta ${isPositive ? 'trend-delta--positive' : 'trend-delta--negative'}`}
      aria-label={label}
    >
      {isPositive ? '↑' : '↓'} {Math.abs(Math.round(value))}%
    </span>
  );
}
```

- [ ] **Step 3: Derive downloads trend from `summary`**

Inside `OverviewView`, after the existing `stats` object, add:
```jsx
const trends = {
  views: detailedStats?.profileViews?.trend ?? 0,
  downloads: Number.isFinite(
    Number(summary?.downloads?.changePct ?? summary?.downloads?.changePercent ?? summary?.downloads?.deltaPct)
  )
    ? Number(summary?.downloads?.changePct ?? summary?.downloads?.changePercent ?? summary?.downloads?.deltaPct)
    : 0,
};
```

- [ ] **Step 4: Update the Analytics Snippet card (Card B) to show trend deltas**

Replace the existing analytics snippet JSX:
```jsx
{/* Card B: Analytics Snippet */}
<div className="bento-card bento-card--analytics">
  <h2 className="bento-card-title">This Week</h2>
  <div className="analytics-snippet">
    <div className="snippet-row">
      <Eye size={16} aria-hidden className="snippet-icon" />
      <span className="snippet-value">{stats.views.toLocaleString()}</span>
      <span className="snippet-label">views</span>
      {!isSummaryLoading && <TrendDelta value={trends.views} />}
    </div>
    <div className="snippet-row">
      <Download size={16} aria-hidden className="snippet-icon" />
      <span className="snippet-value">{stats.downloads.toLocaleString()}</span>
      <span className="snippet-label">downloads</span>
      {!isSummaryLoading && <TrendDelta value={trends.downloads} />}
    </div>
  </div>
  <Link to="/dashboard/talent/analytics" className="bento-footer-link">
    View Full Analytics <ArrowRight size={14} className="arrow-link-icon" aria-hidden />
  </Link>
</div>
```

- [ ] **Step 5: Update `snippet-row` CSS to accommodate the delta badge**

In `OverviewView.css`, update `.snippet-row`:
```css
.snippet-row {
  display: flex;
  align-items: center;
  gap: var(--talent-space-2);
  font-size: 0.9375rem;
  flex-wrap: wrap;
}
```

- [ ] **Step 6: Handle the zero-data case for the analytics card**

When both values are 0, show a motivational prompt instead of `0 views / 0 downloads`. Add the zero check inside Card B, replacing the `analytics-snippet` div:
```jsx
{stats.views === 0 && stats.downloads === 0 && !isSummaryLoading ? (
  <p className="analytics-empty-prompt">
    Share your profile to get your first view.
  </p>
) : (
  <div className="analytics-snippet">
    <div className="snippet-row">
      <Eye size={16} aria-hidden className="snippet-icon" />
      <span className="snippet-value">{stats.views.toLocaleString()}</span>
      <span className="snippet-label">views</span>
      {!isSummaryLoading && <TrendDelta value={trends.views} />}
    </div>
    <div className="snippet-row">
      <Download size={16} aria-hidden className="snippet-icon" />
      <span className="snippet-value">{stats.downloads.toLocaleString()}</span>
      <span className="snippet-label">downloads</span>
      {!isSummaryLoading && <TrendDelta value={trends.downloads} />}
    </div>
  </div>
)}
```

Add CSS:
```css
.analytics-empty-prompt {
  flex: 1;
  font-size: 0.875rem;
  color: var(--talent-text-secondary);
  font-style: italic;
  margin: 0 0 var(--talent-space-4) 0;
}
```

- [ ] **Step 7: Verify in browser**

With dev server running, open http://localhost:5173/dashboard/talent and confirm:
- Analytics card shows delta badges when trend data exists
- Analytics card shows the motivational prompt when views and downloads are both 0

- [ ] **Step 8: Commit**

```bash
git add client/src/domains/talent/components/OverviewView.jsx \
        client/src/domains/talent/components/OverviewView.css
git commit -m "feat(overview): analytics card trend deltas + zero-state prompt"
```

---

## Task 4: Zero-State Consolidation for New Users

**Files:**
- Modify: `client/src/domains/talent/components/OverviewView.jsx`
- Modify: `client/src/domains/talent/components/OverviewView.css`

**Goal:** When a user has no data at all (0 views, 0 downloads, 0 applications, no activity), the dashboard currently shows empty states in 4 different places at once. This task elevates the "Get Discovered Faster" checklist card to be the dominant element in the empty state, while keeping the KPI row visible but de-emphasized.

**Detection logic:** A user is in the "zero state" when `stats.views === 0 && stats.downloads === 0 && applicationsParsed.ok && applicationsParsed.count === 0`.

- [ ] **Step 1: Compute `isZeroState` boolean in `OverviewView`**

After the `applicationsParsed` line, add:
```jsx
const isZeroState =
  !profileLoading &&
  !applicationsPending &&
  stats.views === 0 &&
  stats.downloads === 0 &&
  applicationsParsed.ok &&
  applicationsParsed.count === 0;
```

- [ ] **Step 2: Add a zero-state welcome banner above the KPI row**

Inside the `overview-container` div, add immediately before `{/* ── 2. KPI ROW ── */}`:
```jsx
{isZeroState && (
  <div className="zero-state-banner" role="status">
    <div className="zero-state-icon" aria-hidden>
      <Sparkles size={20} />
    </div>
    <div className="zero-state-text">
      <strong>You're all set up.</strong> Complete the steps below to start getting discovered.
    </div>
  </div>
)}
```

- [ ] **Step 3: Add KPI row de-emphasis in zero state**

Add a conditional class to the KPI row:
```jsx
<div className={`kpi-row${isZeroState ? ' kpi-row--empty' : ''}`} role="list" aria-label="Key metrics">
```

Add CSS:
```css
.kpi-row--empty .kpi-card {
  opacity: 0.55;
}
.kpi-row--empty .kpi-card--interactive {
  opacity: 1;
}
```

This visually mutes the 0-value KPI cards while keeping the navigable ones (Profile Strength — which is always > 0 if onboarding is done — and Applications) fully visible.

- [ ] **Step 4: Add zero-state banner CSS**

```css
/* ── Zero state banner ── */
.zero-state-banner {
  display: flex;
  align-items: center;
  gap: var(--talent-space-3);
  background: var(--talent-accent-gold-ghost);
  border: 1px solid var(--talent-accent-gold-border);
  border-radius: var(--talent-radius-lg);
  padding: var(--talent-space-3) var(--talent-space-4);
  margin-bottom: var(--talent-space-6);
  font-size: 0.875rem;
  color: var(--talent-text-primary);
}
.zero-state-icon {
  color: var(--talent-accent-gold);
  flex-shrink: 0;
}
.zero-state-text strong {
  font-weight: 600;
}
```

- [ ] **Step 5: Suppress the bento Applications empty state when in zero state**

When `isZeroState` is true, the "No applications yet" empty state in the bento card is redundant — the banner already communicates emptiness. Replace the empty state in Card A with a simpler, quieter treatment:

```jsx
) : applicationsParsed.count === 0 ? (
  isZeroState ? (
    <div className="bento-empty-state bento-empty-state--quiet">
      <p>Apply to agencies to see your applications here.</p>
      <Link to="/dashboard/talent/applications" className="bento-footer-link">
        Browse Agencies <ArrowRight size={14} className="arrow-link-icon" aria-hidden />
      </Link>
    </div>
  ) : (
    <div className="bento-empty-state">
      <TrendingUp size={32} aria-hidden className="empty-icon" />
      <p>No applications yet.</p>
      <Link to="/dashboard/talent/applications" className="overview-btn overview-btn--secondary">
        Browse Agencies
      </Link>
    </div>
  )
) : (
```

Add CSS:
```css
.bento-empty-state--quiet {
  align-items: flex-start;
  padding: var(--talent-space-4) 0;
  text-align: left;
}
```

- [ ] **Step 6: Suppress Activity Footer when in zero state**

When `isZeroState` is true, the activity footer's empty Clock state is redundant. Conditionally hide the activity section entirely:

```jsx
{/* ── 4. ACTIVITY FOOTER ── */}
{!isZeroState && (
  <section className="activity-footer">
    {/* ... existing activity footer contents unchanged ... */}
  </section>
)}
```

- [ ] **Step 7: Verify in browser — simulate zero state**

To test the zero state without real data, temporarily hardcode `isZeroState = true` and confirm:
- Gold banner appears above KPI row
- KPI cards for Views and Downloads are visually muted (opacity 0.55)
- Applications bento card shows the quiet empty state
- Activity footer is hidden
- Revert the hardcode after verification

- [ ] **Step 8: Commit**

```bash
git add client/src/domains/talent/components/OverviewView.jsx \
        client/src/domains/talent/components/OverviewView.css
git commit -m "feat(overview): zero-state consolidation — banner, muted KPIs, quiet empty states"
```

---

## Self-Review Checklist

**Spec coverage:**
- [x] Remove false hover affordance on non-interactive KPI cards → Task 1 Step 1, Task 2 Step 4
- [x] Zero state demoralizing → Task 4
- [x] Analytics card trend delta → Task 3
- [x] Bento grid card hierarchy (gold border on Applications, stronger upsell) → Task 1 Steps 4–5
- [x] Hover lift on bento cards → Task 1 Step 3
- [x] Arrow link upgrade → Task 1 Step 7, Task 2 Steps 5–6
- [x] Upsell card upgrade → Task 1 Step 9, Task 2 Steps 7–8
- [x] Hero fluid typography → Task 1 Step 6
- [x] Greeting name fallback → Task 2 Step 2
- [x] Activity icon fix (Zap) → Task 2 Step 3
- [x] Analytics card zero-data state → Task 3 Step 6

**No placeholders found.**

**Type/method consistency:**
- `detailedStats.profileViews.trend` — returned from `useAnalytics()` at `useAnalytics.js:157`
- `isSummaryLoading` — returned from `useAnalytics()` at `useAnalytics.js:219`
- `summary?.downloads?.changePct` — same pattern as `views.changePct` in hook
- `isZeroState` defined in Task 4 Step 1, used in Steps 2–6
- `TrendDelta` component defined in Task 3 Step 2, used in Task 3 Step 4
- `ArrowRight`, `Zap` imported in Task 2 Step 1, used throughout Tasks 2–4
