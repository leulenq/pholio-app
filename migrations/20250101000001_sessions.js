/**
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  const exists = await knex.schema.hasTable('sessions');
  if (!exists) {
    await knex.schema.createTable('sessions', (table) => {
      table.string('sid').primary();
      table.json('sess').notNullable();
      table.timestamp('expired').notNullable();
    });
  }
};

exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('sessions');
};
