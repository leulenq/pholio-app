/**
 * DOB-derived age filter cutoffs for Discover.
 *
 * Lives in its own module because discover-search.js requires
 * discover-retrieval.js — retrieval importing the helper back from
 * discover-search would create a require cycle. This is the same logic as
 * `ageFilterDobCutoffs` in discover-search.js (the canonical in-file copy,
 * kept in sync; consolidating discover-search onto this module is follow-up
 * work outside this PR's scope).
 *
 * Boundaries (today = referenceDate):
 *   - age >= minAge  ⟺  DOB <  (today - minAge years) + 1 day   [strict <]
 *   - age <= maxAge  ⟺  DOB >= (today - (maxAge+1) years) + 1 day
 *
 * The strict `<` upper bound (an exclusive next-day date string) makes the
 * comparison correct for BOTH a date-only DOB ("1995-03-15") and a full ISO
 * timestamp DOB ("1995-03-15T05:00:00.000Z") under plain string/date
 * ordering, so it behaves identically on SQLite and Postgres without DB
 * date math. NULL DOBs fail closed (SQL NULL comparisons are never true).
 */

"use strict";

function utcDateString(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * Convert min/max age filters into UTC date-of-birth cutoff STRINGS
 * (YYYY-MM-DD) derived from the reference date.
 *
 * @param {number|null} minAge
 * @param {number|null} maxAge
 * @param {Date} [referenceDate]
 * @returns {{ maxDobExclusive?: string, minDobInclusive?: string }}
 */
function ageFilterDobCutoffs(minAge, maxAge, referenceDate = new Date()) {
  const y = referenceDate.getUTCFullYear();
  const m = referenceDate.getUTCMonth();
  const d = referenceDate.getUTCDate();
  const out = {};
  if (minAge != null) {
    const base = new Date(Date.UTC(y - minAge, m, d));
    base.setUTCDate(base.getUTCDate() + 1);
    out.maxDobExclusive = utcDateString(base);
  }
  if (maxAge != null) {
    const base = new Date(Date.UTC(y - (maxAge + 1), m, d));
    base.setUTCDate(base.getUTCDate() + 1);
    out.minDobInclusive = utcDateString(base);
  }
  return out;
}

module.exports = {
  ageFilterDobCutoffs,
  utcDateString,
};
