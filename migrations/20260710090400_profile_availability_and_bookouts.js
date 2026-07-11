"use strict";

/**
 * Discover search — availability (WS3.6).
 *
 * `profiles.availability_status` — coarse availability the talent controls.
 * App-level values: 'available' | 'limited' | 'unavailable'. Plain text with
 * an app-enforced vocabulary (matches house style for profile enums like
 * stats_track); default 'available'.
 *
 * `bookouts` — date ranges a talent is booked out (industry term), one row
 * per range. Indexed on (profile_id, starts_on) for the availability-window
 * overlap query in the launch engine.
 *
 * Dual-dialect (PG + SQLite).
 *
 * @param {import("knex").Knex} knex
 */
exports.up = async function up(knex) {
  const hasStatus = await knex.schema.hasColumn(
    "profiles",
    "availability_status",
  );
  if (!hasStatus) {
    await knex.schema.alterTable("profiles", (table) => {
      table
        .string("availability_status", 20)
        .notNullable()
        .defaultTo("available");
    });
  }

  const hasBookouts = await knex.schema.hasTable("bookouts");
  if (!hasBookouts) {
    await knex.schema.createTable("bookouts", (table) => {
      table.uuid("id").primary();
      table
        .uuid("profile_id")
        .notNullable()
        .references("id")
        .inTable("profiles")
        .onDelete("CASCADE");
      table.date("starts_on").notNullable();
      table.date("ends_on").notNullable();
      table.text("note").nullable();
      table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());

      table.index(["profile_id", "starts_on"]);
    });
  }
};

/**
 * @param {import("knex").Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("bookouts");

  const hasStatus = await knex.schema.hasColumn(
    "profiles",
    "availability_status",
  );
  if (hasStatus) {
    await knex.schema.alterTable("profiles", (table) => {
      table.dropColumn("availability_status");
    });
  }
};
