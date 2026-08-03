# Agency metadata component system

## The problem

Metadata across the agency dashboard is loose text, formatted differently in
every file that renders it. The audit found:

- **5** separate `timeAgo` implementations (ActivityFeed, ReviewRoom,
  CastingPage, ApplicantsPage, MessagesDropdown) that disagree on casing
  (`just now` / `Just now`), on the 1-day label (`yesterday` / `Yesterday`),
  on the null case (`''` / `'—'`), and on when to fall back to a date.
- **2** match-score components plus a third raw `${score} / 100` string.
- **3** overlapping status vocabularies: `STATUS_MAP` (StatusText),
  `STATES`/`PIPELINE`/`STAGE_MAP` (statusConfig), `STANDINGS` (divisions).
- Location printed raw as stored — `"Los Angeles, CA"`, `"Copenhagen,
  Denmark"` — where a booker only needs the city.
- `heightLine()` exists in rosterFormat.js and RosterPage rebuilds the same
  string inline anyway.
- `.join(' · ')` hand-rolled across ~20 files, so separator colour, spacing
  and overflow behaviour all differ.

## The thesis

The division mark already established the right idea: **typesetting
identifies, ground carries state, colour is a recall aid.** Extending that,
the organising question for any piece of metadata is *what kind of thing is
this?* — and the answer picks the treatment. Three classes:

1. **MARK** — a bounded entity you hold standing in. Only boards qualify.
   Has a container because it is a thing you belong to. → `DivisionMark`
   (already built, unchanged).
2. **FIGURE** — a measured value: height, measurements, match, age, counts.
   Tabular mono figures + a tracked Inter unit. **Never a container** — a
   number in a box reads as a badge, which is banned and also wrong.
3. **NOTATION** — quiet context: location, recency, provenance, notes.
   Small Inter, muted ink, semantic tone only when it is genuinely
   actionable (stale, overdue).

Scanning weight then matches booking priority: Marks > Figures > Notations.

## Plan

- [x] Audit every metadata surface in `client/src/domains/agency`
- [x] `meta/metaFormat.js` — one set of pure formatters (city, recency,
      height, measurements, figures). Replaces the 5 `timeAgo`s and the
      inline rebuilds.
- [x] `meta/Figure.jsx` — measured values
- [x] `meta/Place.jsx` — location, city-only by default, full string on hover
- [x] `meta/Moment.jsx` — timestamps and recency
- [x] `meta/Notation.jsx` — provenance and inline notes
- [x] `meta/MetaLine.jsx` — the canonical `·` separated row
- [x] `meta/meta-system.css`
- [x] Unit tests for the formatters (the disagreement cases above)
- [x] Migrate call sites: overview, roster, review, dossier, casting,
      applicants, interviews, reminders, messages, discover
- [x] Collapse the duplicate match components
- [x] Run: `npm test`, client vitest, lint

## Review

### Built

`client/src/domains/agency/components/meta/` — `metaFormat.js` (pure
formatters), `Figure`/`FigureGroup`, `MatchFigure`, `Place`, `Moment`/
`Freshness`, `Notation`/`FieldKey`, `MetaLine`, `meta-system.css`, and 35
unit tests pinning the cases the old implementations disagreed on.

### Removed

- 5 `timeAgo`/`relativeTime` implementations (ActivityFeed, ReviewRoom,
  CastingPage, ApplicantsPage, MessagesDropdown)
- 3 cm→imperial converters (rosterFormat, ReviewRoom via import,
  DiscoverPage — the last with straight quotes and a 5′ 12″ bug at exact
  foot boundaries)
- the raw `${score} / 100` string in RecordPanels
- `heightLine`, `measurementSummary`, `measurementAge`,
  `measurementFreshness`, `cmToImperial` from rosterFormat.js (all dead
  once callers moved)
- hand-rolled `·` joins in ActivityFeed, TalentStrip, TalentPanel,
  ReviewRoom, RosterDetailDrawer, InterviewRow, TalentThread

### Decisions worth recording

- **Deferred to `lib/matchTier.js`.** A first draft of `scoreTier` invented
  ≥85/≥70/≥50 bands against matchTier's ≥90/≥80/≥70 — recreating the exact
  drift this work exists to remove. metaFormat now re-exports it.
- **Deferred to `shared/utils/locationFormat`.** A naive split-on-comma got
  "Los Angeles, California, United States" wrong; that module already
  resolves against the CITIES registry and US state names.
- **Kept `MatchScore`** as the photo-overlay variant. Its corner placement is
  marked owner-sanctioned in OverviewPage.css, so it was not mine to remove;
  it and `MatchFigure` now share one tier source.
- **`sub` vs `verdict`.** First version put the match tier in the `sub` slot,
  so a verdict rendered with the weight of a centimetre conversion. Split
  into its own tracked-caps slot after seeing it rendered.
- **A zero score is not a missing score.** `Number(null)` is 0 and finite, so
  an unscored talent rendered as "0 — Low". Caught by its own test.

### Verified

- 35 new formatter tests; client suite 167 passing across 23 files
- lint 0 errors; production build succeeds
- backend `npm test` — 181 suites, 2423 passing
- rendered against the real shipped stylesheets and reviewed as an image

### Not done

Structurally different surfaces left alone deliberately: `dossierModel.fmtDate`
(dossier has its own date vocabulary), `BoardsTable` stage-mix summary (a
title attribute, not a rendered line), `SubmissionPackageDetails` /
`BoardSelect` / `TheBook` joins (list joins inside a `<dd>`, not metadata
lines). No browser pass against the live dashboard with real data — the
component rendering was verified from the shipped CSS, not from a running
session.
