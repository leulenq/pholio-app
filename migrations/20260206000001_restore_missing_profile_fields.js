/**
 * Restore missing profile fields for Talent Dashboard compatibility
 * 
 * Re-adds experience_level and weight_lbs if they were dropped
 */

exports.up = async function(knex) {
  const hasExperienceLevel = await knex.schema.hasColumn('profiles', 'experience_level');
  const hasWeightLbs = await knex.schema.hasColumn('profiles', 'weight_lbs');

  return knex.schema.alterTable('profiles', table => {
    if (!hasExperienceLevel) {
      table.string('experience_level', 30).nullable().comment('Matches dashboard-talent/profile.js expectations');
    }
    if (!hasWeightLbs) {
      table.decimal('weight_lbs', 5, 2).nullable().comment('Redundant weight in lbs for dashboard display compatibility');
    }
  });
};

exports.down = async function(knex) {
  return knex.schema.alterTable('profiles', table => {
    table.dropColumn('experience_level');
    table.dropColumn('weight_lbs');
  });
};
