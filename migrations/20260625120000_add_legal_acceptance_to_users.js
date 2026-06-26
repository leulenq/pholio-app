/**
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable("users", (table) => {
    table.timestamp("terms_accepted_at").nullable();
    table.string("terms_accepted_version").nullable();
    table.timestamp("privacy_accepted_at").nullable();
    table.string("privacy_accepted_version").nullable();
  });
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  await knex.schema.alterTable("users", (table) => {
    table.dropColumn("privacy_accepted_version");
    table.dropColumn("privacy_accepted_at");
    table.dropColumn("terms_accepted_version");
    table.dropColumn("terms_accepted_at");
  });
};
