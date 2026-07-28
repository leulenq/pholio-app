/**
 * Drop the orphaned `profiles.ai_processing_consent` column.
 *
 * The migration that created it (`20260712120000_add_ai_processing_consent_to_profiles.js`)
 * was deleted from the repo after being applied to production — the feature was
 * reverted, but the column stayed behind. That left production carrying a column
 * no migration creates, so a database built from `migrations/` did not match it.
 *
 * Nothing reads or writes it. The only references left are prose asking for the
 * flag to be built: a TODO in `domains/talent/routes/media.js` and a line in
 * `docs/audits/talent-production-readiness-audit.md`. Every row held the `true`
 * default, so the column carried no information.
 *
 * Dropping rather than re-adding it, for the same reason
 * `20260727120000_settings_truth_pass.js` dropped `display_preferences`: a dead
 * column must not be reintroduced by accident. It is also actively misleading
 * here — both TODOs want a *per-user* consent flag, and a half-created column on
 * `profiles` sharing that name reads like working functionality to whoever picks
 * the work up.
 *
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  if (await knex.schema.hasColumn("profiles", "ai_processing_consent")) {
    await knex.schema.alterTable("profiles", (table) => {
      table.dropColumn("ai_processing_consent");
    });
  }
};

/**
 * Restores the column as production held it: boolean, NOT NULL, default true.
 *
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  if (!(await knex.schema.hasColumn("profiles", "ai_processing_consent"))) {
    await knex.schema.alterTable("profiles", (table) => {
      table.boolean("ai_processing_consent").notNullable().defaultTo(true);
    });
  }
};
