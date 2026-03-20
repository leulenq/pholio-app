/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  await knex.schema.table('profiles', (table) => {
    table.boolean('passport_ready').defaultTo(false);
    table.string('youtube_handle', 100).nullable();
    table.string('youtube_url', 255).nullable();
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  await knex.schema.table('profiles', (table) => {
    table.dropColumn('passport_ready');
    table.dropColumn('youtube_handle');
    table.dropColumn('youtube_url');
  });
};
