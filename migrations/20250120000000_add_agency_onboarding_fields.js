/**
 * Migration: Add agency onboarding fields
 * NOTE: This is a stub migration file created to resolve migration directory corruption.
 * WARNING: This migration shares a timestamp with add_ai_metadata_to_profiles.js
 * If this migration was previously run, it should have added agency onboarding fields.
 * This stub ensures Knex can continue without errors.
 * 
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  // Stub migration - check if columns already exist before adding
  console.log('[Migration] Stub migration: add_agency_onboarding_fields - checking columns');
  
  const hasUsersTable = await knex.schema.hasTable('users');
  
  if (hasUsersTable) {
    // Check and add agency onboarding fields to users table (for AGENCY role)
    // This is idempotent - safe to run multiple times
    
    try {
      // Use raw SQL to check if columns exist (more reliable across databases)
      if (knex.client.config.client === 'pg') {
        const columns = await knex.raw(`
          SELECT column_name 
          FROM information_schema.columns 
          WHERE table_name = 'users' AND table_schema = 'public'
        `);
        
        const columnNames = columns.rows ? columns.rows.map(r => r.column_name) : [];
        
        // Add agency onboarding fields if they don't exist
        if (!columnNames.includes('agency_name')) {
          await knex.schema.table('users', (table) => {
            table.string('agency_name').nullable().comment('Agency name for onboarding');
          });
          console.log('[Migration] Added agency_name column to users table');
        }
        
        if (!columnNames.includes('agency_description')) {
          await knex.schema.table('users', (table) => {
            table.text('agency_description').nullable().comment('Agency description for onboarding');
          });
          console.log('[Migration] Added agency_description column to users table');
        }
      } else {
        // For SQLite or other databases, use schema checks
        const hasAgencyName = await knex.schema.hasColumn('users', 'agency_name');
        const hasAgencyDescription = await knex.schema.hasColumn('users', 'agency_description');
        
        if (!hasAgencyName) {
          await knex.schema.table('users', (table) => {
            table.string('agency_name').nullable();
          });
        }
        
        if (!hasAgencyDescription) {
          await knex.schema.table('users', (table) => {
            table.text('agency_description').nullable();
          });
        }
      }
    } catch (error) {
      // If columns already exist or other error, log and continue
      console.log('[Migration] Agency onboarding fields may already exist or error occurred:', error.message);
    }
  } else {
    console.log('[Migration] Users table not found, skipping agency onboarding fields');
  }
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  // Stub migration - safely remove columns if they exist
  // Use raw SQL with IF EXISTS for PostgreSQL, or try-catch for other databases
  const hasUsersTable = await knex.schema.hasTable('users');
  const isPostgres = knex.client.config.client === 'pg' || knex.client.config.client === 'postgresql';
  
  if (hasUsersTable) {
    if (isPostgres) {
      // PostgreSQL: Use IF EXISTS for safe column drops
      try {
        await knex.raw('ALTER TABLE users DROP COLUMN IF EXISTS agency_name');
        await knex.raw('ALTER TABLE users DROP COLUMN IF EXISTS agency_description');
        console.log('[Migration] Removed agency onboarding fields from users table (if they existed)');
      } catch (error) {
        // Log but don't fail - columns may not exist
        console.log('[Migration] Error removing agency onboarding fields (may not exist):', error.message);
      }
    } else {
      // SQLite or other: Use try-catch around schema operations
      try {
        const hasAgencyName = await knex.schema.hasColumn('users', 'agency_name');
        if (hasAgencyName) {
          await knex.schema.table('users', (table) => {
            table.dropColumn('agency_name');
          });
        }
        
        const hasAgencyDescription = await knex.schema.hasColumn('users', 'agency_description');
        if (hasAgencyDescription) {
          await knex.schema.table('users', (table) => {
            table.dropColumn('agency_description');
          });
        }
        console.log('[Migration] Removed agency onboarding fields from users table');
      } catch (error) {
        // Columns may not exist - that's okay
        console.log('[Migration] Error removing agency onboarding fields (may not exist):', error.message);
      }
    }
  }
};

