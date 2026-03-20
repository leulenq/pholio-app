/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
  const hasColumn = await knex.schema.hasColumn('profiles', 'nationality');
  if (!hasColumn) {
    await knex.schema.table('profiles', (table) => {
      table.string('nationality', 100).nullable();
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
  // We can't safely drop it if it might have existed before, but for reversibility:
  const hasColumn = await knex.schema.hasColumn('profiles', 'nationality');
  if (hasColumn) {
      // Intentionally leaving this empty or commented out to prevent data loss on rollback if it was a pre-existing column that just got missed.
      // But for strict reversibility of *this* migration:
      // await knex.schema.table('profiles', (table) => {
      //   table.dropColumn('nationality');
      // });
  }
};
