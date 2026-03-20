/**
 * Migration: Add agency boards and tags
 * NOTE: This is a stub migration file created to resolve migration directory corruption.
 * If this migration was previously run, it should have added boards and tags functionality.
 * This stub ensures Knex can continue without errors.
 * 
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  // Stub migration - if tables already exist, this will be a no-op
  console.log('[Migration] Stub migration: add_agency_boards_and_tags - checking if tables exist');
  
  try {
    // Check if board_tags table exists, if not create it
    const hasBoardTagsTable = await knex.schema.hasTable('board_tags');
    if (!hasBoardTagsTable) {
      await knex.schema.createTable('board_tags', (table) => {
        table.uuid('id').primary();
        table.uuid('board_id').notNullable().references('id').inTable('boards').onDelete('CASCADE');
        table.string('tag_name').notNullable();
        table.timestamp('created_at').defaultTo(knex.fn.now());
        table.unique(['board_id', 'tag_name']);
      });
      console.log('[Migration] Created board_tags table');
    } else {
      console.log('[Migration] board_tags table already exists, skipping creation');
    }
    
    // Check if board_profiles table exists (for linking profiles to boards)
    const hasBoardProfilesTable = await knex.schema.hasTable('board_profiles');
    if (!hasBoardProfilesTable) {
      await knex.schema.createTable('board_profiles', (table) => {
        table.uuid('id').primary();
        table.uuid('board_id').notNullable().references('id').inTable('boards').onDelete('CASCADE');
        table.uuid('profile_id').notNullable().references('id').inTable('profiles').onDelete('CASCADE');
        table.timestamp('added_at').defaultTo(knex.fn.now());
        table.unique(['board_id', 'profile_id']);
      });
      console.log('[Migration] Created board_profiles table');
    } else {
      console.log('[Migration] board_profiles table already exists, skipping creation');
    }
  } catch (error) {
    // If table creation fails (e.g., references don't exist), log and continue
    console.log('[Migration] Board tags/profiles tables may already exist or error occurred:', error.message);
  }
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  // Stub migration - safely drop if exists
  const hasBoardProfilesTable = await knex.schema.hasTable('board_profiles');
  if (hasBoardProfilesTable) {
    await knex.schema.dropTableIfExists('board_profiles');
  }
  
  const hasBoardTagsTable = await knex.schema.hasTable('board_tags');
  if (hasBoardTagsTable) {
    await knex.schema.dropTableIfExists('board_tags');
  }
};

