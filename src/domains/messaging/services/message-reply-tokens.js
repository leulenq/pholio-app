const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const knex = require("../../../shared/db/knex");

// SEC-0.8: shortened from 7 days to reduce the replay window on magic links.
const TOKEN_TTL_DAYS = 3;

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

async function getApplicationContext(applicationId) {
  return knex("applications as a")
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

  const existing = await knex("message_reply_tokens")
    .where({ application_id: applicationId })
    .first();

  if (existing) {
    await knex("message_reply_tokens").where({ id: existing.id }).update({
      talent_user_id: talentUserId,
      token_hash: tokenHash,
      expires_at: expiresAt,
      updated_at: knex.fn.now(),
    });
  } else {
    await knex("message_reply_tokens").insert({
      id: uuidv4(),
      application_id: applicationId,
      talent_user_id: talentUserId,
      token_hash: tokenHash,
      expires_at: expiresAt,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now(),
    });
  }

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

  if (new Date(row.expires_at) < new Date()) {
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

async function touchReplyToken(tokenId) {
  await knex("message_reply_tokens").where({ id: tokenId }).update({
    last_used_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  });
}

module.exports = {
  TOKEN_TTL_DAYS,
  buildReplyUrl,
  hashToken,
  findByRawToken,
  createOrRefreshReplyToken,
  issueReplyTokenForApplication,
  validateReplyToken,
  touchReplyToken,
  resolveTalentUserIdForApplication,
  getApplicationContext,
};
