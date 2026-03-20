/**
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  await knex.schema.table('profiles', (table) => {
    // Personal information
    table.string('gender').nullable(); // "Male", "Female", "Non-binary", "Other", "Prefer not to say"
    table.date('date_of_birth').nullable();
    table.integer('age').nullable(); // Calculated from date_of_birth
    table.decimal('weight_kg', 5, 2).nullable(); // Weight in kilograms
    table.decimal('weight_lbs', 5, 2).nullable(); // Weight in pounds
    table.string('dress_size', 10).nullable(); // US dress size
    table.string('hair_length', 20).nullable(); // "Short", "Medium", "Long", "Very Long"
    table.string('skin_tone', 50).nullable();
    
    // Professional information
    table.text('languages').nullable(); // JSON array of languages
    table.boolean('availability_travel').nullable();
    table.string('availability_schedule', 30).nullable(); // "Full-time", "Part-time", "Flexible", "Weekends only"
    table.string('experience_level', 30).nullable(); // "Beginner", "Intermediate", "Experienced", "Professional"
    table.text('training').nullable();
    table.string('portfolio_url', 255).nullable();
    
    // Social media (Free users: handle only, Pro users: handle + URL)
    table.string('instagram_handle', 100).nullable();
    table.string('instagram_url', 255).nullable();
    table.string('twitter_handle', 100).nullable();
    table.string('twitter_url', 255).nullable();
    table.string('tiktok_handle', 100).nullable();
    table.string('tiktok_url', 255).nullable();
    
    // References
    table.string('reference_name', 100).nullable();
    table.string('reference_email', 255).nullable();
    table.string('reference_phone', 20).nullable();
    table.string('reference_relationship', 50).nullable();
    
    // Emergency contact
    table.string('emergency_contact_name', 100).nullable();
    table.string('emergency_contact_phone', 20).nullable();
    table.string('emergency_contact_relationship', 50).nullable();
    
    // Additional information
    table.string('nationality', 100).nullable();
    table.string('union_membership', 100).nullable();
    table.string('ethnicity', 100).nullable();
    table.boolean('tattoos').nullable();
    table.boolean('piercings').nullable();
  });
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  await knex.schema.table('profiles', (table) => {
    table.dropColumn('gender');
    table.dropColumn('date_of_birth');
    table.dropColumn('age');
    table.dropColumn('weight_kg');
    table.dropColumn('weight_lbs');
    table.dropColumn('dress_size');
    table.dropColumn('hair_length');
    table.dropColumn('skin_tone');
    table.dropColumn('languages');
    table.dropColumn('availability_travel');
    table.dropColumn('availability_schedule');
    table.dropColumn('experience_level');
    table.dropColumn('training');
    table.dropColumn('portfolio_url');
    table.dropColumn('instagram_handle');
    table.dropColumn('instagram_url');
    table.dropColumn('twitter_handle');
    table.dropColumn('twitter_url');
    table.dropColumn('tiktok_handle');
    table.dropColumn('tiktok_url');
    table.dropColumn('reference_name');
    table.dropColumn('reference_email');
    table.dropColumn('reference_phone');
    table.dropColumn('reference_relationship');
    table.dropColumn('emergency_contact_name');
    table.dropColumn('emergency_contact_phone');
    table.dropColumn('emergency_contact_relationship');
    table.dropColumn('nationality');
    table.dropColumn('union_membership');
    table.dropColumn('ethnicity');
    table.dropColumn('tattoos');
    table.dropColumn('piercings');
  });
};

