/**
 * JSON embedding cache for local SQLite dev (and fallback storage).
 *
 * Postgres production uses pgvector tables; SQLite uses this cache so
 * Discover semantic search works without Neon during pre-launch dev.
 */

exports.up = async function (knex) {
  const exists = await knex.schema.hasTable("talent_embedding_cache");
  if (exists) return;

  await knex.schema.createTable("talent_embedding_cache", (table) => {
    table.uuid("profile_id").notNullable();
    table.string("source", 50).notNullable().comment("discover_index | image");
    table.text("embedding_json").notNullable();
    table.text("source_text").nullable();
    table.timestamp("embedded_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());
    table.primary(["profile_id", "source"]);
    table
      .foreign("profile_id")
      .references("id")
      .inTable("profiles")
      .onDelete("CASCADE");
  });
};

exports.down = async function (knex) {
  await knex.schema.dropTableIfExists("talent_embedding_cache");
};
