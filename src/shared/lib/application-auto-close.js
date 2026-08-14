"use strict";

/*
 * Auto-close — Part B3 of the August 2026 product plan.
 *
 * The industry's most-cited talent complaint is never hearing back. The
 * tempting product answer is to push agencies to respond more; that fails,
 * because not responding is a deliberate, published policy at most agencies
 * and no software changes it.
 *
 * So the default does the work instead. Each agency has a review window. When
 * it lapses with the application still sitting in the agency's court, Pholio
 * closes it and tells the talent plainly to treat it as a pass. The agency
 * does nothing and the talent gets certainty.
 *
 * The one thing this must not do is claim the agency decided something. An
 * expired window is silence, and silence is recorded as `closed_no_response`
 * with `auto_closed_at` set — never as `passed`, which is a booker's verdict.
 * The talent-facing copy says how to *treat* it; the record says what actually
 * happened.
 */

const { v4: uuidv4 } = require("uuid");
const {
  AUTO_CLOSED_APPLICATION_STATUS,
  AWAITING_AGENCY_APPLICATION_STATUSES,
} = require("../constants/application-status");
const {
  notifyTalentForApplicationStatus,
} = require("../services/notify-talent-application");

/** Used when an agency row predates the column or holds a null. */
const DEFAULT_REVIEW_WINDOW_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * `0` (or anything non-positive) turns auto-close off for that agency, which
 * is the escape hatch for an agency that would rather answer every submission
 * itself. A null column reads as the default rather than as "off": a missing
 * value is not a decision to disable.
 */
function resolveWindowDays(value) {
  if (value == null) return DEFAULT_REVIEW_WINDOW_DAYS;
  const days = Number(value);
  if (!Number.isFinite(days)) return DEFAULT_REVIEW_WINDOW_DAYS;
  return days;
}

function toDate(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * The window runs from the last time the application moved. `status_changed_at`
 * is backfilled for older rows, but fall back down the chain rather than
 * skipping a row whose anchor is missing entirely — a null anchor should not
 * make an application immortal.
 */
function windowAnchor(row) {
  return (
    toDate(row.status_changed_at) ||
    toDate(row.updated_at) ||
    toDate(row.created_at)
  );
}

function isExpired(row, now) {
  const days = resolveWindowDays(row.application_review_window_days);
  if (!(days > 0)) return false;
  const anchor = windowAnchor(row);
  if (!anchor) return false;
  return now.getTime() - anchor.getTime() >= days * MS_PER_DAY;
}

/**
 * Closes every application whose agency review window has lapsed.
 *
 * Candidate selection filters on status in SQL and evaluates the window in JS.
 * The window is per-agency, so a single portable SQL predicate would need
 * dialect-specific interval maths against a joined column — and this runs
 * daily over open applications only, which is a small set.
 *
 * @param {import("knex").Knex} db
 * @param {{ now?: Date }} [options]
 * @returns {Promise<{ scanned: number, closed: number, notified: number }>}
 */
async function runApplicationAutoClose(db, { now = new Date() } = {}) {
  const candidates = await db("applications as a")
    .leftJoin("agencies as ag", "ag.id", "a.agency_id")
    .whereIn("a.status", AWAITING_AGENCY_APPLICATION_STATUSES)
    .select(
      "a.id",
      "a.profile_id",
      "a.agency_id",
      "a.status",
      "a.status_changed_at",
      "a.updated_at",
      "a.created_at",
      "ag.application_review_window_days",
    );

  const expired = candidates.filter((row) => isExpired(row, now));
  let notified = 0;

  for (const row of expired) {
    const closedAt = now;
    await db("applications").where({ id: row.id }).update({
      status: AUTO_CLOSED_APPLICATION_STATUS,
      auto_closed_at: closedAt,
      status_changed_at: closedAt,
      updated_at: closedAt,
    });

    // `user_id` stays null: no person did this, and attributing it to a
    // booker would be the same lie as recording it as a pass.
    try {
      await db("application_activities").insert({
        id: uuidv4(),
        application_id: row.id,
        agency_id: row.agency_id,
        user_id: null,
        activity_type: "auto_closed",
        description: "Closed automatically — the review window lapsed with no decision.",
        metadata: JSON.stringify({
          reviewWindowDays: resolveWindowDays(row.application_review_window_days),
          previousStatus: row.status,
          autoClosedAt: closedAt.toISOString(),
        }),
        created_at: closedAt,
      });
    } catch (error) {
      // An activity row is a record of the close, not the close itself.
      console.error("[AutoClose] Activity log failed:", error);
    }

    try {
      await notifyTalentForApplicationStatus({
        application: { id: row.id, profile_id: row.profile_id },
        agencyId: row.agency_id,
        newStatus: AUTO_CLOSED_APPLICATION_STATUS,
        previousStatus: row.status,
      });
      notified += 1;
    } catch (error) {
      // The close is the product promise; the notification is best-effort and
      // must not roll back or halt the batch.
      console.error("[AutoClose] Notify failed:", error);
    }
  }

  return { scanned: candidates.length, closed: expired.length, notified };
}

module.exports = {
  DEFAULT_REVIEW_WINDOW_DAYS,
  runApplicationAutoClose,
  resolveWindowDays,
};
