// src/lib/agency-overview-queries.js
"use strict";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
const WEEK_MS = 7 * DAY_MS;

// Pipeline stage configuration (module-level to avoid re-allocation per call)
const PIPELINE_LABEL_MAP = {
  submitted: "Submitted",
  shortlisted: "Shortlisted",
  booked: "Booked",
  passed: "Passed",
  declined: "Declined",
};
const PIPELINE_STAGE_ORDER = [
  "submitted",
  "shortlisted",
  "booked",
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

/**
 * Returns the start of the current UTC calendar month.
 */
function utcMonthStart() {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
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
    .where("closes_at", ">=", dayStart)
    .where("closes_at", "<", dayEnd) // exclusive upper bound
    .count("* as count");

  return {
    count: parseInt(totalRow.count, 10) || 0,
    closingToday: parseInt(closingRow.count, 10) || 0,
  };
}

/**
 * Returns roster count (accepted talent with non-null accepted_at),
 * a 7-element cumulative trend array, and new acceptances this month.
 *
 * trend[0] = oldest week, trend[6] = current week (equals `count`).
 *
 * @returns {{ count: number, trend: number[], changeThisMonth: number }}
 */
async function getRosterSize(db, agencyId) {
  const sevenWeeksAgo = new Date(Date.now() - 49 * DAY_MS);
  const monthStart = utcMonthStart();

  // Single aggregation query for count, base, and changeThisMonth
  const [aggRow] = await db("applications")
    .where({ agency_id: agencyId, status: "accepted" })
    .whereNotNull("accepted_at")
    .select(
      db.raw("COUNT(*) as count"),
      db.raw("COUNT(CASE WHEN accepted_at < ? THEN 1 END) as base", [
        sevenWeeksAgo,
      ]),
      db.raw(
        "COUNT(CASE WHEN accepted_at >= ? THEN 1 END) as change_this_month",
        [monthStart],
      ),
    );
  const count = parseInt(aggRow.count, 10) || 0;
  const base = parseInt(aggRow.base, 10) || 0;
  const changeThisMonth = parseInt(aggRow.change_this_month, 10) || 0;

  // Per-week new acceptances within the window (JS bucketing, dialect-agnostic)
  const windowRows = await db("applications")
    .where({ agency_id: agencyId, status: "accepted" })
    .whereNotNull("accepted_at")
    .where("accepted_at", ">=", sevenWeeksAgo)
    .select("accepted_at");

  const newPerSlot = [0, 0, 0, 0, 0, 0, 0];
  for (const row of windowRows) {
    const slot = Math.min(
      6,
      Math.floor(
        (new Date(row.accepted_at).getTime() - sevenWeeksAgo.getTime()) /
          WEEK_MS,
      ),
    );
    newPerSlot[Math.max(0, slot)]++;
  }

  // Build cumulative array
  const trend = [];
  let running = base;
  for (let i = 0; i < 7; i++) {
    running += newPerSlot[i];
    trend.push(running);
  }

  return { count, trend, changeThisMonth };
}

/**
 * Returns placement rate (%) for the current 90-day window and the
 * prior 90-day window ("last season"). Both windows use exclusive upper
 * bounds so no application is counted twice.
 *
 * placementRate = booked / (booked + passed + declined + accepted) × 100
 *
 * @returns {{ current: number, lastSeason: number }}
 */
async function getPlacementRate(db, agencyId) {
  const now = Date.now();
  const now90 = new Date(now - 90 * DAY_MS);
  const now180 = new Date(now - 180 * DAY_MS);

  async function rateForWindow(windowStart, windowEnd) {
    const [row] = await db("applications")
      .where("agency_id", agencyId)
      .where("created_at", ">=", windowStart)
      .where("created_at", "<", windowEnd)
      .whereIn("status", ["booked", "passed", "declined", "accepted"])
      .select(
        db.raw("SUM(CASE WHEN status = 'booked' THEN 1 ELSE 0 END) as booked"),
        db.raw("COUNT(*) as decided"),
      );

    const booked = parseInt(row.booked, 10) || 0;
    const decided = parseInt(row.decided, 10) || 0;
    return decided > 0 ? Math.round((booked / decided) * 100) : 0;
  }

  const [current, lastSeason] = await Promise.all([
    rateForWindow(now90, new Date()), // last 90 days
    rateForWindow(now180, now90), // prior 90 days (no overlap)
  ]);

  return { current, lastSeason };
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
 * Returns archetype breakdown for accepted talent on the roster.
 * Only accepted applications whose profile has a non-null archetype are included.
 * pct = archetype count / total-with-archetype × 100.
 *
 * @returns {Array<{ name: string, count: number, pct: number }>}
 */
async function getTalentMix(db, agencyId) {
  const rows = await db("applications as a")
    .join("profiles as p", "p.id", "a.profile_id")
    .where("a.agency_id", agencyId)
    .where("a.status", "accepted")
    .whereNotNull("p.archetype")
    .groupBy("p.archetype")
    .select("p.archetype as name", db.raw("COUNT(*) as count"))
    .orderByRaw("COUNT(*) DESC");

  if (rows.length === 0) return [];

  const total = rows.reduce((sum, r) => sum + (parseInt(r.count, 10) || 0), 0);
  if (total === 0) return [];

  return rows.map((row) => {
    const count = parseInt(row.count, 10);
    return { name: row.name, count, pct: Math.round((count / total) * 100) };
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
      .where("created_at", "<=", cutoff14d)
      .count("* as count"),

    // Warning: boards closing today (UTC)
    db("boards")
      .where({ agency_id: agencyId, is_active: true })
      .where("closes_at", ">=", dayStart)
      .where("closes_at", "<", dayEnd)
      .count("* as count"),

    // Positive: new submitted applications in last 2 hours
    db("applications")
      .where({ agency_id: agencyId, status: "submitted" })
      .where("created_at", ">=", twoHoursAgo)
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
 * Pulse strip chips (4): newToday, closingWeek, idleTalent, avgMatchScore
 * Discover promo card (2): discoverableCount, newTalentWeek
 *
 * @returns {{
 *   newToday: number,
 *   closingWeek: number,
 *   idleTalent: number,
 *   avgMatchScore: number|null,
 *   discoverableCount: number,
 *   newTalentWeek: number
 * }}
 */
async function getPulse(db, agencyId) {
  const { dayStart } = utcDayBounds();
  const now = new Date();
  const weekAhead = new Date(Date.now() + 7 * DAY_MS);
  const thirtyDaysAgo = new Date(Date.now() - 30 * DAY_MS);
  const sevenDaysAgo = new Date(Date.now() - 7 * DAY_MS);

  // Use ISO strings for all date comparisons — required for SQLite dialect
  // compatibility; PostgreSQL also accepts ISO strings so this is dialect-agnostic.
  const dayStartISO = dayStart.toISOString();
  const nowISO = now.toISOString();
  const weekAheadISO = weekAhead.toISOString();
  const thirtyDaysAgoISO = thirtyDaysAgo.toISOString();
  const sevenDaysAgoISO = sevenDaysAgo.toISOString();

  const [
    [newTodayRow],
    [closingWeekRow],
    [idleRow],
    [avgRow],
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

    // Accepted talent not submitted to any casting (this agency) in 30 days
    db("applications as a")
      .where("a.agency_id", agencyId)
      .where("a.status", "accepted")
      .whereNotIn("a.profile_id", function () {
        this.select("a2.profile_id")
          .from("board_applications as ba")
          .join("applications as a2", "a2.id", "ba.application_id")
          .where("a2.agency_id", agencyId)
          .where("ba.created_at", ">=", thirtyDaysAgoISO)
          .distinct();
      })
      .countDistinct("a.profile_id as count"),

    // Average match score of currently-pending submitted applications
    db("board_applications as ba")
      .join("applications as a", "a.id", "ba.application_id")
      .where("a.agency_id", agencyId)
      .where("a.status", "submitted")
      .avg("ba.match_score as avg"),

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
    idleTalent: parseInt(idleRow.count, 10) || 0,
    avgMatchScore: avgRow.avg != null ? Math.round(Number(avgRow.avg)) : null,
    discoverableCount: parseInt(matchRow.count, 10) || 0,
    newTalentWeek: parseInt(newTalentRow.count, 10) || 0,
  };
}

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
  const thirtyDaysAgo = new Date(Date.now() - 30 * DAY_MS);

  const [totalRow] = await db("applications")
    .where({ agency_id: agencyId, status: "accepted" })
    .countDistinct("profile_id as count");

  const total = parseInt(totalRow.count, 10) || 0;
  if (total === 0) return { active: 0, total: 0, pct: 0 };

  const [activeRow] = await db("applications as a")
    .join("board_applications as ba", "ba.application_id", "a.id")
    .where("a.agency_id", agencyId)
    .where("a.status", "accepted")
    .where("ba.created_at", ">=", thirtyDaysAgo.toISOString())
    .countDistinct("a.profile_id as count");

  const active = parseInt(activeRow.count, 10) || 0;
  const pct = Math.round((active / total) * 100);

  return { active, total, pct };
}

module.exports = {
  getPendingReview,
  getActiveCastings,
  getRosterSize,
  getPlacementRate,
  getPipeline,
  getTalentMix,
  getAlerts,
  getPulse,
  getActiveUtilization,
};
