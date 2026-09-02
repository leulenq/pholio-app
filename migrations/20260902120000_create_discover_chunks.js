"use strict";

/**
 * Discover semantic layer — the corpus table.
 *
 * `discover_chunks` holds several short, readable pieces of text per profile,
 * each with its embedding:
 *   kind 'bio'     — a sentence group from the talent's own bio
 *   kind 'profile' — the talent's declared facts rendered as prose
 *   kind 'photo'   — an attribute-neutral description of one visible image
 *
 * Every row is text a talent can read. No measurement, name, heritage, age,
 * skin tone or body judgement is ever written here (tasks/discover-semantic-
 * 2026-09.md §3.1). Rows are deleted with the image, the consent, or the
 * profile (FK cascade), and rebuilt whenever the source changes.
 *
 * Dual-dialect: Postgres stores `embedding vector(512)` with an HNSW index;
 * SQLite stores `embedding_json` and scores in process.
 *
 * Also adds:
 *   image_signals.description / description_model / described_at — the photo
 *     description, kept next to the classifier's signals for the same image.
 *   profiles.discover_indexed_at — null means "stale, reindex me".
 */

const VECTOR_DIM = 512;

function isPostgres(knex) {
  const client = knex.client?.config?.client || "";
  return client === "pg" || client === "postgresql";
}

exports.up = async function up(knex) {
  const pg = isPostgres(knex);

  if (!(await knex.schema.hasTable("discover_chunks"))) {
    await knex.schema.createTable("discover_chunks", (table) => {
      table.uuid("id").primary();
      table
        .uuid("profile_id")
        .notNullable()
        .references("id")
        .inTable("profiles")
        .onDelete("CASCADE");
      table
        .uuid("image_id")
        .nullable()
        .references("id")
        .inTable("images")
        .onDelete("CASCADE");
      table.string("kind", 16).notNullable(); // bio | profile | photo
      // `${kind}:${image_id || seq}` — one row per source piece per profile.
      table.string("chunk_key", 64).notNullable();
      table.text("text").notNullable();
      table.string("text_hash", 64).notNullable();
      table.string("model", 120).nullable();
      if (!pg) table.text("embedding_json").nullable();
      table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
      table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
      table.unique(["profile_id", "chunk_key"]);
      table.index(["profile_id"], "discover_chunks_profile_idx");
    });

    if (pg) {
      await knex.raw("CREATE EXTENSION IF NOT EXISTS vector");
      await knex.raw(
        `ALTER TABLE discover_chunks ADD COLUMN embedding vector(${VECTOR_DIM})`,
      );
      await knex.raw(
        "CREATE INDEX IF NOT EXISTS discover_chunks_emb_hnsw ON discover_chunks USING hnsw (embedding vector_cosine_ops)",
      );
    }
  }

  if (await knex.schema.hasTable("image_signals")) {
    const cols = ["description", "description_model", "described_at"];
    const missing = [];
    for (const col of cols) {
      // eslint-disable-next-line no-await-in-loop
      if (!(await knex.schema.hasColumn("image_signals", col))) missing.push(col);
    }
    if (missing.length) {
      await knex.schema.alterTable("image_signals", (table) => {
        if (missing.includes("description")) table.text("description").nullable();
        if (missing.includes("description_model")) {
          table.string("description_model", 120).nullable();
        }
        if (missing.includes("described_at")) {
          table.timestamp("described_at").nullable();
        }
      });
    }
  }

  if (!(await knex.schema.hasColumn("profiles", "discover_indexed_at"))) {
    await knex.schema.alterTable("profiles", (table) => {
      table.timestamp("discover_indexed_at").nullable();
    });
  }
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("discover_chunks");
  if (await knex.schema.hasTable("image_signals")) {
    for (const col of ["description", "description_model", "described_at"]) {
      // eslint-disable-next-line no-await-in-loop
      if (await knex.schema.hasColumn("image_signals", col)) {
        // eslint-disable-next-line no-await-in-loop
        await knex.schema.alterTable("image_signals", (table) => {
          table.dropColumn(col);
        });
      }
    }
  }
  if (await knex.schema.hasColumn("profiles", "discover_indexed_at")) {
    await knex.schema.alterTable("profiles", (table) => {
      table.dropColumn("discover_indexed_at");
    });
  }
};

// SQLite rebuilds the profiles table for a dropped column; keep the migration
// outside a transaction so its foreign-key guard is honoured (see
// 20260820110000_drop_profiles_archetype.js).
exports.config = { transaction: false };
