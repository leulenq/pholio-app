/**
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  await knex.schema.table('profiles', (table) => {
    table.string('pdf_theme').defaultTo('ink').nullable();
  });
};

exports.down = async function down(knex) {
  await knex.schema.table('profiles', (table) => {
    table.dropColumn('pdf_theme');
  });
};

