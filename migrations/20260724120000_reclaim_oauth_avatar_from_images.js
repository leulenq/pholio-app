/**
 * OAuth provider pictures (Google/Instagram) were historically seeded into
 * `images` as primary book media. They belong on `users.avatar_url` only.
 *
 * Move any leftover remote, untyped, non-local seeds onto the account avatar
 * layer and delete them from curated media collections.
 *
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  const {
    reclaimProviderAccountAvatarSeeds,
  } = require("../src/shared/lib/account-avatar");

  if (!(await knex.schema.hasColumn("users", "avatar_url"))) {
    await knex.schema.alterTable("users", (table) => {
      table.string("avatar_url", 2048).nullable();
    });
  }

  await reclaimProviderAccountAvatarSeeds(knex);
};

exports.down = async function down() {
  // Irreversible data repair — OAuth seeds must not return to the book.
};
