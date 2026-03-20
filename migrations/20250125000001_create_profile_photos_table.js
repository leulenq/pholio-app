/**
 * Migration: Create profile_photos table
 * Stores canonical photo storage keys for profiles
 * 
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  await knex.schema.createTable('profile_photos', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('profile_id').notNullable()
      .references('id')
      .inTable('profiles')
      .onDelete('CASCADE');
    table.string('storage_key', 255).notNullable().comment('Canonical storage key (e.g. uploads/filename.webp)');
    table.string('kind', 20).defaultTo('polaroid').comment('Photo kind: polaroid | headshot | full_body | etc');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    // Indexes
    table.index('profile_id');
    table.index('storage_key');
  });
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('profile_photos');
};
