/**
 * Migration: Add onboarding stage and AI pipeline fields to profiles table
 * Adds onboarding_stage, submitted_at, processed_at, visual_intel, onboarding_predictions,
 * librarian_synthesis, vector_summary_text fields
 * 
 * Note: vibe_score, is_unicorn already exist from migration 20250120000000_add_ai_metadata_to_profiles.js
 * This migration adds vector_summary_text as TEXT (separate from vector_summary pgvector field)
 * 
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  const isPostgres = knex.client.config.client === 'pg' || knex.client.config.client === 'postgresql';
  
  await knex.schema.table('profiles', (table) => {
    // Onboarding stage tracking
    table.string('onboarding_stage', 20).nullable().comment('onboarding stage: draft | completing | submitted | processing | processed');
    
    // Timestamps
    table.timestamp('submitted_at').nullable().comment('When profile was submitted for processing');
    table.timestamp('processed_at').nullable().comment('When Phase C pipeline completed');
    
    // AI pipeline outputs (JSONB for PostgreSQL, TEXT for SQLite)
    if (isPostgres) {
      table.jsonb('visual_intel').nullable().comment('Scout analysis output (JSON)');
      table.jsonb('onboarding_predictions').nullable().comment('Maverick assessment output (JSON)');
      table.jsonb('librarian_synthesis').nullable().comment('Librarian synthesis output (JSON)');
    } else {
      table.text('visual_intel').nullable().comment('Scout analysis output (JSON string)');
      table.text('onboarding_predictions').nullable().comment('Maverick assessment output (JSON string)');
      table.text('librarian_synthesis').nullable().comment('Librarian synthesis output (JSON string)');
    }
    
    // Vector summary as TEXT (semantic summary, not pgvector array)
    table.text('vector_summary_text').nullable().comment('Librarian semantic summary (TEXT, not vector array)');
  });
  
  // Set default onboarding_stage for existing profiles
  await knex('profiles')
    .whereNull('onboarding_stage')
    .update({ onboarding_stage: 'draft' });
  
  // Add index on onboarding_stage for queries
  await knex.schema.table('profiles', (table) => {
    table.index('onboarding_stage');
  });
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  await knex.schema.table('profiles', (table) => {
    table.dropIndex('onboarding_stage');
    table.dropColumn('onboarding_stage');
    table.dropColumn('submitted_at');
    table.dropColumn('processed_at');
    table.dropColumn('visual_intel');
    table.dropColumn('onboarding_predictions');
    table.dropColumn('librarian_synthesis');
    table.dropColumn('vector_summary_text');
  });
};
