/**
 * Board identity + typing fields.
 *
 * Boards carry their own art direction (house color, plate treatment, client
 * logo, cover visual) and a board_type that switches the signing vs. package
 * vocabulary on the agency Signing surface. All nullable — curated defaults
 * in the client resolve when unset.
 *
 * @param {import('knex').Knex} knex
 */
const COLUMNS = [
  'brand_color',
  'plate_style',
  'logo_path',
  'cover_image_path',
  'board_type',
];

exports.up = async function up(knex) {
  const hasBoards = await knex.schema.hasTable('boards');
  if (!hasBoards) return;

  const missing = [];
  for (const column of COLUMNS) {
    // eslint-disable-next-line no-await-in-loop
    if (!(await knex.schema.hasColumn('boards', column))) missing.push(column);
  }
  if (missing.length === 0) return;

  await knex.schema.alterTable('boards', (table) => {
    missing.forEach((column) => table.string(column).nullable());
  });
};

/**
 * @param {import('knex').Knex} knex
 */
exports.down = async function down(knex) {
  const hasBoards = await knex.schema.hasTable('boards');
  if (!hasBoards) return;

  const present = [];
  for (const column of COLUMNS) {
    // eslint-disable-next-line no-await-in-loop
    if (await knex.schema.hasColumn('boards', column)) present.push(column);
  }
  if (present.length === 0) return;

  await knex.schema.alterTable('boards', (table) => {
    present.forEach((column) => table.dropColumn(column));
  });
};
