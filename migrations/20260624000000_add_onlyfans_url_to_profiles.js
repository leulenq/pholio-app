/**
 * Add OnlyFans social profile URL for talent profiles.
 *
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  const hasTable = await knex.schema.hasTable("profiles");
  if (!hasTable) return;

  const hasOnlyFansUrl = await knex.schema.hasColumn("profiles", "onlyfans_url");
  if (!hasOnlyFansUrl) {
    await knex.schema.alterTable("profiles", (table) => {
      table.string("onlyfans_url", 500).nullable();
    });
  }
};

exports.down = async function down(knex) {
  const hasTable = await knex.schema.hasTable("profiles");
  if (!hasTable) return;

  const hasOnlyFansUrl = await knex.schema.hasColumn("profiles", "onlyfans_url");
  if (hasOnlyFansUrl) {
    await knex.schema.alterTable("profiles", (table) => {
      table.dropColumn("onlyfans_url");
    });
  }
};
