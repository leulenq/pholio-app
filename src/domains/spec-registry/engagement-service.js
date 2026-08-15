"use strict";

/**
 * Outbound clicks and exports, per published route.
 *
 * Guardrail 4 of `docs/spec-correct-export-brief.md`. Pholio carries the
 * requirements of fifty agencies it cannot deliver a submission to, and the
 * return on that is evidence: *"142 people prepared an Elite-spec set on Pholio
 * last quarter and applied on your site."* That is a claim about people, not
 * about clicks, so the summaries below count distinct profiles as well as
 * events — one talent exporting six times is one person who prepared a set.
 *
 * Recording is deliberately best-effort. A failed count must never fail the
 * download or swallow the link the talent just clicked; the measurement exists
 * to serve a future sales conversation, and the talent's task outranks it.
 */

const crypto = require("crypto");

const EVENT_TYPES = Object.freeze({
  EXPORT: "export",
  OUTBOUND_CLICK: "outbound_click",
});

const TABLE = "spec_registry_engagement_events";

async function tableReady(db) {
  try {
    return await db.schema.hasTable(TABLE);
  } catch {
    return false;
  }
}

/**
 * Record one engagement event.
 *
 * @returns {Promise<boolean>} whether the event was stored
 */
async function recordEngagement(
  db,
  { seriesId, profileId, eventType, agencyId = null, revisionId = null, fileCount = null },
) {
  if (!seriesId || !profileId) return false;
  if (!Object.values(EVENT_TYPES).includes(eventType)) return false;
  if (!(await tableReady(db))) return false;

  try {
    await db(TABLE).insert({
      id: crypto.randomUUID(),
      series_id: seriesId,
      agency_id: agencyId,
      profile_id: profileId,
      event_type: eventType,
      revision_id: revisionId,
      file_count: fileCount,
      // An ISO string rather than a Date: under Jest's VM realm knex's
      // `instanceof Date` check fails and it persists `String(value)`, which is
      // the literal text "[object Object]".
      created_at: new Date().toISOString(),
    });
    return true;
  } catch {
    return false;
  }
}

function countsFrom(rows, key) {
  const summary = new Map();
  for (const row of rows) {
    const id = row[key];
    if (!summary.has(id)) {
      summary.set(id, {
        exports: 0,
        exportedBy: new Set(),
        outboundClicks: 0,
        clickedBy: new Set(),
      });
    }
    const entry = summary.get(id);
    if (row.event_type === EVENT_TYPES.EXPORT) {
      entry.exports += 1;
      entry.exportedBy.add(row.profile_id);
    } else if (row.event_type === EVENT_TYPES.OUTBOUND_CLICK) {
      entry.outboundClicks += 1;
      entry.clickedBy.add(row.profile_id);
    }
  }
  return summary;
}

/**
 * Per-series engagement over a window.
 *
 * @param {import("knex")} db
 * @param {{ seriesId?: string, since?: string, until?: string }} [options]
 *   `since` / `until` are ISO timestamps; `until` is exclusive.
 */
async function summarizeEngagement(db, { seriesId = null, since = null, until = null } = {}) {
  if (!(await tableReady(db))) return [];

  const query = db(`${TABLE} as event`)
    .leftJoin(
      "spec_registry_revisions as revision",
      "revision.revision_id",
      "event.revision_id",
    )
    .select(
      "event.series_id",
      "event.event_type",
      "event.profile_id",
      "revision.organization_name",
    );
  if (seriesId) query.where("event.series_id", seriesId);
  if (since) query.where("event.created_at", ">=", since);
  if (until) query.where("event.created_at", "<", until);

  const rows = await query;
  const names = new Map(
    rows.filter((row) => row.organization_name).map((row) => [row.series_id, row.organization_name]),
  );

  return [...countsFrom(rows, "series_id").entries()]
    .map(([id, entry]) => ({
      seriesId: id,
      agencyName: names.get(id) || null,
      exports: entry.exports,
      talentWhoExported: entry.exportedBy.size,
      outboundClicks: entry.outboundClicks,
      talentWhoClickedThrough: entry.clickedBy.size,
    }))
    .sort(
      (left, right) =>
        right.talentWhoExported - left.talentWhoExported ||
        left.seriesId.localeCompare(right.seriesId),
    );
}

/**
 * Whether the name takes "a" or "an".
 *
 * Spelling, not phonetics — enough for agency names, which are ordinary proper
 * nouns. The sentence goes in front of the agency it names, so "a Elite-spec
 * set" is not a detail to wave through.
 */
function article(name) {
  return /^[aeiou]/i.test(String(name).trim()) ? "an" : "a";
}

/** The sentence guardrail 4 exists to produce. */
function engagementSentence(summary, windowLabel = "recently") {
  const agency = summary.agencyName || summary.seriesId;
  const people = summary.talentWhoExported;
  if (!people) return null;
  const noun = people === 1 ? "person" : "people";
  const applied = summary.talentWhoClickedThrough;
  const tail = applied
    ? ` and ${applied === people ? "all of them" : `${applied} of them`} went on to your site.`
    : ".";
  return `${people} ${noun} prepared ${article(agency)} ${agency}-spec set on Pholio ${windowLabel}${tail}`;
}

module.exports = {
  EVENT_TYPES,
  engagementSentence,
  recordEngagement,
  summarizeEngagement,
};
