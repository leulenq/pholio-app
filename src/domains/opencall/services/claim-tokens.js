"use strict";

/**
 * `applicant_claim_tokens` — the magic link
 * (`docs/open-call-applicant-flow-design-2026-08.md` §3.3, §5.2, §5.4, §5.5).
 *
 * The idiom is `src/domains/messaging/services/message-reply-tokens.js`, kept
 * deliberately identical so there is one shape of hashed magic link in this
 * codebase: mint a raw base64url value, persist **only** its sha256 hex digest,
 * and let the raw value exist nowhere but inside the emailed URL. A database
 * dump therefore contains no usable credential.
 *
 * Three purposes, one table:
 *   claim      — "Keep it — takes one tap" (§5.2). Opens a session on a new
 *                account and is the act that sets `email_verified` (ruling Q4).
 *   disown     — "Didn't apply to this? That wasn't me" (§5.5).
 *   materials  — the shortlist-stage fulfilment page (§5.4), no account needed.
 *
 * TWO RULES THAT DIFFER FROM REPLY TOKENS, both on purpose:
 *
 *  - **Minting does not revoke.** Reply tokens rotate (one row per
 *    application). Here a re-send is a new row, so an applicant who is emailed
 *    a receipt for Brooklyn and then one for Queens can still use whichever
 *    message they find first. Multiple valid tokens may exist at once.
 *  - **Single use is enforced at consume**, by the conditional update in
 *    `consumeClaimToken` — the same replay boundary `consumeClaim` uses. A
 *    magic link that survived its own click would let a forwarded email open a
 *    session on someone else's new account.
 *
 * Validation is a no-oracle boundary: unknown, expired, consumed and
 * purpose-mismatched all return exactly `null`. A caller cannot distinguish
 * "never existed" from "already used", so a URL-guessing probe learns nothing.
 */

const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");

const TOKENS_TABLE = "applicant_claim_tokens";

const CLAIM_TOKEN_PURPOSES = Object.freeze({
  CLAIM: "claim",
  DISOWN: "disown",
  MATERIALS: "materials",
});
const CLAIM_TOKEN_PURPOSE_VALUES = Object.freeze(
  Object.values(CLAIM_TOKEN_PURPOSES),
);

/**
 * Default lifetimes.
 *
 * Claim and disown are both 30 days because they ride the same receipt email
 * and an applicant who opens their mail a fortnight later is the normal case,
 * not an attack. Materials is 14 days because it carries a due date the
 * organizer set and a fulfilment window that outlives the shortlist is a
 * deadline nobody is waiting on. Shorter than a `message_reply_tokens` TTL is
 * not available here: this link's whole job is to survive the gap between
 * pressing send and reading email.
 */
const CLAIM_TOKEN_TTL_DAYS = Object.freeze({
  [CLAIM_TOKEN_PURPOSES.CLAIM]: 30,
  [CLAIM_TOKEN_PURPOSES.DISOWN]: 30,
  [CLAIM_TOKEN_PURPOSES.MATERIALS]: 14,
});

/**
 * The client routes these paths resolve to are built by a later lane. The paths
 * themselves are the contract, and they are spelled once, here.
 */
const CLAIM_TOKEN_PATHS = Object.freeze({
  [CLAIM_TOKEN_PURPOSES.CLAIM]: "/opencall/claim",
  [CLAIM_TOKEN_PURPOSES.DISOWN]: "/opencall/disown",
  [CLAIM_TOKEN_PURPOSES.MATERIALS]: "/opencall/materials",
});

/** Same resolution order as message-reply-tokens' getAppBaseUrl. */
function getAppBaseUrl() {
  return (
    process.env.APP_URL ||
    process.env.VITE_APP_URL ||
    (process.env.NODE_ENV === "production"
      ? "https://app.pholio.studio"
      : "http://localhost:5173")
  );
}

function generateTokenValue() {
  return crypto.randomBytes(32).toString("base64url");
}

/** sha256 hex of the raw token. The only representation ever persisted. */
function hashToken(raw) {
  return crypto.createHash("sha256").update(String(raw)).digest("hex");
}

function buildClaimTokenUrl(purpose, rawToken) {
  const path = CLAIM_TOKEN_PATHS[purpose];
  if (!path) {
    const error = new Error(`Unknown claim token purpose: ${String(purpose)}`);
    error.code = "CLAIM_TOKEN_PURPOSE_INVALID";
    throw error;
  }
  const base = getAppBaseUrl().replace(/\/$/, "");
  return `${base}${path}/${rawToken}`;
}

function addDays(date, days) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/**
 * Knex/SQLite can return timestamps as millisecond strings while PostgreSQL
 * returns Date objects or ISO strings. Normalize every representation so an
 * unparsable value FAILS CLOSED instead of silently bypassing expiry.
 * (Verbatim from message-reply-tokens.js — the same bug is available here.)
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
 * Mint a token for one purpose against one identity.
 *
 * @param {import('knex')} db
 * @param {{identityId: string, purpose: string, ttlDays?: number}} input
 * @returns {Promise<{tokenId: string, rawToken: string, tokenHash: string, url: string, expiresAt: Date, purpose: string}>}
 */
async function mintClaimToken(db, { identityId, purpose, ttlDays } = {}) {
  if (!identityId) {
    const error = new Error("identityId is required");
    error.code = "CLAIM_TOKEN_IDENTITY_REQUIRED";
    throw error;
  }
  if (!CLAIM_TOKEN_PURPOSE_VALUES.includes(purpose)) {
    const error = new Error(`Unknown claim token purpose: ${String(purpose)}`);
    error.code = "CLAIM_TOKEN_PURPOSE_INVALID";
    throw error;
  }

  const days =
    Number.isFinite(ttlDays) && ttlDays > 0
      ? ttlDays
      : CLAIM_TOKEN_TTL_DAYS[purpose];
  const expiresAt = addDays(new Date(), days);

  const rawToken = generateTokenValue();
  const tokenHash = hashToken(rawToken);
  const id = uuidv4();

  await db(TOKENS_TABLE).insert({
    id,
    applicant_identity_id: identityId,
    token_hash: tokenHash,
    purpose,
    expires_at: expiresAt.toISOString(),
    created_at: db.fn.now(),
  });

  // The RAW token is returned once, for the emailed URL, and is never written
  // to the database.
  return {
    tokenId: id,
    rawToken,
    tokenHash,
    purpose,
    expiresAt,
    url: buildClaimTokenUrl(purpose, rawToken),
  };
}

/**
 * Look a token up by its raw value WITHOUT judging it, together with its
 * identity.
 *
 * Exists for one narrow job: the claim route has to answer a second click on
 * the same email link with "you're already set up, sign in" rather than a dead
 * end (§5.2's link is going to be clicked twice — that is what email clients
 * and link previewers do). Answering that needs to see a consumed row, which
 * `validateClaimToken` deliberately cannot show. This is not an oracle: the
 * caller already holds the raw token, so it learns nothing it did not present.
 *
 * @returns {Promise<{token: object, identity: object}|null>}
 */
async function findClaimTokenByRawToken(db, rawToken, purpose) {
  if (!rawToken || typeof rawToken !== "string") return null;
  const trimmed = rawToken.trim();
  if (!trimmed) return null;

  const token = await db(TOKENS_TABLE)
    .where({ token_hash: hashToken(trimmed) })
    .first();
  if (!token) return null;
  if (purpose && token.purpose !== purpose) return null;

  const identity = await db("applicant_identities")
    .where({ id: token.applicant_identity_id })
    .first();
  if (!identity) return null;

  return { token, identity };
}

/**
 * Resolve a usable token, or null.
 *
 * Unknown / expired / already consumed / wrong purpose are ALL null, with no
 * distinguishing signal — see the module header.
 *
 * @returns {Promise<{token: object, identity: object}|null>}
 */
async function validateClaimToken(db, rawToken, purpose) {
  if (!CLAIM_TOKEN_PURPOSE_VALUES.includes(purpose)) return null;
  const found = await findClaimTokenByRawToken(db, rawToken, purpose);
  if (!found) return null;
  if (found.token.consumed_at) return null;
  if (isExpired(found.token.expires_at)) return null;
  return found;
}

/**
 * Spend the token. Conditional update — the replay boundary, on both SQLite and
 * PostgreSQL, exactly as `consumeClaim` in open-call-claims.js. Throws
 * CLAIM_TOKEN_CONFLICT when another request got there first; the caller treats
 * that like any other single-use collision.
 *
 * @param {import('knex').Knex.Transaction} trx
 * @param {string} tokenId
 */
async function consumeClaimToken(trx, tokenId) {
  const updated = await trx(TOKENS_TABLE)
    .where({ id: tokenId })
    .whereNull("consumed_at")
    .update({ consumed_at: trx.fn.now() });

  if (updated !== 1) {
    const error = new Error("This link has already been used");
    error.code = "CLAIM_TOKEN_CONFLICT";
    throw error;
  }
}

module.exports = {
  CLAIM_TOKEN_PATHS,
  CLAIM_TOKEN_PURPOSES,
  CLAIM_TOKEN_PURPOSE_VALUES,
  CLAIM_TOKEN_TTL_DAYS,
  TOKENS_TABLE,
  buildClaimTokenUrl,
  consumeClaimToken,
  findClaimTokenByRawToken,
  getAppBaseUrl,
  hashToken,
  isExpired,
  mintClaimToken,
  timestampToMillis,
  validateClaimToken,
};
