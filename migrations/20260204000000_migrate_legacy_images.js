/**
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  // Move data from legacy 'images' table to 'profile_photos'
  // Only move valid paths
  const legacyImages = await knex('images').whereNot('path', 'like', '%[object Object]%');
  
  if (legacyImages.length > 0) {
    const newPhotos = legacyImages.map(img => ({
      profile_id: img.profile_id,
      storage_key: img.path, // Assuming legacy path is valid
      kind: 'polaroid' // Default kind
    }));
    
    await knex('profile_photos').insert(newPhotos);
    console.log(`Migrated ${newPhotos.length} images to profile_photos.`);
  }
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  // Irreversible for now as we don't track origin
};
