/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.table('profiles', (table) => {
    table.string('place_of_birth', 100).nullable();
    table.string('timezone', 100).nullable(); // User selected timezone, distinct from ip_timezone
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.table('profiles', (table) => {
    table.dropColumn('place_of_birth');
    table.dropColumn('timezone');
  });
};
