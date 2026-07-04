/**
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  const hasColumn = await knex.schema.hasColumn("users", "account_status");
  if (!hasColumn) {
    await knex.schema.alterTable("users", (table) => {
      table.string("account_status").notNullable().defaultTo("active");
    });
  }
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  const hasColumn = await knex.schema.hasColumn("users", "account_status");
  if (hasColumn) {
    await knex.schema.alterTable("users", (table) => {
      table.dropColumn("account_status");
    });
  }
};
