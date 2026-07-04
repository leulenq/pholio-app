/**
 * Add submission requirement columns to agencies table (age range and height ranges by gender).
 * Also backfills the seeded agencies with realistic requirement data.
 *
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  const hasAgencies = await knex.schema.hasTable("agencies");
  if (!hasAgencies) return;

  const hasMinHeightFemale = await knex.schema.hasColumn("agencies", "min_height_female");
  if (!hasMinHeightFemale) {
    await knex.schema.alterTable("agencies", (table) => {
      table.integer("min_height_female").nullable();
      table.integer("max_height_female").nullable();
      table.integer("min_height_male").nullable();
      table.integer("max_height_male").nullable();
      table.integer("min_age").nullable();
      table.integer("max_age").nullable();
    });
  }

  // Backfill seed data for known agencies
  const agencyRequirements = [
    {
      name: "Wilhelmina Models",
      min_height_female: 173,
      max_height_female: 183,
      min_height_male: 183,
      max_height_male: 193,
      min_age: 16,
      max_age: 30,
    },
    {
      name: "IMG Models",
      min_height_female: 175,
      max_height_female: 182,
      min_height_male: 185,
      max_height_male: 192,
      min_age: 16,
      max_age: 28,
    },
    {
      name: "Elite Model Management",
      min_height_female: 172,
      max_height_female: 183,
      min_height_male: 182,
      max_height_male: 192,
      min_age: 15,
      max_age: 28,
    },
    {
      name: "Ford Models",
      min_height_female: 170,
      max_height_female: 182,
      min_height_male: 180,
      max_height_male: 190,
      min_age: 16,
      max_age: 35,
    },
    {
      name: "DNA Model Management",
      min_height_female: 175,
      max_height_female: 181,
      min_height_male: 185,
      max_height_male: 191,
      min_age: 16,
      max_age: 26,
    },
    {
      name: "The Society Management",
      min_height_female: 176,
      max_height_female: 182,
      min_height_male: 185,
      max_height_male: 193,
      min_age: 16,
      max_age: 25,
    },
    {
      name: "Next Management",
      min_height_female: 172,
      max_height_female: 183,
      min_height_male: 182,
      max_height_male: 192,
      min_age: 16,
      max_age: 30,
    },
    {
      name: "Marilyn Agency",
      min_height_female: 173,
      max_height_female: 182,
      min_height_male: 183,
      max_height_male: 190,
      min_age: 16,
      max_age: 28,
    },
  ];

  for (const reqs of agencyRequirements) {
    await knex("agencies")
      .where({ name: reqs.name })
      .update({
        min_height_female: reqs.min_height_female,
        max_height_female: reqs.max_height_female,
        min_height_male: reqs.min_height_male,
        max_height_male: reqs.max_height_male,
        min_age: reqs.min_age,
        max_age: reqs.max_age,
        updated_at: knex.fn.now(),
      });
  }
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  const hasAgencies = await knex.schema.hasTable("agencies");
  if (!hasAgencies) return;

  const hasMinHeightFemale = await knex.schema.hasColumn("agencies", "min_height_female");
  if (hasMinHeightFemale) {
    await knex.schema.alterTable("agencies", (table) => {
      table.dropColumn("min_height_female");
      table.dropColumn("max_height_female");
      table.dropColumn("min_height_male");
      table.dropColumn("max_height_male");
      table.dropColumn("min_age");
      table.dropColumn("max_age");
    });
  }
};
