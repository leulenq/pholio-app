/**
 * Persistent comp-card "director preset" snapshots per profile.
 * Stores deterministic generation inputs (seed/layout/style/locks) for reuse.
 *
 * @param {import("knex").Knex} knex
 */
exports.up = async function up(knex) {
  if (await knex.schema.hasTable("comp_card_presets")) {
    return;
  }

  await knex.schema.createTable("comp_card_presets", (table) => {
    table.uuid("id").primary();
    table
      .uuid("profile_id")
      .notNullable()
      .references("id")
      .inTable("profiles")
      .onDelete("CASCADE");
    table.string("name", 80).notNullable();
    table.string("seed", 128).nullable();
    table.string("layout_family", 64).nullable();
    table.string("style_variant", 64).nullable();
    table.string("lock_hero_id", 64).nullable();
    table.json("lock_grid_ids").nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());
    table.timestamp("last_used_at").nullable();

    table.unique(["profile_id", "name"]);
    table.index(["profile_id", "updated_at"]);
  });
};

/**
 * @param {import("knex").Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("comp_card_presets");
};
