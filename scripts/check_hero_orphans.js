const knex = require('../src/shared/db/knex');

async function checkHeroOrphans() {
  console.log('Checking for profiles with hero_image_path not in images table...');

  const profiles = await knex('profiles')
    .whereNotNull('hero_image_path')
    .whereNot('hero_image_path', '')
    .select('id', 'user_id', 'hero_image_path', 'first_name', 'last_name');

  let orphans = 0;

  for (const profile of profiles) {
    // Check if an image record exists with this path
    const image = await knex('images')
      .where({ profile_id: profile.id, path: profile.hero_image_path })
      .first();

    if (!image) {
      // Try fuzzy match (sometimes path has /uploads prefix or not)
      const pathPart = profile.hero_image_path.split('/').pop();
      const fuzzyImage = await knex('images')
        .where({ profile_id: profile.id })
        .andWhere('path', 'like', `%${pathPart}`)
        .first();

      if (!fuzzyImage) {
        console.log(`[ORPHAN] Profile ${profile.id} (${profile.first_name}): Hero path "${profile.hero_image_path}" not found in images table.`);
        orphans++;
      } else {
        console.log(`[MISMATCH] Profile ${profile.id}: Hero "${profile.hero_image_path}" matches image "${fuzzyImage.path}" but exact match failed.`);
      }
    }
  }

  console.log(`\nScan complete. Found ${orphans} profiles with orphaned hero images.`);
  process.exit();
}

checkHeroOrphans();
