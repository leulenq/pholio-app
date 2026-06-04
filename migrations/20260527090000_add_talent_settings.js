/**
 * Persist talent settings that do not belong on the core profile row.
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  const hasIsPublic = await knex.schema.hasColumn("profiles", "is_public");
  if (!hasIsPublic) {
    await knex.schema.alterTable("profiles", (table) => {
      table.boolean("is_public").notNullable().defaultTo(true);
      table.index("is_public");
    });
  }

  const exists = await knex.schema.hasTable("talent_user_settings");
  if (exists) return;

  await knex.schema.createTable("talent_user_settings", (table) => {
    table.uuid("id").primary();
    table
      .uuid("user_id")
      .notNullable()
      .unique()
      .references("id")
      .inTable("users")
      .onDelete("CASCADE");
    table.json("notification_preferences").nullable();
    table.json("display_preferences").nullable();
    table.json("privacy_preferences").nullable();
    table.json("cookie_preferences").nullable();
    table.timestamp("data_export_requested_at").nullable();
    table.timestamp("data_erasure_requested_at").nullable();
    table.timestamp("account_deactivated_at").nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());

    table.index("user_id");
    table.index("account_deactivated_at");
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("talent_user_settings");

  const hasIsPublic = await knex.schema.hasColumn("profiles", "is_public");
  if (hasIsPublic) {
    await knex.schema.alterTable("profiles", (table) => {
      table.dropIndex("is_public");
      table.dropColumn("is_public");
    });
  }
};
