/**
 * Migration: Complete boards system with all necessary columns and tables
 * This adds missing columns to boards table and creates related tables
 *
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  // 1. Update boards table with missing columns
  const hasBoardsTable = await knex.schema.hasTable('boards');
  if (hasBoardsTable) {
    await knex.schema.table('boards', (table) => {
      // Check and add columns if they don't exist
      const columns = [
        { name: 'is_active', type: 'boolean', default: true },
        { name: 'sort_order', type: 'integer', default: 0 }
      ];

      // Note: Knex doesn't have a hasColumn method, so we use raw query
      // We'll use ALTER TABLE IF NOT EXISTS pattern or check existing columns
    });

    // Safer approach: Use raw SQL with IF NOT EXISTS
    const dbClient = knex.client.config.client;

    if (dbClient === 'pg' || dbClient === 'postgresql') {
      // PostgreSQL
      await knex.raw(`
        ALTER TABLE boards
        ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true NOT NULL,
        ADD COLUMN IF NOT EXISTS sort_order INTEGER DEFAULT 0;
      `);
    } else {
      // SQLite - check if columns exist first
      const boardsInfo = await knex.raw(`PRAGMA table_info(boards)`);
      const existingColumns = boardsInfo.map(col => col.name);

      if (!existingColumns.includes('is_active')) {
        await knex.schema.table('boards', (table) => {
          table.boolean('is_active').notNullable().defaultTo(true);
        });
      }

      if (!existingColumns.includes('sort_order')) {
        await knex.schema.table('boards', (table) => {
          table.integer('sort_order').defaultTo(0);
        });
      }
    }

    console.log('[Migration] Updated boards table with missing columns');
  }

  // 2. Create board_requirements table if it doesn't exist
  const hasRequirementsTable = await knex.schema.hasTable('board_requirements');
  if (!hasRequirementsTable) {
    await knex.schema.createTable('board_requirements', (table) => {
      table.uuid('id').primary();
      table
        .uuid('board_id')
        .notNullable()
        .references('id')
        .inTable('boards')
        .onDelete('CASCADE');

      // Age range
      table.integer('min_age').nullable();
      table.integer('max_age').nullable();

      // Height range
      table.integer('min_height_cm').nullable();
      table.integer('max_height_cm').nullable();

      // Gender (stored as JSON array)
      table.text('genders').nullable();

      // Measurements range
      table.decimal('min_bust', 5, 2).nullable();
      table.decimal('max_bust', 5, 2).nullable();
      table.decimal('min_waist', 5, 2).nullable();
      table.decimal('max_waist', 5, 2).nullable();
      table.decimal('min_hips', 5, 2).nullable();
      table.decimal('max_hips', 5, 2).nullable();

      // Arrays stored as JSON
      table.text('body_types').nullable();
      table.text('comfort_levels').nullable();
      table.text('experience_levels').nullable();
      table.text('skills').nullable();
      table.text('locations').nullable();

      // Social reach
      table.integer('min_social_reach').nullable();
      table.string('social_reach_importance', 20).nullable();

      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());

      table.unique(['board_id']);
      table.index('board_id');
    });
    console.log('[Migration] Created board_requirements table');
  }

  // 3. Create board_scoring_weights table if it doesn't exist
  const hasWeightsTable = await knex.schema.hasTable('board_scoring_weights');
  if (!hasWeightsTable) {
    await knex.schema.createTable('board_scoring_weights', (table) => {
      table.uuid('id').primary();
      table
        .uuid('board_id')
        .notNullable()
        .references('id')
        .inTable('boards')
        .onDelete('CASCADE');

      // Weight sliders (0-5 scale)
      table.decimal('age_weight', 3, 1).notNullable().defaultTo(0);
      table.decimal('height_weight', 3, 1).notNullable().defaultTo(0);
      table.decimal('measurements_weight', 3, 1).notNullable().defaultTo(0);
      table.decimal('body_type_weight', 3, 1).notNullable().defaultTo(0);
      table.decimal('comfort_weight', 3, 1).notNullable().defaultTo(0);
      table.decimal('experience_weight', 3, 1).notNullable().defaultTo(0);
      table.decimal('skills_weight', 3, 1).notNullable().defaultTo(0);
      table.decimal('location_weight', 3, 1).notNullable().defaultTo(0);
      table.decimal('social_reach_weight', 3, 1).notNullable().defaultTo(0);

      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());

      table.unique(['board_id']);
      table.index('board_id');
    });
    console.log('[Migration] Created board_scoring_weights table');
  }

  // 4. Create board_applications table if it doesn't exist
  const hasBoardApplicationsTable = await knex.schema.hasTable('board_applications');
  if (!hasBoardApplicationsTable) {
    await knex.schema.createTable('board_applications', (table) => {
      table.uuid('id').primary();
      table
        .uuid('board_id')
        .notNullable()
        .references('id')
        .inTable('boards')
        .onDelete('CASCADE');
      table
        .uuid('application_id')
        .notNullable()
        .references('id')
        .inTable('applications')
        .onDelete('CASCADE');
      table.integer('match_score').nullable();
      table.text('match_details').nullable();
      table.timestamp('created_at').defaultTo(knex.fn.now());
      table.timestamp('updated_at').defaultTo(knex.fn.now());

      table.unique(['board_id', 'application_id']);
      table.index('board_id');
      table.index('application_id');
      table.index('match_score');
    });
    console.log('[Migration] Created board_applications table');
  }

  // 5. Update applications table if columns don't exist
  const hasApplicationsTable = await knex.schema.hasTable('applications');
  if (hasApplicationsTable) {
    const dbClient = knex.client.config.client;

    if (dbClient === 'pg' || dbClient === 'postgresql') {
      // PostgreSQL - add columns if they don't exist
      await knex.raw(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_name='applications' AND column_name='board_id') THEN
            ALTER TABLE applications ADD COLUMN board_id UUID REFERENCES boards(id) ON DELETE SET NULL;
            CREATE INDEX IF NOT EXISTS applications_board_id_index ON applications(board_id);
          END IF;

          IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_name='applications' AND column_name='match_score') THEN
            ALTER TABLE applications ADD COLUMN match_score INTEGER;
            CREATE INDEX IF NOT EXISTS applications_match_score_index ON applications(match_score);
          END IF;

          IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                        WHERE table_name='applications' AND column_name='match_calculated_at') THEN
            ALTER TABLE applications ADD COLUMN match_calculated_at TIMESTAMP;
          END IF;
        END $$;
      `);
    } else {
      // SQLite - check and add columns
      const applicationsInfo = await knex.raw(`PRAGMA table_info(applications)`);
      const existingColumns = applicationsInfo.map(col => col.name);

      await knex.schema.table('applications', (table) => {
        if (!existingColumns.includes('board_id')) {
          table.uuid('board_id').nullable().references('id').inTable('boards').onDelete('SET NULL');
        }
        if (!existingColumns.includes('match_score')) {
          table.integer('match_score').nullable();
        }
        if (!existingColumns.includes('match_calculated_at')) {
          table.timestamp('match_calculated_at').nullable();
        }
      });

      // Add indexes separately for SQLite
      if (!existingColumns.includes('board_id')) {
        await knex.raw('CREATE INDEX IF NOT EXISTS applications_board_id_index ON applications(board_id)');
      }
      if (!existingColumns.includes('match_score')) {
        await knex.raw('CREATE INDEX IF NOT EXISTS applications_match_score_index ON applications(match_score)');
      }
    }

    console.log('[Migration] Updated applications table with board columns');
  }

  console.log('[Migration] Boards system update complete');
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  // Rollback in reverse order

  // 1. Remove columns from applications table
  const hasApplicationsTable = await knex.schema.hasTable('applications');
  if (hasApplicationsTable) {
    await knex.schema.table('applications', (table) => {
      table.dropColumn('match_calculated_at');
      table.dropColumn('match_score');
      table.dropColumn('board_id');
    });
  }

  // 2. Drop board_applications table
  await knex.schema.dropTableIfExists('board_applications');

  // 3. Drop board_scoring_weights table
  await knex.schema.dropTableIfExists('board_scoring_weights');

  // 4. Drop board_requirements table
  await knex.schema.dropTableIfExists('board_requirements');

  // 5. Remove columns from boards table
  const hasBoardsTable = await knex.schema.hasTable('boards');
  if (hasBoardsTable) {
    await knex.schema.table('boards', (table) => {
      table.dropColumn('sort_order');
      table.dropColumn('is_active');
    });
  }

  console.log('[Migration] Boards system update rolled back');
};
