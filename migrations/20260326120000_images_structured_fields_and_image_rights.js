/**
 * Compatibility shim migration.
 *
 * This file previously existed and may already be recorded in knex_migrations.
 * It is intentionally a no-op so environments with that recorded migration
 * can still validate the migration directory without reapplying schema changes.
 *
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  return knex.raw("select 1");
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  return knex.raw("select 1");
};
