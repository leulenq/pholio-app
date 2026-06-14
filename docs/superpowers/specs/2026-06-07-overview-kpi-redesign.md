# Overview Command Panel — KPI Redesign

**Date:** 2026-06-07  
**Scope:** `OverviewPulse` component and supporting data layer  
**Goal:** Replace the generic stats ledger with a focused, action-first command panel that has clear visual hierarchy and shows only decision-useful data.

---

## Problem

The current `OverviewPulse` section sits between the greeting and the talent strip. It contains three visual zones:

1. A hero priority band (large number + label + CTA)
2. A four-stat ledger row (Active castings / Roster / Placement rate / In market)
3. A secondary action queue strip (Awaiting review / Close this week / New today / Idle bench)

The ledger row reads as filler: Roster headcount and Placement rate are lagging indicators that don't change the agent's next move. They compete visually with the urgency above and below them, diluting the panel's authority.

---

## Design Decision

**Lead with action. Remove the ledger.**

An agency agent opening the overview is asking "what do I act on right now" — not reviewing business strategy. Placement rate, roster headcount, and utilization belong in an analytics view. This panel should be a command surface.

---

## Structure

One panel, two zones separated by a hairline rule.

### Zone 1 — Hero

The single highest-priority attention item.

```
TODAY'S PRIORITY                          (eyebrow: 9px uppercase gold)

  7    Awaiting review  ·  11 active castings
       oldest 4d
       Review applications →
```

- Number: Playfair Display, 56px, `--ag-text-0` (urgent tone: `--ag-danger`)
- Label: 10px uppercase, weight 600, `#4a443c`
- Sub: 10px uppercase, `--ag-text-3`
- CTA: 9px uppercase gold, inline arrow
- Context figure: `· {n} {label}` — same line as the big number, separated by a centered dot, 11px, `--ag-text-3`, no uppercase

The context figure is the one number that makes the hero legible. It does not duplicate or replace the ledger — it contextualizes the priority.

### Zone 2 — Queue

The remaining 2–3 non-zero attention items as compact horizontal tiles.

```
  3 Close this week    5 New today    12 Idle bench
    2 today              awaiting triage   unsubmitted 30d
```

- Number: Playfair Display, 26px
- Label: 9px uppercase, weight 600
- Sub: 8.5px uppercase, muted
- No CTA text — the entire tile is a `<Link>`, click navigates directly
- Tiles are visually subordinate: no top rule accent, lighter border treatment

### Clear State

When all attention items are zero, no queue strip renders.

```
STATUS                                    (eyebrow)

All caught up
No boards closing today and inbox is current.
Scout talent →
```

---

## Context Figure Logic

Each hero type maps to exactly one context figure:

| Hero key | Context figure |
|---|---|
| `review` | `{activeCastings} active casting(s)` |
| `closing` | `{activeCastings} active total` |
| `new` | `{pendingReview} total pending` |
| `idle` | `{rosterSize} on roster` |
| `clear` | *(none)* |

Context figure is omitted when its value is 0 or null.

---

## Data Changes

### `overviewData.js`

- `buildAttentionItems(kpis, pulse)` — add a `context` field to each item:
  - `review`: `{ n: kpis.activeCastings, label: kpis.activeCastings === 1 ? 'active casting' : 'active castings' }`
  - `closing`: `{ n: kpis.activeCastings, label: 'active total' }`
  - `new`: `{ n: kpis.pendingReview, label: 'total pending' }`
  - `idle`: `{ n: kpis.rosterSize, label: 'on roster' }`
- `buildHealthStats` — keep the function (no deletion), but `OverviewPage` stops calling it and stops passing `health` to `OverviewPulse`

### `OverviewPage.jsx`

- Remove `const health = buildHealthStats(kpis)` call
- Remove `health={health}` prop from `<OverviewPulse />`
- `hero` object now carries a `context` field (sourced from `buildAttentionItems` → `pickOverviewHero`)

### `OverviewPulse.jsx`

- Remove the `health` prop
- Remove the entire `ov-pulse-ledger` block
- In `PriorityBand`: render context figure inline after the number when `hero.context?.n` is truthy

### `OverviewPage.css`

- Remove all `.ov-pulse-ledger`, `.ov-pulse-ledger-stat`, `.ov-pulse-ledger-num`, `.ov-pulse-ledger-label`, `.ov-pulse-ledger-hint` rules
- Add `.ov-pulse-priority-context` — inline context figure styles
- Adjust responsive breakpoints that referenced the ledger

---

## What Is Not Changed

- The priority band's gold top-rule accent and urgent/clear tone variants
- The queue tile tone system (urgent → danger red, positive → gold, default → neutral)
- The `AgencyStatCard` component (used elsewhere, untouched)
- The `StatLedger` component (used in the roster view, untouched)
- All other overview modules (TalentStrip, BoardsTable, ActivityFeed, TeamModule, NextMoves)

---

## Files Affected

| File | Change |
|---|---|
| `components/overview/overviewData.js` | Add `context` field to attention items |
| `components/overview/OverviewPulse.jsx` | Remove ledger block, add context figure |
| `pages/OverviewPage.jsx` | Stop passing `health` prop |
| `pages/OverviewPage.css` | Remove ledger styles, add context figure styles |
