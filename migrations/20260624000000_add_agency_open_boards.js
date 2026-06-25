/**
 * Add `open_boards` to agencies — the divisions/boards an agency is currently
 * scouting new faces for (e.g. Women, Men, New Faces, Curve). This is the
 * agency-authored, talent-facing signal of which boards are open; it is
 * distinct from the private internal `boards` Kanban (casting pipelines).
 *
 * Stored as JSON (array of board names). Idempotent.
 *
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  const hasAgencies = await knex.schema.hasTable('agencies');
  if (!hasAgencies) return;

  const hasOpenBoards = await knex.schema.hasColumn('agencies', 'open_boards');
  if (!hasOpenBoards) {
    await knex.schema.alterTable('agencies', (table) => {
      table.json('open_boards').nullable();
    });
  }
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  const hasAgencies = await knex.schema.hasTable('agencies');
  if (!hasAgencies) return;

  const hasOpenBoards = await knex.schema.hasColumn('agencies', 'open_boards');
  if (hasOpenBoards) {
    await knex.schema.alterTable('agencies', (table) => {
      table.dropColumn('open_boards');
    });
  }
};
