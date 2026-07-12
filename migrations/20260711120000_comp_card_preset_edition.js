/**
 * Comp-card EDITION pin on saved presets (editions plan 2.9).
 *
 * An edition is a complete named art direction (see composition/editions.js).
 * A card saved under an edition must render under that edition forever — the
 * same faithful-render principle as the frozen plan_json. This nullable
 * column persists the chosen edition id (null = no edition / legacy path);
 * the render + freeze flows pin it via opts.edition when present.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function up(knex) {
  const hasEdition = await knex.schema.hasColumn("comp_card_presets", "edition");
  if (!hasEdition) {
    await knex.schema.alterTable("comp_card_presets", (table) => {
      table.string("edition", 32).nullable();
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function down(knex) {
  const hasEdition = await knex.schema.hasColumn("comp_card_presets", "edition");
  if (hasEdition) {
    await knex.schema.alterTable("comp_card_presets", (table) => {
      table.dropColumn("edition");
    });
  }
};
