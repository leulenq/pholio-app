/**
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  await knex.schema.table('profiles', (table) => {
    table.string('phone').nullable();
    table.integer('bust').nullable();
    table.integer('waist').nullable();
    table.integer('hips').nullable();
    table.string('shoe_size').nullable();
    table.string('eye_color').nullable();
    table.string('hair_color').nullable();
    table.text('specialties').nullable(); // JSON array stored as text
  });
};

exports.down = async function down(knex) {
  await knex.schema.table('profiles', (table) => {
    table.dropColumn('phone');
    table.dropColumn('bust');
    table.dropColumn('waist');
    table.dropColumn('hips');
    table.dropColumn('shoe_size');
    table.dropColumn('eye_color');
    table.dropColumn('hair_color');
    table.dropColumn('specialties');
  });
};

