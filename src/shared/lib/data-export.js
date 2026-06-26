/**
 * GDPR / privacy data export assembly for talent accounts.
 */

const PROFILE_AI_COLUMNS = [
  "vibe_score",
  "is_unicorn",
  "vector_summary",
  "photo_embedding",
  "archetype",
  "analysis_status",
  "analysis_error",
  "image_analysis",
  "fit_score_runway",
  "fit_score_editorial",
  "fit_score_commercial",
  "fit_score_lifestyle",
  "fit_score_swim_fitness",
  "fit_score_overall",
  "fit_scores_calculated_at",
  "market_fit_rankings",
  "modeling_categories",
];

function serializeVector(value) {
  if (value == null) return null;
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
  return value;
}

function formatUserForExport(user) {
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    createdAt: user.created_at,
    termsAcceptedAt: user.terms_accepted_at ?? null,
    termsAcceptedVersion: user.terms_accepted_version ?? null,
    privacyAcceptedAt: user.privacy_accepted_at ?? null,
    privacyAcceptedVersion: user.privacy_accepted_version ?? null,
  };
}

async function extractProfileAiFields(knex, profile) {
  if (!profile) return null;

  const fields = {};
  let hasAny = false;

  for (const column of PROFILE_AI_COLUMNS) {
    if (!(await knex.schema.hasColumn("profiles", column))) continue;
    if (profile[column] === undefined) continue;
    hasAny = true;
    if (column === "vector_summary" || column === "photo_embedding") {
      fields[column] = serializeVector(profile[column]);
    } else {
      fields[column] = profile[column];
    }
  }

  return hasAny ? fields : null;
}

async function loadImageRights(knex, imageIds) {
  if (!imageIds.length) return [];
  if (!(await knex.schema.hasTable("image_rights"))) return [];
  return knex("image_rights").whereIn("image_id", imageIds);
}

async function loadMessages(knex, applicationIds) {
  if (!applicationIds.length) return [];
  if (!(await knex.schema.hasTable("messages"))) return [];
  return knex("messages")
    .whereIn("application_id", applicationIds)
    .orderBy("created_at", "asc");
}

/**
 * Build a structured JSON export payload for a talent user.
 * @param {import('knex').Knex} knex
 * @param {string} userId
 * @returns {Promise<object>}
 */
async function buildTalentDataExport(knex, userId) {
  const user = await knex("users").where({ id: userId }).first();
  const profile = await knex("profiles").where({ user_id: userId }).first();
  const profileId = profile?.id || null;

  const [
    images,
    applications,
    onboarding_signals,
    ai_profile_analysis,
    talent_user_settings,
  ] = await Promise.all([
    profileId
      ? knex("images").where({ profile_id: profileId }).orderBy("sort", "asc")
      : [],
    profileId
      ? knex("applications")
          .where({ profile_id: profileId })
          .orderBy("created_at", "desc")
      : [],
    profileId && (await knex.schema.hasTable("onboarding_signals"))
      ? knex("onboarding_signals").where({ profile_id: profileId }).first()
      : null,
    profileId && (await knex.schema.hasTable("ai_profile_analysis"))
      ? knex("ai_profile_analysis").where({ profile_id: profileId }).first()
      : null,
    (await knex.schema.hasTable("talent_user_settings"))
      ? knex("talent_user_settings").where({ user_id: userId }).first()
      : null,
  ]);

  const applicationIds = applications.map((row) => row.id);
  const imageIds = images.map((row) => row.id);

  const [messages, image_rights, profile_ai_fields] = await Promise.all([
    loadMessages(knex, applicationIds),
    loadImageRights(knex, imageIds),
    extractProfileAiFields(knex, profile),
  ]);

  return {
    user: formatUserForExport(user),
    profile,
    images,
    image_rights,
    applications,
    messages,
    onboarding_signals,
    ai_profile_analysis,
    profile_ai_fields,
    talent_user_settings,
  };
}

module.exports = {
  buildTalentDataExport,
  PROFILE_AI_COLUMNS,
};
