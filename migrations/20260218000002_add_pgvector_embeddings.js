/**
 * pgvector Embedding Tables
 *
 * Creates three tables for semantic search and "vibe" matching:
 *
 *   talent_image_embeddings  — one vector per talent (Scout description text)
 *   talent_text_embeddings   — one vector per (talent, source): bio | full_profile
 *   brief_embeddings         — one vector per agency casting brief (future use)
 *
 * Model: text-embedding-3-small @ 512 dimensions
 * Distance: cosine (<=>), indexed with HNSW for fast ANN search
 *
 * Postgres-only: silently no-ops on SQLite.
 */

const VECTOR_DIM = 512;

exports.up = async function(knex) {
  const isPostgres = knex.client.config.client === 'pg' || knex.client.config.client === 'postgresql';

  if (!isPostgres) {
    console.log('[Migration] Skipping pgvector tables — not on Postgres');
    return;
  }

  // Enable pgvector extension (idempotent)
  await knex.raw('CREATE EXTENSION IF NOT EXISTS vector');
  console.log('[Migration] pgvector extension enabled');

  // ── talent_image_embeddings ───────────────────────────────────────────────
  // One row per profile. Source text = Scout's face_structure + body_impression + vibe_tags.
  await knex.schema.createTable('talent_image_embeddings', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('profile_id')
      .notNullable()
      .unique()
      .references('id').inTable('profiles').onDelete('CASCADE');
    table.text('source_text').nullable()
      .comment('The Scout description text that was embedded');
    table.specificType('embedding', `vector(${VECTOR_DIM})`).nullable();
    table.timestamp('embedded_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  // HNSW index for fast cosine ANN search
  await knex.raw(
    `CREATE INDEX talent_image_emb_hnsw
     ON talent_image_embeddings USING hnsw (embedding vector_cosine_ops)`
  );

  console.log('[Migration] Created talent_image_embeddings');

  // ── talent_text_embeddings ────────────────────────────────────────────────
  // One row per (profile, source). Sources: 'bio', 'full_profile'
  await knex.schema.createTable('talent_text_embeddings', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('profile_id')
      .notNullable()
      .references('id').inTable('profiles').onDelete('CASCADE');
    table.string('source', 50).notNullable()
      .comment("'bio' | 'full_profile'");
    table.text('source_text').nullable()
      .comment('The concatenated text that was embedded');
    table.specificType('embedding', `vector(${VECTOR_DIM})`).nullable();
    table.timestamp('embedded_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    table.unique(['profile_id', 'source']);
  });

  await knex.raw(
    `CREATE INDEX talent_text_emb_hnsw
     ON talent_text_embeddings USING hnsw (embedding vector_cosine_ops)`
  );

  console.log('[Migration] Created talent_text_embeddings');

  // ── brief_embeddings ──────────────────────────────────────────────────────
  // One row per casting brief. brief_id references a future `briefs` table.
  await knex.schema.createTable('brief_embeddings', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('brief_id').nullable()
      .comment('References future briefs table');
    table.text('source_text').nullable()
      .comment('The brief text that was embedded');
    table.specificType('embedding', `vector(${VECTOR_DIM})`).nullable();
    table.jsonb('metadata').nullable()
      .comment('Arbitrary metadata: {agency_id, title, ...}');
    table.timestamp('embedded_at').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
  });

  await knex.raw(
    `CREATE INDEX brief_emb_hnsw
     ON brief_embeddings USING hnsw (embedding vector_cosine_ops)`
  );

  console.log('[Migration] Created brief_embeddings');
};

exports.down = async function(knex) {
  const isPostgres = knex.client.config.client === 'pg' || knex.client.config.client === 'postgresql';
  if (!isPostgres) return;

  await knex.schema.dropTableIfExists('brief_embeddings');
  await knex.schema.dropTableIfExists('talent_text_embeddings');
  await knex.schema.dropTableIfExists('talent_image_embeddings');
  // Leave pgvector extension in place — other tenants may use it
};
