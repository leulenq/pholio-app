"use strict";

/**
 * Discover search — Postgres-backed caches (WS3.8, consumed in WS6.3).
 *
 * Replace per-process Maps (which reset per serverless instance) with shared
 * DB-backed caches:
 *
 * `discover_parse_cache` — brief-parse memoization keyed by query hash.
 * `discover_embed_cache` — soft-query embedding memoization keyed by text
 *   hash. Embedding stored as JSON (float array) — it is a cache read back
 *   whole by the app, never similarity-indexed, so no vector type needed and
 *   the table stays dual-dialect.
 *
 * TTL is enforced by a `created_at` sweep in the existing daily scheduled
 * function (WS6.3) — no expiry columns here.
 *
 * @param {import("knex").Knex} knex
 */
exports.up = async function up(knex) {
  const hasParse = await knex.schema.hasTable("discover_parse_cache");
  if (!hasParse) {
    await knex.schema.createTable("discover_parse_cache", (table) => {
      table.string("query_hash", 64).primary();
      table.json("contract").nullable();
      table.string("model", 120).nullable();
      table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    });
  }

  const hasEmbed = await knex.schema.hasTable("discover_embed_cache");
  if (!hasEmbed) {
    await knex.schema.createTable("discover_embed_cache", (table) => {
      table.string("text_hash", 64).primary();
      table.json("embedding").nullable();
      table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    });
  }
};

/**
 * @param {import("knex").Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("discover_embed_cache");
  await knex.schema.dropTableIfExists("discover_parse_cache");
};
