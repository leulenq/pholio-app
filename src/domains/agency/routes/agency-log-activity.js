const { v4: uuidv4 } = require("uuid");

async function logActivity(
  knex,
  applicationId,
  agencyId,
  userId,
  activityType,
  description,
  metadata = {},
) {
  try {
    const activityUserId = userId
      ? await knex("users")
          .where({ id: userId })
          .first()
          .then((row) => row?.id || null)
      : null;

    await knex("application_activities").insert({
      id: uuidv4(),
      application_id: applicationId,
      agency_id: agencyId,
      user_id: activityUserId,
      activity_type: activityType,
      description,
      metadata: JSON.stringify(metadata),
      created_at: knex.fn.now(),
    });
  } catch (error) {
    console.error("[Activity Logging] Error:", error);
  }
}

module.exports = logActivity;
