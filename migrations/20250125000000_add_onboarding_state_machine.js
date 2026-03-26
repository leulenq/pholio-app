/**
 * Migration: Add onboarding state machine fields to profiles table
 * Adds onboarding_stage (new values), completion tracking, completeness, services locking,
 * visibility mode, analysis status, and photo key fields
 * 
 * Note: Some columns (onboarding_completed_at, profile_completeness) may already exist
 * from migration 20250124000000. This migration checks and only adds if missing.
 * 
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  const isPostgres = knex.client.config.client === 'pg' || knex.client.config.client === 'postgresql';
  
  // Check if columns exist (PostgreSQL only)
  let hasOnboardingCompletedAt = false;
  let hasProfileCompleteness = false;
  
  if (isPostgres) {
    try {
      const result = await knex.raw(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'profiles' 
        AND column_name IN ('onboarding_completed_at', 'profile_completeness')
      `);
      const existingColumns = result.rows.map(row => row.column_name);
      hasOnboardingCompletedAt = existingColumns.includes('onboarding_completed_at');
      hasProfileCompleteness = existingColumns.includes('profile_completeness');
    } catch (err) {
      // If check fails, assume columns don't exist and try to add them
      console.warn('[Migration] Could not check column existence:', err.message);
    }
  }
  
  // Add columns conditionally
  await knex.schema.table('profiles', (table) => {
    if (!hasOnboardingCompletedAt) {
      table.timestamp('onboarding_completed_at').nullable().comment('When onboarding finished');
    }
    
    if (!hasProfileCompleteness) {
      // Use decimal(5,2) to match existing migration 20250124000000
      table.decimal('profile_completeness', 5, 2).notNullable().defaultTo(0).comment('Profile completeness 0-100');
    }
    
    // Always add these new columns
    table.boolean('services_locked').notNullable().defaultTo(true).comment('Whether services are locked until essentials complete');
    table.uuid('source_agency_id').nullable()
      .references('id')
      .inTable('agencies')
      .onDelete('SET NULL')
      .comment('Agency ID if user came from /apply/:agencySlug partner route');
    table.string('visibility_mode', 20).notNullable().defaultTo('private_intake')
      .comment('Visibility: private_intake | agency_locked | discoverable');
    table.string('analysis_status', 20).notNullable().defaultTo('pending')
      .comment('Analysis status: pending | complete | failed');
    table.text('analysis_error').nullable().comment('Error message if analysis failed');
    table.string('photo_key_primary', 255).nullable().comment('Canonical storage key for primary photo (e.g. uploads/filename.webp)');
  }).catch(async (err) => {
    // For SQLite or if column exists error, try adding columns individually
    if (err.message && (err.message.includes('duplicate column') || err.message.includes('already exists'))) {
      console.warn('[Migration] Some columns may already exist, adding remaining columns individually...');
      
      // Add remaining columns one by one
      try {
        await knex.schema.table('profiles', (table) => {
          if (!err.message.includes('services_locked')) {
            table.boolean('services_locked').notNullable().defaultTo(true);
          }
          if (!err.message.includes('source_agency_id')) {
            table.uuid('source_agency_id').nullable().references('id').inTable('agencies').onDelete('SET NULL');
          }
          if (!err.message.includes('visibility_mode')) {
            table.string('visibility_mode', 20).notNullable().defaultTo('private_intake');
          }
          if (!err.message.includes('analysis_status')) {
            table.string('analysis_status', 20).notNullable().defaultTo('pending');
          }
          if (!err.message.includes('analysis_error')) {
            table.text('analysis_error').nullable();
          }
          if (!err.message.includes('photo_key_primary')) {
            table.string('photo_key_primary', 255).nullable();
          }
        });
      } catch (retryErr) {
        // If retry also fails, log and continue (some columns may already exist)
        console.warn('[Migration] Retry also failed, some columns may already exist:', retryErr.message);
      }
    } else {
      throw err;
    }
  });
  
  // Migrate existing onboarding_stage values to new system
  try {
    await knex('profiles')
      .where({ onboarding_stage: 'draft' })
      .update({ onboarding_stage: 'identity' });
    
    await knex('profiles')
      .where({ onboarding_stage: 'completing' })
      .update({ onboarding_stage: 'upload' });
    
    await knex('profiles')
      .whereIn('onboarding_stage', ['submitted', 'processing', 'processed'])
      .update({ onboarding_stage: 'done', onboarding_completed_at: knex.fn.now() });
    
    await knex('profiles')
      .whereNull('onboarding_stage')
      .update({ onboarding_stage: 'identity' });
    
    // Set defaults for new columns
    await knex('profiles')
      .whereNull('visibility_mode')
      .update({ visibility_mode: 'private_intake' });
    
    await knex('profiles')
      .whereNull('services_locked')
      .update({ services_locked: true });
    
    await knex('profiles')
      .whereNull('analysis_status')
      .update({ analysis_status: 'pending' });
  } catch (migrateErr) {
    console.warn('[Migration] Error migrating data (may be expected):', migrateErr.message);
  }
  
  // Add indexes (ignore errors if they exist)
  try {
    await knex.schema.table('profiles', (table) => {
      table.index('services_locked');
      table.index('visibility_mode');
      table.index('source_agency_id');
      table.index('analysis_status');
    });
  } catch (idxErr) {
    console.warn('[Migration] Some indexes may already exist:', idxErr.message);
  }
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  // Only drop columns we added (not onboarding_completed_at or profile_completeness from migration 20250124000000)
  await knex.schema.table('profiles', (table) => {
    try {
      table.dropIndex('analysis_status');
      table.dropIndex('source_agency_id');
      table.dropIndex('visibility_mode');
      table.dropIndex('services_locked');
    } catch (err) {
      // Indexes may not exist
    }
    
    try {
      table.dropColumn('photo_key_primary');
      table.dropColumn('analysis_error');
      table.dropColumn('analysis_status');
      table.dropColumn('visibility_mode');
      table.dropColumn('source_agency_id');
      table.dropColumn('services_locked');
      // Note: Don't drop onboarding_completed_at and profile_completeness
      // as they may have been created by migration 20250124000000
    } catch (err) {
      // Columns may not exist
    }
  });
};
