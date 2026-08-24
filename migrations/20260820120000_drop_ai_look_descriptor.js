/**
 * NOT transactional, deliberately.
 *
 * SQLite has no DROP COLUMN, so knex rebuilds the table: create-copy-drop-
 * rename. It guards that with `PRAGMA foreign_keys = OFF`, which SQLite
 * silently ignores inside a transaction. Dropping a column from a table other
 * rows reference would then cascade and empty them — the exact regression
 * tests/migrations/event-casting-schema.test.js exists to catch, and which it
 * caught here.
 */
exports.config = { transaction: false };

/**
 * Drop the AI "look descriptor" and its numeric scoring inputs from
 * profiles: look_descriptor, look_descriptor_generated_at, vibe_score.
 *
 * WHY: per docs/pholio-product-plan-2026-08.md §A3 and
 * docs/pholio-strategic-analysis-2026-08.md §9.2, the line the product cuts
 * is precise — remove the machine judging the *person* (per-market
 * readiness scores derived from a photograph, and the one-line AI "look
 * descriptor" written on top of those scores), while keeping the art
 * direction. `castingAnalysis` (lookType, marketSignals, bookingStrengths,
 * boneStructure, etc. — profiles/images `image_analysis`) is UNTOUCHED by
 * this migration: it describes the photograph, feeds comp-card layout and
 * photo curation, reaches no agency audience, and keeps being produced and
 * persisted by src/domains/ai/analyzeProfileImage.js. Likewise the talent's
 * own self-declared fit_score_* columns are UNTOUCHED — those are a person
 * stating their own lanes, not a machine inferring them.
 *
 * `src/domains/ai/scoring.js` (scoreFromImageAnalysis, buildDescriptorPrompt)
 * — the keyword-matching engine that turned castingAnalysis into runway /
 * editorial / commercial / lifestyle / swimFitness readiness numbers and fed
 * them into the descriptor prompt — is deleted in the same change as this
 * migration; nothing writes look_descriptor or vibe_score after that.
 *
 * PRODUCTION REALITY CHECK (2026-08-20, read via Neon MCP against the
 * `profiles` table on the live database): `look_descriptor` and
 * `look_descriptor_generated_at` do not exist on `profiles` in production —
 * no migration in this repo ever created them there (a same-named pair of
 * columns exists, unused and empty, on the dormant `ai_profile_analysis`
 * table, which no application code writes to). `vibe_score` does exist on
 * `profiles` in production. This mirrors the already-known drift where
 * `market_fit_rankings` was dropped from production long ago while code
 * still named it — column presence in this codebase's migration history is
 * not proof of column presence in the live database, hence the hasColumn
 * guards below rather than an unconditional dropColumn.
 *
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  const toDrop = [];
  for (const column of [
    "look_descriptor",
    "look_descriptor_generated_at",
    "vibe_score",
  ]) {
    if (await knex.schema.hasColumn("profiles", column)) toDrop.push(column);
  }

  if (toDrop.length > 0) {
    await knex.schema.alterTable("profiles", (table) => {
      for (const column of toDrop) table.dropColumn(column);
    });
    console.log(`[Migration] Dropped profiles columns: ${toDrop.join(", ")}`);
  } else {
    console.log(
      "[Migration] look_descriptor / look_descriptor_generated_at / vibe_score already absent on profiles — nothing to drop",
    );
  }
};

/**
 * Faithful restore of each column exactly as originally defined:
 *   - look_descriptor / look_descriptor_generated_at: written as plain
 *     nullable columns by src/domains/ai/analyzeProfileImage.js prior to
 *     this change (no migration ever formally typed them on `profiles`).
 *   - vibe_score: migrations/20250120000000_add_ai_metadata_to_profiles.js
 *     ("AI-calculated vibe score (0-10)").
 * Only restores columns this migration's up() actually dropped, so down()
 * is safe to run against a database where some or all were already absent.
 *
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  const toRestore = [];

  if (!(await knex.schema.hasColumn("profiles", "look_descriptor"))) {
    toRestore.push((table) => table.text("look_descriptor").nullable());
  }
  if (
    !(await knex.schema.hasColumn(
      "profiles",
      "look_descriptor_generated_at",
    ))
  ) {
    toRestore.push((table) =>
      table.timestamp("look_descriptor_generated_at").nullable(),
    );
  }
  if (!(await knex.schema.hasColumn("profiles", "vibe_score"))) {
    toRestore.push((table) =>
      table
        .decimal("vibe_score", 3, 1)
        .nullable()
        .comment("AI-calculated vibe score (0-10)"),
    );
  }

  if (toRestore.length > 0) {
    await knex.schema.alterTable("profiles", (table) => {
      toRestore.forEach((fn) => fn(table));
    });
  }
};
