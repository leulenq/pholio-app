/**
 * @param {import('knex').Knex} knex
 */
exports.up = async function(knex) {
  // 1. Data Sync: Set is_primary = true for images that match hero_image_path
  // This ensures we don't lose the currently selected primary image.
  await knex.raw(`
    UPDATE images
    SET is_primary = true
    FROM profiles
    WHERE images.profile_id = profiles.id
      AND images.path = profiles.hero_image_path
  `);

  // 2. Add Unique Partial Index
  // Ensures only one primary image per profile at the database level.
  await knex.raw(`
    CREATE UNIQUE INDEX IF NOT EXISTS one_primary_per_profile
    ON images (profile_id)
    WHERE is_primary = true
  `);

  // 3. Drop Redundant Columns from profiles
  await knex.schema.alterTable('profiles', (table) => {
    table.dropColumn('hero_image_path');
    
    // Check if these exist before dropping (to be safe)
    // photo_url_primary was added in 20260211000001
    // photo_key_primary is referenced in code, might be legacy or added recently
  });

  // Safely drop columns that might or might not exist depending on the environment
  const hasUrlPrimary = await knex.schema.hasColumn('profiles', 'photo_url_primary');
  if (hasUrlPrimary) {
    await knex.schema.alterTable('profiles', (table) => {
      table.dropColumn('photo_url_primary');
    });
  }

  const hasKeyPrimary = await knex.schema.hasColumn('profiles', 'photo_key_primary');
  if (hasKeyPrimary) {
    await knex.schema.alterTable('profiles', (table) => {
      table.dropColumn('photo_key_primary');
    });
  }
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function(knex) {
  // Revert unique index
  await knex.raw(`DROP INDEX IF EXISTS one_primary_per_profile`);

  // Add back columns
  await knex.schema.alterTable('profiles', (table) => {
    table.string('hero_image_path').nullable();
    table.text('photo_url_primary').nullable();
    table.string('photo_key_primary').nullable();
  });

  // Reverse data sync (best effort)
  await knex.raw(`
    UPDATE profiles
    SET hero_image_path = (
      SELECT path FROM images 
      WHERE images.profile_id = profiles.id AND images.is_primary = true 
      LIMIT 1
    )
  `);
};
