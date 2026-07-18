/**
 * Agency team surfaces (setup roster, inbox team presence) and the seed data
 * read/write `users.avatar_url`, but no migration ever created the column, so
 * a fresh database fails on those queries. Guarded so environments where the
 * column was added out-of-band remain healthy.
 *
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  if (!(await knex.schema.hasColumn("users", "avatar_url"))) {
    await knex.schema.alterTable("users", (table) => {
      table.string("avatar_url", 2048).nullable();
    });
  }
};

exports.down = async function down(knex) {
  if (await knex.schema.hasColumn("users", "avatar_url")) {
    await knex.schema.alterTable("users", (table) => {
      table.dropColumn("avatar_url");
    });
  }
};
