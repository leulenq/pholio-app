# Agency Overview Tab — Improvements Design

**Date:** 2026-03-20
**Approach:** Surgical improvements + Today's Pulse strip (Approach B)

---

## Problem Statement

The current overview tab is split between two jobs — monitoring the inbound talent funnel and managing active talent relationships — but neither is fully served. The page lacks a live "right now" signal layer, the 4th KPI card measures the wrong thing, the pipeline shows counts but not where the process is breaking down, application rows aren't actionable from the overview, and the Discover promo card is a static internal ad occupying valuable real estate.

---

## Goals

- Surface both inbound flow and active relationships simultaneously (the "control room" feel)
- Replace static/irrelevant data with live, actionable signals
- Make the overview the single place where an agency knows what needs attention right now
- No layout restructure — all improvements land within the existing sections

---

## Changes

### 1. Today's Pulse Strip

A new compact horizontal row of four live-data chips inserted **between the hero block and the KPI cards**.

| Chip | Signal | Data source | Navigation | Urgent threshold |
|------|--------|-------------|------------|-----------------|
| Inbox | New applications today | `COUNT` applications where `created_at >= UTC day start` and `agency_id=?` | `/applicants` | ≥ 1 (always informational, no amber) |
| Clock | Castings closing this week | `COUNT` boards where `closes_at` within 7 days, `is_active=true`, `agency_id=?` | `/casting` | ≥ 1 (always informational, no amber) |
| Moon | Idle signed talent | Accepted applications whose `profile_id` has no board submission in last 30 days (agency-scoped) | `/roster` | > 20% of `rosterSize.count` → amber tint |
| Star | Avg match score (pending) | `AVG(ba.match_score)` for submitted applications belonging to this agency | `/applicants` | < 50 → amber tint |

**Behavior:**
- Zero-value chips render muted/dim — not alarming, just informational
- Amber tint applied per thresholds defined in the table above
- All four values added to the existing `/api/agency/overview` response as a top-level `pulse` object, computed in parallel with the existing 7 queries — no new endpoint
- Frontend defaults to `overview?.pulse ?? {}` before data arrives; all chips show `—` while loading

**Backend — new `getPulse(db, agencyId)` function in `agency-overview-queries.js`:**

`getPulse()` returns **6 values** that serve two consumers: 4 for the pulse strip chips, and 2 (`matchCount`, `newTalentWeek`) for the Discover promo card. They are bundled in one function to avoid a second parallel query.

```js
// New applications today (UTC day boundary)
newToday = COUNT FROM applications
  WHERE agency_id = agencyId
  AND created_at >= UTC day start

// Castings closing within the next 7 days (inclusive of today).
// Boards with closes_at IS NULL are excluded — this is intentional.
// Zero-value chip means either no castings or no deadlines set.
closingWeek = COUNT FROM boards
  WHERE agency_id = agencyId
  AND is_active = true
  AND closes_at >= now
  AND closes_at < now + 7 days

// Idle signed talent: accepted applications whose profile_id does NOT appear
// in board_applications for THIS agency in the last 30 days.
// The inner subquery joins back through applications to enforce agency scope.
idleTalent = COUNT FROM applications AS a
  WHERE a.agency_id = agencyId
  AND a.status = 'accepted'
  AND a.profile_id NOT IN (
    SELECT DISTINCT a2.profile_id
    FROM board_applications AS ba
    JOIN applications AS a2 ON a2.id = ba.application_id
    WHERE a2.agency_id = agencyId
    AND ba.created_at >= now - 30 days
  )

// Average match score of currently-submitted (pending) applications for this agency.
// Explicit join path: board_applications.application_id → applications.id
avgMatchScore = AVG(ba.match_score)
  FROM board_applications AS ba
  JOIN applications AS a ON a.id = ba.application_id
  WHERE a.agency_id = agencyId
  AND a.status = 'submitted'
  -- returns null if no submitted applications; frontend renders as '—'

// Discoverable profiles not yet applied to this agency (available pool to discover).
// Used by the Discover promo card, not the pulse strip chips.
matchCount = COUNT FROM profiles AS p
  WHERE p.is_discoverable = true
  AND p.id NOT IN (
    SELECT profile_id FROM applications WHERE agency_id = agencyId
  )

// New talent who joined the discoverable pool in the last 7 days.
// Used by the Discover promo card, not the pulse strip chips.
newTalentWeek = COUNT FROM profiles
  WHERE is_discoverable = true
  AND created_at >= now - 7 days

returns { newToday, closingWeek, idleTalent, avgMatchScore, matchCount, newTalentWeek }
```

**Note on `closingWeek` vs `activeCastings.closingToday`:** These are intentionally different signals. `closingToday` (existing KPI) counts boards closing on the current UTC calendar day. `closingWeek` (pulse chip) counts boards closing within the next 7 days including today. The hero subtitle uses `closingToday`; the pulse strip uses `closingWeek`. Both are useful at different granularities.

**UX note on `closingWeek = 0`:** A zero chip could mean "nothing closing soon" (good) or "no deadlines set on boards" (missing data). The Clock chip tooltip should read `"No castings closing soon"` for zero, not a blank. This is a tooltip-only change — no data model impact.

**Agency ID resolution:** The existing `agency-overview.js` route uses `req.session.userId` as the agency ID. The spec's new queries must use `getSessionAgencyId(req.session)` from `src/lib/agency-context.js` instead, which correctly handles both solo-owner accounts (`role === 'AGENCY'` → uses `userId`) and future multi-member accounts (`agencyId` from session). The route should be updated to:
```js
const { getSessionAgencyId } = require('../../lib/agency-context')
const agencyId = getSessionAgencyId(req.session)
if (!agencyId) return res.status(401).json({ success: false, error: 'Unauthorized' })
```
This is a one-line change that makes all queries (existing and new) future-safe.

---

### 2. Dynamic Hero Subtitle

The static subtitle "Here's where your roster stands today." is replaced with a single contextual sentence resolved on the frontend from the overview data. Priority order (first match wins):

| Priority | Condition | Subtitle |
|----------|-----------|----------|
| 1 | `pendingReview.count > 0` | `` `${n} application${n === 1 ? '' : 's'} waiting — oldest ${X} days ago.` `` |
| 2 | `activeCastings.closingToday > 0` | `` `${n} casting${n === 1 ? '' : 's'} close today — time to shortlist.` `` |
| 3 | `(overview?.pulse?.idleTalent ?? 0) > 0` | `{n} signed talent haven't been submitted in 30 days.` |
| 4 | All clear | `All caught up — roster looking strong.` |

- No backend change required.
- Condition 3 guards with `overview?.pulse?.idleTalent ?? 0` so a missing or partial `pulse` response safely falls through to priority 4.

---

### 3. Active Talent Utilization (replaces Placement Rate KPI)

**Metric:** count of distinct signed (accepted) talent `profile_id`s that appear in `board_applications` for this agency in the last 30 days, over distinct total accepted `profile_id`s.

**Display:** Large animated numeral shows `active` count. Subtitle: `{pct}% of roster active`. Existing radial chart component is reused — gold fill arc represents utilization %.

**Backend — new `getActiveUtilization(db, agencyId)` function in `agency-overview-queries.js`:**

```js
// Both sides use COUNT DISTINCT profile_id to handle talent with
// multiple accepted applications (avoids overcounting).

total = COUNT DISTINCT profile_id FROM applications
  WHERE agency_id = agencyId
  AND status = 'accepted'

active30d = COUNT DISTINCT a.profile_id FROM applications AS a
  JOIN board_applications AS ba ON ba.application_id = a.id
  WHERE a.agency_id = agencyId
  AND a.status = 'accepted'
  AND ba.created_at >= now - 30 days

pct = total > 0 ? Math.round(active30d / total * 100) : 0

returns { active: active30d, total, pct }
```

Added to the `kpis` object in the overview response alongside the existing four KPIs.

**Note:** `rosterSize.count` (from the existing query) counts accepted applications, not distinct profiles. `getActiveUtilization` counts distinct `profile_id`s on both sides for consistency. If a profile has two accepted applications, it counts as 1 in utilization metrics. The `rosterSize` KPI card is unchanged and retains its existing definition.

---

### 4. Pipeline Conversion Rates

The stacked bar and legend are unchanged. A new row of two conversion rate callouts is added **below the legend**:

```
Submitted → Shortlisted   42%     Shortlisted → Booked   31%
```

A single insight line below the callouts: `"{weakest stage name} is your tightest gate."` (lowest of the two rates, resolved in JS).

**Computation (frontend only, no new backend query):**

```js
// Using stage counts from the existing pipeline array.
// 'total' here means the sum of all stages including terminal ones
// (submitted + shortlisted + booked + passed + declined).
// This is a cumulative funnel approximation, not a cohort rate.
// It reads as: "of everything that entered the funnel, what share reached each stage?"

const stageMap = Object.fromEntries(pipelineStages.map(s => [s.label.toLowerCase(), s.count]))
const total       = pipelineStages.reduce((sum, s) => sum + s.count, 0)
const shortlisted = stageMap['shortlisted'] ?? 0
const booked      = stageMap['booked'] ?? 0

const sub2short  = total > 0 ? Math.round(((shortlisted + booked) / total) * 100) : null
const short2book = (shortlisted + booked) > 0 ? Math.round((booked / (shortlisted + booked)) * 100) : null
// null → render as '—'
```

**Edge cases and null handling:**

```js
// Insight line logic — both rates may be null or 0
const rates = [
  { label: 'Submitted → Shortlisted', value: sub2short },
  { label: 'Shortlisted → Booked',    value: short2book },
].filter(r => r.value !== null && r.value !== undefined)

// Only show the insight line if at least one rate is computable
// and at least one non-zero rate exists (avoid false alarm for new agencies)
const nonZeroRates = rates.filter(r => r.value > 0)
const weakest = nonZeroRates.length > 0
  ? nonZeroRates.reduce((min, r) => r.value < min.value ? r : min)
  : null
// insightLine = weakest ? `${weakest.label} is your tightest gate.` : null
// When insightLine is null, the insight row is not rendered.
```

This prevents the false-alarm `"Submitted → Shortlisted is your tightest gate."` message that would appear at 0% for agencies that have submitted applications but haven't shortlisted anyone yet.

**Known limitation:** Including `passed` and `declined` in `total` makes `sub2short` conservative (lower than a strict step-through rate). This is acceptable for bottleneck identification — a low `sub2short` still correctly identifies the Submitted→Shortlisted stage as the constraint. A true cohort rate requires a `status_history` table (future upgrade, noted in Out of Scope).

---

### 5. Data-Aware Discover Promo Card

Keep the dark editorial aesthetic, floating particles, and CTA button exactly as-is. Replace static copy with live numbers from the `pulse` object:

- **Headline:** `{pulse.matchCount} profiles ready to discover` (counts undiscovered talent not yet applied to this agency)
- **Body:** `{pulse.newTalentWeek} new talent joined this week. Updated in real time.`
- **Fallback** (pulse not loaded or matchCount is null): `Explore new talent on the network.`

The previous "X profiles match your open castings" framing is replaced with "X profiles ready to discover" because `board_requirements` stores physical measurements and experience levels — not archetypes — making a precise archetype-match count infeasible without a complex multi-column comparison. "Ready to discover" (undiscovered pool size) is equally motivating and accurately computable.

---

### 6. Recent Applications — Deep Links + Inline Actions

**Deep links:** Avatar, name, and the entire left portion of each row become a `<Link>` to `/dashboard/agency/applicants?applicationId={applicationId}`. The applicants page currently has no `:id` route param, so the link uses a query string. The applicants page is responsible for reading `?applicationId` on mount and scrolling to / opening that record. This does not require changes to `App.jsx` routing.

**Inline quick actions (right side):** Replace "Open / Review" buttons with three compact icon-label buttons:

| Button | Label | API call | Optimistic UI |
|--------|-------|----------|---------------|
| `✓` | Accept | `acceptApplication(id)` | Status dot → green (`#16a34a`), row fades to 40% opacity |
| `→` | Shortlist | `shortlistApplication(id)` (new) | Status dot → slate (`#0f172a`), `archetypeLabel` badge text changes to `"Shortlisted"` |
| `✕` | Decline | `declineApplication(id)` | Row animates out and is removed from list |

**Optimistic UI:** Changes apply immediately in React Query cache (`queryClient.setQueryData`). On API error, the cache is restored to pre-mutation state and a Sonner toast fires with the error message.

**TalentPanel state sync:** When an inline action fires, the `selected` state variable is also updated to reflect the change (e.g. `setSelected(prev => prev?.id === id ? { ...prev, status: 'shortlisted', archetypeLabel: 'Shortlisted' } : prev)`). This keeps the open TalentPanel consistent with the optimistic row update. If the action fails, both the cache rollback and a `setSelected` reset are called together.

**Backend — new `shortlistApplication` endpoint** (mirrors existing accept/decline pattern, using `POST` to match the existing convention):

```
POST /api/agency/applications/:applicationId/shortlist
Auth: requireRole('AGENCY')
Body: none
Action: UPDATE applications SET status = 'shortlisted' WHERE id = :applicationId AND agency_id = agencyId
Response: { success: true, application: { id, status: 'shortlisted' } }
```

**staleTime:** The existing `staleTime: 60000` (1 minute) is retained for all overview queries including `pulse`. The pulse strip is a "recent state" view, not a real-time stream — 60-second staleness is acceptable.

---

## Files to Change

| File | Change |
|------|--------|
| `src/lib/agency-overview-queries.js` | Add `getPulse()`, `getActiveUtilization()` |
| `src/routes/api/agency-overview.js` | Switch to `getSessionAgencyId(req.session)`, add new queries to `Promise.all`, add `pulse` and `utilization` to response |
| `src/routes/api/agency.js` | Add `POST /api/agency/applications/:applicationId/shortlist` |
| `client/src/api/agency.js` | Add `shortlistApplication()` method using `apiClient.post` |
| `client/src/routes/agency/OverviewPage.jsx` | Pulse strip component, dynamic subtitle, utilization KPI card, conversion rate callouts, deep links, inline actions with optimistic UI |
| `client/src/routes/agency/OverviewPage.css` | Styles for pulse strip chips, conversion rate row, inline action buttons |

---

## Out of Scope

- True cohort-based pipeline conversion (requires `status_history` table)
- `?applicationId` deep-link handling on the applicants page (separate task)
- Today's agenda / calendar widget
- Commission / revenue KPI
- Roster health / expiring contracts
