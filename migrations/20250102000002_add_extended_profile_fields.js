/**
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  await knex.schema.table('profiles', (table) => {
    table.string('specializations').nullable();
    table.text('achievements').nullable();
    table.string('agency_affiliation').nullable();
    table.string('age_range').nullable();
  });
};

exports.down = async function down(knex) {
  await knex.schema.table('profiles', (table) => {
    table.dropColumn('specializations');
    table.dropColumn('achievements');
    table.dropColumn('agency_affiliation');
    table.dropColumn('age_range');
  });
};

