/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('analytics', function(table) {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('profile_id').notNullable();
    table.string('event_type').notNullable(); // 'view', 'download', 'share'
    table.string('event_source').defaultTo('web'); // 'web', 'api', 'email'
    table.jsonb('metadata').defaultTo('{}'); // Additional event data
    table.string('ip_address'); // Optional IP address for analytics
    table.string('user_agent'); // Optional user agent
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    // Foreign key
    table.foreign('profile_id').references('id').inTable('profiles').onDelete('CASCADE');
    
    // Indexes for performance
    table.index('profile_id');
    table.index('event_type');
    table.index('created_at');
    table.index(['profile_id', 'event_type']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('analytics');
};

