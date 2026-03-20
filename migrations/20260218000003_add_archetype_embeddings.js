/**
 * Archetype Embeddings Table
 *
 * Stores prototype embedding vectors for each modeling archetype.
 * Used for vector-similarity-based score computation in the casting pipeline:
 *   cosine(talent_image_embedding, archetype_embedding) → similarity score
 *
 * Rows are seeded with null embeddings and populated lazily at runtime
 * by ensureArchetypeEmbeddings() in src/lib/ai/archetypes.js.
 *
 * Model: text-embedding-3-small @ 512 dimensions
 * Distance: cosine (<=>), indexed with HNSW
 *
 * Postgres-only: silently no-ops on SQLite.
 */

const VECTOR_DIM = 512;
const ARCHETYPES = ['runway', 'editorial', 'commercial', 'lifestyle'];

exports.up = async function(knex) {
  const isPostgres = knex.client.config.client === 'pg' || knex.client.config.client === 'postgresql';

  if (!isPostgres) {
    console.log('[Migration] Skipping archetype_embeddings — not on Postgres');
    return;
  }

  await knex.schema.createTable('archetype_embeddings', (table) => {
    table.string('name', 50).primary()
      .comment("Archetype identifier: 'runway' | 'editorial' | 'commercial' | 'lifestyle'");
    table.specificType('embedding', `vector(${VECTOR_DIM})`).nullable()
      .comment('Prototype embedding vector — populated lazily at runtime');
    table.timestamp('embedded_at').nullable()
      .comment('When the embedding was last computed');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // HNSW index for fast cosine ANN search
  await knex.raw(
    `CREATE INDEX archetype_emb_hnsw
     ON archetype_embeddings USING hnsw (embedding vector_cosine_ops)`
  );

  // Seed rows — embeddings populated lazily by ensureArchetypeEmbeddings()
  await knex('archetype_embeddings').insert(
    ARCHETYPES.map((name) => ({ name }))
  );

  console.log('[Migration] Created archetype_embeddings with seed rows:', ARCHETYPES.join(', '));
};

exports.down = async function(knex) {
  const isPostgres = knex.client.config.client === 'pg' || knex.client.config.client === 'postgresql';
  if (!isPostgres) return;

  await knex.schema.dropTableIfExists('archetype_embeddings');
};
