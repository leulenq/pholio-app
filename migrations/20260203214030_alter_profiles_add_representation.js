/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.table('profiles', (table) => {
    table.boolean('seeking_representation').defaultTo(false);
    table.string('current_agency', 255).nullable();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.table('profiles', (table) => {
    table.dropColumn('seeking_representation');
    table.dropColumn('current_agency');
  });
};
