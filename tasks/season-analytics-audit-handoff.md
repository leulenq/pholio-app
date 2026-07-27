# Handoff — Season / Analytics data-integrity audit

**For:** Codex (or whichever agent picks this up)
**Branch:** `claude/season-analytics-redesign-th5k8o`
**Commit under audit:** `228ea0a` — *Rebuild the agency Season page as a chart-driven analytics surface*
**Written by:** the agent that built the surface. Treat every claim below as a
lead to confirm, not as a result to trust.

---

## 1. What you are auditing and why

The agency Season page (`/dashboard/agency/analytics`) was rebuilt from a short
written report into a three-lens analytics surface with seventeen panels. The
visual work is signed off. **This audit is only about truth.**

Audit it as if it ships tomorrow to real agencies who will make roster and
booking decisions from it. Specifically:

1. **Does the backend work** — under a fresh agency, a large agency, Postgres as
   well as SQLite, a board filter, every range, and a hostile query string.
2. **Are the queries correct** — do the aggregates mean what their names say,
   with no double counting, no silent clamping, no fabricated denominators.
3. **Are the metrics real** — every number traceable to rows in this agency's
   own tables.
4. **Do the subtitles and labels reflect the data they sit above** — same
   population, same window, same board scope, same units.
5. **Is anything hard-coded, faked, placeholder, static, or misleading** — if so,
   replace it with a real computed value or delete it.

The bar for a metric: *a booker who checks it by hand against the inbox and the
roster gets the same number.*

---

## 2. Code map

| Path | Lines | What it is |
|---|---|---|
| `src/domains/agency/queries/season.queries.js` | 1385 | **The whole aggregation.** Every number on the page is built here. |
| `src/domains/agency/routes/analytics.js` | 63 | `GET /api/agency/analytics/season` |
| `src/domains/agency/routes/index.js` | — | mounts the route |
| `src/domains/agency/lib/route-permissions.js` | — | `org.view_analytics` rule for the new path |
| `src/domains/agency/queries/__tests__/season.queries.test.js` | — | 25 unit tests over an in-memory SQLite fixture |
| `client/src/domains/agency/pages/AnalyticsPage.jsx` | 878 | the page; **all descriptive copy lives here** |
| `client/src/domains/agency/components/analytics/*` | ~1650 | 13 chart components + `viz.js` palette |
| `client/src/domains/agency/api/agency.js` | — | `getSeasonAnalytics()` |

Query contract: `?range=30|90|365|730` · `?board=<uuid>` · `?tz=<minutes east of UTC>`.
The client sends `-new Date().getTimezoneOffset()`.

Response is `{ success, data }` where `data` has `meta`, `signals`, `flow`,
`volume`, `queue`, `calibration`, `boards`, `cohorts`, `desk`, `roster`, `totals`.

---

## 3. How to get a real dataset in front of it

There is **no committed fixture** that fills this page. The repo seed
(`npm run seed`) creates ~47 applications and **14 activity rows**, which is far
too thin to exercise flow timing, the punchcard, latency, or team attribution —
most panels render their empty state. Building a realistic fixture is the first
task, and **it is worth committing** so the next person does not repeat it.

```bash
cp .env.example .env          # set AUTH_PASSTHROUGH_ENABLED=1, SESSION_SECRET
rm -f dev.sqlite3 && npm run migrate && npm run seed
npm run dev:all               # Express :3000 + Vite :5173
# seeded agency login: agency@example.com / password123
```

Two gates sit in front of the page and will 403 the API until cleared:
`agencyOnboardingCompletedAt` on the session (agency setup) and the legal
acceptance manifest. Both are session-cached — **re-login after changing the DB**
or the old session keeps the old answer.

To exercise the aggregation directly without the HTTP layer:

```js
const knex = require('./src/shared/db/knex');
const { buildSeasonAnalytics } = require('./src/domains/agency/queries/season.queries');
await buildSeasonAnalytics(knex, { agencyId, range: 90, tzOffsetMinutes: -240, now: new Date('...') });
```

`now` is injectable — use it. Every finding below was measured this way.

Tests: `npx jest src/domains/agency/queries` (25, green).
`npm test` in full aborts with a pre-existing `Unable to acquire a connection`
crash that reproduces identically on a clean tree — **not caused by this work**,
but it means the suite gives you no safety net; verify narrowly.

---

## 4. Verified leads

These were measured against a 250-application / 690-activity dataset on
`2026-07-27`, range 90. Numbers are real observations, not guesses. Confirm each,
decide whether it is a defect, and fix.

### 4.1 Two implementations of one metric disagree on their population
`firstResponse` is computed twice: once in `windowSummary()` for the signal tile,
once inline in `buildDesk()` for the latency panel. Same formula, **different
bounds** — `windowSummary` filters `createdAt < windowEnd`, `buildDesk` has no
upper bound.

Measured: signal `sample 36`, panel `sample 37`. The medians happened to agree
(50.7h) so nothing looked wrong on screen. **Two numbers derived from two code
paths is the defect**; the matching median is luck. Collapse to one function.

### 4.2 "Divisions" counts a non-division
`buildRoster` files roster members with no `board_id` under the literal string
`"Unassigned"`, and the panel reading is
`` `${roster.size} across ${roster.boardMix.length} divisions` ``.
Measured: `boardMix` = `Unassigned, Vogue Italia · Editorial, Chanel Beauty, NYFW
Runway Package, Zara Commercial Lookbook, Net-a-Porter E-comm, Aritzia Fall,
Calvin Klein Denim` → the page claims **8 divisions when the agency has 7**.

### 4.3 "N markets represented" is capped at 10
`buildRoster` returns `markets: [...].slice(0, 10)` and the reading is
`` `${roster.markets.length} markets represented` ``. An agency in 14 markets is
told it is in 10. Not triggered in the fixture (6 markets) — trivially
reproducible by adding markets. Either report a true count separately or drop
the cap.

### 4.4 Cohort grid cannot show what its copy implies
`buildCohorts(..., monthsBack = 12)` but its input is pre-filtered to
`createdAt >= previousStart`, and `previousStart = now − 2 × range`. At range 90
that is 180 days, so the grid can only ever hold ~6 rows. Measured: **6 months**,
`2026-02 … 2026-07`. The panel reads "Each month's intake and how far it got".
Decide the intended window and make the data and the copy agree.

### 4.5 The board filter does not scope the Desk lens consistently
With a board filter applied, `flow.cohort` correctly drops 67 → 9, and the
punchcard/team are scoped via `scopedActivities`. But `interviews` and
`reminders` are passed to `buildDesk` as `rows.interviews` / `rows.reminders` —
**unscoped**. Measured: interviews `18` and reminders-open `19` are byte-identical
filtered and unfiltered. Either scope them through `application_id` or state in
the copy that they are agency-wide.

### 4.6 One phrase, two scopes
Punchcard reading: `"157 recorded actions across the window"`.
Page footer: `"250 submissions all time · 690 recorded actions"` — that 690 is
all-time. The same phrase names two different populations on one screen. Also
check whether "all time" is honest under a board filter (`allTimeSubmissions` is
board-scoped when one is applied).

### 4.7 "Open" means two things
Signal tile `Open from this window` = 42 (created in window, still open).
Queue panel `103 open` = every open submission regardless of window (deliberate —
stale work must not expire). Both are defensible; verify a reader can tell them
apart from the labels alone, because the numbers are 2.5× apart.

### 4.8 Masthead subtitle mixes two windows
`` `${totals.windowSubmissions} submissions and ${roster.size} represented, read
across ${rangeLabel}` `` — `windowSubmissions` is window-scoped, `roster.size` is
**current** roster and is not. "read across 90 days" governs only the first half.

---

## 5. Areas I did not verify — assume nothing

- **Postgres.** Everything was exercised on SQLite only. `buildSeasonAnalytics`
  reads `applications.metadata`/`application_activities.metadata` through
  `parseJson`, which handles both a string and an already-parsed object — check
  that `jsonb` behaves, plus date handling (`date_of_birth` is a known
  full-ISO-vs-date quirk in this codebase) and boolean coercion (`is_active !== false`).
- **Scale.** `loadRows` pulls **every** application, **every** activity, and every
  board link for the agency with no date bound, then folds in JS. There is also
  `knex('profiles').whereIn('id', profileIds)` where `profileIds` is unbounded —
  **SQLite caps host variables (historically 999)** and Postgres will build a huge
  IN list. Test an agency with 5k+ applications. This is the likeliest production
  failure on the whole page.
- **Timezone correctness.** A single offset (the viewer's *current*
  `getTimezoneOffset()`) is applied to every historical timestamp, so day/hour
  buckets are wrong across a DST boundary. Decide whether that matters for the
  punchcard and the daily volume axis.
- **`replayJourney` against real production event shapes.** It keys entirely on
  `activity_type === 'status_change'` and `metadata.new_status`. Confirm every
  writer of that activity actually sets `new_status` (`agency-log-activity.js`
  call sites), and that bulk status changes and `casting.js` board moves are
  recorded the same way. If any path writes a status change without metadata,
  the funnel silently under-reports advancement.
- **`accepted` vs `represented`.** `mapApplicationStatusToCastingStage` maps
  `accepted` → *Offered* and `represented` → *Represented*, while
  `roster-memberships` treats `accepted|booked|represented` as on-roster. So a
  talent can be on the roster while the funnel shows them at Offered. Confirm
  that is the intended industry reading.
- **Roster fallback.** When `roster_memberships` is absent or empty,
  `loadRows` derives the roster from application status and sets
  `meta.rosterIsDerived`. The empty-table case takes the fallback path even for an
  agency that legitimately has zero roster members — check that is harmless.
- **Match score provenance.** `scoreForApplication` prefers
  `applications.match_score`, else the **max** across `board_applications`. Verify
  max (not mean, not the scoped board's own score) is right, especially under a
  board filter.
- **Interview/reminder windows.** Interviews are windowed on
  `created_at || proposed_datetime`; reminders on `completed_at`. Confirm those
  are the fields an agency would expect.
- **Permissions.** `org.view_analytics` on `/api/agency/analytics/season` — check
  a member without it is refused, and that no talent identity leaks (the endpoint
  is aggregates-only by design, which is why the minor-visibility gates that
  scope roster/inbox reads were not applied; confirm that reasoning holds).

---

## 6. Full inventory of derived copy

Every user-visible string that carries a number, with the expression behind it.
Check each for: correct source, correct window, correct board scope, correct
denominator, correct pluralisation, and correct behaviour at 0/1/null.
`AnalyticsPage.jsx` line numbers at `228ea0a`.

| Line | String | Source |
|---|---|---|
| 769 | `{n} submissions and {n} represented, read across {range}` | `totals.windowSubmissions`, `roster.size` — **see 4.8** |
| 860 | `{n} submissions all time · {n} recorded actions` | `totals.allTimeSubmissions`, `totals.activitiesObserved` — **see 4.6** |
| 86 | `{n} of {n} submissions reached representation · strongest hand-off is {stage} at {n}%` | `flow.signed`, `flow.cohort`, computed `strongestHandoff` (requires `reached >= 3`) |
| 127 | `{n} submissions across the window` | summed `volume.series[].total` — cross-check against `flow.cohort` |
| 128 | `Line is the trailing {n}-{granularity} average of the same total` | `volume.windowSize`, `volume.granularity` |
| 157 | `{n} open · oldest untouched for {n} days` | `queue.total`, `queue.oldestDays` — **see 4.7** |
| 178 | `Signed talent scored {n} points above passed talent` | `calibration.separation` (mean signed − mean passed) |
| 183 | `{n} scored submissions.` | `calibration.sample` |
| 220 | `{n} boards took submissions this window` | `boards` filtered to `submissions > 0` |
| 295 | `{n} represented · {±n} over twelve months` | `roster.size`, summed `growth[].net` |
| 329 | `{n} across {n} divisions` | `roster.size`, `roster.boardMix.length` — **see 4.2** |
| 352 | `Measured on {n} of {n} represented` | `roster.coverage.heights`, `roster.size` |
| 379 | `Dated on {n} of {n} represented` | `roster.coverage.ages`, `roster.size` |
| 401 | `Averaged over {n} represented` | `roster.coverage.fit` |
| 429 | `{n} markets represented` | `roster.markets.length` — **see 4.3** |
| 537 | `{n} recorded actions across the window` | `desk.punchTotal` — **see 4.6** |
| 561 | `Median {t} · nine in ten inside {t}` | `desk.latency.medianHours`, `.p90Hours` — **see 4.1** |
| 566 | `Measured on {n} submissions that have been touched` | `desk.latency.sample` |
| 590 | `{n} actions across {n} members` | `desk.teamTotal`, `desk.team.length` (includes zero-action active members) |
| 615 | `{n} scheduled · {n} answered` | `desk.interviews.total`, `.answered` — **see 4.5** |
| 620 | `Median {n} days of notice` | `desk.interviews.medianLeadDays` |
| 683 | `{n} open · {n} overdue` | `desk.reminders.open`, `.overdue` — **see 4.5** |
| — | `"{n}% up/down on the previous period"` (six tiles) | `SignalRail.jsx` `Delta`; `deltaPercent` for counts, absolute delta otherwise. Check the `previous == 0` path and the `goodDirection` colour on each metric. |
| — | `"From {n} observed"` / `"Not yet observed"` | `signal.sample`, rendered only when `< 5` |

Also verify the **`aria-label` on every chart `<svg>`** — several serialise the
whole series into a sentence and are as capable of lying as visible copy.

**Things that are intentionally static prose** (no numbers, no claims about the
dataset — panel `note` and `empty` strings): confirm each still describes what the
code does. Two were written to document behaviour and must stay true —
"Age runs from the last recorded action … and ignores the reporting window", and
"Applied is not drawn — every submission reaches it by definition".

---

## 7. What is already known-good (don't re-litigate)

- No mock data, fixtures, or placeholder arrays ship in the page or the query
  module — grep for them, but the intent was zero.
- Unobserved measures return `null` with a `sample` count rather than `0`;
  panels with nothing observed drop their legend, table toggle, and note.
- `replayJourney` deliberately refuses to infer stages it cannot evidence — a
  status jump from Applied straight to Represented records one transition, not
  three. Tests cover this.
- The chart palette in `viz.js` is validated for contrast/CVD; colour is not in
  scope here.
- The legacy `GET /api/agency/analytics` endpoint is untouched and still tested
  by `tests/agency-analytics.test.js`, but **its client helper
  `getAgencyAnalytics()` now has no callers** — decide whether to retire both.

---

## 8. Deliverable

For each finding: file and line, what the number claims, what it actually
computes, how you reproduced it, severity (ships / blocks), and the fix.

Where copy cannot be made true, delete it — an empty space is honest and a
confident wrong sentence is not.
