/**
 * Migration: Create Casting Call Infrastructure
 * - Creates onboarding_signals table for Project Casting Call
 * - Adds phenotype_tags and archetype_scores to ai_profile_analysis
 *
 * Part of Phase 1: Backend Infrastructure for "Project Casting Call"
 *
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  const isPostgres = knex.client.config.client === 'pg' || knex.client.config.client === 'postgresql';

  // 1. Create onboarding_signals table
  await knex.schema.createTable('onboarding_signals', (table) => {
    // Primary key
    if (isPostgres) {
      table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    } else {
      table.uuid('id').primary();
    }

    // Foreign key to profiles
    table.uuid('profile_id').notNullable().unique()
      .references('id')
      .inTable('profiles')
      .onDelete('CASCADE')
      .comment('Profile this signal collection belongs to');

    // Smart Entry Signals (OAuth data extraction)
    table.string('oauth_provider', 20).nullable()
      .comment('OAuth provider: google | instagram');
    table.text('inferred_location').nullable()
      .comment('Location inferred from OAuth profile or email domain');

    // Bio keywords (text array for Postgres, JSON for SQLite)
    if (isPostgres) {
      table.specificType('inferred_bio_keywords', 'text[]').nullable()
        .comment('Keywords scraped from bio/profile');
    } else {
      table.text('inferred_bio_keywords').nullable()
        .comment('JSON array: Keywords scraped from bio/profile');
    }

    // Visual Interview Signals (Scout - AI analysis)
    table.string('digi_storage_key', 255).nullable()
      .comment('Storage key for primary headshot (e.g., uploads/jane-123.webp)');

    if (isPostgres) {
      table.jsonb('ai_phenotype_tags').nullable()
        .comment('AI-detected visual attributes: {hair_color, eye_color, skin_tone, build}');
      table.jsonb('ai_predicted_measurements').nullable()
        .comment('AI-predicted measurements: {height_cm, bust, waist, hips}');
    } else {
      table.text('ai_phenotype_tags').nullable()
        .comment('JSON: AI-detected visual attributes');
      table.text('ai_predicted_measurements').nullable()
        .comment('JSON: AI-predicted measurements');
    }

    table.integer('user_edits_count').notNullable().defaultTo(0)
      .comment('Number of user edits to AI predictions');

    // Maverick Chat Signals (Vibe - psychographic questions)
    table.string('ambition_type', 50).nullable()
      .comment('Career ambition: editorial | commercial | hybrid');
    table.string('travel_willingness', 20).nullable()
      .comment('Travel flexibility: high | moderate | low');
    table.string('comfort_level', 20).nullable()
      .comment('Comfort with risk: adventurous | moderate | cautious');

    // Calculated Archetype (Reveal - weighted scoring)
    table.decimal('archetype_commercial_pct', 5, 2).nullable()
      .comment('Commercial archetype percentage (0-100)');
    table.decimal('archetype_editorial_pct', 5, 2).nullable()
      .comment('Editorial archetype percentage (0-100)');
    table.decimal('archetype_lifestyle_pct', 5, 2).nullable()
      .comment('Lifestyle archetype percentage (0-100)');
    table.string('archetype_label', 50).nullable()
      .comment('Human-readable archetype label (e.g., "Commercial Star")');

    // Timestamps
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    // Indexes
    table.index('profile_id');
    table.index('oauth_provider');
    table.index('archetype_label');
  });

  console.log('[Migration] Created onboarding_signals table');

  // 2. Add phenotype_tags and archetype_scores to ai_profile_analysis
  const hasAiTable = await knex.schema.hasTable('ai_profile_analysis');

  if (hasAiTable) {
    await knex.schema.table('ai_profile_analysis', (table) => {
      if (isPostgres) {
        table.jsonb('phenotype_tags').nullable()
          .comment('Structured phenotype data: {hair_color, eye_color, skin_tone, build}');
        table.jsonb('archetype_scores').nullable()
          .comment('Archetype scoring: {commercial, editorial, lifestyle, runway}');
      } else {
        table.text('phenotype_tags').nullable()
          .comment('JSON: Structured phenotype data');
        table.text('archetype_scores').nullable()
          .comment('JSON: Archetype scoring');
      }

      table.string('archetype_label', 50).nullable()
        .comment('Primary archetype label (e.g., "Commercial Star")');
    });

    console.log('[Migration] Added phenotype_tags and archetype_scores to ai_profile_analysis');
  } else {
    console.warn('[Migration] ai_profile_analysis table not found, skipping column additions');
  }
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  // Drop onboarding_signals table
  await knex.schema.dropTableIfExists('onboarding_signals');
  console.log('[Migration] Dropped onboarding_signals table');

  // Remove columns from ai_profile_analysis
  const hasAiTable = await knex.schema.hasTable('ai_profile_analysis');
  if (hasAiTable) {
    await knex.schema.table('ai_profile_analysis', (table) => {
      table.dropColumn('phenotype_tags');
      table.dropColumn('archetype_scores');
      table.dropColumn('archetype_label');
    });
    console.log('[Migration] Removed casting call columns from ai_profile_analysis');
  }
};
