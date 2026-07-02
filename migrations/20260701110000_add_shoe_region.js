"use strict";

/**
 * Migration: Add shoe_region column to profiles table
 * 
 * @param {import("knex").Knex} knex
 */
exports.up = async function up(knex) {
  const hasShoeRegion = await knex.schema.hasColumn("profiles", "shoe_region");

  if (!hasShoeRegion) {
    await knex.schema.alterTable("profiles", (table) => {
      table.string("shoe_region", 10).nullable();
    });

    // Default existing shoe sizes to US region
    await knex("profiles")
      .whereNotNull("shoe_size")
      .whereNull("shoe_region")
      .update({ shoe_region: "US" });
  }
};

/**
 * @param {import("knex").Knex} knex
 */
exports.down = async function down(knex) {
  const hasShoeRegion = await knex.schema.hasColumn("profiles", "shoe_region");

  if (hasShoeRegion) {
    await knex.schema.alterTable("profiles", (table) => {
      table.dropColumn("shoe_region");
    });
  }
};
