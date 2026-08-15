"use strict";

/**
 * The event-casting funnel writer (design §(g)).
 *
 * Eight steps, one table, one rule: **observability never changes behaviour.**
 * Every entry point here swallows its own errors and logs at debug level, the
 * same contract `src/domains/talent/services/intel/capture.js` states for
 * portfolio attention and `spec_registry_engagement_events` states for spec
 * exports. A funnel write is not allowed to 500 a submission, block an arrival
 * screen, or roll back a transaction — if the measurement is lost, the
 * measurement is lost.
 *
 * WHAT MAY BE STORED
 *
 * Codes and counts. `metadata` is filtered down to short slugs, finite numbers
 * and booleans (`safeFunnelMetadata`), so a caller cannot accidentally park a
 * name, an email, a note, a URL or a free-text reason in an analytics row that
 * outlives the submission it describes. Identity is carried by the foreign
 * keys (`profile_id`) or by an irreversible hash (`anon_id`), never by content.
 *
 * `anon_id` is the hashed Express session id. It exists to stitch a pre-signup
 * arrival to the submission that eventually follows it — the denominator of
 * this funnel is people who *looked*, and they have no `profile_id` yet. The
 * hash is `hashArrivalIp`'s: the same HMAC and the same salt already used for
 * arrival telemetry on this exact surface, reused rather than reinvented so
 * there is one place where an open-call identifier gets anonymized.
 */

const crypto = require("crypto");
const knex = require("../db/knex");
const {
  CALL_PURPOSES,
  FUNNEL_EVENT_TYPES,
  FUNNEL_EVENT_TYPE_VALUES,
} = require("../constants/event-casting");
const {
  hashArrivalIp,
} = require("../../domains/talent/services/open-call-claims");

const TABLE = "event_casting_funnel_events";
const EVENT_TYPES = new Set(FUNNEL_EVENT_TYPE_VALUES);

/**
 * What the ApplySuccess payoff block can report. Lane E's own vocabulary — the
 * shared event-casting constants describe the domain, and these describe one
 * instrumented component, so they live with the writer that validates them.
 * Mirrored in `client/src/shared/constants/eventCasting.js`.
 */
const PAYOFF_ACTIONS = Object.freeze({
  VIEWED: "viewed",
  COMP_CARD: "comp_card",
  PORTFOLIO_LINK: "portfolio_link",
});
const PAYOFF_ACTION_VALUES = Object.freeze(Object.values(PAYOFF_ACTIONS));

/** The D30 window from design §(g): submitted 25–35 days ago. */
const RETURNED_D30_MIN_DAYS = 25;
const RETURNED_D30_MAX_DAYS = 35;
const DAY_MS = 86_400_000;

/** Metadata is a handful of codes, not a document. */
const METADATA_MAX_KEYS = 12;
const METADATA_MAX_ITEMS = 10;
const METADATA_CODE_MAX_LENGTH = 64;
/** A slug, not a sentence: no spaces, no punctuation a name or URL would need. */
const METADATA_CODE_PATTERN = /^[A-Za-z0-9_.:-]{1,64}$/;

/**
 * Deploy-before-migrate guard. Checked once per process, and re-armed on
 * failure so a transient error does not permanently disable the funnel.
 */
let tableReadyPromise = null;
function tableReady(db) {
  if (db !== knex) return db.schema.hasTable(TABLE).catch(() => false);
  if (!tableReadyPromise) {
    tableReadyPromise = db.schema
      .hasTable(TABLE)
      .catch(() => {
        tableReadyPromise = null;
        return false;
      });
  }
  return tableReadyPromise;
}

/** Test seam only — the memoized schema probe outlives a suite's database. */
function resetEventFunnelSchemaCache() {
  tableReadyPromise = null;
}

function debug(message, error) {
  // Debug level, per the capture.js contract: a lost measurement is not an
  // incident, and paging on one trains people to ignore real errors.
  console.debug(`[EventFunnel] ${message}`, error?.message || error || "");
}

function isSafeCode(value) {
  return typeof value === "string" && METADATA_CODE_PATTERN.test(value);
}

/**
 * Codes and counts only. Anything else is dropped silently — a caller that
 * hands over a name should lose the field, not the event.
 */
function safeFunnelMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }
  const safe = {};
  for (const [key, value] of Object.entries(metadata)) {
    if (Object.keys(safe).length >= METADATA_MAX_KEYS) break;
    if (!isSafeCode(key)) continue;
    if (typeof value === "boolean") {
      safe[key] = value;
    } else if (typeof value === "number" && Number.isFinite(value)) {
      safe[key] = value;
    } else if (isSafeCode(value)) {
      safe[key] = value.slice(0, METADATA_CODE_MAX_LENGTH);
    } else if (Array.isArray(value)) {
      const codes = value.filter(isSafeCode).slice(0, METADATA_MAX_ITEMS);
      if (codes.length) safe[key] = codes;
    }
  }
  return Object.keys(safe).length ? safe : null;
}

/**
 * The stitching key for a visitor with no account yet.
 *
 * Reuses `hashArrivalIp` — same HMAC, same salt, already the anonymizer for
 * open-call arrival telemetry. Note the ceiling on what this can prove: with
 * `saveUninitialized: false` an anonymous visitor's session id is only stable
 * once something has persisted the session, so `anon_id` stitches reliably
 * from the arrival POST onward. `profile_id` is the strong key and is written
 * whenever the visitor is signed in.
 */
function hashSessionId(sessionId) {
  return hashArrivalIp(sessionId);
}

/** `anon_id` for a request, or null when there is no session at all. */
function anonIdFromRequest(req) {
  return hashSessionId(req?.sessionID || req?.session?.id || null);
}

function normalizeId(value) {
  return typeof value === "string" && value ? value : null;
}

/**
 * Record one funnel event. Fire-and-forget: awaiting it is optional, and it
 * resolves `false` rather than throwing when anything at all goes wrong.
 *
 * @param {{
 *   openCallLinkId: string,
 *   agencyId?: string|null,
 *   profileId?: string|null,
 *   anonId?: string|null,
 *   eventType: string,
 *   metadata?: Record<string, unknown>|null,
 * }} event
 * @param {{ db?: import('knex').Knex }} [options]
 * @returns {Promise<boolean>} whether a row was written
 */
async function recordEventFunnelEvent(event = {}, options = {}) {
  const db = options.db || knex;
  try {
    const openCallLinkId = normalizeId(event.openCallLinkId);
    // The link is the spine of every question this table answers, and the
    // column is NOT NULL. A representation submission simply has no row.
    if (!openCallLinkId) return false;
    if (!EVENT_TYPES.has(event.eventType)) {
      debug(`Unknown event type "${event.eventType}" refused`);
      return false;
    }
    if (!(await tableReady(db))) return false;

    const metadata = safeFunnelMetadata(event.metadata);
    await db(TABLE).insert({
      id: crypto.randomUUID(),
      open_call_link_id: openCallLinkId,
      agency_id: normalizeId(event.agencyId),
      profile_id: normalizeId(event.profileId),
      anon_id: normalizeId(event.anonId),
      event_type: event.eventType,
      metadata: metadata ? JSON.stringify(metadata) : null,
      // An ISO string, not a Date: under Jest's VM realm knex's `instanceof
      // Date` check fails and it persists the literal "[object Object]".
      occurred_at: new Date().toISOString(),
    });
    return true;
  } catch (error) {
    debug("Event write failed", error);
    return false;
  }
}

/**
 * Has this profile already completed an event application somewhere else?
 *
 * "Elsewhere" is a different call, not merely a different organizer: a
 * multi-edition organizer runs Brooklyn and Queens as separate casts with
 * separate packages, and sending to the second one is exactly the reuse this
 * metric is asking about (design §(g) row 7).
 */
async function hasPriorEventSubmission(
  { profileId, excludeOpenCallLinkId = null },
  options = {},
) {
  const db = options.db || knex;
  try {
    if (!normalizeId(profileId)) return false;
    if (!(await tableReady(db))) return false;
    const query = db(TABLE)
      .where({
        profile_id: profileId,
        event_type: FUNNEL_EVENT_TYPES.APPLICATION_COMPLETED,
      })
      .first("id");
    if (excludeOpenCallLinkId) {
      query.whereNot("open_call_link_id", excludeOpenCallLinkId);
    }
    return Boolean(await query);
  } catch (error) {
    debug("Prior-submission lookup failed", error);
    return false;
  }
}

/**
 * The set of user ids with a live Express session.
 *
 * This is the "session activity since" signal in design §(g) row 8. Pholio has
 * no `last_login_at` and no login-event table; what it does have is
 * `connect-session-knex`'s `sessions` table, whose `expired` column is pushed
 * forward by express-session's `touch` on every request a signed-in person
 * makes. With a 7-day cookie (src/app.js), an unexpired row therefore means
 * "used the app within the last week" — necessarily *after* a submission that
 * is 25–35 days old, which is precisely the question.
 *
 * The `sess` payload is JSON in one dialect and text in the other, so it is
 * parsed in JS rather than queried with a dialect-specific JSON operator. The
 * scan is bounded by live sessions only and runs once per daily job.
 */
async function activeSessionUserIds(db) {
  const rows = await db("sessions")
    .where("expired", ">", new Date().toISOString())
    .select("sess");
  const userIds = new Set();
  for (const row of rows) {
    try {
      const sess =
        typeof row.sess === "string" ? JSON.parse(row.sess) : row.sess;
      if (sess?.userId) userIds.add(sess.userId);
    } catch {
      // A malformed session row is the session store's problem, not ours.
    }
  }
  return userIds;
}

/**
 * Daily job block: `returned_d30`.
 *
 * Server-side by design — "did they come back?" measured from the client is a
 * number the client can invent. One row per (profile, call) ever: the window
 * is eleven days wide and the job runs daily, so without the guard a single
 * submission would report a return eleven times.
 *
 * @returns {Promise<{ candidates: number, recorded: number }>}
 */
async function recordReturnedD30Events(options = {}) {
  const db = options.db || knex;
  const now = options.now ? new Date(options.now) : new Date();
  try {
    if (!(await tableReady(db))) return { candidates: 0, recorded: 0 };

    const windowStart = now.getTime() - RETURNED_D30_MAX_DAYS * DAY_MS;
    const windowEnd = now.getTime() - RETURNED_D30_MIN_DAYS * DAY_MS;

    // SQLite writes `knex.fn.now()` as "YYYY-MM-DD HH:MM:SS" while callers
    // write ISO-8601 with a "T", and those two sort against each other wrongly
    // at the boundary. So the SQL bound is deliberately slack and the exact
    // window is applied in JS — the same shape `application-auto-close.js`
    // uses for its review-window arithmetic.
    const rows = await db("applications as a")
      .join("profiles as p", "p.id", "a.profile_id")
      .whereNotNull("a.open_call_link_id")
      .andWhere("a.call_purpose", CALL_PURPOSES.EVENT_CASTING)
      .andWhere(
        "a.created_at",
        ">=",
        new Date(windowStart - DAY_MS).toISOString(),
      )
      .andWhere(
        "a.created_at",
        "<",
        new Date(windowEnd + DAY_MS).toISOString(),
      )
      .select(
        "a.profile_id",
        "a.open_call_link_id",
        "a.agency_id",
        "a.created_at",
        "p.user_id",
      );
    const candidates = rows.filter((row) => {
      const submittedAt = new Date(row.created_at).getTime();
      return (
        Number.isFinite(submittedAt) &&
        submittedAt >= windowStart &&
        submittedAt < windowEnd
      );
    });
    if (!candidates.length) return { candidates: 0, recorded: 0 };

    // One idempotency read for the whole batch rather than one per candidate.
    const alreadyRecorded = new Set(
      (
        await db(TABLE)
          .where({ event_type: FUNNEL_EVENT_TYPES.RETURNED_D30 })
          .whereIn(
            "profile_id",
            candidates.map((row) => row.profile_id),
          )
          .select("profile_id", "open_call_link_id")
      ).map((row) => `${row.profile_id}:${row.open_call_link_id}`),
    );

    const activeUsers = await activeSessionUserIds(db);
    let recorded = 0;
    for (const candidate of candidates) {
      if (alreadyRecorded.has(`${candidate.profile_id}:${candidate.open_call_link_id}`)) {
        continue;
      }
      if (!activeUsers.has(candidate.user_id)) continue;
      const written = await recordEventFunnelEvent(
        {
          openCallLinkId: candidate.open_call_link_id,
          agencyId: candidate.agency_id,
          profileId: candidate.profile_id,
          eventType: FUNNEL_EVENT_TYPES.RETURNED_D30,
          metadata: {
            daysSinceSubmit: Math.round(
              (now.getTime() - new Date(candidate.created_at).getTime()) / DAY_MS,
            ),
          },
        },
        { db },
      );
      if (written) {
        alreadyRecorded.add(
          `${candidate.profile_id}:${candidate.open_call_link_id}`,
        );
        recorded += 1;
      }
    }
    return { candidates: candidates.length, recorded };
  } catch (error) {
    debug("returned_d30 sweep failed", error);
    return { candidates: 0, recorded: 0 };
  }
}

module.exports = {
  EVENT_FUNNEL_TABLE: TABLE,
  PAYOFF_ACTIONS,
  PAYOFF_ACTION_VALUES,
  RETURNED_D30_MAX_DAYS,
  RETURNED_D30_MIN_DAYS,
  anonIdFromRequest,
  hasPriorEventSubmission,
  hashSessionId,
  recordEventFunnelEvent,
  recordReturnedD30Events,
  resetEventFunnelSchemaCache,
  safeFunnelMetadata,
};
