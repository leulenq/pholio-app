/**
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  await knex.schema.table('profiles', (table) => {
    table.json('pdf_customizations').nullable();
  });
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  await knex.schema.table('profiles', (table) => {
    table.dropColumn('pdf_customizations');
  });
};

