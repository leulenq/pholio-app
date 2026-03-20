/**
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  await knex.schema.table('users', (table) => {
    table.string('agency_name').nullable();
    table.string('agency_logo_path').nullable();
    table.string('agency_brand_color').nullable();
  });
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  // Safely drop columns - use IF EXISTS for PostgreSQL
  const isPostgres = knex.client.config.client === 'pg' || knex.client.config.client === 'postgresql';
  
  if (isPostgres) {
    // PostgreSQL: Use IF EXISTS for safe column drops
    try {
      await knex.raw('ALTER TABLE users DROP COLUMN IF EXISTS agency_name');
      await knex.raw('ALTER TABLE users DROP COLUMN IF EXISTS agency_logo_path');
      await knex.raw('ALTER TABLE users DROP COLUMN IF EXISTS agency_brand_color');
    } catch (error) {
      console.log('[Migration] Error dropping agency branding fields (some may not exist):', error.message);
    }
  } else {
    // SQLite or other: Try-catch around schema operations
    try {
      await knex.schema.table('users', (table) => {
        table.dropColumn('agency_name');
        table.dropColumn('agency_logo_path');
        table.dropColumn('agency_brand_color');
      });
    } catch (error) {
      console.log('[Migration] Error dropping agency branding fields:', error.message);
    }
  }
};

