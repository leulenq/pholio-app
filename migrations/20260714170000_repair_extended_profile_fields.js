/**
 * Repair databases where the historical extended-profile migration was
 * recorded after only some columns were created.  Each addition is guarded so
 * the migration is safe for both healthy and drifted environments.
 *
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  const columns = [
    ["specializations", (table) => table.string("specializations").nullable()],
    ["agency_affiliation", (table) => table.string("agency_affiliation").nullable()],
    ["age_range", (table) => table.string("age_range").nullable()],
  ];

  for (const [column, addColumn] of columns) {
    if (!(await knex.schema.hasColumn("profiles", column))) {
      await knex.schema.alterTable("profiles", addColumn);
    }
  }
};

// This is a drift-repair migration. Rolling it back must not remove columns
// that may have existed before the repair ran.
exports.down = async function down() {};
