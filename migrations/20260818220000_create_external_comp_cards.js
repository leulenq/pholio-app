/** Saved third-party comp cards. These are attachments, deliberately separate
 * from comp_card_imports, whose source documents are never persisted. */
exports.up = async function up(knex) {
  if (await knex.schema.hasTable("external_comp_cards")) return;
  await knex.schema.createTable("external_comp_cards", (table) => {
    table.uuid("id").primary();
    table.uuid("user_id").notNullable().references("id").inTable("users").onDelete("CASCADE").index();
    table.uuid("profile_id").notNullable().references("id").inTable("profiles").onDelete("CASCADE").index();
    table.string("filename", 255).notNullable();
    table.string("mime_type", 100).notNullable();
    table.integer("size_bytes").notNullable();
    table.string("storage_key", 700).nullable();
    table.string("public_url", 1500).notNullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("deleted_at").nullable();
    table.index(["profile_id", "deleted_at", "created_at"]);
  });
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("external_comp_cards");
};
