const knex = require('../src/shared/db/knex');

async function cleanupBadRoutes() {
  try {
    console.log('Starting cleanup of corrupted image paths...');
    
    // Check old table for corruption
    const corrupted = await knex('images')
      .where('path', 'like', '%[object Object]%')
      .select('id', 'profile_id');

    if (corrupted.length > 0) {
        console.log(`Found ${corrupted.length} corrupted records in 'images' table.`);
        const deleted = await knex('images')
        .where('path', 'like', '%[object Object]%')
        .del();
        console.log(`Deleted ${deleted} records.`);
    } else {
        console.log('No corrupted records found in images table.');
    }
    
    // Check profiles for hero_image_path corruption
    const corruptedProfiles = await knex('profiles')
        .where('hero_image_path', 'like', '%[object Object]%')
        .update({ hero_image_path: null });
        
    if (corruptedProfiles > 0) {
        console.log(`Reset ${corruptedProfiles} corrupted hero_image_paths in profiles table.`);
    }

    console.log('Cleanup complete.');
    process.exit(0);
  } catch (error) {
    console.error('Cleanup failed:', error);
    process.exit(1);
  }
}

cleanupBadRoutes();
