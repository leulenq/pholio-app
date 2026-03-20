/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('activities', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('user_id').notNullable();
    table.string('activity_type').notNullable(); // 'profile_updated', 'image_uploaded', 'pdf_downloaded', 'portfolio_viewed'
    table.jsonb('metadata').defaultTo('{}'); // Additional activity data (e.g., image count, theme used)
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    // Foreign key
    table.foreign('user_id').references('id').inTable('users').onDelete('CASCADE');
    
    // Indexes for performance
    table.index('user_id');
    table.index('activity_type');
    table.index('created_at');
    table.index(['user_id', 'created_at']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('activities');
};

