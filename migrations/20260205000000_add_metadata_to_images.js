/**
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  const hasColumn = await knex.schema.hasColumn('images', 'metadata');
  if (!hasColumn) {
    await knex.schema.table('images', (table) => {
      table.jsonb('metadata').defaultTo('{}');
    });
  }
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  await knex.schema.table('images', (table) => {
    table.dropColumn('metadata');
  });
};
