/**
 * Stats are perishable — agencies expect measurements current (≤3 months) and
 * re-confirmed. Track when a talent last changed their measurements so the
 * submission stats card can show a real "measured" date and flag a stale set,
 * rather than guessing from the row's generic updated_at.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  const exists = await knex.schema.hasColumn('profiles', 'measurements_updated_at');
  if (!exists) {
    await knex.schema.alterTable('profiles', (table) => {
      table.timestamp('measurements_updated_at').nullable();
    });
  }
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const exists = await knex.schema.hasColumn('profiles', 'measurements_updated_at');
  if (exists) {
    await knex.schema.alterTable('profiles', (table) => {
      table.dropColumn('measurements_updated_at');
    });
  }
};
