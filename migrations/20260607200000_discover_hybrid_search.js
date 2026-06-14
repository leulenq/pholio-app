/**
 * Hybrid Discover search: lexical document + FTS (Postgres tsvector / SQLite FTS5).
 *
 * - profiles.search_document — cached lowercase prose + structured tokens
 * - Postgres: profiles.search_vector tsvector + GIN index
 * - SQLite: profiles_fts FTS5 virtual table
 *
 * Dense channel sources (visual, casting, market) use existing talent_text_embeddings
 * / talent_embedding_cache rows keyed by source.
 */

exports.up = async function (knex) {
  const client = knex.client?.config?.client || "";
  const isPostgres = client === "pg" || client === "postgresql";

  const hasSearchDocument = await knex.schema.hasColumn(
    "profiles",
    "search_document",
  );
  if (!hasSearchDocument) {
    await knex.schema.alterTable("profiles", (table) => {
      table.text("search_document").nullable();
    });
  }

  if (isPostgres) {
    const colCheck = await knex.raw(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'profiles' AND column_name = 'search_vector'
    `);
    const hasSearchVector = (colCheck.rows || colCheck).length > 0;
    if (!hasSearchVector) {
      await knex.raw(`ALTER TABLE profiles ADD COLUMN search_vector tsvector`);
      await knex.raw(
        `CREATE INDEX IF NOT EXISTS profiles_search_vector_gin
         ON profiles USING GIN (search_vector)`,
      );
    }
    return;
  }

  // SQLite FTS5
  const ftsCheck = await knex.raw(
    `SELECT name FROM sqlite_master WHERE type='table' AND name='profiles_fts'`,
  );
  const ftsRows = ftsCheck || [];
  if (!ftsRows.length) {
    await knex.raw(
      `CREATE VIRTUAL TABLE profiles_fts USING fts5(profile_id UNINDEXED, document)`,
    );
  }
};

exports.down = async function (knex) {
  const client = knex.client?.config?.client || "";
  const isPostgres = client === "pg" || client === "postgresql";

  if (!isPostgres) {
    await knex.raw(`DROP TABLE IF EXISTS profiles_fts`);
  } else {
    await knex.raw(`DROP INDEX IF EXISTS profiles_search_vector_gin`);
    const colCheck = await knex.raw(`
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'profiles' AND column_name = 'search_vector'
    `);
    if ((colCheck.rows || colCheck).length > 0) {
      await knex.raw(`ALTER TABLE profiles DROP COLUMN search_vector`);
    }
  }

  const hasSearchDocument = await knex.schema.hasColumn(
    "profiles",
    "search_document",
  );
  if (hasSearchDocument) {
    await knex.schema.alterTable("profiles", (table) => {
      table.dropColumn("search_document");
    });
  }
};
