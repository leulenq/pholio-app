/**
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable("users", (table) => {
    table.timestamp("submission_program_acknowledged_at").nullable();
    table.string("submission_program_acknowledged_version").nullable();
  });
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  await knex.schema.alterTable("users", (table) => {
    table.dropColumn("submission_program_acknowledged_version");
    table.dropColumn("submission_program_acknowledged_at");
  });
};
