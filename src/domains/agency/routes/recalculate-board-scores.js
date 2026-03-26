const knex = require("../../../shared/db/knex");
const { calculateMatchScore } = require("../services/match-scoring");

async function recalculateBoardScores(boardId, agencyId) {
  const board = await knex("boards")
    .where({ id: boardId, agency_id: agencyId })
    .first();

  if (!board) return;

  const requirements = await knex("board_requirements")
    .where({ board_id: boardId })
    .first();

  const scoring_weights = await knex("board_scoring_weights")
    .where({ board_id: boardId })
    .first();

  if (!requirements || !scoring_weights) return;

  const parsedRequirements = {
    ...requirements,
    genders: requirements.genders ? JSON.parse(requirements.genders) : null,
    body_types: requirements.body_types
      ? JSON.parse(requirements.body_types)
      : null,
    comfort_levels: requirements.comfort_levels
      ? JSON.parse(requirements.comfort_levels)
      : null,
    experience_levels: requirements.experience_levels
      ? JSON.parse(requirements.experience_levels)
      : null,
    skills: requirements.skills ? JSON.parse(requirements.skills) : null,
    locations: requirements.locations
      ? JSON.parse(requirements.locations)
      : null,
  };

  const boardApplications = await knex("board_applications")
    .where({ board_id: boardId })
    .select("application_id");

  for (const ba of boardApplications) {
    const application = await knex("applications")
      .where({ id: ba.application_id, agency_id: agencyId })
      .first();

    if (!application) continue;

    const profile = await knex("profiles")
      .where({ id: application.profile_id })
      .first();

    if (!profile) continue;

    const matchResult = calculateMatchScore(profile, {
      requirements: parsedRequirements,
      scoring_weights,
    });

    await knex("board_applications")
      .where({ board_id: boardId, application_id: application.id })
      .update({
        match_score: matchResult.score,
        match_details: JSON.stringify(matchResult.details),
        updated_at: knex.fn.now(),
      });

    await knex("applications").where({ id: application.id }).update({
      match_score: matchResult.score,
      match_calculated_at: knex.fn.now(),
    });
  }
}

module.exports = { recalculateBoardScores };
