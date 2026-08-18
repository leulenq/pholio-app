"use strict";

const DELIVERY_COLUMNS = [
  "delivery_mime_type",
  "delivery_size_bytes",
  "delivery_width_px",
  "delivery_height_px",
  "delivery_metadata_recorded_at",
  "original_delivery_mime_type",
  "original_delivery_size_bytes",
  "original_delivery_width_px",
  "original_delivery_height_px",
  "original_delivery_metadata_recorded_at",
];

/**
 * Persist facts about the exact processed asset Pholio can deliver. Existing
 * rows intentionally remain null: missing file facts must evaluate unknown,
 * never be inferred from a filename or storage key.
 *
 * The original_* fields let replace/restore keep both artifacts' facts paired
 * with the bytes they describe.
 *
 * @param {import("knex").Knex} knex
 */
exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable("images"))) return;

  const exists = {};
  for (const name of DELIVERY_COLUMNS) {
    exists[name] = await knex.schema.hasColumn("images", name);
  }

  await knex.schema.alterTable("images", (table) => {
    if (!exists.delivery_mime_type) {
      table.string("delivery_mime_type", 100).nullable();
    }
    if (!exists.delivery_size_bytes) {
      table.bigInteger("delivery_size_bytes").nullable();
    }
    if (!exists.delivery_width_px) {
      table.integer("delivery_width_px").nullable();
    }
    if (!exists.delivery_height_px) {
      table.integer("delivery_height_px").nullable();
    }
    if (!exists.delivery_metadata_recorded_at) {
      table.timestamp("delivery_metadata_recorded_at").nullable();
    }
    if (!exists.original_delivery_mime_type) {
      table.string("original_delivery_mime_type", 100).nullable();
    }
    if (!exists.original_delivery_size_bytes) {
      table.bigInteger("original_delivery_size_bytes").nullable();
    }
    if (!exists.original_delivery_width_px) {
      table.integer("original_delivery_width_px").nullable();
    }
    if (!exists.original_delivery_height_px) {
      table.integer("original_delivery_height_px").nullable();
    }
    if (!exists.original_delivery_metadata_recorded_at) {
      table.timestamp("original_delivery_metadata_recorded_at").nullable();
    }
  });
};

/** @param {import("knex").Knex} knex */
exports.down = async function down(knex) {
  if (!(await knex.schema.hasTable("images"))) return;
  for (const name of [...DELIVERY_COLUMNS].reverse()) {
    if (await knex.schema.hasColumn("images", name)) {
      await knex.schema.alterTable("images", (table) => {
        table.dropColumn(name);
      });
    }
  }
};

exports.DELIVERY_COLUMNS = DELIVERY_COLUMNS;
