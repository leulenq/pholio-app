/**
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  await knex.schema.table('users', (table) => {
    // Add Firebase UID column for Firebase Authentication
    table.string('firebase_uid', 128).nullable().unique();
    // Make password_hash nullable to support migration period
    // Existing users can still use bcrypt passwords until migrated
    table.string('password_hash').nullable().alter();
    // Add index on firebase_uid for faster lookups
    table.index('firebase_uid');
  });
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  // For test environments, we need to handle NULL password_hash values
  // Set a placeholder password for users with NULL password_hash (Firebase-only users)
  // This allows us to restore the NOT NULL constraint safely
  const usersWithNullPassword = await knex('users')
    .whereNull('password_hash')
    .select('id');
  
  if (usersWithNullPassword.length > 0) {
    // Set a placeholder password hash for users without passwords (Firebase-only users)
    // Use a bcrypt hash of 'placeholder' to satisfy the NOT NULL constraint
    // In production, you might want to delete these users or handle differently
    const bcrypt = require('bcrypt');
    const placeholderHash = await bcrypt.hash('placeholder', 10);
    
    await knex('users')
      .whereNull('password_hash')
      .update({ password_hash: placeholderHash });
    
    console.log(`[Migration] Set placeholder password for ${usersWithNullPassword.length} Firebase-only users`);
  }
  
  await knex.schema.table('users', (table) => {
    // Remove Firebase UID column
    table.dropIndex('firebase_uid');
    table.dropColumn('firebase_uid');
    // Now restore password_hash as not nullable (all NULL values have been handled)
    table.string('password_hash').notNullable().alter();
  });
};

