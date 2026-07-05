/**
 * Frozen saved comp cards (audit P1-6) + named directions (P0-3).
 *
 * - plan_json: the full composed CompositionPlan captured at save time. A
 *   saved card is an artifact talent send to agencies — it must render
 *   byte-identical forever, not silently redesign when the engine evolves.
 * - engine_version: the composition engine version that authored plan_json
 *   (telemetry + future "redesign with the new engine" affordances).
 * - structure: the named creative direction the card was saved under
 *   (photo-dominant | matted | split | cutout), so re-composition and the
 *   direction picker stay honest about what the talent chose.
 */

exports.up = async function up(knex) {
  await knex.schema.alterTable("comp_card_presets", (table) => {
    table.text("plan_json");
    table.string("engine_version", 32);
    table.string("structure", 32);
  });
};

exports.down = async function down(knex) {
  await knex.schema.alterTable("comp_card_presets", (table) => {
    table.dropColumn("plan_json");
    table.dropColumn("engine_version");
    table.dropColumn("structure");
  });
};
