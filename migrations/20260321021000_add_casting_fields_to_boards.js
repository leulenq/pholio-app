/**
 * Add casting-specific metadata to boards so the casting UI can render
 * client names, deadlines, and target slot counts without relying on mock data.
 *
 * @param {import('knex').Knex} knex
 */
exports.up = async function up(knex) {
  const hasBoards = await knex.schema.hasTable('boards');
  if (!hasBoards) {
    return;
  }

  const hasClientName = await knex.schema.hasColumn('boards', 'client_name');
  const hasTargetSlots = await knex.schema.hasColumn('boards', 'target_slots');

  if (!hasClientName || !hasTargetSlots) {
    await knex.schema.alterTable('boards', (table) => {
      if (!hasClientName) {
        table.string('client_name').nullable();
      }
      if (!hasTargetSlots) {
        table.integer('target_slots').nullable();
      }
    });
  }
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  const hasBoards = await knex.schema.hasTable('boards');
  if (!hasBoards) {
    return;
  }

  const hasClientName = await knex.schema.hasColumn('boards', 'client_name');
  const hasTargetSlots = await knex.schema.hasColumn('boards', 'target_slots');

  await knex.schema.alterTable('boards', (table) => {
    if (hasClientName) {
      table.dropColumn('client_name');
    }
    if (hasTargetSlots) {
      table.dropColumn('target_slots');
    }
  });
};
