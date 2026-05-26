/**
 * Add original_* columns to images so in-place file replacement can preserve the pre-edit asset.
 * These are populated only when an image is first replaced via POST /api/talent/media/:id/replace.
 * Subsequent replacements keep original_* pointing to the very first uploaded file.
 */
exports.up = async function up(knex) {
  const [
    hasOriginalPath,
    hasOriginalPublicUrl,
    hasOriginalStorageKey,
    hasOriginalAbsolutePath,
  ] = await Promise.all([
    knex.schema.hasColumn('images', 'original_path'),
    knex.schema.hasColumn('images', 'original_public_url'),
    knex.schema.hasColumn('images', 'original_storage_key'),
    knex.schema.hasColumn('images', 'original_absolute_path'),
  ]);

  if (!hasOriginalPath || !hasOriginalPublicUrl || !hasOriginalStorageKey || !hasOriginalAbsolutePath) {
    await knex.schema.alterTable('images', (table) => {
      if (!hasOriginalPath) table.string('original_path', 500).nullable();
      if (!hasOriginalPublicUrl) table.string('original_public_url', 500).nullable();
      if (!hasOriginalStorageKey) table.string('original_storage_key', 500).nullable();
      if (!hasOriginalAbsolutePath) table.string('original_absolute_path', 500).nullable();
    });
  }
};

exports.down = async function down(knex) {
  await knex.schema.alterTable('images', (table) => {
    table.dropColumn('original_path');
    table.dropColumn('original_public_url');
    table.dropColumn('original_storage_key');
    table.dropColumn('original_absolute_path');
  });
};
