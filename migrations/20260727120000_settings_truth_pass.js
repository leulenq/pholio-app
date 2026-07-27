/**
 * Settings truth pass.
 *
 * 1. `users.auth_provider` — the login path already normalises a provider from the
 *    Firebase token (`domains/onboarding/services/providers/oauth-user.js`) and then
 *    throws it away, so nothing downstream can tell a Google account from a
 *    password account. Settings needs that distinction to represent sign-in
 *    identity honestly (and to stop offering a password reset to accounts that
 *    have no password).
 *
 * 2. `talent_user_settings.display_preferences` — held `cardLayout`, `coverImage`
 *    and `watermark`. None of the three had a single consumer: comp cards are
 *    composed by `domains/pdf/composition/composition-director.js` from the actual
 *    frames, the lead frame is set explicitly through `setHeroImage`, and the PDF
 *    watermark is `!profile.is_pro`. Dropping the column so the dead abstraction
 *    cannot be reintroduced by accident.
 *
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  const hasAuthProvider = await knex.schema.hasColumn("users", "auth_provider");
  if (!hasAuthProvider) {
    await knex.schema.alterTable("users", (table) => {
      table.string("auth_provider", 32).nullable();
    });
  }

  // Backfill what can be inferred without a token. Instagram accounts are
  // identifiable from the uid prefix the custom-auth flow mints; every other
  // account with a Firebase uid is resolved on next sign-in, and accounts with a
  // local password hash and no Firebase uid are password accounts today.
  await knex("users")
    .whereNull("auth_provider")
    .andWhere("firebase_uid", "like", "instagram:%")
    .update({ auth_provider: "instagram" });

  const hasPasswordHash = await knex.schema.hasColumn("users", "password_hash");
  if (hasPasswordHash) {
    await knex("users")
      .whereNull("auth_provider")
      .whereNull("firebase_uid")
      .whereNotNull("password_hash")
      .update({ auth_provider: "password" });
  }

  const hasSettings = await knex.schema.hasTable("talent_user_settings");
  if (hasSettings) {
    const hasDisplay = await knex.schema.hasColumn(
      "talent_user_settings",
      "display_preferences",
    );
    if (hasDisplay) {
      await knex.schema.alterTable("talent_user_settings", (table) => {
        table.dropColumn("display_preferences");
      });
    }
  }
};

exports.down = async function down(knex) {
  const hasSettings = await knex.schema.hasTable("talent_user_settings");
  if (hasSettings) {
    const hasDisplay = await knex.schema.hasColumn(
      "talent_user_settings",
      "display_preferences",
    );
    if (!hasDisplay) {
      await knex.schema.alterTable("talent_user_settings", (table) => {
        table.json("display_preferences").nullable();
      });
    }
  }

  const hasAuthProvider = await knex.schema.hasColumn("users", "auth_provider");
  if (hasAuthProvider) {
    await knex.schema.alterTable("users", (table) => {
      table.dropColumn("auth_provider");
    });
  }
};
