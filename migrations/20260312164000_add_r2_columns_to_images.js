/**
 * Migration: Add storage_key and public_url to images table
 * 
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  const hasStorageKey = await knex.schema.hasColumn('images', 'storage_key');
  const hasPublicUrl = await knex.schema.hasColumn('images', 'public_url');

  await knex.schema.alterTable('images', (table) => {
    if (!hasStorageKey) {
      table.string('storage_key', 500).nullable().comment('Cloudflare R2 object key');
    }
    if (!hasPublicUrl) {
      table.string('public_url', 500).nullable().comment('CDN public URL');
    }
  });
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  await knex.schema.alterTable('images', (table) => {
    table.dropColumn('storage_key');
    table.dropColumn('public_url');
  });
};
