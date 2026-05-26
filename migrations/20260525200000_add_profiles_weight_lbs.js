/**
 * Ensure profiles.weight_lbs exists (talent profile PUT persists lbs alongside kg).
 * Idempotent: safe if 20260206000001_restore_missing_profile_fields already added it.
 */

exports.up = async function (knex) {
  const hasWeightLbs = await knex.schema.hasColumn("profiles", "weight_lbs");
  if (hasWeightLbs) return;

  return knex.schema.alterTable("profiles", (table) => {
    table
      .decimal("weight_lbs", 5, 2)
      .nullable()
      .comment("Weight in pounds; synced from weight_kg on profile save");
  });
};

exports.down = async function (knex) {
  const hasWeightLbs = await knex.schema.hasColumn("profiles", "weight_lbs");
  if (!hasWeightLbs) return;

  return knex.schema.alterTable("profiles", (table) => {
    table.dropColumn("weight_lbs");
  });
};
