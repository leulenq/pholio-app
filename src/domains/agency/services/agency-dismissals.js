"use strict";

/**
 * Agency dismissals — "not for us", the private half of the Scout bar.
 *
 * See `migrations/20260903100000_create_agency_dismissed_profiles.js` for why
 * the record carries nothing but the pair and a timestamp. Everything here is
 * agency-scoped: a dismissal is one agency's view state and is never read,
 * shown, or notified to the talent, and never read across agencies.
 *
 * Every read is guarded for the deploy-before-migrate window, following
 * `agency-invitations.js` exactly. Discover is the surface these calls sit
 * behind, and a search that 500s because a table has not been created yet is a
 * worse outcome than a search that shows a lead the agency had dismissed.
 */

let schemaPromise = null;

/**
 * Whether `agency_dismissed_profiles` exists yet. Cached per process: the
 * answer only changes when a migration runs, which restarts the process.
 *
 * @param {import('knex')} db
 * @returns {Promise<boolean>}
 */
async function hasDismissalsSchema(db) {
  if (!schemaPromise) {
    schemaPromise = db.schema
      .hasTable("agency_dismissed_profiles")
      .catch(() => false);
  }
  return schemaPromise;
}

/** Test seam — the cache would otherwise outlive a suite's schema rebuild. */
function resetDismissalsSchemaCache() {
  schemaPromise = null;
}

/**
 * This agency's dismissal of this talent, if any.
 *
 * @param {import('knex')} db
 * @param {{ agencyId: string, profileId: string }} params
 * @returns {Promise<object|null>}
 */
async function findDismissal(db, { agencyId, profileId }) {
  if (!agencyId || !profileId) return null;
  if (!(await hasDismissalsSchema(db))) return null;
  return (
    (await db("agency_dismissed_profiles")
      .where({ agency_id: agencyId, profile_id: profileId })
      .first()) || null
  );
}

/**
 * Profile ids this agency has dismissed, as an exclusion set for Discover.
 *
 * @param {import('knex')} db
 * @param {string} agencyId
 * @returns {Promise<Set<string>>}
 */
async function dismissedProfileIds(db, agencyId) {
  const ids = new Set();
  if (!agencyId) return ids;
  if (!(await hasDismissalsSchema(db))) return ids;

  try {
    const rows = await db("agency_dismissed_profiles")
      .where({ agency_id: agencyId })
      .select("profile_id");
    for (const row of rows) {
      if (row.profile_id) ids.add(row.profile_id);
    }
  } catch {
    // A dismissal is a preference, never a gate. If the store cannot be read
    // the search runs unfiltered rather than failing.
  }

  return ids;
}

/**
 * Record a dismissal. Idempotent: dismissing an already-dismissed profile is
 * the same fact and keeps the original timestamp.
 *
 * @param {import('knex')} db
 * @param {{ agencyId: string, profileId: string, id: string }} params
 * @returns {Promise<boolean>} whether the store was available
 */
async function createDismissal(db, { agencyId, profileId, id }) {
  if (!(await hasDismissalsSchema(db))) return false;

  const existing = await db("agency_dismissed_profiles")
    .where({ agency_id: agencyId, profile_id: profileId })
    .first();
  if (existing) return true;

  await db("agency_dismissed_profiles").insert({
    id,
    agency_id: agencyId,
    profile_id: profileId,
    created_at: db.fn.now(),
  });
  return true;
}

/**
 * Undo a dismissal. Idempotent: removing one that is not there succeeds.
 *
 * @param {import('knex')} db
 * @param {{ agencyId: string, profileId: string }} params
 * @returns {Promise<boolean>} whether the store was available
 */
async function removeDismissal(db, { agencyId, profileId }) {
  if (!(await hasDismissalsSchema(db))) return false;
  await db("agency_dismissed_profiles")
    .where({ agency_id: agencyId, profile_id: profileId })
    .del();
  return true;
}

module.exports = {
  hasDismissalsSchema,
  resetDismissalsSchemaCache,
  findDismissal,
  dismissedProfileIds,
  createDismissal,
  removeDismissal,
};
