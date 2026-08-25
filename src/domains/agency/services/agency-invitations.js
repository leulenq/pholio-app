"use strict";

/**
 * Agency invitations — an agency's standing interest in a talent it found in
 * Discover, recorded as its own fact rather than as a placeholder application.
 *
 * See `migrations/20260820100000_create_agency_invitations.js` for why the two
 * were separated. In short: an invitation stored as an `applications` row
 * granted the agency submission-grade access (exact date of birth, email) to a
 * talent who had done nothing, and told that talent they had already applied.
 *
 * Every read here is guarded, because the routes that call them ship before the
 * migration runs. `applications.js`'s dashboard prompt is on the talent's first
 * screen — an unguarded query against a missing table takes that screen down for
 * every talent in the window between deploy and migrate. The guard resolves once
 * per process, following the same idiom as `hasOpenCallSchema` in
 * `open-call-claims.js`.
 */

let schemaPromise = null;

/**
 * Whether `agency_invitations` exists yet. Cached per process: the answer only
 * changes when a migration runs, which restarts the process.
 *
 * @param {import('knex')} db
 * @returns {Promise<boolean>}
 */
async function hasInvitationsSchema(db) {
  if (!schemaPromise) {
    schemaPromise = db.schema.hasTable("agency_invitations").catch(() => false);
  }
  return schemaPromise;
}

/** Test seam — the cache would otherwise outlive a suite's schema rebuild. */
function resetInvitationsSchemaCache() {
  schemaPromise = null;
}

/**
 * The standing invitation from this agency to this talent, if any.
 *
 * @param {import('knex')} db
 * @param {{ agencyId: string, profileId: string }} params
 * @returns {Promise<object|null>}
 */
async function findInvitation(db, { agencyId, profileId }) {
  if (!(await hasInvitationsSchema(db))) return null;
  return (
    (await db("agency_invitations")
      .where({ agency_id: agencyId, profile_id: profileId })
      .first()) || null
  );
}

/**
 * The most recent invitation any agency has sent this talent, joined to the
 * agency so the talent dashboard can name who is asking.
 *
 * @param {import('knex')} db
 * @param {string} profileId
 * @returns {Promise<object|null>}
 */
async function latestInvitationForProfile(db, profileId) {
  if (!(await hasInvitationsSchema(db))) return null;
  return (
    (await db("agency_invitations as i")
      .leftJoin("agencies as ag", "ag.id", "i.agency_id")
      .where("i.profile_id", profileId)
      .select(
        "i.agency_id as invited_by_agency_id",
        "i.created_at",
        "ag.id as agency_id",
        "ag.name as agency_name",
        "ag.location as agency_location",
        "ag.logo_path as agency_logo",
        "ag.website as agency_website",
      )
      .orderBy("i.created_at", "desc")
      .first()) || null
  );
}

/**
 * Profile ids this agency has already invited.
 *
 * @param {import('knex')} db
 * @param {string} agencyId
 * @returns {Promise<string[]>}
 */
async function invitedProfileIds(db, agencyId) {
  if (!(await hasInvitationsSchema(db))) return [];
  const rows = await db("agency_invitations")
    .where({ agency_id: agencyId })
    .select("profile_id");
  return rows.map((row) => row.profile_id);
}

/**
 * Record an invitation. Returns null when the schema is not present yet, so the
 * caller can answer honestly rather than reporting a send that did not happen.
 *
 * @param {import('knex')} db
 * @param {{ agencyId: string, profileId: string, id: string }} params
 * @returns {Promise<string|null>} the invitation id, or null if unavailable
 */
async function createInvitation(db, { agencyId, profileId, id }) {
  if (!(await hasInvitationsSchema(db))) return null;
  await db("agency_invitations").insert({
    id,
    agency_id: agencyId,
    profile_id: profileId,
    created_at: db.fn.now(),
    updated_at: db.fn.now(),
  });
  return id;
}

module.exports = {
  hasInvitationsSchema,
  resetInvitationsSchemaCache,
  findInvitation,
  latestInvitationForProfile,
  invitedProfileIds,
  createInvitation,
};
