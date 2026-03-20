/**
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable('profiles', (table) => {
    table.string('last_name').nullable().alter();
  });
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  await knex.schema.alterTable('profiles', (table) => {
    // Reverting to non-nullable might fail if there are NULLs now,
    // but originally it was .notNullable().
    table.string('last_name').notNullable().alter();
  });
};
