"use strict";

/**
 * Make `migrations/` describe the `profiles` table production actually has.
 *
 * A database built from this repo produced 142 columns on `profiles`.
 * Production has 111. The 34 columns below exist only in the migration
 * history: production dropped them, and no migration in this repo records
 * that. It is the same pattern `20260728200000_drop_profiles_ai_processing_
 * consent.js` documents — "the migration that created it was deleted from the
 * repo after being applied to production" — and it leaves the repo unable to
 * reproduce its own production schema, which is how the drift stayed invisible.
 *
 * Direction of the fix matters. Production is the correct state here, not the
 * damaged one: every column below is legacy inference, telemetry, or a
 * duplicate of somewhere the live code already writes. Restoring them would
 * re-create a compliance surface the product deliberately removed. So the
 * migrations move to meet production, not the other way round.
 *
 * WHAT EACH GROUP IS, AND WHY NOTHING BREAKS
 *
 *  1. fit_score_* / fit_scores_calculated_at (7)
 *     Persisted output of the Casting Reveal, which is gone — `/reveal`
 *     redirects to the dashboard. `POST /api/talent/profile/fit-scores` is the
 *     only writer and NOTHING in the client calls it; against production it
 *     would throw on columns that are not there. The route is removed in the
 *     same change as this migration.
 *
 *  2. google_* (5), ip_* (5), verified_location_intel (1)
 *     Duplicates. `domains/auth/routes/auth.js` collects these into `geoData`
 *     and writes them to `onboarding_signals`, which holds all eleven in
 *     production. The copies on `profiles` have no writer.
 *
 *  3. predicted_* (8)
 *     Inference about a person's measurements and appearance. Already stripped
 *     from every API response by the `predicted_` prefix rule in
 *     `talent/routes/profile.js`, and squarely inside what plan §A3 removes.
 *
 *  4. visual_intel, librarian_synthesis, market_fit_rankings,
 *     onboarding_predictions, photo_embedding, vector_summary,
 *     vector_summary_text (7)
 *     The legacy AI analysis layer. Every remaining reference is a denylist or
 *     purge entry guarded by `hasColumn`, or export metadata — no reads, no
 *     writes. `market_fit_rankings` was already known to be absent from
 *     production while code still named it.
 *
 *  5. age (1)
 *     Superseded: "stored age/age_range are no longer maintained; derive age
 *     from DOB" (talent/routes/profile.js). `age_range` still exists in
 *     production and is left alone.
 *
 * DELIBERATELY NOT INCLUDED
 *
 *  - `profiles.image_analysis` / `image_analyzed_at` / `image_analysis_model`.
 *    These are absent from production AND from the migration history — no
 *    migration has ever created them on `profiles` in any environment. That is
 *    not drift, it is a standing bug: `masterVisionAnalysis` writes them, the
 *    write throws, the outer catch swallows it, and PDF composition reads
 *    `profileRow.image_analysis` as undefined. Adding them here would switch on
 *    a pipeline that has never once run in production, which is a product
 *    decision and a first-run risk, not a schema reconciliation. Left alone on
 *    purpose. RESOLVED by 20260902090000_create_profiles_image_analysis.js,
 *    which takes that decision on the evidence that the comp card composition
 *    path reads the column.
 *  - `archetype` and `vibe_score`, dropped by 20260820110000 / 20260820120000.
 *  - `search_vector`, which exists in production and not in the migrations: a
 *    Postgres-only artefact, harmless, and not this migration's business.
 *
 * @param {import('knex')} knex
 */

/**
 * NOT transactional, deliberately.
 *
 * SQLite has no DROP COLUMN, so knex rebuilds the table: create-copy-drop-
 * rename. Its `PRAGMA foreign_keys = OFF` guard is silently ignored inside a
 * transaction, and rebuilding `profiles` would then cascade through
 * `applications.profile_id` and empty it — the regression
 * tests/migrations/event-casting-schema.test.js exists to catch.
 */
exports.config = { transaction: false };

const DRIFTED_COLUMNS = Object.freeze([
  // 1 — Casting Reveal fit scores
  "fit_score_runway",
  "fit_score_editorial",
  "fit_score_commercial",
  "fit_score_lifestyle",
  "fit_score_swim_fitness",
  "fit_score_overall",
  "fit_scores_calculated_at",
  // 2 — geo/OAuth duplicates of onboarding_signals
  "google_addresses",
  "google_birthday",
  "google_gender",
  "google_organization",
  "google_phone",
  "ip_address",
  "ip_city",
  "ip_country",
  "ip_region",
  "ip_timezone",
  "verified_location_intel",
  // 3 — predicted traits
  "predicted_bust",
  "predicted_eye_color",
  "predicted_hair_color",
  "predicted_height_cm",
  "predicted_hips",
  "predicted_skin_tone",
  "predicted_waist",
  "predicted_weight_lbs",
  // 4 — legacy AI analysis layer
  "visual_intel",
  "librarian_synthesis",
  "market_fit_rankings",
  "onboarding_predictions",
  "photo_embedding",
  "vector_summary",
  "vector_summary_text",
  // 5 — superseded
  "age",
]);

exports.up = async function up(knex) {
  const present = [];
  for (const column of DRIFTED_COLUMNS) {
    if (await knex.schema.hasColumn("profiles", column)) present.push(column);
  }

  if (present.length === 0) {
    console.log(
      "[Migration] profiles already matches production — no drifted columns to drop",
    );
    return;
  }

  await knex.schema.alterTable("profiles", (table) => {
    for (const column of present) table.dropColumn(column);
  });
  console.log(
    `[Migration] Dropped ${present.length} drifted profiles column(s): ${present.join(", ")}`,
  );
};

/**
 * Deliberately irreversible.
 *
 * The rehearsal against a branch of production caught the asymmetry this
 * replaces. `up()` is a no-op there — production already lacks all 34 columns —
 * but the previous `down()` restored every column that was currently missing,
 * so reverting a deploy would have CREATED 34 columns production has never had,
 * resurrecting exactly the inference surface the compliance work removed. A
 * rollback that adds a compliance surface is worse than no rollback.
 *
 * There is nothing to restore in any case. Every column this migration drops is
 * dead in all environments: no writer, no reader outside hasColumn-guarded
 * denylists, and for the geo group a live duplicate on `onboarding_signals`.
 * Reverting the deploy that ships this migration does not need them back.
 *
 * Rolling back and re-applying still round-trips cleanly: `up()` is idempotent
 * and finds nothing to drop the second time.
 *
 * @param {import('knex')} knex
 */
exports.down = async function down() {
  console.log(
    "[Migration] reconcile_profiles_ai_drift is a one-way reconciliation — nothing to restore",
  );
};
