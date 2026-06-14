# Overview Command Panel — KPI Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the generic four-stat KPI ledger in `OverviewPulse` with an action-first command panel that has clear visual hierarchy and shows only decision-useful data.

**Architecture:** Remove the `ov-pulse-ledger` row entirely. Add a single inline context figure to the hero priority band that contextualizes the priority without adding a separate metrics row. The four attention items (review, closing, new, idle) each carry their own context shape; the hero spreads it naturally via `pickOverviewHero`'s existing spread.

**Tech Stack:** React 19, Framer Motion, CSS custom properties (`agency-tokens.css`), no backend changes.

---

## File Map

| File | Change |
|---|---|
| `client/src/domains/agency/components/overview/overviewData.js` | Add `context` field to each attention item in `buildAttentionItems` |
| `client/src/domains/agency/components/overview/OverviewPulse.jsx` | Remove `health` prop + ledger block; add context figure in `PriorityBand`; remove `--tail` modifier |
| `client/src/domains/agency/pages/OverviewPage.jsx` | Remove `buildHealthStats` call and `health` prop |
| `client/src/domains/agency/pages/OverviewPage.css` | Remove all `.ov-pulse-ledger*` rules; add `.ov-pulse-priority-num-group` + `.ov-pulse-priority-context`; clean up responsive ledger rules |

---

## Task 1: Add `context` field to attention items

**File:** `client/src/domains/agency/components/overview/overviewData.js`

- [ ] **Step 1: Update `buildAttentionItems` to add a `context` field to each item**

Replace the entire `buildAttentionItems` function (lines 118–157) with:

```js
export function buildAttentionItems(kpis, pulse) {
  return [
    {
      key: 'review',
      n: kpis.pendingReview,
      label: 'Awaiting review',
      sub: kpis.pendingOldestDaysAgo ? `oldest ${kpis.pendingOldestDaysAgo}d` : 'all current',
      to: '/dashboard/agency/applicants',
      tone: (kpis.pendingOldestDaysAgo || 0) >= 14 ? 'urgent' : 'default',
      cta: 'Review applications',
      context: kpis.activeCastings > 0
        ? { n: kpis.activeCastings, label: kpis.activeCastings === 1 ? 'active casting' : 'active castings' }
        : null,
    },
    {
      key: 'closing',
      n: pulse.closingWeek,
      label: 'Close this week',
      sub: kpis.castingsClosingToday ? `${kpis.castingsClosingToday} today` : 'across boards',
      to: '/dashboard/agency/casting',
      tone: kpis.castingsClosingToday > 0 ? 'urgent' : 'default',
      cta: 'Open casting',
      context: kpis.activeCastings > 0
        ? { n: kpis.activeCastings, label: 'active total' }
        : null,
    },
    {
      key: 'new',
      n: pulse.newToday,
      label: 'New today',
      sub: 'awaiting triage',
      to: '/dashboard/agency/applicants',
      tone: 'positive',
      cta: 'Triage inbox',
      context: kpis.pendingReview > 0
        ? { n: kpis.pendingReview, label: 'total pending' }
        : null,
    },
    {
      key: 'idle',
      n: pulse.idleTalent,
      label: 'Idle bench',
      sub: 'unsubmitted 30d',
      to: '/dashboard/agency/roster',
      tone: 'default',
      cta: 'Activate roster',
      context: kpis.rosterSize > 0
        ? { n: kpis.rosterSize, label: 'on roster' }
        : null,
    },
  ];
}
```

The `context` field is `{ n: number, label: string } | null`. `pickOverviewHero` already does `{ kind: 'action', ...top }`, so `hero.context` is available in `OverviewPulse` with no changes to `pickOverviewHero`.

- [ ] **Step 2: Commit**

```bash
git add client/src/domains/agency/components/overview/overviewData.js
git commit -m "feat(overview): add context field to attention items"
```

---

## Task 2: Update `OverviewPulse.jsx`

**File:** `client/src/domains/agency/components/overview/OverviewPulse.jsx`

- [ ] **Step 1: Replace the entire file contents**

```jsx
import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowUpRight } from 'lucide-react';

const spring = { type: 'spring', stiffness: 55, damping: 16 };

function PriorityBand({ hero }) {
  if (hero.kind === 'clear') {
    return (
      <div className="ov-pulse-priority ov-pulse-priority--clear">
        <span className="ov-pulse-eyebrow">Status</span>
        <div className="ov-pulse-priority-main ov-pulse-priority-main--clear">
          <div className="ov-pulse-priority-copy">
            <span className="ov-pulse-priority-headline">{hero.label}</span>
            <span className="ov-pulse-priority-sub">{hero.sub}</span>
            {hero.to && (
              <Link to={hero.to} className="ov-pulse-priority-cta">
                {hero.cta} <ArrowUpRight size={12} strokeWidth={1.75} aria-hidden="true" />
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  return (
    <Link to={hero.to} className={`ov-pulse-priority ov-pulse-priority--${hero.tone}`}>
      <span className="ov-pulse-eyebrow">Today&apos;s priority</span>
      <div className="ov-pulse-priority-main">
        <div className="ov-pulse-priority-num-group">
          <span className="ov-pulse-priority-num">{hero.n}</span>
          {hero.context && (
            <span className="ov-pulse-priority-context">
              · {hero.context.n} {hero.context.label}
            </span>
          )}
        </div>
        <div className="ov-pulse-priority-copy">
          <span className="ov-pulse-priority-label">{hero.label}</span>
          {hero.sub && <span className="ov-pulse-priority-sub">{hero.sub}</span>}
          <span className="ov-pulse-priority-cta">
            {hero.cta} <ArrowUpRight size={12} strokeWidth={1.75} aria-hidden="true" />
          </span>
        </div>
        <span className="ov-pulse-priority-go" aria-hidden="true">
          <ArrowUpRight size={16} strokeWidth={1.5} />
        </span>
      </div>
    </Link>
  );
}

export default function OverviewPulse({ hero, actions }) {
  return (
    <motion.section
      className="ov-module ov-pulse"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
    >
      <div className="ov-pulse-panel">
        <PriorityBand hero={hero} />
        {actions.length > 0 && (
          <div className="ov-pulse-queue" role="list">
            {actions.map((a, i) => (
              <motion.div
                key={a.key}
                role="listitem"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ ...spring, delay: 0.05 + i * 0.04 }}
              >
                <Link to={a.to} className={`ov-pulse-queue-tile ov-pulse-queue-tile--${a.tone}`}>
                  <span className="ov-pulse-queue-n">{a.n}</span>
                  <span className="ov-pulse-queue-label">{a.label}</span>
                  {a.sub && <span className="ov-pulse-queue-sub">{a.sub}</span>}
                </Link>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </motion.section>
  );
}
```

Key changes from original:
- `health` prop removed from `OverviewPulse`
- Entire `ov-pulse-ledger` block removed
- `ov-pulse-panel--tail` modifier removed (was only used to strip the ledger border)
- `PriorityBand` action state wraps number + context in `.ov-pulse-priority-num-group`
- Context figure renders when `hero.context` is non-null

- [ ] **Step 2: Commit**

```bash
git add client/src/domains/agency/components/overview/OverviewPulse.jsx
git commit -m "feat(overview): remove ledger, add context figure to hero band"
```

---

## Task 3: Update `OverviewPage.jsx` — remove `health` prop

**File:** `client/src/domains/agency/pages/OverviewPage.jsx`

- [ ] **Step 1: Remove `buildHealthStats` import reference and call**

In the import at line 8, remove `buildHealthStats` from the destructured imports:

```js
import {
  selectKpis, selectPipeline, selectPulse, selectTalentMix,
  buildNextMoves, mapApplicant,
  buildAttentionItems, pickOverviewHero,
} from '../components/overview/overviewData';
```

- [ ] **Step 2: Remove the `health` variable and prop**

Remove line `const health = buildHealthStats(kpis);` (currently line 53).

Update the `<OverviewPulse>` call from:

```jsx
<OverviewPulse hero={hero} actions={pulseActions} health={health} />
```

to:

```jsx
<OverviewPulse hero={hero} actions={pulseActions} />
```

- [ ] **Step 3: Commit**

```bash
git add client/src/domains/agency/pages/OverviewPage.jsx
git commit -m "feat(overview): remove health prop from OverviewPulse"
```

---

## Task 4: Update `OverviewPage.css` — remove ledger styles, add context figure

**File:** `client/src/domains/agency/pages/OverviewPage.css`

- [ ] **Step 1: Remove the `ov-pulse-ledger` block and all child rules**

Delete these rules entirely (lines 118–159 in current file):

```css
.ov-pulse-ledger {
  display: flex;
  padding: 18px 0 16px;
  border-bottom: 1px solid var(--ag-rule);
}
.ov-pulse-panel--tail .ov-pulse-ledger {
  border-bottom: none;
  padding-bottom: 18px;
}
.ov-pulse-ledger-stat {
  flex: 1;
  min-width: 0;
  padding: 0 24px;
  border-left: 1px solid #e2dac9;
}
.ov-pulse-ledger-stat:first-child {
  border-left: none;
  padding-left: 24px;
}
.ov-pulse-ledger-num {
  display: block;
  font-family: var(--ag-font-display);
  font-size: 30px;
  line-height: 1;
  color: var(--ag-text-0);
}
.ov-pulse-ledger-label {
  display: block;
  font-size: 9px;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: var(--ag-text-3);
  margin-top: 9px;
}
.ov-pulse-ledger-hint {
  display: block;
  font-size: 8.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: #b3a89a;
  margin-top: 4px;
}
```

- [ ] **Step 2: Replace `.ov-pulse-priority-main` and add new num-group / context rules**

Find and replace the existing `.ov-pulse-priority-main` rule:

```css
/* old */
.ov-pulse-priority-main {
  display: flex;
  align-items: flex-end;
  gap: 18px;
}
```

Replace with:

```css
.ov-pulse-priority-main {
  display: flex;
  align-items: flex-start;
  gap: 18px;
}
.ov-pulse-priority-num-group {
  display: flex;
  flex-direction: column;
  flex: none;
  gap: 6px;
}
.ov-pulse-priority-context {
  font-size: 11px;
  color: var(--ag-text-3);
  letter-spacing: 0.04em;
}
```

`align-items` changes from `flex-end` to `flex-start` so the copy block top-aligns with the number group rather than bottom-aligning with a now-taller group.

- [ ] **Step 3: Remove the ledger rules from the 960px and 720px breakpoints**

In `@media (max-width: 960px)`, remove:

```css
.ov-pulse-ledger { flex-wrap: wrap; row-gap: 16px; }
.ov-pulse-ledger-stat { flex: 1 1 45%; border-left: none; padding-left: 24px; }
.ov-pulse-ledger-stat:nth-child(odd) { border-left: none; }
```

In `@media (max-width: 720px)`, remove:

```css
.ov-pulse-ledger { flex-direction: column; padding: 0; }
.ov-pulse-ledger-stat {
  flex: none;
  border-left: none;
  border-top: 1px solid #ece4d4;
  padding: 14px 24px;
}
.ov-pulse-ledger-stat:first-child { border-top: none; }
```

The `ov-pulse-priority-num` responsive rule at 720px stays untouched:

```css
.ov-pulse-priority-num { font-size: 44px; }
```

- [ ] **Step 4: Commit**

```bash
git add client/src/domains/agency/pages/OverviewPage.css
git commit -m "style(overview): remove ledger CSS, add context figure styles"
```

---

## Task 5: Visual verification

- [ ] **Step 1: Start the dev server**

```bash
npm run dev:all
```

Open `http://localhost:5173/dashboard/agency` and navigate to the Overview tab.

- [ ] **Step 2: Verify the action state**

When there are pending review items or active castings, confirm:
- Large serif number renders at top of priority band
- Context figure (`· N active castings`) appears below the number in muted text
- No ledger row between priority band and queue tiles
- Queue tiles render below (2–3 items), compact and visually subordinate

- [ ] **Step 3: Verify the clear state**

When all attention items are zero (or use the `clear` mock path):
- Eyebrow reads "Status" not "Today's priority"
- "All caught up" headline renders in display font
- No queue strip below
- No ledger row

- [ ] **Step 4: Verify responsive at 720px**

Resize to 720px. Confirm:
- Priority number scales down (44px)
- Queue tiles stack vertically
- No broken layout from removed ledger responsive rules

- [ ] **Step 5: Final commit**

```bash
git add -p
git commit -m "feat(overview): action-first command panel, remove KPI ledger"
```
