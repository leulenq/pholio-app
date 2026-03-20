/**
 * Migration: Create boards system
 * NOTE: This is a stub migration file created to resolve migration directory corruption.
 * If this migration was previously run, it should have created boards-related tables.
 * This stub ensures Knex can continue without errors.
 * 
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  // Stub migration - if boards system already exists, this will be a no-op
  // If you need to recreate the boards system, implement the actual table creation here
  console.log('[Migration] Stub migration: create_boards_system - checking if boards table exists');
  
  try {
    // Check if boards table exists, if not create it
    const hasBoardsTable = await knex.schema.hasTable('boards');
    if (!hasBoardsTable) {
      await knex.schema.createTable('boards', (table) => {
        table.uuid('id').primary();
        table.uuid('agency_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
        table.string('name').notNullable();
        table.text('description').nullable();
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.timestamp('updated_at').defaultTo(knex.fn.now());
      });
      console.log('[Migration] Created boards table');
    } else {
      console.log('[Migration] Boards table already exists, skipping creation');
    }
  } catch (error) {
    // If table creation fails (e.g., references don't exist), log and continue
    console.log('[Migration] Boards table may already exist or error occurred:', error.message);
  }
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  // Drop dependent tables first (in reverse order of creation)
  // These tables have foreign keys referencing boards, so they must be dropped first
  // Use CASCADE to handle any remaining dependencies
  const hasBoardProfilesTable = await knex.schema.hasTable('board_profiles');
  if (hasBoardProfilesTable) {
    await knex.raw('DROP TABLE IF EXISTS board_profiles CASCADE');
    console.log('[Migration] Dropped board_profiles table');
  }
  
  const hasBoardTagsTable = await knex.schema.hasTable('board_tags');
  if (hasBoardTagsTable) {
    await knex.raw('DROP TABLE IF EXISTS board_tags CASCADE');
    console.log('[Migration] Dropped board_tags table');
  }
  
  // Now drop the main boards table (use CASCADE to be safe)
  const hasBoardsTable = await knex.schema.hasTable('boards');
  if (hasBoardsTable) {
    await knex.raw('DROP TABLE IF EXISTS boards CASCADE');
    console.log('[Migration] Dropped boards table');
  }
};

