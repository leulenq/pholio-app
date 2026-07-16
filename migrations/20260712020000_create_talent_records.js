"use strict";

/**
 * Agency-private, off-platform talent records (DATA-1.2).
 *
 * Every real agency arrives with an existing roster. These rows let an agency
 * hold talent who are not (yet) Pholio users, so the roster and the concierge
 * import pipeline have somewhere to land. Strictly private to the owning
 * agency — never surfaced in Discover or public views. Minors follow the same
 * restricted-visibility discipline as platform minors (is_minor gate).
 *
 * @param {import("knex").Knex} knex
 */
exports.up = async function up(knex) {
  if (await knex.schema.hasTable("talent_records")) return;

  await knex.schema.createTable("talent_records", (table) => {
    table.uuid("id").primary();
    table
      .uuid("agency_id")
      .notNullable()
      .references("id")
      .inTable("agencies")
      .onDelete("CASCADE");
    table.string("first_name", 120).nullable();
    table.string("last_name", 120).nullable();
    table.string("email", 254).nullable();
    table.string("phone", 40).nullable();
    table.string("gender", 40).nullable();
    table.date("date_of_birth").nullable();
    table.integer("height_cm").nullable();
    table.jsonb("measurements").nullable();
    table.string("board_hint", 120).nullable();
    table.string("market", 120).nullable();
    table.string("photo_path", 1024).nullable();
    // Set if this off-platform record is later matched to a real Pholio profile.
    table
      .uuid("claimed_profile_id")
      .nullable()
      .references("id")
      .inTable("profiles")
      .onDelete("SET NULL");
    table.boolean("is_minor").notNullable().defaultTo(false);
    table
      .uuid("created_by_user_id")
      .nullable()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());

    table.index(["agency_id"]);
  });
};

/**
 * @param {import("knex").Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("talent_records");
};
