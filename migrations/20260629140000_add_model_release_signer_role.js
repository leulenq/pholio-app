/**
 * Records who signed an image model release. This is required to distinguish
 * an adult talent's own release from a guardian-authorized release for a minor.
 *
 * @param {import("knex").Knex} knex
 */
exports.up = async function up(knex) {
  const hasReleases = await knex.schema.hasTable("image_model_releases");
  if (!hasReleases) return;

  const hasSignerRole = await knex.schema.hasColumn(
    "image_model_releases",
    "signer_role",
  );
  if (!hasSignerRole) {
    await knex.schema.alterTable("image_model_releases", (table) => {
      table.string("signer_role", 40).nullable();
    });
  }
};

/**
 * @param {import("knex").Knex} knex
 */
exports.down = async function down(knex) {
  const hasReleases = await knex.schema.hasTable("image_model_releases");
  if (!hasReleases) return;

  const hasSignerRole = await knex.schema.hasColumn(
    "image_model_releases",
    "signer_role",
  );
  if (hasSignerRole) {
    await knex.schema.alterTable("image_model_releases", (table) => {
      table.dropColumn("signer_role");
    });
  }
};
