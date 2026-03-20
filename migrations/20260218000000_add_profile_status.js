/**
 * Add profile_status column to profiles table.
 *
 * Values: 'incomplete' | 'active'
 * - 'incomplete': talent not yet visible to agencies
 * - 'active': all core fields complete, visible in agency discover
 *
 * Backfills existing rows: profiles with height, measurements, city,
 * experience level, and a social handle are marked 'active'.
 */

exports.up = async function(knex) {
  await knex.schema.table('profiles', (table) => {
    table.string('profile_status', 20).defaultTo('incomplete').notNullable();
  });

  // Backfill: mark profiles with enough core data as 'active'
  await knex('profiles')
    .whereNotNull('height_cm')
    .whereNotNull('waist_cm')
    .whereNotNull('hips_cm')
    .whereNotNull('gender')
    .whereNotNull('city')
    .whereNotNull('experience_level')
    .where(function() {
      this.whereNotNull('instagram_handle').orWhereNotNull('portfolio_url');
    })
    .update({ profile_status: 'active' });
};

exports.down = async function(knex) {
  await knex.schema.table('profiles', (table) => {
    table.dropColumn('profile_status');
  });
};
