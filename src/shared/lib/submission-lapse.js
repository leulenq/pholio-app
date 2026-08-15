"use strict";

/*
 * Off-platform submission lapse — pure display-time math (ruling R1).
 *
 * `off_platform_submissions` stores no lapse status. A tracked row only ever
 * carries `submitted_on` + `review_window_days`, and every reader (this route,
 * the merged Applications ledger on the client) derives "has this gone quiet"
 * from those two fields at read time. There is nothing to drift and no job to
 * run — see docs/talent-trust-loop-design-2026-08.md §(c) and ruling R1.
 *
 * Dates are date-only (`YYYY-MM-DD`), so all of this is UTC-midnight math —
 * the same idiom the client already uses for date-only fields
 * (`new Date(`${value}T00:00:00Z`)`, e.g. AvailabilitySection.jsx,
 * OverviewPage/index.jsx). Parsing with the local offset instead would move a
 * lapse date by a day depending on the server's timezone.
 */

const {
  DEFAULT_TRACKER_WINDOW_DAYS,
  REAPPLY_CONVENTION_MONTHS,
  TRACKER_STATUS,
} = require("../constants/submission-tracker");

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** Parse a `YYYY-MM-DD` string as UTC midnight. Anything else is invalid. */
function parseDateOnly(value) {
  if (value == null) return null;
  const s = value instanceof Date ? value.toISOString().slice(0, 10) : String(value).trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  const date = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function reviewWindowDays(row) {
  const days = Number(row?.review_window_days);
  return Number.isFinite(days) && days >= 0 ? days : DEFAULT_TRACKER_WINDOW_DAYS;
}

/**
 * The UTC-midnight instant at which `row` lapses, or `null` when
 * `submitted_on` is missing/unparseable. Not gated on status — callers that
 * want "is it actually lapsed right now" use `isLapsed`, which also checks
 * status.
 */
function lapseDate(row) {
  const submittedOn = parseDateOnly(row?.submitted_on);
  if (!submittedOn) return null;
  return new Date(submittedOn.getTime() + reviewWindowDays(row) * MS_PER_DAY);
}

/**
 * True once `review_window_days` has elapsed since `submitted_on` and the row
 * is still sitting in `awaiting` — matching `off_platform_submissions.status`
 * (see `src/shared/constants/submission-tracker.js`). A row the talent already
 * marked `heard_back` or `closed_by_talent` is never "lapsed"; that word is
 * reserved for the specific case of ongoing silence past the window.
 */
function isLapsed(row, now = new Date()) {
  if (row?.status !== TRACKER_STATUS.AWAITING) return false;
  const lapsesAt = lapseDate(row);
  if (!lapsesAt) return false;
  const nowDate = now instanceof Date ? now : new Date(now);
  return lapsesAt.getTime() < nowDate.getTime();
}

/**
 * The conventional re-apply date: `submitted_on` + `REAPPLY_CONVENTION_MONTHS`
 * calendar months. Display-only (ruling R1) — nothing enforces it, and the
 * client copy says "opens", never "blocked".
 *
 * `setUTCMonth` is used rather than a fixed day count so "6 months" reads the
 * same everywhere a human would expect (e.g. submitted 2026-01-31 reads as the
 * corresponding day in July, not as a fixed 182-day offset which would drift
 * across months of different lengths). JS Date normalizes an out-of-range day
 * (e.g. Jan 31 + 1 month) by rolling into the following month, which is the
 * same overflow behavior calendar arithmetic libraries use.
 */
function reapplyOpensOn(row) {
  const submittedOn = parseDateOnly(row?.submitted_on);
  if (!submittedOn) return null;
  const opens = new Date(submittedOn.getTime());
  opens.setUTCMonth(opens.getUTCMonth() + REAPPLY_CONVENTION_MONTHS);
  return opens;
}

/** `YYYY-MM-DD` for a UTC-midnight Date, or `null`. */
function toDateOnlyString(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  return date.toISOString().slice(0, 10);
}

module.exports = {
  isLapsed,
  lapseDate,
  reapplyOpensOn,
  parseDateOnly,
  toDateOnlyString,
};
