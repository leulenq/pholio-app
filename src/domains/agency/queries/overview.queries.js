// src/lib/agency-overview-queries.js
"use strict";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;

// Pipeline stage configuration (module-level to avoid re-allocation per call)
const PIPELINE_LABEL_MAP = {
  submitted: "Submitted",
  shortlisted: "Shortlisted",
  development: "New Face — Development",
  accepted: "Signed",
  represented: "Represented",
  passed: "Passed",
  declined: "Declined",
};
const PIPELINE_STAGE_ORDER = [
  "submitted",
  "shortlisted",
  "development",
  "accepted",
  "represented",
  "passed",
  "declined",
];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Returns { dayStart: Date, dayEnd: Date } for the current UTC calendar day.
 * dayEnd is exclusive (start of next day).
 */
function utcDayBounds() {
  const now = new Date();
  const dayStart = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
  );
  const dayEnd = new Date(dayStart.getTime() + DAY_MS);
  return { dayStart, dayEnd };
}

// ---------------------------------------------------------------------------
// Exports
// ---------------------------------------------------------------------------

/**
 * Returns the count of unreviewed (submitted) applications and how many
 * days ago the oldest one was submitted.
 *
 * @returns {{ count: number, oldestDaysAgo: number|null }}
 */
async function getPendingReview(db, agencyId) {
  const [row] = await db("applications")
    .where({ agency_id: agencyId, status: "submitted" })
    .select(
      db.raw("COUNT(*) as count"),
      db.raw("MIN(created_at) as oldest_at"),
    );

  const count = parseInt(row.count, 10) || 0;
  if (count === 0) return { count: 0, oldestDaysAgo: null };

  const oldestDaysAgo = row.oldest_at
    ? Math.floor((Date.now() - new Date(row.oldest_at).getTime()) / DAY_MS)
    : null;

  return { count, oldestDaysAgo };
}

/**
 * Returns the count of active boards and how many close today (UTC).
 *
 * @returns {{ count: number, closingToday: number }}
 */
async function getActiveCastings(db, agencyId) {
  const { dayStart, dayEnd } = utcDayBounds();

  const [totalRow] = await db("boards")
    .where({ agency_id: agencyId, is_active: true })
    .count("* as count");

  const [closingRow] = await db("boards")
    .where({ agency_id: agencyId, is_active: true })
    // ISO strings for date bindings (same dialect-compatibility rule as getPulse)
    .where("closes_at", ">=", dayStart.toISOString())
    .where("closes_at", "<", dayEnd.toISOString()) // exclusive upper bound
    .count("* as count");

  return {
    count: parseInt(totalRow.count, 10) || 0,
    closingToday: parseInt(closingRow.count, 10) || 0,
  };
}

/**
 * Returns per-stage counts and share percentages for the casting pipeline.
 * sharePct = stage count / total × 100 (independent rounding; may not sum to 100).
 *
 * @returns {Array<{ label: string, count: number, sharePct: number }>}
 */
async function getPipeline(db, agencyId) {
  const rows = await db("applications")
    .where("agency_id", agencyId)
    .whereIn("status", PIPELINE_STAGE_ORDER)
    .groupBy("status")
    .select("status", db.raw("COUNT(*) as count"));

  // Build a map and compute total
  const countMap = {};
  let total = 0;
  for (const row of rows) {
    const c = parseInt(row.count, 10) || 0;
    countMap[row.status] = c;
    total += c;
  }

  if (total === 0) return [];

  return PIPELINE_STAGE_ORDER.map((status) => {
    const count = countMap[status] || 0;
    return {
      label: PIPELINE_LABEL_MAP[status],
      count,
      sharePct: Math.round((count / total) * 100),
    };
  });
}

/**
 * Returns attention alerts for the overview strip.
 * Only alerts with count > 0 are included.
 *
 * @returns {Array<{ type: 'critical'|'warning'|'positive', message: string, count: number, link: string }>}
 */
async function getAlerts(db, agencyId) {
  const { dayStart, dayEnd } = utcDayBounds();
  const cutoff14d = new Date(Date.now() - 14 * DAY_MS);
  const twoHoursAgo = new Date(Date.now() - 2 * HOUR_MS);

  const [[overdueRow], [closingRow], [newRow]] = await Promise.all([
    // Critical: submitted applications older than 14 days
    db("applications")
      .where({ agency_id: agencyId, status: "submitted" })
      .where("created_at", "<=", cutoff14d.toISOString())
      .count("* as count"),

    // Warning: boards closing today (UTC)
    db("boards")
      .where({ agency_id: agencyId, is_active: true })
      .where("closes_at", ">=", dayStart.toISOString())
      .where("closes_at", "<", dayEnd.toISOString())
      .count("* as count"),

    // Positive: new submitted applications in last 2 hours
    db("applications")
      .where({ agency_id: agencyId, status: "submitted" })
      .where("created_at", ">=", twoHoursAgo.toISOString())
      .count("* as count"),
  ]);

  const overdue = parseInt(overdueRow.count, 10) || 0;
  const closing = parseInt(closingRow.count, 10) || 0;
  const newApps = parseInt(newRow.count, 10) || 0;

  const alerts = [];

  if (overdue > 0) {
    alerts.push({
      type: "critical",
      message: `${overdue} application${overdue === 1 ? "" : "s"} waiting for review for 14+ days`,
      count: overdue,
      link: "/dashboard/agency/applicants",
    });
  }

  if (closing > 0) {
    alerts.push({
      type: "warning",
      message: `${closing} casting${closing === 1 ? "" : "s"} close${closing === 1 ? "s" : ""} today`,
      count: closing,
      link: "/dashboard/agency/casting",
    });
  }

  if (newApps > 0) {
    alerts.push({
      type: "positive",
      message: `${newApps} new application${newApps === 1 ? "" : "s"} in the last 2 hours`,
      count: newApps,
      link: "/dashboard/agency/applicants",
    });
  }

  return alerts;
}

/**
 * Returns live "right now" signals for the pulse strip and Discover promo card.
 *
 * Pulse strip: newToday, closingWeek.
 * Discover promo card (2): discoverableCount, newTalentWeek
 *
 * @returns {{
 *   newToday: number,
 *   closingWeek: number,
 *   discoverableCount: number,
 *   newTalentWeek: number
 * }}
 */
async function getPulse(db, agencyId) {
  const { dayStart } = utcDayBounds();
  const now = new Date();
  const weekAhead = new Date(Date.now() + 7 * DAY_MS);
  const sevenDaysAgo = new Date(Date.now() - 7 * DAY_MS);

  // Use ISO strings for all date comparisons — required for SQLite dialect
  // compatibility; PostgreSQL also accepts ISO strings so this is dialect-agnostic.
  const dayStartISO = dayStart.toISOString();
  const nowISO = now.toISOString();
  const weekAheadISO = weekAhead.toISOString();
  const sevenDaysAgoISO = sevenDaysAgo.toISOString();

  const [
    [newTodayRow],
    [closingWeekRow],
    [matchRow],
    [newTalentRow],
  ] = await Promise.all([
    // New applications received today
    db("applications")
      .where("agency_id", agencyId)
      .where("created_at", ">=", dayStartISO)
      .count("* as count"),

    // Active castings closing within the next 7 days
    db("boards")
      .where({ agency_id: agencyId, is_active: true })
      .where("closes_at", ">=", nowISO)
      .where("closes_at", "<", weekAheadISO)
      .count("* as count"),

    // Discoverable profiles not yet applied to this agency
    db("profiles")
      .where("is_discoverable", true)
      .whereNotIn("id", function () {
        this.select("profile_id")
          .from("applications")
          .where("agency_id", agencyId);
      })
      .count("* as count"),

    // New discoverable talent in the last 7 days
    db("profiles")
      .where("is_discoverable", true)
      .where("created_at", ">=", sevenDaysAgoISO)
      .count("* as count"),
  ]);

  return {
    newToday: parseInt(newTodayRow.count, 10) || 0,
    closingWeek: parseInt(closingWeekRow.count, 10) || 0,
    discoverableCount: parseInt(matchRow.count, 10) || 0,
    newTalentWeek: parseInt(newTalentRow.count, 10) || 0,
  };
}

module.exports = {
  getPendingReview,
  getActiveCastings,
  getPipeline,
  getAlerts,
  getPulse,
};
