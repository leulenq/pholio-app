/**
 * Migration: Add Google Intel & IP Geolocation fields to profiles table
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  await knex.schema.table('profiles', (table) => {
    // Google Intel fields (from Google People API)
    table.date('google_birthday').nullable(); // Date of birth from Google
    table.string('google_gender', 50).nullable(); // Gender from Google
    table.string('google_phone', 20).nullable(); // Phone number from Google
    table.text('google_addresses').nullable(); // JSON array of addresses from Google
    table.string('google_organization', 255).nullable(); // Organization/company from Google
    
    // IP Geolocation fields
    table.string('ip_address', 45).nullable(); // IPv4 or IPv6 address
    table.string('ip_country', 2).nullable(); // ISO 3166-1 alpha-2 country code (e.g., 'US', 'GB')
    table.string('ip_region', 100).nullable(); // Region/state (e.g., 'California', 'New York')
    table.string('ip_city', 100).nullable(); // City from IP geolocation
    table.string('ip_timezone', 50).nullable(); // Timezone (e.g., 'America/Los_Angeles')
    table.text('verified_location_intel').nullable(); // JSON object with verified location data for cross-reference
  });
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  await knex.schema.table('profiles', (table) => {
    table.dropColumn('google_birthday');
    table.dropColumn('google_gender');
    table.dropColumn('google_phone');
    table.dropColumn('google_addresses');
    table.dropColumn('google_organization');
    table.dropColumn('ip_address');
    table.dropColumn('ip_country');
    table.dropColumn('ip_region');
    table.dropColumn('ip_city');
    table.dropColumn('ip_timezone');
    table.dropColumn('verified_location_intel');
  });
};



