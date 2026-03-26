# Agency Overview Improvements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Improve the agency dashboard overview tab with a live pulse strip, dynamic hero subtitle, active talent utilization KPI, pipeline conversion rates, data-aware Discover promo, and inline application actions with optimistic UI.

**Architecture:** Backend changes land in `agency-overview-queries.js` (two new query functions) and `agency-overview.js` (route update). The shortlist action reuses the existing `PATCH /api/agency/applications/:id/status` endpoint — no new route needed. All frontend changes are isolated to `OverviewPage.jsx` and `OverviewPage.css`.

**Tech Stack:** Node.js/Express 5 backend, Knex.js (SQLite dev / PostgreSQL prod), React 19, TanStack Query v5, Framer Motion, Recharts, Lucide React, Sonner toasts.

---

## File Map

| File | What changes |
|------|-------------|
| `src/lib/agency-overview-queries.js` | Add `getPulse()` and `getActiveUtilization()` |
| `src/routes/api/agency-overview.js` | Use `getSessionAgencyId`, add new queries to `Promise.all`, expose `pulse` + `utilization` in response |
| `client/src/api/agency.js` | Add `shortlistApplication()` using existing `apiClient.patch` against `PATCH /api/agency/applications/:id/status` — no new backend route needed |
| `client/src/routes/agency/OverviewPage.jsx` | Pulse strip, dynamic subtitle, utilization KPI, conversion rates, inline actions + optimistic UI |
| `client/src/routes/agency/OverviewPage.css` | Styles for new UI elements |
| `tests/agency-overview.test.js` | Extend existing suite: new shape tests for `pulse` + `utilization`; query-level correctness tests |

---

## Task 1: `getPulse()` backend query

**Files:**
- Modify: `src/lib/agency-overview-queries.js`
- Test: `tests/agency-overview.test.js`

### Context

The existing file exports 7 async functions (`getPendingReview`, `getActiveCastings`, `getRosterSize`, `getPlacementRate`, `getPipeline`, `getTalentMix`, `getAlerts`). All follow the same signature: `async function name(db, agencyId)`. Add `getPulse` at the bottom in the same style.

The test file creates its own SQLite schema in `createSchema()`. It needs two new tables: `board_applications` (with `application_id`, `profile_id`, `match_score`, `created_at`) and an `is_discoverable` column on `profiles`. Add these to `createSchema()` in the test.

- [ ] **Step 1: Add `board_applications` and `is_discoverable` to test schema**

Open `tests/agency-overview.test.js`. In `createSchema()`, add after the boards table block:

```js
// board_applications — links board_applications.application_id → applications.id
// No profile_id column here; profile is reached via applications.profile_id
if (!(await knex.schema.hasTable('board_applications'))) {
  await knex.schema.createTable('board_applications', (t) => {
    t.string('id', 36).primary()
    t.string('application_id', 36).references('id').inTable('applications')
    t.float('match_score').nullable()
    t.timestamp('created_at').defaultTo(knex.fn.now())
  })
}
// is_discoverable on profiles
if (!(await knex.schema.hasColumn('profiles', 'is_discoverable'))) {
  await knex.schema.alterTable('profiles', (t) => {
    t.boolean('is_discoverable').defaultTo(false)
  })
}
```

- [ ] **Step 2: Write failing tests for `getPulse` zero-state**

Add a new `describe` block at the bottom of `tests/agency-overview.test.js`:

```js
describe('getPulse — zero state', () => {
  test('returns all-zero pulse for fresh agency', async () => {
    const result = await queries.getPulse(knex, AGENCY_USER_ID)
    expect(result.newToday).toBe(0)
    expect(result.closingWeek).toBe(0)
    expect(result.idleTalent).toBe(0)
    expect(result.avgMatchScore).toBeNull()
    expect(result.matchCount).toBeGreaterThanOrEqual(0)
    expect(result.newTalentWeek).toBeGreaterThanOrEqual(0)
  })
})
```

- [ ] **Step 3: Run failing test to confirm it fails**

```bash
npx jest tests/agency-overview.test.js --testNamePattern "getPulse — zero state" 2>&1 | tail -20
```

Expected: `TypeError: queries.getPulse is not a function`

- [ ] **Step 4: Implement `getPulse` in `agency-overview-queries.js`**

Add at the bottom of `src/lib/agency-overview-queries.js`, before the `module.exports` block:

```js
/**
 * Returns live "right now" signals for the pulse strip and Discover promo card.
 *
 * Pulse strip chips (4): newToday, closingWeek, idleTalent, avgMatchScore
 * Discover promo card (2): matchCount, newTalentWeek
 *
 * @returns {{
 *   newToday: number,
 *   closingWeek: number,
 *   idleTalent: number,
 *   avgMatchScore: number|null,
 *   matchCount: number,
 *   newTalentWeek: number
 * }}
 */
async function getPulse(db, agencyId) {
  const { dayStart } = utcDayBounds()
  const weekAhead    = new Date(Date.now() + 7 * DAY_MS)
  const thirtyDaysAgo = new Date(Date.now() - 30 * DAY_MS)
  const sevenDaysAgo  = new Date(Date.now() - 7 * DAY_MS)

  const [
    [newTodayRow],
    [closingWeekRow],
    [idleRow],
    [avgRow],
    [matchRow],
    [newTalentRow],
  ] = await Promise.all([
    // New applications received today
    db('applications')
      .where('agency_id', agencyId)
      .where('created_at', '>=', dayStart)
      .count('* as count'),

    // Active castings closing within the next 7 days
    db('boards')
      .where({ agency_id: agencyId, is_active: true })
      .where('closes_at', '>=', new Date())
      .where('closes_at', '<', weekAhead)
      .count('* as count'),

    // Accepted talent not submitted to any casting (this agency) in 30 days
    db('applications as a')
      .where('a.agency_id', agencyId)
      .where('a.status', 'accepted')
      .whereNotIn('a.profile_id', function () {
        this.select('a2.profile_id')
          .from('board_applications as ba')
          .join('applications as a2', 'a2.id', 'ba.application_id')
          .where('a2.agency_id', agencyId)
          .where('ba.created_at', '>=', thirtyDaysAgo)
          .distinct()
      })
      .count('* as count'),

    // Average match score of currently-pending submitted applications
    db('board_applications as ba')
      .join('applications as a', 'a.id', 'ba.application_id')
      .where('a.agency_id', agencyId)
      .where('a.status', 'submitted')
      .avg('ba.match_score as avg'),

    // Discoverable profiles not yet applied to this agency
    db('profiles')
      .where('is_discoverable', true)
      .whereNotIn('id', function () {
        this.select('profile_id').from('applications').where('agency_id', agencyId)
      })
      .count('* as count'),

    // New discoverable talent in the last 7 days
    db('profiles')
      .where('is_discoverable', true)
      .where('created_at', '>=', sevenDaysAgo)
      .count('* as count'),
  ])

  return {
    newToday:      parseInt(newTodayRow.count,    10) || 0,
    closingWeek:   parseInt(closingWeekRow.count,  10) || 0,
    idleTalent:    parseInt(idleRow.count,          10) || 0,
    avgMatchScore: avgRow.avg != null ? Math.round(Number(avgRow.avg)) : null,
    matchCount:    parseInt(matchRow.count,         10) || 0,
    newTalentWeek: parseInt(newTalentRow.count,     10) || 0,
  }
}
```

Also add `getPulse` to the `module.exports` at the bottom.

- [ ] **Step 5: Run the zero-state test to confirm it passes**

```bash
npx jest tests/agency-overview.test.js --testNamePattern "getPulse" 2>&1 | tail -20
```

Expected: `PASS — 1 test passed`

- [ ] **Step 6: Write and run data-correctness test for `getPulse`**

Add inside the `describe('query functions — data correctness', ...)` block (or a new describe alongside it):

```js
describe('getPulse — data correctness', () => {
  const TODAY_APP_ID = uuidv4()
  const ACCEPTED_APP_ID = uuidv4()
  const IDLE_PROFILE_ID = uuidv4()
  const BOARD_ID = uuidv4()

  beforeAll(async () => {
    // idle talent profile
    await knex('profiles').insert({ id: IDLE_PROFILE_ID, user_id: TALENT_USER_ID, is_discoverable: false })
    // application submitted today
    await knex('applications').insert({
      id: TODAY_APP_ID, profile_id: PROFILE_ID, agency_id: AGENCY_USER_ID,
      status: 'submitted', created_at: new Date().toISOString(),
    })
    // accepted application with no recent board activity = idle
    await knex('applications').insert({
      id: ACCEPTED_APP_ID, profile_id: IDLE_PROFILE_ID, agency_id: AGENCY_USER_ID,
      status: 'accepted', created_at: new Date(Date.now() - 60 * 86400000).toISOString(),
    })
    // board closing in 3 days
    await knex('boards').insert({
      id: BOARD_ID, agency_id: AGENCY_USER_ID, is_active: true,
      closes_at: new Date(Date.now() + 3 * 86400000).toISOString(),
    })
  })

  afterAll(async () => {
    await knex('boards').where({ id: BOARD_ID }).delete()
    await knex('applications').whereIn('id', [TODAY_APP_ID, ACCEPTED_APP_ID]).delete()
    await knex('profiles').where({ id: IDLE_PROFILE_ID }).delete()
  })

  test('newToday counts application submitted today', async () => {
    const result = await queries.getPulse(knex, AGENCY_USER_ID)
    expect(result.newToday).toBeGreaterThanOrEqual(1)
  })

  test('closingWeek counts board closing in 3 days', async () => {
    const result = await queries.getPulse(knex, AGENCY_USER_ID)
    expect(result.closingWeek).toBeGreaterThanOrEqual(1)
  })

  test('idleTalent counts accepted talent with no recent board activity', async () => {
    const result = await queries.getPulse(knex, AGENCY_USER_ID)
    expect(result.idleTalent).toBeGreaterThanOrEqual(1)
  })
})
```

```bash
npx jest tests/agency-overview.test.js --testNamePattern "getPulse — data" 2>&1 | tail -20
```

Expected: `PASS — 3 tests passed`

- [ ] **Step 7: Commit**

```bash
git add src/lib/agency-overview-queries.js tests/agency-overview.test.js
git commit -m "feat(backend): add getPulse query for overview pulse strip and Discover promo"
```

---

## Task 2: `getActiveUtilization()` backend query

**Files:**
- Modify: `src/lib/agency-overview-queries.js`
- Test: `tests/agency-overview.test.js`

- [ ] **Step 1: Write failing test for `getActiveUtilization` zero-state**

Add to `tests/agency-overview.test.js`:

```js
describe('getActiveUtilization — zero state', () => {
  test('returns { active: 0, total: 0, pct: 0 } for fresh agency', async () => {
    const result = await queries.getActiveUtilization(knex, AGENCY_USER_ID)
    expect(result).toEqual({ active: 0, total: 0, pct: 0 })
  })
})
```

- [ ] **Step 2: Run to confirm it fails**

```bash
npx jest tests/agency-overview.test.js --testNamePattern "getActiveUtilization" 2>&1 | tail -10
```

Expected: `TypeError: queries.getActiveUtilization is not a function`

- [ ] **Step 3: Implement `getActiveUtilization` in `agency-overview-queries.js`**

Add after `getPulse`, before `module.exports`:

```js
/**
 * Returns active talent utilization: distinct signed talent who have been
 * submitted to a casting in the last 30 days, vs total distinct signed talent.
 *
 * Both sides count DISTINCT profile_id to avoid overcounting talent with
 * multiple accepted applications.
 *
 * @returns {{ active: number, total: number, pct: number }}
 */
async function getActiveUtilization(db, agencyId) {
  const thirtyDaysAgo = new Date(Date.now() - 30 * DAY_MS)

  const [totalRow] = await db('applications')
    .where({ agency_id: agencyId, status: 'accepted' })
    .countDistinct('profile_id as count')

  const total = parseInt(totalRow.count, 10) || 0
  if (total === 0) return { active: 0, total: 0, pct: 0 }

  const [activeRow] = await db('applications as a')
    .join('board_applications as ba', 'ba.application_id', 'a.id')
    .where('a.agency_id', agencyId)
    .where('a.status', 'accepted')
    .where('ba.created_at', '>=', thirtyDaysAgo)
    .countDistinct('a.profile_id as count')

  const active = parseInt(activeRow.count, 10) || 0
  const pct    = Math.round((active / total) * 100)

  return { active, total, pct }
}
```

Add `getActiveUtilization` to `module.exports`.

- [ ] **Step 4: Run zero-state test to confirm it passes**

```bash
npx jest tests/agency-overview.test.js --testNamePattern "getActiveUtilization" 2>&1 | tail -10
```

Expected: `PASS`

- [ ] **Step 5: Commit**

```bash
git add src/lib/agency-overview-queries.js tests/agency-overview.test.js
git commit -m "feat(backend): add getActiveUtilization query for roster KPI"
```

---

## Task 3: Update the overview route

**Files:**
- Modify: `src/routes/api/agency-overview.js`
- Test: `tests/agency-overview.test.js`

### Context

The current route at line 28 uses `req.session.userId` as the agency ID. Replace with `getSessionAgencyId(req.session)` from `src/lib/agency-context.js`. Then add `getPulse` and `getActiveUtilization` to the `Promise.all`. The response shape gains `data.pulse` (top-level) and `data.kpis.utilization`.

- [ ] **Step 1: Write failing shape tests**

Add to the `describe('GET /api/agency/overview — response shape', ...)` block:

```js
test('pulse object present with correct shape', () => {
  const { pulse } = res.body.data
  expect(pulse).toBeDefined()
  expect(typeof pulse.newToday).toBe('number')
  expect(typeof pulse.closingWeek).toBe('number')
  expect(typeof pulse.idleTalent).toBe('number')
  expect(typeof pulse.matchCount).toBe('number')
  expect(typeof pulse.newTalentWeek).toBe('number')
  // avgMatchScore may be null when no submitted apps exist
  expect(
    pulse.avgMatchScore === null || typeof pulse.avgMatchScore === 'number'
  ).toBe(true)
})

test('kpis.utilization present with correct shape', () => {
  const { utilization } = res.body.data.kpis
  expect(utilization).toBeDefined()
  expect(typeof utilization.active).toBe('number')
  expect(typeof utilization.total).toBe('number')
  expect(typeof utilization.pct).toBe('number')
})
```

- [ ] **Step 2: Run to confirm tests fail**

```bash
npx jest tests/agency-overview.test.js --testNamePattern "pulse object|kpis.utilization" 2>&1 | tail -15
```

Expected: both tests fail with `undefined`

- [ ] **Step 3: Update `agency-overview.js`**

Replace the entire file content:

```js
// src/routes/api/agency-overview.js
'use strict'

const express   = require('express')
const router    = express.Router()
const knex      = require('../../db/knex')
const { requireRole }        = require('../../middleware/auth')
const { getSessionAgencyId } = require('../../lib/agency-context')
const {
  getPendingReview,
  getActiveCastings,
  getRosterSize,
  getPlacementRate,
  getPipeline,
  getTalentMix,
  getAlerts,
  getPulse,
  getActiveUtilization,
} = require('../../lib/agency-overview-queries')

/**
 * GET /api/agency/overview
 *
 * Returns aggregated KPI, pipeline, talent mix, pulse, and alert data
 * for the Agency Overview tab. All 9 queries run in parallel.
 *
 * Auth: requireRole('AGENCY')
 */
router.get('/api/agency/overview', requireRole('AGENCY'), async (req, res) => {
  try {
    const agencyId = getSessionAgencyId(req.session)
    if (!agencyId) return res.status(401).json({ success: false, error: 'Unauthorized' })

    const [
      pendingReview,
      activeCastings,
      rosterSize,
      placementRate,
      pipeline,
      talentMix,
      alerts,
      pulse,
      utilization,
    ] = await Promise.all([
      getPendingReview(knex,       agencyId),
      getActiveCastings(knex,      agencyId),
      getRosterSize(knex,          agencyId),
      getPlacementRate(knex,       agencyId),
      getPipeline(knex,            agencyId),
      getTalentMix(knex,           agencyId),
      getAlerts(knex,              agencyId),
      getPulse(knex,               agencyId),
      getActiveUtilization(knex,   agencyId),
    ])

    return res.json({
      success: true,
      data: {
        kpis: { pendingReview, activeCastings, rosterSize, placementRate, utilization },
        pipeline,
        talentMix,
        alerts,
        pulse,
      },
    })
  } catch (err) {
    console.error('[AgencyOverview] Error:', err)
    return res.status(500).json({ success: false, error: 'Internal server error' })
  }
})

module.exports = router
```

- [ ] **Step 4: Run updated shape tests to confirm they pass**

```bash
npx jest tests/agency-overview.test.js 2>&1 | tail -20
```

Expected: all tests pass (including existing ones)

- [ ] **Step 5: Commit**

```bash
git add src/routes/api/agency-overview.js tests/agency-overview.test.js
git commit -m "feat(backend): expose pulse and utilization in overview route; use getSessionAgencyId"
```

---

## Task 4: Add `shortlistApplication` to the client API

**Files:**
- Modify: `client/src/api/agency.js`

### Context

The existing `PATCH /api/agency/applications/:applicationId/status` endpoint already supports `shortlisted`. The client just needs a named method that calls it. Look at `acceptApplication` (line 182) for the pattern — use `apiClient.patch` with `{ status: 'shortlisted' }`.

- [ ] **Step 1: Add `shortlistApplication` method**

In `client/src/api/agency.js`, add after `declineApplication`:

```js
/**
 * Shortlist an application (move to shortlisted status).
 */
export async function shortlistApplication(applicationId) {
  return apiClient.patch(`/applications/${applicationId}/status`, { status: 'shortlisted' });
}
```

Also add `shortlistApplication` to the `export default` object at the bottom of the file.

- [ ] **Step 2: Verify lint passes**

```bash
cd client && npm run lint 2>&1 | tail -10
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add client/src/api/agency.js
git commit -m "feat(client): add shortlistApplication API method"
```

---

## Task 5: Frontend — Pulse strip + dynamic subtitle

**Files:**
- Modify: `client/src/routes/agency/OverviewPage.jsx`
- Modify: `client/src/routes/agency/OverviewPage.css`

### Context

The `getAgencyOverview` query returns `overview.data` which is auto-unwrapped by `api/client.js` to just `data`. So `overview` in the component already equals `{ kpis, pipeline, talentMix, alerts, pulse }`. The component accesses `overview?.kpis`, `overview?.pipeline`, etc.

Import additions needed: `Inbox, Moon, Star` from `lucide-react` (Clock is already imported as `Clock`).

- [ ] **Step 1: Add pulse strip imports**

In `OverviewPage.jsx`, update the lucide-react import line to include `Inbox, Moon, Star`:

```js
import {
  ChevronDown,
  ArrowUpRight, TrendingUp, Inbox, Users,
  AlertCircle, Clock, Loader2, Moon, Star,
} from 'lucide-react';
```

- [ ] **Step 2: Add `buildDynamicSubtitle` helper and `PulseStrip` component**

Add after the `getApplicantStatus` helper (around line 104):

```jsx
// ════════════════════════════════════════════════════════════
// DYNAMIC SUBTITLE
// ════════════════════════════════════════════════════════════

function buildDynamicSubtitle(kpis, pulse) {
  const pending = kpis?.pendingReview?.count ?? 0;
  const oldest  = kpis?.pendingReview?.oldestDaysAgo;
  if (pending > 0) {
    return `${pending} application${pending === 1 ? '' : 's'} waiting — oldest ${oldest ?? '?'} days ago.`;
  }
  const closingToday = kpis?.activeCastings?.closingToday ?? 0;
  if (closingToday > 0) {
    return `${closingToday} casting${closingToday === 1 ? '' : 's'} close${closingToday === 1 ? 's' : ''} today — time to shortlist.`;
  }
  const idle = pulse?.idleTalent ?? 0;
  if (idle > 0) {
    return `${idle} signed talent haven't been submitted in 30 days.`;
  }
  return 'All caught up — roster looking strong.';
}

// ════════════════════════════════════════════════════════════
// PULSE STRIP
// ════════════════════════════════════════════════════════════

function PulseChip({ icon: Icon, value, label, to, urgent }) {
  const display = value == null ? '—' : value;
  return (
    <motion.div
      className={`ov-pulse-chip${urgent ? ' ov-pulse-chip--urgent' : ''}${value === 0 || value == null ? ' ov-pulse-chip--dim' : ''}`}
      whileHover={{ y: -1, transition: { duration: 0.15 } }}
    >
      <Link to={to} className="ov-pulse-chip-inner">
        <Icon size={14} className="ov-pulse-icon" />
        <span className="ov-pulse-value">{display}</span>
        <span className="ov-pulse-label">{label}</span>
      </Link>
    </motion.div>
  );
}

function PulseStrip({ pulse, rosterCount }) {
  const idle        = pulse?.idleTalent ?? null;
  const avgMatch    = pulse?.avgMatchScore ?? null;
  const idleUrgent  = rosterCount > 0 && idle != null && (idle / rosterCount) > 0.2;
  const matchUrgent = avgMatch != null && avgMatch < 50;

  return (
    <div className="ov-pulse-strip">
      <PulseChip icon={Inbox}  value={pulse?.newToday}     label="new today"          to="/dashboard/agency/applicants" />
      <PulseChip icon={Clock}  value={pulse?.closingWeek}  label="closing this week"  to="/dashboard/agency/casting" />
      <PulseChip icon={Moon}   value={idle}                label="idle signed talent" to="/dashboard/agency/roster" urgent={idleUrgent} />
      <PulseChip icon={Star}   value={avgMatch != null ? `${avgMatch}%` : null} label="avg match score" to="/dashboard/agency/applicants" urgent={matchUrgent} />
    </div>
  );
}
```

- [ ] **Step 3: Wire pulse data in `OverviewPage` and replace static subtitle**

In the `OverviewPage` component body, after the existing data destructuring (around line 279), add:

```js
const pulse = overview?.pulse ?? {};
const dynamicSubtitle = buildDynamicSubtitle(kpis, pulse);
```

Replace the static subtitle span in the hero section:
```jsx
// BEFORE:
<motion.span className="ov-hero-line ov-hero-line--sub" custom={1} variants={lineVars}>
  Here's where your roster stands today.
</motion.span>

// AFTER:
<motion.span className="ov-hero-line ov-hero-line--sub" custom={1} variants={lineVars}>
  {dynamicSubtitle}
</motion.span>
```

Add `<PulseStrip pulse={pulse} rosterCount={rosterSize.count} />` between the attention strip and the BentoGrid:

```jsx
{/* ── Attention Strip ── */}
<AttentionStripData items={attentionItems} />

{/* ── Pulse Strip ── */}
<PulseStrip pulse={pulse} rosterCount={rosterSize.count} />

{/* ── Row 1: KPI cards ── */}
<BentoGrid variants={itemVars}>
```

- [ ] **Step 4: Add pulse strip CSS**

In `OverviewPage.css`, add at the bottom:

```css
/* ── Pulse Strip ── */
.ov-pulse-strip {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}

.ov-pulse-chip {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 8px 14px;
  background: var(--ag-surface-1);
  border: 1px solid rgba(0,0,0,0.06);
  border-radius: 10px;
  text-decoration: none;
  color: var(--ag-text-0);
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}

.ov-pulse-chip:hover {
  border-color: var(--ag-gold);
  box-shadow: var(--ag-shadow-gold);
}

.ov-pulse-chip-inner {
  display: flex;
  align-items: center;
  gap: 7px;
  text-decoration: none;
  color: inherit;
  width: 100%;
}

.ov-pulse-chip--dim {
  opacity: 0.45;
}

.ov-pulse-chip--urgent {
  border-color: #d97706;
  background: #fffbeb;
}

.ov-pulse-icon {
  color: var(--ag-gold);
  flex-shrink: 0;
}

.ov-pulse-chip--urgent .ov-pulse-icon {
  color: #d97706;
}

.ov-pulse-value {
  font-size: 15px;
  font-weight: 600;
  color: var(--ag-text-0);
  line-height: 1;
}

.ov-pulse-label {
  font-size: 11px;
  color: var(--ag-text-2);
  letter-spacing: 0.02em;
  white-space: nowrap;
}
```

- [ ] **Step 5: Verify in browser — pulse strip appears, subtitle is dynamic**

```bash
npm run dev:all
```

Navigate to `http://localhost:5173/dashboard/agency` and confirm:
- Pulse strip shows 4 chips between the hero and KPI cards
- Hero subtitle reflects live state (not the static string)
- Chips navigate to the correct routes on click

- [ ] **Step 6: Commit**

```bash
git add client/src/routes/agency/OverviewPage.jsx client/src/routes/agency/OverviewPage.css
git commit -m "feat(frontend): add pulse strip and dynamic hero subtitle to overview"
```

---

## Task 6: Frontend — Active Talent Utilization KPI

**Files:**
- Modify: `client/src/routes/agency/OverviewPage.jsx`
- Modify: `client/src/routes/agency/OverviewPage.css`

### Context

The existing 4th KPI card renders a `RadialBarChart` with `placementRate.current`. Replace its data and labels. The `utilization` object comes from `overview?.kpis?.utilization` and has `{ active, total, pct }`.

- [ ] **Step 1: Swap Placement Rate card data**

In `OverviewPage.jsx`, update the data derivation block (around line 296):

```js
// BEFORE:
const placementRate = kpis.placementRate || { current: 0, lastSeason: 0 };
// ...
const placementData = [
  { name: 'Track', value: 100, fill: '#E2E8F0' },
  { name: 'Placement', value: placementRate.current || 0, fill: '#C9A55A' }
];

// AFTER:
const utilization = kpis.utilization || { active: 0, total: 0, pct: 0 };
const utilizationData = [
  { name: 'Track', value: 100, fill: '#E2E8F0' },
  { name: 'Active', value: utilization.pct || 0, fill: '#C9A55A' }
];
```

- [ ] **Step 2: Replace the 4th KPI card JSX**

Find the `{/* Card 4: Placement Rate */}` block and replace it entirely:

```jsx
{/* Card 4: Active Talent Utilization */}
<EditorialCard>
  <div className="ov-kpi-head">
    <MicroLabel>Roster Active</MicroLabel>
  </div>
  <div className="ov-kpi-body--center" style={{ margin: 'auto 0', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
    <div className="ov-placement-hero">
      <div className="ov-placement-halo" />
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          cx="50%" cy="50%"
          innerRadius="72%" outerRadius="90%"
          startAngle={90} endAngle={-270}
          data={utilizationData}
          barSize={12}
          style={{ margin: '0 auto' }}
        >
          <RadialBar
            dataKey="value"
            cornerRadius={5}
            isAnimationActive={!prefersReducedMotion}
          />
          <Label
            value={`${utilization.pct || 0}%`}
            position="center"
            style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 600, fill: '#C9A55A' }}
          />
        </RadialBarChart>
      </ResponsiveContainer>
    </div>
    <span className="ov-placement-caption" style={{ marginTop: 8, fontSize: '10px', letterSpacing: '0.08em', color: '#9CA3AF' }}>
      OF ROSTER SUBMITTED
    </span>
    <span className="ov-placement-season">
      {utilization.active} of {utilization.total} active in 30 days
    </span>
  </div>
</EditorialCard>
```

- [ ] **Step 3: Verify in browser**

Confirm the 4th KPI card shows "Roster Active" with the radial chart and `{active} of {total} active in 30 days` caption.

- [ ] **Step 4: Commit**

```bash
git add client/src/routes/agency/OverviewPage.jsx
git commit -m "feat(frontend): replace placement rate KPI with active talent utilization"
```

---

## Task 7: Frontend — Pipeline conversion rates

**Files:**
- Modify: `client/src/routes/agency/OverviewPage.jsx`
- Modify: `client/src/routes/agency/OverviewPage.css`

- [ ] **Step 1: Add conversion rate computation**

In `OverviewPage.jsx`, after the `pipelineStages` derivation (around line 284), add:

```js
// Pipeline conversion rates (cumulative funnel approximation)
const pipelineTotal     = pipelineStages.reduce((s, p) => s + p.count, 0);
const shortlistedCount  = pipelineStages.find(s => s.label === 'Shortlisted')?.count ?? 0;
const bookedCount       = pipelineStages.find(s => s.label === 'Booked')?.count ?? 0;

const sub2short  = pipelineTotal > 0
  ? Math.round(((shortlistedCount + bookedCount) / pipelineTotal) * 100)
  : null;
const short2book = (shortlistedCount + bookedCount) > 0
  ? Math.round((bookedCount / (shortlistedCount + bookedCount)) * 100)
  : null;

const conversionRates = [
  { label: 'Submitted → Shortlisted', value: sub2short },
  { label: 'Shortlisted → Booked',    value: short2book },
];
const nonZeroRates = conversionRates.filter(r => r.value !== null && r.value > 0);
const weakestGate  = nonZeroRates.length > 0
  ? nonZeroRates.reduce((min, r) => r.value < min.value ? r : min)
  : null;
```

- [ ] **Step 2: Add conversion rate UI below the pipeline legend**

In the pipeline card JSX, after the `<div className="ov-pipeline-legend">` closing tag, add:

```jsx
{/* Conversion rates */}
{(sub2short !== null || short2book !== null) && (
  <div className="ov-conversion-row">
    {conversionRates.map(r => (
      <div key={r.label} className="ov-conversion-chip">
        <span className="ov-conversion-label">{r.label}</span>
        <span className="ov-conversion-value">{r.value !== null ? `${r.value}%` : '—'}</span>
      </div>
    ))}
  </div>
)}
{weakestGate && (
  <p className="ov-conversion-insight">
    {weakestGate.label} is your tightest gate.
  </p>
)}
```

- [ ] **Step 3: Add conversion rate CSS**

```css
/* ── Conversion rates ── */
.ov-conversion-row {
  display: flex;
  gap: 12px;
  margin-top: 12px;
  flex-wrap: wrap;
}

.ov-conversion-chip {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 12px;
  background: var(--ag-surface-0);
  border-radius: 8px;
  flex: 1;
  min-width: 120px;
}

.ov-conversion-label {
  font-size: 10px;
  color: var(--ag-text-2);
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.ov-conversion-value {
  font-size: 18px;
  font-weight: 700;
  color: var(--ag-gold);
  font-family: var(--font-display);
}

.ov-conversion-insight {
  margin-top: 8px;
  font-size: 11px;
  color: var(--ag-text-2);
  font-style: italic;
}
```

- [ ] **Step 4: Verify in browser**

Confirm the conversion rate chips appear below the pipeline legend with correct values, and the insight line only appears when there is at least one non-zero rate.

- [ ] **Step 5: Commit**

```bash
git add client/src/routes/agency/OverviewPage.jsx client/src/routes/agency/OverviewPage.css
git commit -m "feat(frontend): add pipeline conversion rate callouts"
```

---

## Task 8: Frontend — Data-aware Discover promo card

**Files:**
- Modify: `client/src/routes/agency/OverviewPage.jsx`

- [ ] **Step 1: Replace static promo card copy with live data**

Find the `{/* Dark editorial promo card */}` block. Replace the `<div className="ov-promo-content">` inner content:

```jsx
// BEFORE:
<span className="ov-promo-eyebrow">DISCOVER</span>
<h3 className="ov-promo-heading">Explore New Talent</h3>
<p className="ov-promo-body">
  Browse AI-matched profiles from our curated talent network. Updated in real time.
</p>

// AFTER:
<span className="ov-promo-eyebrow">DISCOVER</span>
<h3 className="ov-promo-heading">
  {pulse.matchCount != null
    ? `${pulse.matchCount} profiles ready to discover`
    : 'Explore New Talent'}
</h3>
<p className="ov-promo-body">
  {pulse.newTalentWeek != null
    ? `${pulse.newTalentWeek} new talent joined this week. Updated in real time.`
    : 'Browse curated talent from our network. Updated in real time.'}
</p>
```

- [ ] **Step 2: Verify in browser**

Confirm the promo card shows live counts from the API response, and falls back gracefully when `pulse` data is missing.

- [ ] **Step 3: Commit**

```bash
git add client/src/routes/agency/OverviewPage.jsx
git commit -m "feat(frontend): make Discover promo card data-aware with live pool counts"
```

---

## Task 9: Frontend — Inline application actions + deep links

**Files:**
- Modify: `client/src/routes/agency/OverviewPage.jsx`
- Modify: `client/src/routes/agency/OverviewPage.css`

### Context

The component uses a local `displayApplicants` array derived from `recentApplicants`. Mutations need to update both the React Query cache (`['agency', 'overview', 'recent-applicants']`) and the local `selected` state (for the open TalentPanel).

The `useQueryClient` hook is not currently imported — add it.

`acceptApplication` and `declineApplication` are already imported from `../../api/agency`. Add `shortlistApplication` to that import.

- [ ] **Step 1: Update imports**

The current `OverviewPage.jsx` imports only `getAgencyOverview`, `getAgencyProfile`, and `getRecentApplicants` from `../../api/agency`. None of `acceptApplication`, `declineApplication`, or `shortlistApplication` are present yet — all three must be added:

```js
// Replace the existing react-query import line with:
import { useQuery, useQueryClient } from '@tanstack/react-query';

// Replace the existing agency API import line with:
import {
  getAgencyOverview,
  getAgencyProfile,
  getRecentApplicants,
  acceptApplication,
  declineApplication,
  shortlistApplication,
} from '../../api/agency';
```

- [ ] **Step 2: Add `useQueryClient` and `useInlineAction` hook inside `OverviewPage`**

Add at the top of the `OverviewPage` component body (after the existing `useState` calls):

```js
const queryClient = useQueryClient();

/**
 * Fires an inline action (accept/shortlist/decline) with optimistic UI.
 * Updates the query cache immediately, syncs the open TalentPanel, rolls back on error.
 */
async function handleInlineAction(applicationId, actionFn, optimisticUpdate) {
  const prevData = queryClient.getQueryData(['agency', 'overview', 'recent-applicants']);
  // Optimistic cache update
  queryClient.setQueryData(['agency', 'overview', 'recent-applicants'], (old = []) =>
    old.map(app => app.applicationId === applicationId ? { ...app, ...optimisticUpdate } : app)
  );
  // Sync TalentPanel if open
  setSelected(prev =>
    prev?.id === applicationId ? { ...prev, ...optimisticUpdate } : prev
  );
  try {
    await actionFn(applicationId);
    // Invalidate to get fresh data on next stale check
    queryClient.invalidateQueries({ queryKey: ['agency', 'overview'] });
  } catch (err) {
    // Rollback cache to pre-mutation snapshot
    queryClient.setQueryData(['agency', 'overview', 'recent-applicants'], prevData);
    // Close TalentPanel rather than attempting a partial field revert
    // (the panel will re-open from correct cache data if the user clicks again)
    setSelected(null);
    const { toast } = await import('sonner');
    toast.error('Action failed. Please try again.');
  }
}
```

- [ ] **Step 3: Replace the application row JSX**

Find the `<motion.div ... className="ov-app-row"` block (around line 587). Replace it:

```jsx
<motion.div
  key={t.id}
  className="ov-app-row"
  initial={{ opacity: 0, x: -10 }}
  animate={{ opacity: 1, x: 0 }}
  transition={{ delay: 0.3 + idx * 0.06, ease: [0.16, 1, 0.3, 1] }}
>
  {/* Left side: deep link */}
  <Link
    to={`/dashboard/agency/applicants?applicationId=${t.id}`}
    className="ov-app-row-link"
    style={{ display: 'contents' }}
  >
    <div className={`ov-app-avatar-wrap ${t.status === 'submitted' ? 'ov-app-avatar-wrap--new' : ''}`}>
      <img src={t.avatar} alt={t.name} className="ov-app-avatar" />
      <span className="ov-status-dot" style={{ background: STATUS_COLORS[t.status] }} />
    </div>
    <div className="ov-app-info">
      <span className="ov-app-name">{t.name}</span>
      <span className="ov-app-meta">
        <span className="ov-app-badge ov-badge--editorial">{t.archetypeLabel}</span>
        {t.city} · {t.applied}
      </span>
    </div>
    <div className="ov-app-match-col">
      <TalentMatchRing score={t.match || 0} size="sm" />
    </div>
  </Link>
  {/* Right side: inline actions — stopPropagation prevents link activation */}
  <div className="ov-app-quick-actions" onClick={e => e.stopPropagation()}>
    <button
      className="ov-quick-btn ov-quick-btn--accept"
      title="Accept"
      onClick={() => handleInlineAction(t.id, acceptApplication, { status: 'accepted', archetypeLabel: 'Accepted' })}
    >✓</button>
    <button
      className="ov-quick-btn ov-quick-btn--shortlist"
      title="Shortlist"
      onClick={() => handleInlineAction(t.id, shortlistApplication, { status: 'shortlisted', archetypeLabel: 'Shortlisted' })}
    >→</button>
    <button
      className="ov-quick-btn ov-quick-btn--decline"
      title="Decline"
      onClick={() => handleInlineAction(t.id, declineApplication, { status: 'declined', archetypeLabel: 'Declined' })}
    >✕</button>
  </div>
</motion.div>
```

- [ ] **Step 4: Add inline action button CSS**

```css
/* ── Inline action buttons ── */
.ov-app-row-link {
  display: contents;
  text-decoration: none;
  color: inherit;
}

.ov-quick-btn--shortlist {
  background: #f8fafc;
  color: #0f172a;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 4px 10px;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.ov-quick-btn--shortlist:hover {
  background: #0f172a;
  color: #fff;
  border-color: #0f172a;
}
```

(The existing `.ov-quick-btn--accept` and `.ov-quick-btn--review` styles are already in the CSS — rename `--review` to `--decline` or add `--decline` as a new variant with red styling.)

- [ ] **Step 5: Verify in browser**

1. Clicking the name/avatar area navigates to `/applicants?applicationId=...`
2. Clicking ✓, →, ✕ fires the action, updates the status dot immediately, and shows a toast on error
3. If TalentPanel is open, its badge updates when an inline action fires

- [ ] **Step 6: Commit**

```bash
git add client/src/routes/agency/OverviewPage.jsx client/src/routes/agency/OverviewPage.css
git commit -m "feat(frontend): add inline accept/shortlist/decline actions and deep links to overview applications"
```

---

## Task 10: Final check

- [ ] **Step 1: Run the full test suite**

```bash
npm test 2>&1 | tail -30
```

Expected: all tests pass

- [ ] **Step 2: Run the React linter**

```bash
cd client && npm run lint 2>&1 | tail -10
```

Expected: no errors

- [ ] **Step 3: Smoke-test end-to-end in browser**

1. Overview loads — pulse strip, dynamic subtitle, utilization KPI all show live data
2. Pipeline card shows conversion rates + tightest gate insight
3. Discover promo shows live pool count
4. Application rows have working deep links and inline action buttons

- [ ] **Step 4: Final commit**

```bash
git add -A
git commit -m "feat(overview): agency overview improvements — pulse strip, utilization KPI, pipeline conversion rates, data-aware Discover promo, inline actions"
```
