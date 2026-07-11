"use strict";

/**
 * Discover — query/outcome logging (WS6.5).
 *
 * Every write here is BEST-EFFORT: a logging failure (missing table during a
 * deploy-before-migrate window, DB hiccup) must NEVER fail the search or the
 * invite. Tables: discover_query_log (one row per search) + discover_query_events
 * (per-profile impression/invite/… outcomes attributed to a logged query).
 */

const crypto = require("crypto");

function jsonCol(value) {
  if (value == null) return null;
  return typeof value === "string" ? value : JSON.stringify(value);
}

/**
 * Insert one discover_query_log row. Returns the new id, or null on failure.
 */
async function writeQueryLog(knex, entry) {
  if (!knex) return null;
  try {
    const id = crypto.randomUUID();
    await knex("discover_query_log").insert({
      id,
      agency_user_id: entry.agencyUserId,
      raw_brief: entry.rawBrief != null ? String(entry.rawBrief) : null,
      parsed_contract: jsonCol(entry.contract),
      extraction_disagreements: jsonCol(entry.disagreements),
      engine: entry.engine || null,
      result_profile_ids: jsonCol(entry.resultProfileIds),
      group_counts: jsonCol(entry.groupCounts),
      timings: jsonCol(entry.timings),
      created_at: knex.fn.now(),
    });
    return id;
  } catch (err) {
    console.warn("[discover-log] query log write failed:", err.message);
    return null;
  }
}

/**
 * Insert one discover_query_events row per profile for a given event type.
 */
async function writeQueryEvents(knex, queryLogId, profileIds, event) {
  if (!knex || !queryLogId) return;
  const ids = [...new Set((profileIds || []).filter(Boolean))].slice(0, 120);
  if (!ids.length) return;
  try {
    await knex("discover_query_events").insert(
      ids.map((profileId) => ({
        id: crypto.randomUUID(),
        query_log_id: queryLogId,
        profile_id: profileId,
        event,
        created_at: knex.fn.now(),
      })),
    );
  } catch (err) {
    console.warn(`[discover-log] ${event} events write failed:`, err.message);
  }
}

function writeImpressionEvents(knex, queryLogId, profileIds) {
  return writeQueryEvents(knex, queryLogId, profileIds, "impression");
}

function writeInviteEvent(knex, queryLogId, profileId) {
  return writeQueryEvents(knex, queryLogId, [profileId], "invite");
}

module.exports = {
  writeQueryLog,
  writeQueryEvents,
  writeImpressionEvents,
  writeInviteEvent,
};
