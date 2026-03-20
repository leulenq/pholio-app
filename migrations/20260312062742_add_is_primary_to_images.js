/**
 * Migration: Add is_primary to images table
 * Allows decoupling of primary photo selection from AI analysis triggering
 * 
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  const hasColumn = await knex.schema.hasColumn('images', 'is_primary');
  if (!hasColumn) {
    await knex.schema.alterTable('images', (table) => {
      table.boolean('is_primary').defaultTo(false).index();
    });
  }
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  const hasColumn = await knex.schema.hasColumn('images', 'is_primary');
  if (hasColumn) {
    await knex.schema.alterTable('images', (table) => {
      table.dropColumn('is_primary');
    });
  }
};
