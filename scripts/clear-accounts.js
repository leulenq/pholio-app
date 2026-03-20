#!/usr/bin/env node

/**
 * Clear Accounts Script
 * Deletes all users and their associated data from the database
 * 
 * Usage: node scripts/clear-accounts.js
 * 
 * WARNING: This will delete ALL users, profiles, and related data!
 */

const knex = require('../src/db/knex');

async function tableExists(tableName) {
  try {
    const result = await knex.schema.hasTable(tableName);
    return result;
  } catch (error) {
    return false;
  }
}

async function clearTable(tableName, description) {
  const exists = await tableExists(tableName);
  if (!exists) {
    console.log(`[Clear Accounts] Skipping ${description} (table doesn't exist)`);
    return;
  }
  
  try {
    console.log(`[Clear Accounts] Deleting ${description}...`);
    await knex(tableName).del();
    console.log(`[Clear Accounts] ✓ ${description} deleted`);
  } catch (error) {
    console.error(`[Clear Accounts] Error deleting ${description}:`, error.message);
    throw error;
  }
}

async function clearAccounts() {
  try {
    console.log('[Clear Accounts] Starting account cleanup...');

    // Get connection info
    const client = knex.client.config.client;
    const dbName = knex.client.config.connection?.database || knex.client.config.connection?.filename || 'database';
    console.log(`[Clear Accounts] Database: ${dbName} (${client})`);

    // Delete in order (respecting foreign key constraints)
    // 1. Delete dependent records first (deepest first)
    await clearTable('application_activities', 'application activities');
    await clearTable('application_notes', 'application notes');
    await clearTable('application_tags', 'application tags');
    
    // Board dependencies
    await clearTable('board_profiles', 'board profiles');
    await clearTable('board_tags', 'board tags');
    await clearTable('board_requirements', 'board requirements');
    await clearTable('board_scoring_weights', 'board scoring weights');
    await clearTable('board_applications', 'board applications');
    
    // Communication & Tools
    await clearTable('interviews', 'interviews');
    await clearTable('messages', 'messages');
    await clearTable('reminders', 'reminders');
    await clearTable('filter_presets', 'filter presets');
    
    // Onboarding & Signals
    await clearTable('onboarding_analytics', 'onboarding analytics');
    await clearTable('onboarding_signals', 'onboarding signals');
    await clearTable('visitor_sessions', 'visitor sessions');

    // Boards (depends on users)
    await clearTable('boards', 'boards');

    // Existing tables
    await clearTable('profile_photos', 'profile photos');
    await clearTable('ai_profile_analysis', 'AI profile analysis');
    await clearTable('images', 'images');
    await clearTable('applications', 'applications');
    await clearTable('analytics', 'analytics');
    await clearTable('activities', 'activities');
    await clearTable('subscriptions', 'subscriptions');
    await clearTable('commissions', 'commissions');

    // 2. Delete profiles (may have FK to users, but CASCADE should handle it)
    await clearTable('profiles', 'profiles');

    // 3. Delete users (last, as profiles reference users)
    await clearTable('users', 'users');

    // 4. Clear sessions (optional - for clean slate)
    await clearTable('sessions', 'sessions');

    console.log('[Clear Accounts] ✓ All accounts cleared successfully!');
    console.log('[Clear Accounts] Database is now empty.');
    
    await knex.destroy();
  } catch (error) {
    console.error('[Clear Accounts] Error:', error);
    console.error('[Clear Accounts] Stack:', error.stack);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  clearAccounts()
    .then(() => {
      knex.destroy();
    })
    .catch((error) => {
      console.error('[Clear Accounts] Fatal error:', error);
      knex.destroy();
      process.exit(1);
    });
}

module.exports = { clearAccounts };
