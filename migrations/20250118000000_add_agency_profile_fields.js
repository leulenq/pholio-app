/**
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  await knex.schema.table('users', (table) => {
    table.string('agency_location').nullable();
    table.string('agency_website').nullable();
    table.text('agency_description').nullable();
    table.boolean('notify_new_applications').defaultTo(true);
    table.boolean('notify_status_changes').defaultTo(true);
    table.string('default_view').nullable();
  });
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  // Safely drop columns - use IF EXISTS for PostgreSQL, or check first for other databases
  const isPostgres = knex.client.config.client === 'pg' || knex.client.config.client === 'postgresql';
  
  if (isPostgres) {
    // PostgreSQL: Use IF EXISTS for safe column drops
    try {
      await knex.raw('ALTER TABLE users DROP COLUMN IF EXISTS agency_location');
      await knex.raw('ALTER TABLE users DROP COLUMN IF EXISTS agency_website');
      await knex.raw('ALTER TABLE users DROP COLUMN IF EXISTS agency_description');
      await knex.raw('ALTER TABLE users DROP COLUMN IF EXISTS notify_new_applications');
      await knex.raw('ALTER TABLE users DROP COLUMN IF EXISTS notify_status_changes');
      await knex.raw('ALTER TABLE users DROP COLUMN IF EXISTS default_view');
    } catch (error) {
      console.log('[Migration] Error dropping agency profile fields (some may not exist):', error.message);
    }
  } else {
    // SQLite or other: Check before dropping
    try {
      await knex.schema.table('users', (table) => {
        table.dropColumn('agency_location');
        table.dropColumn('agency_website');
        table.dropColumn('agency_description');
        table.dropColumn('notify_new_applications');
        table.dropColumn('notify_status_changes');
        table.dropColumn('default_view');
      });
    } catch (error) {
      console.log('[Migration] Error dropping agency profile fields:', error.message);
    }
  }
};

