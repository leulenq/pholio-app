const knex = require('../src/shared/db/knex');
const { v4: uuidv4 } = require('uuid');

async function fixHeroOrphans() {
  console.log('Fixing profiles with hero_image_path not in images table...');

  let hasMetadata = false;
  try {
    hasMetadata = await knex.schema.hasColumn('images', 'metadata');
    console.log(`[SCHEMA] images table has metadata column: ${hasMetadata}`);
  } catch (e) {
    console.log(`[SCHEMA] Error checking metadata column: ${e.message}`);
  }

  const profiles = await knex('profiles')
    .whereNotNull('hero_image_path')
    .whereNot('hero_image_path', '')
    .select('id', 'user_id', 'hero_image_path', 'first_name', 'last_name');

  let fixed = 0;

  for (const profile of profiles) {
    const image = await knex('images')
      .where({ profile_id: profile.id, path: profile.hero_image_path })
      .first();

    if (!image) {
      console.log(`[FIXING] Profile ${profile.id} (${profile.first_name}): Restoring hero image record for "${profile.hero_image_path}"`);
      
      const newImageId = uuidv4();
      
      const insertData = {
        id: newImageId,
        profile_id: profile.id,
        path: profile.hero_image_path,
        label: 'portfolio',
        sort: 0,
        // created_at: new Date() // Keep created_at
        // Remove updated_at as it doesn't exist
      };
      // Explicitly set created_at
      insertData.created_at = new Date();

      if (hasMetadata) {
        insertData.metadata = JSON.stringify({
           role: 'headshot', // Auto-tag as Headshot so ReadinessBar sees it
           visibility: 'public',
           caption: 'Profile Hero'
        });
      }

      console.log('Inserting data:', insertData);

      try {
        await knex('images').insert(insertData);
        console.log('Insert successful');
        fixed++;
      } catch (err) {
        console.error('Insert failed:', err.message);
      }
    }
  }

  console.log(`\nFix complete. Restored ${fixed} hero image records.`);
  process.exit();
}

fixHeroOrphans();
