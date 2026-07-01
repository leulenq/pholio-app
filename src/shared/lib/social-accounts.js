"use strict";

/**
 * Canonical `social_accounts` loader (Wave 2D — restores the join that
 * migration 20260629160000_create_social_accounts_table moved out of
 * `profiles`).
 *
 * Every reader that needs a profile's social links — owner editor, agency
 * discovery, agency submission snapshot — goes through this module instead of
 * hand-rolling its own `knex("social_accounts")` query. That keeps the
 * `verified` computation in exactly one place.
 *
 * `verified` MUST reflect real provider validation only, never a fabricated
 * value. `is_oauth_connected` is the only column that can set it true, and it
 * is only ever written true by:
 *   - the Phyllo-backed callback (`domains/talent/routes/phyllo-routes.js`),
 *     which is mounted in every environment; or
 *   - the mock/simulated OAuth callback (`domains/talent/routes/social-oauth.js`),
 *     which fabricates handles + follower/engagement metrics but is mounted
 *     ONLY when `NODE_ENV !== "production"` (see
 *     `domains/talent/routes/index.js`).
 * This loader does not (and must not) add any additional "trust this" logic —
 * it just reads the column. Honesty in production depends on the mock route
 * staying dev-gated, not on anything here.
 *
 * `oauth_token_encrypted` (a secret) is never selected by this module, even
 * though downstream shaping (`audience-dto.shapeSocialAccounts`,
 * `submission-profile.shapeSocialForSnapshot`) would also strip it. Defense
 * in depth: a secret that is never loaded can never leak.
 */

const knex = require("../db/knex");

const SAFE_COLUMNS = [
  "id",
  "profile_id",
  "platform",
  "handle",
  "url",
  "follower_count",
  "engagement_rate",
  "is_oauth_connected",
  "metrics_updated_at",
  "created_at",
  "updated_at",
];

function withVerified(row) {
  return { ...row, verified: Boolean(row.is_oauth_connected) };
}

/**
 * Load every social_accounts row for a single profile.
 *
 * @param {string|null|undefined} profileId
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
async function loadSocialAccountsForProfile(profileId) {
  if (!profileId) return [];
  const rows = await knex("social_accounts")
    .select(SAFE_COLUMNS)
    .where({ profile_id: profileId });
  return rows.map(withVerified);
}

/**
 * Batch-load social_accounts for many profiles in a single query, to avoid
 * N+1 queries across list/search readers (agency discover, applications list).
 *
 * @param {Array<string>} profileIds
 * @returns {Promise<Map<string, Array<Record<string, unknown>>>>} profile_id -> rows
 */
async function loadSocialAccountsForProfiles(profileIds) {
  const ids = [...new Set((profileIds || []).filter(Boolean))];
  const byProfile = new Map();
  if (ids.length === 0) return byProfile;

  const rows = await knex("social_accounts")
    .select(SAFE_COLUMNS)
    .whereIn("profile_id", ids);

  for (const row of rows) {
    const shaped = withVerified(row);
    if (!byProfile.has(row.profile_id)) byProfile.set(row.profile_id, []);
    byProfile.get(row.profile_id).push(shaped);
  }
  return byProfile;
}

module.exports = {
  loadSocialAccountsForProfile,
  loadSocialAccountsForProfiles,
};
