/**
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  await knex.schema.table('profiles', (table) => {
    // Remove old fields
    table.dropColumn('measurements');
    table.dropColumn('reference_relationship');
    table.dropColumn('nationality');
    
    // Add new fields
    table.string('city_secondary', 100).nullable(); // Secondary city option
    table.text('experience_details').nullable(); // JSON object with experience details
    table.boolean('work_eligibility').nullable(); // Work eligibility (Yes/No)
    table.string('work_status', 50).nullable(); // Work status: "Citizen", "PR", "Visa", "Other"
    table.text('comfort_levels').nullable(); // JSON array of comfort levels: ["Swimwear", "Lingerie", "Implied Nudity", "Not Comfortable"]
    table.text('previous_representations').nullable(); // JSON array of previous representation entries
    table.string('weight_unit', 10).nullable(); // Weight unit: "lbs" or "kg"
  });
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  await knex.schema.table('profiles', (table) => {
    // Restore old fields
    table.string('measurements', 50).nullable();
    table.string('reference_relationship', 50).nullable();
    table.string('nationality', 100).nullable();
    
    // Remove new fields
    table.dropColumn('city_secondary');
    table.dropColumn('experience_details');
    table.dropColumn('work_eligibility');
    table.dropColumn('work_status');
    table.dropColumn('comfort_levels');
    table.dropColumn('previous_representations');
    table.dropColumn('weight_unit');
  });
};

