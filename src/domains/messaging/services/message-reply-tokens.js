const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const knex = require("../../../shared/db/knex");

// SEC-0.8: shortened from 7 days to reduce the replay window on magic links.
const TOKEN_TTL_DAYS = 3;
const SESSION_TOKEN_TTL_MINUTES = 10;

function getAppBaseUrl() {
  return (
    process.env.APP_URL ||
    process.env.VITE_APP_URL ||
    (process.env.NODE_ENV === "production"
      ? "https://app.pholio.studio"
      : "http://localhost:5173")
  );
}

function buildReplyUrl(token) {
  const base = getAppBaseUrl().replace(/\/$/, "");
  return `${base}/reply/${token}`;
}

function generateTokenValue() {
  return crypto.randomBytes(32).toString("base64url");
}

// SEC-0.8: sha256 hex digest of the raw token. Only this hash is persisted; the
// raw token lives solely inside the emailed reply URL. Mirrors the guardian
// consent idiom (see domains/talent/services/guardian-consent.js hashToken).
function hashToken(raw) {
  return crypto.createHash("sha256").update(String(raw)).digest("hex");
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60 * 1000);
}

// Knex/SQLite can return timestamp values as millisecond strings while
// PostgreSQL returns Date objects or ISO strings. Normalize every representation
// so an unparsable value fails closed instead of silently bypassing expiry.
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

async function getApplicationContext(applicationId, db = knex) {
  return db("applications as a")
    .join("profiles as p", "a.profile_id", "p.id")
    .join("users as u", "p.user_id", "u.id")
    .leftJoin("agencies as ag", "a.agency_id", "ag.id")
    .where("a.id", applicationId)
    .select(
      "a.id as application_id",
      "a.agency_id",
      "p.id as profile_id",
      "p.first_name as talent_first_name",
      "p.last_name as talent_last_name",
      "u.id as talent_user_id",
      "u.email as talent_email",
      "ag.name as agency_name",
    )
    .first();
}

async function resolveTalentUserIdForApplication(applicationId) {
  const ctx = await getApplicationContext(applicationId);
  return ctx?.talent_user_id || null;
}

async function createOrRefreshReplyToken({ applicationId, talentUserId }) {
  const expiresAt = addDays(new Date(), TOKEN_TTL_DAYS);

  // SEC-0.8: always mint a fresh raw token and store ONLY its hash. Because the
  // raw value is never persisted, a refresh cannot recover a previously-issued
  // token to re-embed in a new email — so each issue/refresh ROTATES the token:
  // the most recently emailed link is the valid one. Within its TTL that link
  // stays REUSABLE (talent may reply multiple times); rotation is per issuance,
  // not per use, so the flow is not strictly single-use. We keep the one-row-per-
  // application upsert semantics of the original design.
  const rawToken = generateTokenValue();
  const tokenHash = hashToken(rawToken);

  await knex.transaction(async (trx) => {
    const existing = await trx("message_reply_tokens")
      .where({ application_id: applicationId })
      .first();

    if (existing) {
      // A newly emailed reply credential is a new security epoch. Invalidate
      // any bootstrap credential issued from the previous raw token before
      // rotating its stored hash.
      await trx("message_reply_session_tokens")
        .where({ reply_token_id: existing.id })
        .del();
      await trx("message_reply_tokens").where({ id: existing.id }).update({
        talent_user_id: talentUserId,
        token_hash: tokenHash,
        expires_at: expiresAt.toISOString(),
        updated_at: trx.fn.now(),
      });
      return;
    }

    await trx("message_reply_tokens").insert({
      id: uuidv4(),
      application_id: applicationId,
      talent_user_id: talentUserId,
      token_hash: tokenHash,
      expires_at: expiresAt.toISOString(),
      created_at: trx.fn.now(),
      updated_at: trx.fn.now(),
    });
  });

  // Return the RAW token to the caller so it can be placed in the emailed URL.
  // The raw token is never written to the database — only tokenHash is.
  return {
    token: rawToken,
    expiresAt,
    replyUrl: buildReplyUrl(rawToken),
  };
}

async function issueReplyTokenForApplication(applicationId) {
  const ctx = await getApplicationContext(applicationId);
  if (!ctx?.talent_user_id) {
    return null;
  }

  return createOrRefreshReplyToken({
    applicationId,
    talentUserId: ctx.talent_user_id,
  });
}

// SEC-0.8: look up a token row by hashing the raw token supplied by the caller
// (from the magic-link URL) and matching against the stored token_hash. The raw
// token is never compared against a plaintext column because none exists anymore.
async function findByRawToken(raw) {
  if (!raw || typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  return knex("message_reply_tokens")
    .where({ token_hash: hashToken(trimmed) })
    .first();
}

async function validateReplyToken(token) {
  const row = await findByRawToken(token);

  if (!row) {
    return null;
  }

  if (isExpired(row.expires_at)) {
    return null;
  }

  const ctx = await getApplicationContext(row.application_id);
  if (!ctx || ctx.talent_user_id !== row.talent_user_id) {
    return null;
  }

  return {
    tokenId: row.id,
    applicationId: row.application_id,
    talentUserId: row.talent_user_id,
    agencyId: ctx.agency_id,
    agencyName: ctx.agency_name || "Agency",
    talentFirstName: ctx.talent_first_name || "",
    talentLastName: ctx.talent_last_name || "",
    talentEmail: ctx.talent_email || "",
    expiresAt: row.expires_at,
  };
}

/**
 * Mint the only dashboard-bootstrap credential allowed for the current emailed
 * reply-token rotation. The raw value is returned once and only its hash is
 * persisted. The unique reply_token_id constraint closes concurrent re-issue
 * races; callers must rotate/re-email the reply token to start a new epoch.
 */
async function issueReplySessionToken(replyContext) {
  const rawToken = generateTokenValue();
  const expiresAt = addMinutes(new Date(), SESSION_TOKEN_TTL_MINUTES);

  try {
    await knex("message_reply_session_tokens").insert({
      id: uuidv4(),
      reply_token_id: replyContext.tokenId,
      talent_user_id: replyContext.talentUserId,
      token_hash: hashToken(rawToken),
      expires_at: expiresAt.toISOString(),
      created_at: knex.fn.now(),
    });
  } catch (error) {
    // SQLite and Postgres expose unique violations differently. A direct lookup
    // makes the domain result deterministic without depending on driver codes.
    const existing = await knex("message_reply_session_tokens")
      .where({ reply_token_id: replyContext.tokenId })
      .first("id");
    if (existing) {
      const alreadyIssued = new Error(
        "A dashboard access token has already been issued for this reply link",
      );
      alreadyIssued.code = "REPLY_SESSION_TOKEN_ALREADY_ISSUED";
      throw alreadyIssued;
    }
    throw error;
  }

  return { token: rawToken, expiresAt };
}

/**
 * Atomically consume a one-time session credential. The conditional update is
 * the replay boundary: only one concurrent request can change consumed_at from
 * NULL, on both SQLite and Postgres.
 */
async function consumeReplySessionToken(rawToken) {
  if (!rawToken || typeof rawToken !== "string" || !rawToken.trim()) {
    return null;
  }

  return knex.transaction(async (trx) => {
    const row = await trx("message_reply_session_tokens")
      .where({ token_hash: hashToken(rawToken.trim()) })
      .first();

    if (
      !row ||
      row.consumed_at ||
      isExpired(row.expires_at)
    ) {
      return null;
    }

    const consumed = await trx("message_reply_session_tokens")
      .where({ id: row.id })
      .whereNull("consumed_at")
      .update({ consumed_at: trx.fn.now() });

    if (consumed !== 1) {
      return null;
    }

    const replyToken = await trx("message_reply_tokens")
      .where({ id: row.reply_token_id, talent_user_id: row.talent_user_id })
      .first();
    if (
      !replyToken ||
      isExpired(replyToken.expires_at)
    ) {
      return null;
    }

    const ctx = await getApplicationContext(replyToken.application_id, trx);
    if (!ctx || ctx.talent_user_id !== row.talent_user_id) {
      return null;
    }

    return {
      tokenId: row.id,
      applicationId: replyToken.application_id,
      talentUserId: row.talent_user_id,
      agencyId: ctx.agency_id,
    };
  });
}

async function touchReplyToken(tokenId) {
  await knex("message_reply_tokens").where({ id: tokenId }).update({
    last_used_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  });
}

module.exports = {
  TOKEN_TTL_DAYS,
  SESSION_TOKEN_TTL_MINUTES,
  buildReplyUrl,
  hashToken,
  timestampToMillis,
  findByRawToken,
  createOrRefreshReplyToken,
  issueReplyTokenForApplication,
  validateReplyToken,
  issueReplySessionToken,
  consumeReplySessionToken,
  touchReplyToken,
  resolveTalentUserIdForApplication,
  getApplicationContext,
};
