"use strict";

/**
 * Migration: Add unlock_celebrated_at column to profiles table
 *
 * Persists whether the talent has already seen the post-unlock celebration
 * (ProfileUnlockExperience) server-side, replacing the old
 * `talent-gate-celebrated:<id>` localStorage flag so it survives across
 * devices/browsers.
 *
 * @param {import("knex").Knex} knex
 */
exports.up = async function up(knex) {
  const hasUnlockCelebratedAt = await knex.schema.hasColumn(
    "profiles",
    "unlock_celebrated_at",
  );

  if (!hasUnlockCelebratedAt) {
    await knex.schema.alterTable("profiles", (table) => {
      table.timestamp("unlock_celebrated_at").nullable();
    });
  }
};

/**
 * @param {import("knex").Knex} knex
 */
exports.down = async function down(knex) {
  const hasUnlockCelebratedAt = await knex.schema.hasColumn(
    "profiles",
    "unlock_celebrated_at",
  );

  if (hasUnlockCelebratedAt) {
    await knex.schema.alterTable("profiles", (table) => {
      table.dropColumn("unlock_celebrated_at");
    });
  }
};
