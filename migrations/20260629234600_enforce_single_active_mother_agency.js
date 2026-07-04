"use strict";

/**
 * Follow-up for databases that applied the representation table migration
 * before the single-mother invariant was added.
 *
 * @param {import("knex").Knex} knex
 */
exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable("talent_representations"))) return;
  await knex.raw(
    "create unique index if not exists talent_representations_one_active_mother_unique on talent_representations (profile_id) where status = 'active' and relationship_type = 'mother'",
  );
};

/**
 * @param {import("knex").Knex} knex
 */
exports.down = async function down(knex) {
  await knex.raw(
    "drop index if exists talent_representations_one_active_mother_unique",
  );
};
