"use strict";

/**
 * Discover search — per-image multimodal embedding column (WS3.4).
 *
 * `images.embedding vector(512)` — pre-provisioning for multimodal image
 * embeddings. Unpopulated at launch, so deliberately NO index yet (an HNSW
 * index over an all-NULL column is wasted write amplification; add it in the
 * migration that ships the population job).
 *
 * Postgres-only: pgvector's `vector` type does not exist on SQLite, and local
 * dev never runs vector similarity — semantic search is a production (Neon)
 * feature, mirroring 20260218000002_add_pgvector_embeddings.js. SQLite no-ops.
 *
 * @param {import("knex").Knex} knex
 */
const VECTOR_DIM = 512;

exports.up = async function up(knex) {
  const client = knex.client?.config?.client || "";
  const isPostgres = client === "pg" || client === "postgresql";

  if (!isPostgres) {
    console.log(
      "[Migration] Skipping images.embedding vector column — not on Postgres",
    );
    return;
  }

  // Enable pgvector extension (idempotent).
  await knex.raw("CREATE EXTENSION IF NOT EXISTS vector");

  const colCheck = await knex.raw(`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'images' AND column_name = 'embedding'
  `);
  const hasEmbedding = (colCheck.rows || colCheck).length > 0;
  if (!hasEmbedding) {
    await knex.raw(`ALTER TABLE images ADD COLUMN embedding vector(${VECTOR_DIM})`);
  }
};

/**
 * @param {import("knex").Knex} knex
 */
exports.down = async function down(knex) {
  const client = knex.client?.config?.client || "";
  const isPostgres = client === "pg" || client === "postgresql";
  if (!isPostgres) return;

  const colCheck = await knex.raw(`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'images' AND column_name = 'embedding'
  `);
  if ((colCheck.rows || colCheck).length > 0) {
    await knex.raw(`ALTER TABLE images DROP COLUMN embedding`);
  }
  // Leave the pgvector extension in place — other tables use it.
};
