"use strict";

/**
 * Reading the event-casting funnel back out (design §(g)).
 *
 * This is a PLATFORM question, not an agency one. The design says so in as
 * many words — "NO agency-facing analytics surface" — and the reason is that
 * the numbers here are about Pholio's product, not the organizer's casting: an
 * organizer who could see that 40% of applicants abandoned at the walk-video
 * gate would reasonably read it as a report on their applicants rather than on
 * our intake. The only consumer is the internal read route.
 *
 * Everything is scoped to one `open_call_link_id`. The funnel's whole shape —
 * viewed → started → completed — only means anything per call; summing two
 * editions of the same event produces a rate that describes neither.
 */

const knexDefault = require("../../../shared/db/knex");
const {
  FUNNEL_EVENT_TYPES,
  FUNNEL_EVENT_TYPE_VALUES,
} = require("../../../shared/constants/event-casting");

const TABLE = "event_casting_funnel_events";

/**
 * Day bucket for the `occurred_at` timestamp, in the storage dialect.
 * Grouping in SQL rather than paging every row into Node: a busy call is
 * thousands of `call_viewed` rows and this route is a read-only report.
 */
function dayExpression(db) {
  const client = db.client.config.client;
  const isPg = client === "pg" || client === "postgresql";
  return isPg
    ? db.raw("to_char(occurred_at, 'YYYY-MM-DD')")
    : db.raw("strftime('%Y-%m-%d', occurred_at)");
}

function parseMetadata(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw) || {};
  } catch {
    return {};
  }
}

/** Every event type present, so a zero reads as a zero rather than as absent. */
function zeroedTotals() {
  return FUNNEL_EVENT_TYPE_VALUES.reduce((totals, eventType) => {
    totals[eventType] = 0;
    return totals;
  }, {});
}

/**
 * Total events by type for one call.
 * @returns {Promise<Record<string, number>>}
 */
async function countsByEventType(linkId, options = {}) {
  const db = options.db || knexDefault;
  const rows = await db(TABLE)
    .where({ open_call_link_id: linkId })
    .groupBy("event_type")
    .select("event_type")
    .count({ total: "*" });
  const totals = zeroedTotals();
  for (const row of rows) {
    totals[row.event_type] = Number(row.total) || 0;
  }
  return totals;
}

/**
 * Events by type and UTC day, oldest first — the shape a sparkline or a
 * spreadsheet wants.
 * @returns {Promise<Array<{ day: string, eventType: string, count: number }>>}
 */
async function countsByDay(linkId, options = {}) {
  const db = options.db || knexDefault;
  const day = dayExpression(db);
  const rows = await db(TABLE)
    .where({ open_call_link_id: linkId })
    .groupByRaw("1, 2")
    .orderByRaw("1 asc, 2 asc")
    .select({ day }, "event_type")
    .count({ total: "*" });
  return rows.map((row) => ({
    day: row.day,
    eventType: row.event_type,
    count: Number(row.total) || 0,
  }));
}

/**
 * Why started applications never completed, commonest first.
 *
 * The reason lives inside `metadata`, whose column is `jsonb` on Postgres and
 * `text` on SQLite. Rather than fork the query on dialect, the blocked rows —
 * the smallest slice in the table by a wide margin — are counted in JS.
 *
 * @returns {Promise<Array<{ reason: string, count: number }>>}
 */
async function blockedReasonBreakdown(linkId, options = {}) {
  const db = options.db || knexDefault;
  const rows = await db(TABLE)
    .where({
      open_call_link_id: linkId,
      event_type: FUNNEL_EVENT_TYPES.INTAKE_BLOCKED,
    })
    .select("metadata");
  const counts = new Map();
  for (const row of rows) {
    const reason = parseMetadata(row.metadata).reason || "unknown";
    counts.set(reason, (counts.get(reason) || 0) + 1);
  }
  return [...counts.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count || a.reason.localeCompare(b.reason));
}

/** People, not events: one applicant who saved four drafts is one applicant. */
async function distinctProfileCounts(linkId, options = {}) {
  const db = options.db || knexDefault;
  const rows = await db(TABLE)
    .where({ open_call_link_id: linkId })
    .whereNotNull("profile_id")
    .groupBy("event_type")
    .select("event_type")
    .countDistinct({ total: "profile_id" });
  const totals = zeroedTotals();
  for (const row of rows) {
    totals[row.event_type] = Number(row.total) || 0;
  }
  return totals;
}

/** `null` rather than 0 when the denominator is 0 — an unknown rate is not 0%. */
function rate(numerator, denominator) {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 1000) / 1000;
}

/**
 * The whole report for one call, in one call.
 *
 * @returns {Promise<{
 *   openCallLinkId: string,
 *   totals: Record<string, number>,
 *   distinctProfiles: Record<string, number>,
 *   rates: { startFromView: number|null, completionFromStart: number|null, completionFromView: number|null },
 *   byDay: Array<{ day: string, eventType: string, count: number }>,
 *   blockedReasons: Array<{ reason: string, count: number }>,
 * }>}
 */
async function loadEventFunnelReport(linkId, options = {}) {
  const [totals, distinctProfiles, byDay, blockedReasons] = await Promise.all([
    countsByEventType(linkId, options),
    distinctProfileCounts(linkId, options),
    countsByDay(linkId, options),
    blockedReasonBreakdown(linkId, options),
  ]);

  const viewed = totals[FUNNEL_EVENT_TYPES.CALL_VIEWED];
  const started = totals[FUNNEL_EVENT_TYPES.APPLICATION_STARTED];
  const completed = totals[FUNNEL_EVENT_TYPES.APPLICATION_COMPLETED];

  return {
    openCallLinkId: linkId,
    totals,
    distinctProfiles,
    rates: {
      startFromView: rate(started, viewed),
      completionFromStart: rate(completed, started),
      completionFromView: rate(completed, viewed),
    },
    byDay,
    blockedReasons,
  };
}

module.exports = {
  EVENT_FUNNEL_TABLE: TABLE,
  blockedReasonBreakdown,
  countsByDay,
  countsByEventType,
  distinctProfileCounts,
  loadEventFunnelReport,
};
