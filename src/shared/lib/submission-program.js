const CURRENT_SUBMISSION_PROGRAM_VERSION = "2026-06-29";

async function recordSubmissionProgramAcknowledgment(knex, userId) {
  if (!knex) {
    throw new Error("knex instance is required");
  }

  if (!userId) {
    throw new Error("userId is required");
  }

  await knex("users").where({ id: userId }).update({
    submission_program_acknowledged_at: knex.fn.now(),
    submission_program_acknowledged_version: CURRENT_SUBMISSION_PROGRAM_VERSION,
  });

  return true;
}

function requireSubmissionProgramAcknowledgment(user, options = {}) {
  const hasAcknowledged =
    Boolean(user?.submission_program_acknowledged_at) &&
    user?.submission_program_acknowledged_version ===
      CURRENT_SUBMISSION_PROGRAM_VERSION;

  if (hasAcknowledged) {
    return true;
  }

  if (options.throwOnMissing === false) {
    return false;
  }

  const error = new Error("Submission program acknowledgment required");
  error.code = "SUBMISSION_PROGRAM_ACKNOWLEDGMENT_REQUIRED";
  throw error;
}

module.exports = {
  CURRENT_SUBMISSION_PROGRAM_VERSION,
  recordSubmissionProgramAcknowledgment,
  requireSubmissionProgramAcknowledgment,
};
