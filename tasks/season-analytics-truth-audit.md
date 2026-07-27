# Season / Analytics truth audit

Date: 2026-07-27  
Branch: `claude/season-analytics-redesign-th5k8o`

## Verdict

The page no longer relies on fixed numeric subtitles, fake comparison copy,
placeholder series, or sample datasets. Every remaining displayed number is
derived from the authenticated agency's rows and follows the selected board
and reporting scope described beside it.

The audit changed data semantics and supporting copy only. It did not change
the signed-off CSS or visual layout.

## Corrected production defects

- Unified first-response calculation and sample bounds across the headline
  signal and latency panel. The earliest evidenced agency action or view wins.
- Excluded talent-originated activity from agency response, workload,
  punchcard, and last-touch calculations, including legacy agencies without
  membership rows.
- Scoped interviews and reminders to the selected board.
- Repaired interview and reminder routes for team-member sessions by using the
  canonical agency identity. Interview creation now stores the linked talent
  user rather than a nonexistent application field.
- Corrected application lifecycle mapping so accepted/represented outcomes
  agree with roster creation and do not remain at Offered. Removed `booked`
  from current status-write inputs while retaining defensive legacy reads.
- Preserved the original represented timestamp across repeated status writes.
- Excluded withdrawn and future-dated submissions and future operational
  events from reportable windows.
- Replaced the empty-roster fallback: an existing but empty membership table
  now means a real empty roster, not a roster rebuilt from old applications.
- Included agency-private talent records in roster composition.
- Counted only division boards as divisions and reported roster records on
  other board kinds as outside divisions.
- Returned the true market count separately from the top-ten visualization.
- Removed city fallback from the market count; only canonical market data is
  described as a represented market.
- Corrected board-specific score calibration to use that board's score.
- Prevented unmeasured category-fit values from being graphed as zero.
- Added per-axis measurement coverage and small-minor-cohort suppression for
  sensitive demographic distributions.
- Made the cohort grid twelve actual calendar months at every range and added
  an explicit recent-cohort maturation warning.
- Removed invalid previous-period claims for current-cohort advance/open
  outcomes; null comparisons no longer render as “level.”
- Replaced ambiguous all-time/window action copy with explicit, separately
  scoped totals.
- Split current roster size from reporting-window submissions in the masthead.
- Made pipeline copy explicit that progression is cumulative evidenced depth,
  not proof of every intermediate hand-off.
- Normalized SQLite UTC timestamps and used an IANA timezone for historical
  DST-aware day/hour/month bucketing.
- Applied strict range, board, timezone, and offset validation.
- Bounded activity loading and chunked profile/private-record lookups to avoid
  SQLite bind limits and oversized PostgreSQL `IN` lists.
- Corrected reminder timeliness to honor a recorded snooze deadline and kept
  snoozed reminders visible as open work.
- Expanded interview reporting to distinguish answered invitations, retained
  response outcomes, completed, rescheduled, and cancelled states.

## Verification evidence

- `src/domains/agency/queries/__tests__/season.queries.test.js`: 41 passing
  query tests, including DST, future timestamps, actor provenance, empty and
  off-platform rosters, board scoping, large datasets, hostile inputs, score
  provenance, snoozes, and lifecycle mapping.
- Relevant query plus HTTP/roster integration set: 3 suites, 89 tests passing.
- Team-session HTTP tests prove interview and reminder creation persists under
  the canonical agency and links interviews to the talent user account.
- Changed frontend files pass ESLint.
- Production Vite build passes.
- Changed Node files pass syntax checks.
- `git diff --check` passes.

The HTTP integration command uses Jest `--forceExit` because importing the full
application starts existing asynchronous SMTP/telemetry work after tests
finish. The assertions pass; the focused query suite exits normally without
that option.

## Honest residual limits

These are data-model limits, not fabricated values:

1. Pipeline depth can use the current terminal status when older transition
   events were never recorded. It therefore proves furthest evidenced depth,
   not that every intermediate state occurred. The page now says this.
2. Exact historical roster headcount cannot reconstruct multiple
   leave/reactivate episodes from a single membership row. Monthly movement is
   accurate for the persisted `joined_at` and `left_at` episode only.
3. Historical activity missing from `application_activities` cannot be
   recreated. Timed metrics expose samples/empty states instead of estimating.
4. Interview acceptance history is lossy once a row moves from `accepted` to
   `completed`; the page labels its percentage as accepted among outcomes
   still recorded, and separately reports answered invitations.
5. PostgreSQL-compatible branches and JSON/date/boolean handling were reviewed,
   but this workspace did not provide an isolated PostgreSQL service for a
   live dialect run. SQLite and HTTP integration coverage is green.

## Unrelated working-tree state

`client/vite.config.js` was already modified before this audit and was
preserved. Its `/* eslint-env node */` line is rejected by the repository's
current ESLint version and exposes an existing `process` no-undef error, so the
repository-wide client lint command is not green. The Season / Analytics files
themselves lint cleanly.
