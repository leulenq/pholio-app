const crypto = require("crypto");
const { v4: uuidv4 } = require("uuid");
const knex = require("../../../shared/db/knex");

const TOKEN_TTL_DAYS = 7;

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
  const existing = await knex("message_reply_tokens")
    .where({ application_id: applicationId })
    .first();

  if (existing) {
    await knex("message_reply_tokens").where({ id: existing.id }).update({
      talent_user_id: talentUserId,
      expires_at: expiresAt,
      updated_at: knex.fn.now(),
    });

    return {
      token: existing.token,
      expiresAt,
      replyUrl: buildReplyUrl(existing.token),
    };
  }

  const token = generateTokenValue();
  await knex("message_reply_tokens").insert({
    id: uuidv4(),
    application_id: applicationId,
    talent_user_id: talentUserId,
    token,
    expires_at: expiresAt,
    created_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  });

  return {
    token,
    expiresAt,
    replyUrl: buildReplyUrl(token),
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

async function validateReplyToken(token) {
  if (!token || typeof token !== "string") {
    return null;
  }

  const row = await knex("message_reply_tokens")
    .where({ token: token.trim() })
    .first();

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
    token: row.token,
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
  createOrRefreshReplyToken,
  issueReplyTokenForApplication,
  validateReplyToken,
  touchReplyToken,
  resolveTalentUserIdForApplication,
  getApplicationContext,
};
