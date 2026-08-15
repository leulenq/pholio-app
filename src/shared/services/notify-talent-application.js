/**
 * Notify talent users when agency-side application events occur.
 */

const knex = require("../db/knex");
const { notifyTalentApplicationStatusChange } = require("./notifications");
const { DEFAULT_CALL_PURPOSE } = require("../constants/event-casting");

/**
 * The purpose decides the vocabulary the talent reads, so it is resolved from
 * the application itself rather than trusted from the caller — the auto-close
 * job knows it, an inbox status write may not, and a wrong purpose here means
 * a festival telling a model it has offered them representation.
 */
async function resolveCallPurpose(application) {
  if (application?.call_purpose) return application.call_purpose;
  if (!application?.id) return DEFAULT_CALL_PURPOSE;
  try {
    const row = await knex("applications")
      .where({ id: application.id })
      .select("call_purpose")
      .first();
    return row?.call_purpose || DEFAULT_CALL_PURPOSE;
  } catch {
    // Pre-migration schema: everything is a representation submission.
    return DEFAULT_CALL_PURPOSE;
  }
}

async function notifyTalentForApplicationStatus({
  application,
  agencyId,
  newStatus,
  previousStatus,
}) {
  if (!application?.profile_id || !newStatus) return;
  if (previousStatus && previousStatus === newStatus) return;

  const profile = await knex("profiles")
    .where({ id: application.profile_id })
    .select("user_id")
    .first();
  if (!profile?.user_id) return;

  const agency = await knex("agencies")
    .where({ id: agencyId })
    .select("name")
    .first();

  try {
    await notifyTalentApplicationStatusChange({
      userId: profile.user_id,
      applicationId: application.id,
      agencyId,
      agencyName: agency?.name,
      status: newStatus,
      purpose: await resolveCallPurpose(application),
      previousStatus: previousStatus || null,
    });
  } catch (err) {
    console.error("[Notifications] Application status notify failed:", err);
  }
}

module.exports = { notifyTalentForApplicationStatus };
