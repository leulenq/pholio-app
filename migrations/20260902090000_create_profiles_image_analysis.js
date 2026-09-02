"use strict";

/**
 * Create the three `profiles` columns the vision pipeline has always written
 * to and never had.
 *
 * `src/domains/ai/analyzeProfileImage.js` (masterVisionAnalysis) writes
 * `image_analysis`, `image_analyzed_at` and `image_analysis_model` on every
 * successful analysis. No migration has ever created them, in any
 * environment: `migrations/add_image_analysis.sql` was a hand-run psql file
 * Knex never executes, so the write threw, `persistProfileImageAiUpdate`'s
 * caller swallowed the error, and the pipeline has been a no-op in
 * production. `20260824090000_reconcile_profiles_ai_drift.js` documented this
 * as "a standing bug ... left alone on purpose", deferring the product call
 * to a change that was about schema reconciliation. This is that change.
 *
 * WHY CREATE THEM RATHER THAN DELETE THE WRITE
 *
 * The output has live readers on the talent's own comp card:
 *
 *   - `domains/pdf/generator.js` loadProfile() selects the whole profiles row,
 *     so the column reaches composition as soon as it exists.
 *   - `domains/pdf/composition/index.js` composeCompCard() parses it into
 *     `castingAnalysis`, which feeds buildStatsBlock (marketSignals, lookType)
 *     and analyzeImagePool's hero ranking.
 *   - `domains/pdf/routes/pdf.js` calls composeCompCard on the render path and
 *     again in freezePresetPlan.
 *
 * Commit 3c21c8d ("Stop the machine judging the person") drew the line
 * deliberately: the judging layer — scoreFromImageAnalysis,
 * generateLookDescriptor, profiles.archetype — was removed, and
 * castingAnalysis was KEPT, because "describing a photograph so it can be laid
 * out well is a different act" from inferring a person. So the description
 * survives and needs somewhere to live.
 *
 * WHAT THIS DOES NOT DO
 *
 * It does not start analysing anyone. masterVisionAnalysis re-reads DOB,
 * purpose-specific consent and the deployment flag before every provider call
 * and again inside `persistProfileImageAiUpdate` before writing. Minors are
 * excluded outright. Nothing runs without GROQ_API_KEY.
 *
 * It adds no identity or skin-tone field. `SENSITIVE_VISION_KEYS`
 * (skinTone, measurementEstimates) are stripped from the model's output before
 * it is serialised, and `scripts/strip-vision-sensitive-fields.js` scrubs any
 * historical row — the column holds a description of a photograph, never a
 * classification of a face.
 *
 * The stale `migrations/add_image_analysis.sql` is deleted in the same change:
 * besides never running, it also re-added `look_descriptor` /
 * `look_descriptor_generated_at`, which 20260820120000 removed on purpose.
 *
 * @param {import('knex')} knex
 */

/**
 * NOT transactional, for the reason 20260824090000 and 20260820090000 give:
 * SQLite has no DROP COLUMN, so `down` makes knex rebuild `profiles`, and its
 * `PRAGMA foreign_keys = OFF` guard is silently ignored inside a transaction —
 * the rebuild then cascades through `applications.profile_id` and empties it.
 */
exports.config = { transaction: false };

const isPostgres = (knex) =>
  ["pg", "postgresql"].includes(knex.client.config.client);

exports.up = async function up(knex) {
  const missing = [];
  for (const column of [
    "image_analysis",
    "image_analyzed_at",
    "image_analysis_model",
  ]) {
    if (!(await knex.schema.hasColumn("profiles", column))) missing.push(column);
  }

  if (missing.length === 0) {
    console.log(
      "[Migration] profiles already has the image analysis columns — nothing to add",
    );
    return;
  }

  await knex.schema.alterTable("profiles", (table) => {
    if (missing.includes("image_analysis")) {
      // JSONB where the database has it; the code JSON.stringify()s on the way
      // in and parses defensively on the way out, so text is a faithful
      // fallback on SQLite.
      if (isPostgres(knex)) table.jsonb("image_analysis").nullable();
      else table.text("image_analysis").nullable();
    }
    if (missing.includes("image_analyzed_at")) {
      table.timestamp("image_analyzed_at").nullable();
    }
    if (missing.includes("image_analysis_model")) {
      table.string("image_analysis_model", 100).nullable();
    }
  });

  console.log(
    `[Migration] Added profiles column(s): ${missing.join(", ")}`,
  );
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  const present = [];
  for (const column of [
    "image_analysis",
    "image_analyzed_at",
    "image_analysis_model",
  ]) {
    if (await knex.schema.hasColumn("profiles", column)) present.push(column);
  }
  if (present.length === 0) return;

  await knex.schema.alterTable("profiles", (table) => {
    for (const column of present) table.dropColumn(column);
  });
};
