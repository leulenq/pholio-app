/**
 * Application Helper Functions
 * Utilities for creating/upserting agency applications
 */

const { v4: uuidv4 } = require("uuid");
const knex = require("../../../shared/db/knex");

/**
 * Upsert application (create if not exists, update if exists)
 * Idempotent: ensures one application per profile per agency
 *
 * @param {string} profileId - Profile UUID
 * @param {string} agencyId - Agency UUID
 * @returns {Promise<Object>} Application record
 */
async function upsertApplication(profileId, agencyId) {
  if (!profileId || !agencyId) {
    throw new Error("Profile ID and Agency ID are required");
  }

  // Check if application already exists
  const existingApplication = await knex("applications")
    .where({
      profile_id: profileId,
      agency_id: agencyId,
    })
    .first();

  if (existingApplication) {
    // Application exists - update status to pending if needed
    if (existingApplication.status !== "pending") {
      await knex("applications").where({ id: existingApplication.id }).update({
        status: "pending",
        declined_at: null,
        accepted_at: null,
        updated_at: knex.fn.now(),
      });

      return await knex("applications")
        .where({ id: existingApplication.id })
        .first();
    }

    return existingApplication;
  }

  // Create new application
  const applicationId = uuidv4();
  await knex("applications").insert({
    id: applicationId,
    profile_id: profileId,
    agency_id: agencyId,
    status: "pending",
    invited_by_agency_id: null,
    created_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  });

  return await knex("applications").where({ id: applicationId }).first();
}

module.exports = {
  upsertApplication,
};
