/**
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  await knex.schema.table('users', (table) => {
    table.string('first_name').nullable();
    table.string('last_name').nullable();
  });
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  const isPostgres = knex.client.config.client === 'pg' || knex.client.config.client === 'postgresql';
  
  if (isPostgres) {
    await knex.raw('ALTER TABLE users DROP COLUMN IF EXISTS first_name');
    await knex.raw('ALTER TABLE users DROP COLUMN IF EXISTS last_name');
  } else {
    await knex.schema.table('users', (table) => {
      table.dropColumn('first_name');
      table.dropColumn('last_name');
    });
  }
};
