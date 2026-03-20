/**
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  // Add agency_slug to users table for partner-specific URLs
  await knex.schema.table('users', (table) => {
    table.string('agency_slug').nullable();
    table.index('agency_slug');
  });

  // Add is_discoverable to profiles table (Pro talent opt-in for Scout Talent pool)
  await knex.schema.table('profiles', (table) => {
    table.boolean('is_discoverable').notNullable().defaultTo(false);
    table.index('is_discoverable');
  });

  // Add invited_by_agency_id to applications table (tracks scout invites)
  await knex.schema.table('applications', (table) => {
    table
      .uuid('invited_by_agency_id')
      .nullable()
      .references('id')
      .inTable('users')
      .onDelete('SET NULL');
  });
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  await knex.schema.table('applications', (table) => {
    table.dropColumn('invited_by_agency_id');
  });

  await knex.schema.table('profiles', (table) => {
    table.dropIndex('is_discoverable');
    table.dropColumn('is_discoverable');
  });

  await knex.schema.table('users', (table) => {
    table.dropIndex('agency_slug');
    table.dropColumn('agency_slug');
  });
};

