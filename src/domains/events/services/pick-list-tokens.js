"use strict";

/**
 * Designer pick-list share tokens (design §(d), ruling R3).
 *
 * A designer never gets a Pholio account. The only credential in the flow is
 * the raw token inside the emailed `/picks/:token` URL, so this module is the
 * whole authentication surface for that audience and is deliberately the one
 * place the crypto lives — `services/event-pick-lists.js` (Lane C) owns pick
 * list CRUD and calls in here rather than minting its own tokens.
 *
 * The idiom is `domains/messaging/services/message-reply-tokens.js` (SEC-0.8):
 * 32 random bytes base64url as the raw value, sha256 hex as the ONLY thing
 * persisted, lookup by hashing the caller-supplied string. A database read
 * therefore cannot reconstruct a working link.
 *
 * Two departures from the reply-token idiom, both intentional:
 *
 *  - **No session bootstrap.** message-reply-tokens can trade its bearer for a
 *    real Express session. Nothing here may: a designer has no user row, no
 *    cookie, and no dashboard. There is no `issue*SessionToken` on purpose.
 *  - **No rotation on resend.** A reply token rotates on every issuance
 *    because the email is the only carrier. A pick list is forwarded, printed,
 *    and opened by a studio assistant days later (ruling R3 accepts that), so
 *    re-sending the same list must NOT silently invalidate the link already in
 *    the designer's inbox. Rotation happens only when an organizer explicitly
 *    reissues, which stamps `rotated_at`.
 *
 * The no-oracle rule: `validatePickToken` returns `null` for unknown, expired,
 * revoked and never-shared (draft) lists alike. Callers must render one
 * identical 404 for all of them, so a forwarded-and-revoked link cannot be
 * distinguished from a typo.
 */

const crypto = require("crypto");
const knexDb = require("../../../shared/db/knex");
const {
  PICK_LIST_STATUSES,
} = require("../../../shared/constants/event-casting");

/** Design §(d): the link outlives the event by a week so late picks land. */
const TOKEN_TTL_AFTER_EVENT_DAYS = 7;
/** No event end date (ongoing / undated call) — a flat month instead. */
const TOKEN_TTL_FALLBACK_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Statuses a token may be dereferenced at all. `draft` is excluded: the list
 * has not been handed over yet, so its token is not a credential. `closed` IS
 * included — the designer keeps read-only access after submitting.
 */
const READABLE_PICK_LIST_STATUSES = Object.freeze([
  PICK_LIST_STATUSES.OPEN,
  PICK_LIST_STATUSES.CLOSED,
]);

function getAppBaseUrl() {
  return (
    process.env.APP_URL ||
    process.env.VITE_APP_URL ||
    (process.env.NODE_ENV === "production"
      ? "https://app.pholio.studio"
      : "http://localhost:5173")
  );
}

/** The public designer URL. Never stored — it carries the raw token. */
function buildPickListUrl(rawToken) {
  const base = getAppBaseUrl().replace(/\/$/, "");
  return `${base}/picks/${rawToken}`;
}

function generateTokenValue() {
  return crypto.randomBytes(32).toString("base64url");
}

/** sha256 hex of the raw token. The only representation that is persisted. */
function hashToken(raw) {
  return crypto.createHash("sha256").update(String(raw)).digest("hex");
}

/**
 * Knex/SQLite hands back timestamps as millisecond strings while PostgreSQL
 * returns Date objects or ISO strings. Normalize every shape so an unparsable
 * value fails CLOSED (expired) instead of silently bypassing expiry.
 */
function timestampToMillis(value) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) {
    return Number(value);
  }
  return new Date(value).getTime();
}

function isExpired(value, now = Date.now()) {
  const expiresAt = timestampToMillis(value);
  return !Number.isFinite(expiresAt) || expiresAt <= now;
}

/**
 * `agency_open_call_links.event_ends_on` is a DATE column: Postgres returns a
 * Date, SQLite a "YYYY-MM-DD" string. Anything unparsable is treated as absent
 * so the caller falls back to the flat TTL rather than minting a token that
 * expired at epoch.
 */
function parseEventEndDate(value) {
  if (value == null || value === "") return null;
  const millis = timestampToMillis(value);
  return Number.isFinite(millis) ? new Date(millis) : null;
}

/**
 * TTL policy in one place: event end + 7 days, else 30 days from now. The
 * fallback also applies when the event ended so long ago that the computed
 * expiry is already in the past — an organizer re-sharing an old list gets a
 * usable window rather than a link that 404s on arrival.
 *
 * @param {{ eventEndsOn?: unknown, now?: Date }} [opts]
 * @returns {Date}
 */
function computePickTokenExpiry({ eventEndsOn = null, now = new Date() } = {}) {
  const reference = now instanceof Date ? now : new Date(now);
  const eventEnd = parseEventEndDate(eventEndsOn);
  if (eventEnd) {
    const afterEvent = new Date(
      eventEnd.getTime() + TOKEN_TTL_AFTER_EVENT_DAYS * DAY_MS,
    );
    if (afterEvent.getTime() > reference.getTime()) return afterEvent;
  }
  return new Date(reference.getTime() + TOKEN_TTL_FALLBACK_DAYS * DAY_MS);
}

/**
 * Mint token material WITHOUT touching the database.
 *
 * `event_pick_lists.token_hash` is NOT NULL, so the create path needs a hash
 * before the INSERT exists to update. Lane C's create handler uses this to
 * populate `token_hash` / `expires_at` on the row it is inserting and returns
 * `url` to the organizer once. Every other path uses `mintPickListToken`.
 *
 * @param {{ eventEndsOn?: unknown, now?: Date }} [opts]
 * @returns {{ rawToken: string, tokenHash: string, url: string, expiresAt: Date }}
 */
function buildPickListTokenMaterial(opts = {}) {
  const rawToken = generateTokenValue();
  return {
    rawToken,
    tokenHash: hashToken(rawToken),
    url: buildPickListUrl(rawToken),
    expiresAt: computePickTokenExpiry(opts),
  };
}

/**
 * Mint a token for an EXISTING pick list and persist its hash.
 *
 * The contract Lane C consumes. Returns the raw token exactly once — it is
 * never recoverable afterwards, because only the hash is stored.
 *
 * `reissue: true` is the explicit organizer action: it stamps `rotated_at`,
 * which immediately kills the previously emailed link. Calling without it
 * (e.g. minting for a list created with a placeholder) does not stamp
 * rotation. Either way the previous hash is overwritten, so this is never a
 * "resend the same link" operation — resending means emailing the URL the
 * create/reissue call already returned.
 *
 * @param {{ pickListId: string, db?: import('knex').Knex, reissue?: boolean }} args
 * @returns {Promise<{ rawToken: string, tokenHash: string, url: string, expiresAt: Date }>}
 */
async function mintPickListToken({ pickListId, db = knexDb, reissue = false }) {
  const id = String(pickListId || "").trim();
  if (!id) {
    const error = new Error("pickListId is required to mint a pick-list token");
    error.code = "PICK_LIST_ID_REQUIRED";
    throw error;
  }

  const row = await db("event_pick_lists as pl")
    .leftJoin("agency_open_call_links as l", "l.id", "pl.open_call_link_id")
    .where("pl.id", id)
    .first("pl.id", "l.event_ends_on as event_ends_on");

  if (!row) {
    const error = new Error("Pick list not found");
    error.code = "PICK_LIST_NOT_FOUND";
    throw error;
  }

  const material = buildPickListTokenMaterial({
    eventEndsOn: row.event_ends_on,
  });

  const patch = {
    token_hash: material.tokenHash,
    expires_at: material.expiresAt.toISOString(),
    updated_at: db.fn.now(),
  };
  if (reissue) patch.rotated_at = db.fn.now();

  await db("event_pick_lists").where({ id }).update(patch);

  return material;
}

/**
 * Resolve a raw token from a `/picks/:token` URL.
 *
 * Returns `null` — never a reason — for unknown, malformed, draft, revoked and
 * expired tokens. That sameness is the security property: the caller has
 * nothing to leak because it was told nothing.
 *
 * @param {string} raw
 * @param {{ db?: import('knex').Knex, now?: number }} [opts]
 * @returns {Promise<{ pickListId: string, agencyId: string, openCallLinkId: string,
 *   status: string, expiresAt: unknown } | null>}
 */
async function validatePickToken(raw, opts = {}) {
  const db = opts.db || knexDb;
  if (!raw || typeof raw !== "string") return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  const row = await db("event_pick_lists")
    .where({ token_hash: hashToken(trimmed) })
    .first(
      "id",
      "agency_id",
      "open_call_link_id",
      "status",
      "expires_at",
      "revoked_at",
      "submitted_at",
    );

  if (!row) return null;
  if (row.revoked_at) return null;
  if (!READABLE_PICK_LIST_STATUSES.includes(row.status)) return null;
  if (isExpired(row.expires_at, opts.now)) return null;

  return {
    pickListId: row.id,
    agencyId: row.agency_id,
    openCallLinkId: row.open_call_link_id,
    status: row.status,
    expiresAt: row.expires_at,
    submittedAt: row.submitted_at || null,
  };
}

/**
 * Only an `open`, unexpired list accepts writes. `closed` stays readable
 * (design §(d): "closed = read-only"), so this is a separate question from
 * whether the token resolves at all.
 *
 * @param {{ status?: string } | null} context - a validatePickToken result
 */
function isPickListWritable(context) {
  return Boolean(context) && context.status === PICK_LIST_STATUSES.OPEN;
}

/**
 * Open telemetry (design §(d), ruling R3): an organizer who can see a list
 * opened nine times from three cities can act on forwarding without Pholio
 * having to prevent it. Fire-and-forget — a telemetry failure must never cost
 * the designer their page.
 *
 * @param {string} pickListId
 * @param {{ db?: import('knex').Knex }} [opts]
 */
async function recordPickListOpen(pickListId, opts = {}) {
  const db = opts.db || knexDb;
  try {
    await db("event_pick_lists")
      .where({ id: pickListId })
      .update({
        open_count: db.raw("COALESCE(open_count, 0) + 1"),
        last_opened_at: db.fn.now(),
        updated_at: db.fn.now(),
      });
    await db("event_pick_lists")
      .where({ id: pickListId })
      .whereNull("first_opened_at")
      .update({ first_opened_at: db.fn.now() });
  } catch (error) {
    console.error("[PickListTokens] Failed to record open:", error.message);
  }
}

module.exports = {
  TOKEN_TTL_AFTER_EVENT_DAYS,
  TOKEN_TTL_FALLBACK_DAYS,
  READABLE_PICK_LIST_STATUSES,
  buildPickListUrl,
  buildPickListTokenMaterial,
  computePickTokenExpiry,
  generateTokenValue,
  hashToken,
  isExpired,
  isPickListWritable,
  mintPickListToken,
  recordPickListOpen,
  timestampToMillis,
  validatePickToken,
};
