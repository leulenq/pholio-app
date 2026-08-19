/**
 * DOB-derived age filter cutoffs for Discover.
 *
 * Shared by Discover's explicit-filter path and focused tests.
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

async function loadEligibleProfileIds(knex, filters = {}) {
  const query = knex("profiles")
    .where({
      is_discoverable: true,
      profile_status: "active",
    })
    .whereNotNull("bio_curated");
  const { maxDobExclusive, minDobInclusive } = ageFilterDobCutoffs(
    filters.min_age ?? null,
    filters.max_age ?? null,
  );
  if (maxDobExclusive) query.where("date_of_birth", "<", maxDobExclusive);
  if (minDobInclusive) query.where("date_of_birth", ">=", minDobInclusive);
  const rows = await query.select("id");
  return new Set(rows.map((row) => row.id));
}

module.exports = {
  ageFilterDobCutoffs,
  utcDateString,
  loadEligibleProfileIds,
};
