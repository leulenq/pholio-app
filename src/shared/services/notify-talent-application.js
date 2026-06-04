/**
 * Notify talent users when agency-side application events occur.
 */

const knex = require("../db/knex");
const { notifyTalentApplicationStatusChange } = require("./notifications");

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
    });
  } catch (err) {
    console.error("[Notifications] Application status notify failed:", err);
  }
}

module.exports = { notifyTalentForApplicationStatus };
