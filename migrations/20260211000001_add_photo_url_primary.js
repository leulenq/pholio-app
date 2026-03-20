/**
 * Migration: Add photo_url_primary column to profiles table
 *
 * This column stores the URL of the primary photo selected during onboarding.
 * Previously stored only in state machine JSON, now persisted for easier access.
 */

exports.up = async function up(knex) {
  await knex.schema.table('profiles', (table) => {
    table.text('photo_url_primary').nullable();
  });
};

exports.down = async function down(knex) {
  await knex.schema.table('profiles', (table) => {
    table.dropColumn('photo_url_primary');
  });
};
