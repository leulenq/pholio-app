/**
 * Migration: Rename measurement columns to include _cm suffix
 *
 * CRITICAL FIX: Resolves unit confusion where cm values were stored in inch-expected columns
 *
 * Changes:
 * - bust → bust_cm
 * - waist → waist_cm
 * - hips → hips_cm
 *
 * All existing data is preserved (values are already in cm, we're just fixing the naming)
 *
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  const isPostgres = knex.client.config.client === 'pg' || knex.client.config.client === 'postgresql';

  console.log('[Migration] Starting measurement column rename...');

  if (isPostgres) {
    // PostgreSQL: Use ALTER TABLE RENAME COLUMN
    await knex.raw('ALTER TABLE profiles RENAME COLUMN bust TO bust_cm');
    await knex.raw('ALTER TABLE profiles RENAME COLUMN waist TO waist_cm');
    await knex.raw('ALTER TABLE profiles RENAME COLUMN hips TO hips_cm');

    console.log('[Migration] ✅ Renamed columns (PostgreSQL)');
  } else {
    // SQLite: Rename requires recreating columns (copy data, drop old, rename new)
    // SQLite doesn't support RENAME COLUMN in older versions

    // Step 1: Add new columns
    await knex.schema.table('profiles', (table) => {
      table.integer('bust_cm').nullable();
      table.integer('waist_cm').nullable();
      table.integer('hips_cm').nullable();
    });

    console.log('[Migration] Added new columns with _cm suffix');

    // Step 2: Copy data from old columns to new columns
    await knex.raw(`
      UPDATE profiles
      SET bust_cm = bust,
          waist_cm = waist,
          hips_cm = hips
      WHERE bust IS NOT NULL
         OR waist IS NOT NULL
         OR hips IS NOT NULL
    `);

    console.log('[Migration] Copied data from old columns to new columns');

    // Step 3: Drop old columns
    await knex.schema.table('profiles', (table) => {
      table.dropColumn('bust');
      table.dropColumn('waist');
      table.dropColumn('hips');
    });

    console.log('[Migration] ✅ Dropped old columns (SQLite)');
  }

  // Verification: Check that data was preserved
  const sampleCount = await knex('profiles')
    .count('* as count')
    .whereNotNull('bust_cm')
    .first();

  console.log(`[Migration] Verification: ${sampleCount.count} profiles have bust_cm values`);
  console.log('[Migration] ✅ Migration completed successfully');
};

/**
 * Rollback: Rename columns back to original names
 *
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  const isPostgres = knex.client.config.client === 'pg' || knex.client.config.client === 'postgresql';

  console.log('[Migration] Rolling back measurement column rename...');

  if (isPostgres) {
    // PostgreSQL: Use ALTER TABLE RENAME COLUMN
    await knex.raw('ALTER TABLE profiles RENAME COLUMN bust_cm TO bust');
    await knex.raw('ALTER TABLE profiles RENAME COLUMN waist_cm TO waist');
    await knex.raw('ALTER TABLE profiles RENAME COLUMN hips_cm TO hips');

    console.log('[Migration] ✅ Reverted column names (PostgreSQL)');
  } else {
    // SQLite: Recreate old columns
    await knex.schema.table('profiles', (table) => {
      table.integer('bust').nullable();
      table.integer('waist').nullable();
      table.integer('hips').nullable();
    });

    // Copy data back
    await knex.raw(`
      UPDATE profiles
      SET bust = bust_cm,
          waist = waist_cm,
          hips = hips_cm
      WHERE bust_cm IS NOT NULL
         OR waist_cm IS NOT NULL
         OR hips_cm IS NOT NULL
    `);

    // Drop new columns
    await knex.schema.table('profiles', (table) => {
      table.dropColumn('bust_cm');
      table.dropColumn('waist_cm');
      table.dropColumn('hips_cm');
    });

    console.log('[Migration] ✅ Reverted to old columns (SQLite)');
  }
};
