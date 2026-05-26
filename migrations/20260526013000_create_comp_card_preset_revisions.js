/**
 * Immutable revision history for comp_card_presets.
 *
 * @param {import("knex").Knex} knex
 */
exports.up = async function up(knex) {
  if (await knex.schema.hasTable("comp_card_preset_revisions")) {
    return;
  }

  await knex.schema.createTable("comp_card_preset_revisions", (table) => {
    table.uuid("id").primary();
    table
      .uuid("preset_id")
      .notNullable()
      .references("id")
      .inTable("comp_card_presets")
      .onDelete("CASCADE");
    table.integer("revision_number").notNullable();
    table.string("reason", 32).notNullable().defaultTo("update");
    table.json("snapshot").notNullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());

    table.unique(["preset_id", "revision_number"]);
    table.index(["preset_id", "revision_number"]);
  });
};

/**
 * @param {import("knex").Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("comp_card_preset_revisions");
};
