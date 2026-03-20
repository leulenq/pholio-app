/**
 * Migration: Add onboarding completion and prediction fields to profiles table
 * Adds onboarding_completed_at, predicted_* fields, market_fit_rankings, 
 * profile_completeness, and photo_embedding fields
 * 
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  const isPostgres = knex.client.config.client === 'pg' || knex.client.config.client === 'postgresql';
  
  await knex.schema.table('profiles', (table) => {
    // Onboarding completion tracking
    table.timestamp('onboarding_completed_at').nullable().comment('When onboarding finished');
    
    // AI predicted fields (separate from confirmed values)
    table.integer('predicted_height_cm').nullable().comment('AI predicted height in cm');
    table.decimal('predicted_weight_lbs', 5, 2).nullable().comment('AI predicted weight in lbs');
    table.decimal('predicted_bust', 5, 2).nullable().comment('AI predicted bust in inches');
    table.decimal('predicted_waist', 5, 2).nullable().comment('AI predicted waist in inches');
    table.decimal('predicted_hips', 5, 2).nullable().comment('AI predicted hips in inches');
    table.string('predicted_hair_color', 30).nullable().comment('AI predicted hair color');
    table.string('predicted_eye_color', 30).nullable().comment('AI predicted eye color');
    table.string('predicted_skin_tone', 50).nullable().comment('AI predicted skin tone');
    
    // Market fit rankings (array of 5 markets with scores)
    if (isPostgres) {
      table.jsonb('market_fit_rankings').nullable().comment('Ranked list of 5 markets with scores (JSON)');
      table.jsonb('photo_embedding').nullable().comment('Vector embedding from photo analysis (JSON array)');
    } else {
      table.text('market_fit_rankings').nullable().comment('Ranked list of 5 markets with scores (JSON string)');
      table.text('photo_embedding').nullable().comment('Vector embedding from photo analysis (JSON string)');
    }
    
    // Profile completeness (0-100 percentage)
    table.decimal('profile_completeness', 5, 2).defaultTo(0).comment('Profile completeness percentage (0-100)');
  });
  
  // Add index on onboarding_completed_at for queries
  await knex.schema.table('profiles', (table) => {
    table.index('onboarding_completed_at');
  });
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  await knex.schema.table('profiles', (table) => {
    table.dropIndex('onboarding_completed_at');
    table.dropColumn('onboarding_completed_at');
    table.dropColumn('predicted_height_cm');
    table.dropColumn('predicted_weight_lbs');
    table.dropColumn('predicted_bust');
    table.dropColumn('predicted_waist');
    table.dropColumn('predicted_hips');
    table.dropColumn('predicted_hair_color');
    table.dropColumn('predicted_eye_color');
    table.dropColumn('predicted_skin_tone');
    table.dropColumn('market_fit_rankings');
    table.dropColumn('photo_embedding');
    table.dropColumn('profile_completeness');
  });
};
