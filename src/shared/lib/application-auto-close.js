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
  OFFERED_APPLICATION_STATUSES,
} = require("../constants/application-status");
const {
  CALL_PURPOSES,
  DEFAULT_OFFER_RESPONSE_WINDOW_HOURS,
} = require("../constants/event-casting");
const {
  notifyTalentForApplicationStatus,
} = require("../services/notify-talent-application");

/** Used when an agency row predates the column or holds a null. */
const DEFAULT_REVIEW_WINDOW_DAYS = 30;

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_HOUR = 60 * 60 * 1000;

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

/**
 * A one-week event and a standing representation call cannot share a review
 * window: 30 days of silence is a reasonable agency default and an absurd wait
 * for a show that happens in three weeks. The per-call value wins when the call
 * sets one, and the agency default applies to everything else.
 */
function isExpired(row, now) {
  const days = resolveWindowDays(
    row.call_review_window_days ?? row.application_review_window_days,
  );
  if (!(days > 0)) return false;
  const anchor = windowAnchor(row);
  if (!anchor) return false;
  return now.getTime() - anchor.getTime() >= days * MS_PER_DAY;
}

/**
 * `0` disables the offer clock for that call, matching `resolveWindowDays`.
 * A null or absent value is not a decision to disable, so it reads as the
 * 72-hour default the schema carries.
 */
function resolveOfferWindowHours(value) {
  if (value == null) return DEFAULT_OFFER_RESPONSE_WINDOW_HOURS;
  const hours = Number(value);
  if (!Number.isFinite(hours)) return DEFAULT_OFFER_RESPONSE_WINDOW_HOURS;
  return hours;
}

function isOfferExpired(row, now) {
  const hours = resolveOfferWindowHours(row.offer_response_window_hours);
  if (!(hours > 0)) return false;
  const anchor = windowAnchor(row);
  if (!anchor) return false;
  return now.getTime() - anchor.getTime() >= hours * MS_PER_HOUR;
}

/*
 * Deploy-before-migrate guard. Pass B reads `applications.open_call_link_id`;
 * until the column exists there are no event applications to close and the job
 * must not fail the nightly run trying to select it.
 */
async function hasEventCallColumns(db) {
  try {
    return await db.schema.hasColumn("applications", "open_call_link_id");
  } catch {
    return false;
  }
}

/**
 * How many candidates are pulled into memory at a time.
 *
 * Every open application across every agency is one candidate, so an unbounded
 * `select` grows with the product and eventually loads the whole open set — and
 * their agency rows — into one array. Paging keeps the footprint flat no matter
 * how large that set gets.
 */
const AUTO_CLOSE_BATCH_SIZE = 500;

/**
 * Closes every application whose agency review window has lapsed.
 *
 * Candidate selection filters on status in SQL and evaluates the window in JS.
 * The window is per-agency, so a single portable SQL predicate would need
 * dialect-specific interval maths against a joined column.
 *
 * Paging note: a closed row leaves the candidate set, so the next page cannot
 * simply be `offset += batch`. `examined` counts only the rows this run looked
 * at and *left in place*, which is exactly the number to skip past — closed
 * rows have already vacated the offsets behind it. Each pass therefore either
 * advances `examined` or shrinks the set, so the loop always terminates.
 *
 * @param {import("knex").Knex} db
 * @param {{ now?: Date, batchSize?: number }} [options]
 * @returns {Promise<{ scanned: number, closed: number, notified: number }>}
 */
async function runApplicationAutoClose(
  db,
  { now = new Date(), batchSize = AUTO_CLOSE_BATCH_SIZE } = {},
) {
  const limit = Number(batchSize) > 0 ? Number(batchSize) : AUTO_CLOSE_BATCH_SIZE;
  const eventColumnsReady = await hasEventCallColumns(db);

  let scanned = 0;
  let closed = 0;
  let notified = 0;

  /** One expired row, closed and announced. Shared by both passes. */
  async function closeRow(row, { metadata, description }) {
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
        description,
        metadata: JSON.stringify({
          ...metadata,
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
        // `call_purpose` rides along so the notification says "your slot
        // offer expired" rather than "the agency never answered" — the same
        // status, two entirely different things to have happened.
        application: {
          id: row.id,
          profile_id: row.profile_id,
          call_purpose: row.call_purpose || undefined,
        },
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

  /** Selection shared by both passes; `statuses` is what makes them differ. */
  function candidateQuery(statuses, offset) {
    const query = db("applications as a")
      .leftJoin("agencies as ag", "ag.id", "a.agency_id")
      .whereIn("a.status", statuses)
      .select(
        "a.id",
        "a.profile_id",
        "a.agency_id",
        "a.status",
        "a.status_changed_at",
        "a.updated_at",
        "a.created_at",
        "ag.application_review_window_days",
      )
      // A stable order is what makes the offset mean the same thing twice.
      .orderBy("a.id", "asc")
      .offset(offset)
      .limit(limit);

    if (eventColumnsReady) {
      query
        .leftJoin(
          "agency_open_call_links as l",
          "l.id",
          "a.open_call_link_id",
        )
        .select(
          "a.call_purpose",
          "a.open_call_link_id",
          "l.review_window_days as call_review_window_days",
          "l.offer_response_window_hours",
        );
    }
    return query;
  }

  // ── Pass A: nobody triaged it ───────────────────────────────────────────
  // Rows seen and deliberately left open — the offset the next page starts at.
  let examined = 0;
  for (;;) {
    const candidates = await candidateQuery(
      AWAITING_AGENCY_APPLICATION_STATUSES,
      examined,
    );
    if (!candidates.length) break;
    scanned += candidates.length;

    const expired = candidates.filter((row) => isExpired(row, now));
    examined += candidates.length - expired.length;
    closed += expired.length;

    for (const row of expired) {
      await closeRow(row, {
        description:
          "Closed automatically — the review window lapsed with no decision.",
        metadata: {
          reviewWindowDays: resolveWindowDays(
            row.call_review_window_days ?? row.application_review_window_days,
          ),
        },
      });
    }

    if (candidates.length < limit) break;
  }

  // ── Pass B: a slot was offered and never answered ───────────────────────
  //
  // Only event applications. An `accepted` representation application is an
  // open conversation about a contract and has no clock — but an unanswered
  // show slot blocks a booking the organizer has to fill, so it lapses and the
  // slot is released. `metadata.previousStatus` is `accepted`, which is what
  // tells every downstream reader (and the talent's notification) that an
  // offer expired rather than a submission going unread.
  if (eventColumnsReady) {
    let examinedOffers = 0;
    for (;;) {
      const page = await candidateQuery(
        OFFERED_APPLICATION_STATUSES,
        examinedOffers,
      );
      if (!page.length) break;
      scanned += page.length;

      const expired = page.filter(
        (row) =>
          row.call_purpose === CALL_PURPOSES.EVENT_CASTING &&
          isOfferExpired(row, now),
      );
      // Everything this page leaves in place — representation offers very much
      // included — is what the next page has to skip past.
      examinedOffers += page.length - expired.length;
      closed += expired.length;

      for (const row of expired) {
        await closeRow(row, {
          description:
            "Closed automatically — the slot offer expired with no answer.",
          metadata: {
            offerResponseWindowHours: resolveOfferWindowHours(
              row.offer_response_window_hours,
            ),
            openCallLinkId: row.open_call_link_id || null,
          },
        });
      }

      if (page.length < limit) break;
    }
  }

  return { scanned, closed, notified };
}

module.exports = {
  AUTO_CLOSE_BATCH_SIZE,
  DEFAULT_REVIEW_WINDOW_DAYS,
  runApplicationAutoClose,
  resolveOfferWindowHours,
  resolveWindowDays,
};
