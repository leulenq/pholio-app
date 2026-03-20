/**
 * Migration: Add modeling_categories and fit_scores to profiles
 * 
 * Part 1: modeling_categories — self-declared category preferences (jsonb array)
 * Part 2: fit_score_* — persisted AI-calculated fit scores from Casting Reveal
 */
exports.up = function (knex) {
  return knex.schema.alterTable('profiles', (table) => {
    // Self-declared categories
    table.jsonb('modeling_categories').nullable();  // ["Runway", "Editorial", "Commercial"]

    // Persisted fit scores (0-100 each)
    table.smallint('fit_score_runway').nullable();
    table.smallint('fit_score_editorial').nullable();
    table.smallint('fit_score_commercial').nullable();
    table.smallint('fit_score_lifestyle').nullable();
    table.smallint('fit_score_swim_fitness').nullable();
    table.smallint('fit_score_overall').nullable();
    table.timestamp('fit_scores_calculated_at').nullable();
  });
};

exports.down = function (knex) {
  return knex.schema.alterTable('profiles', (table) => {
    table.dropColumn('modeling_categories');
    table.dropColumn('fit_score_runway');
    table.dropColumn('fit_score_editorial');
    table.dropColumn('fit_score_commercial');
    table.dropColumn('fit_score_lifestyle');
    table.dropColumn('fit_score_swim_fitness');
    table.dropColumn('fit_score_overall');
    table.dropColumn('fit_scores_calculated_at');
  });
};
