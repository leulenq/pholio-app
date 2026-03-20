/**
 * Migration: Add absolute_path to images table
 * 
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  const hasColumn = await knex.schema.hasColumn('images', 'absolute_path');
  if (!hasColumn) {
    await knex.schema.alterTable('images', (table) => {
      table.string('absolute_path', 500).nullable();
    });
  }
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  const hasColumn = await knex.schema.hasColumn('images', 'absolute_path');
  if (hasColumn) {
    await knex.schema.alterTable('images', (table) => {
      table.dropColumn('absolute_path');
    });
  }
};
