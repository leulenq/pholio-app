"use strict";

/**
 * Discover search — per-image classification signals (WS3.3).
 *
 * Promotes the `signals` block `classify-portfolio-image.js` already computes
 * (and previously discarded into images.metadata) to a queryable table, one
 * row per image keyed by `image_id`.
 *
 * Column names match the classifier's REAL output keys:
 *   top-level : shot_type, style_type (the commercial/editorial read —
 *               'editorial' | 'commercial' | 'lifestyle' | ...), image_type
 *   signals   : expression, pose_yaw, body_visibility, background,
 *               styling_register, retouch_likelihood, makeup_level
 * plus provenance: analyzed_at, model.
 *
 * Dual-dialect (PG + SQLite). Values are open vocab from the vision model, so
 * plain text (no CHECK) — the classifier prompt is the source of truth.
 *
 * @param {import("knex").Knex} knex
 */
exports.up = async function up(knex) {
  const hasTable = await knex.schema.hasTable("image_signals");
  if (hasTable) return;

  await knex.schema.createTable("image_signals", (table) => {
    table.uuid("id").primary();
    table
      .uuid("image_id")
      .notNullable()
      .unique()
      .references("id")
      .inTable("images")
      .onDelete("CASCADE");

    // Top-level classification (merged heuristic + VLM).
    table.string("shot_type", 40).nullable();
    // 'editorial' | 'commercial' | 'lifestyle' | ... — the classifier's
    // commercial/editorial read (real key name: style_type).
    table.string("style_type", 40).nullable();
    table.string("image_type", 40).nullable();

    // signals block — keys exactly as produced by classify-portfolio-image.js.
    table.string("expression", 40).nullable(); // neutral | smile | serious
    table.string("pose_yaw", 40).nullable(); // front | three_quarter | profile_* | back
    table.string("body_visibility", 40).nullable(); // face_only | bust | three_quarter | full_length
    table.string("background", 40).nullable(); // plain | studio | environmental
    table.string("styling_register", 40).nullable(); // natural | polished | editorial
    table.string("retouch_likelihood", 40).nullable(); // none | light | heavy
    table.string("makeup_level", 40).nullable(); // none | minimal | styled

    table.timestamp("analyzed_at").nullable();
    table.string("model", 120).nullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
  });
};

/**
 * @param {import("knex").Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("image_signals");
};
