const { v4: uuidv4 } = require("uuid");
const { getSessionActorUserId } = require("../services/context");

async function logActivity(
  req,
  knex,
  applicationId,
  agencyId,
  activityType,
  description,
  metadata = {},
) {
  try {
    const actorUserId = getSessionActorUserId(req);
    const activityUserId = actorUserId
      ? await knex("users")
          .where({ id: actorUserId })
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
