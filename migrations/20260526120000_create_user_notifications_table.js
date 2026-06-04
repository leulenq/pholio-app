/**
 * High-signal user notifications (bell center) — separate from noisy activities feed.
 *
 * @param {import("knex").Knex} knex
 */
exports.up = async function up(knex) {
  if (await knex.schema.hasTable("notifications")) {
    return;
  }

  await knex.schema.createTable("notifications", (table) => {
    table.uuid("id").primary();
    table
      .uuid("user_id")
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");
    table.string("type", 64).notNullable();
    table.string("title", 255).notNullable();
    table.text("body");
    table.string("route_target", 512).notNullable();
    table.string("priority", 16).notNullable().defaultTo("normal");
    table.string("group_key", 191).nullable();
    table.string("source_type", 64).nullable();
    table.uuid("source_id").nullable();
    table.json("metadata").nullable();
    table.integer("occurrence_count").notNullable().defaultTo(1);
    table.timestamp("read_at").nullable();
    table.timestamp("last_occurred_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());

    table.index(["user_id", "last_occurred_at"]);
    table.index(["user_id", "read_at"]);
    table.unique(["user_id", "group_key"]);
  });
};

/**
 * @param {import("knex").Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("notifications");
};
