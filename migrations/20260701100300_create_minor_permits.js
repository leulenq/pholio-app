"use strict";

/**
 * Wave 2B — Expand (minor compliance permits).
 *
 * Decision 4: STRUCTURED PERMIT MODEL. Private compliance context for minor
 * talent — work permit + jurisdiction + expiry, chaperone/guardian-on-set, and
 * school/education constraints. Additive; no source data to backfill.
 *
 * @param {import("knex").Knex} knex
 */
exports.up = async function up(knex) {
  if (await knex.schema.hasTable("minor_permits")) return;

  await knex.schema.createTable("minor_permits", (table) => {
    table.uuid("id").primary();
    table
      .uuid("profile_id")
      .notNullable()
      .references("id")
      .inTable("profiles")
      .onDelete("CASCADE");
    table.string("permit_type", 60).notNullable();
    table.string("jurisdiction", 120).nullable();
    table.date("issued_at").nullable();
    table.date("expires_at").nullable();
    table.boolean("chaperone_required").notNullable().defaultTo(false);
    table.string("chaperone_name", 160).nullable();
    table.text("school_constraints").nullable();
    table.text("notes").nullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());

    table.index(["profile_id"]);
    table.index(["expires_at"]);
  });
};

exports.down = async function down(knex) {
  if (await knex.schema.hasTable("minor_permits")) {
    await knex.schema.dropTable("minor_permits");
  }
};
