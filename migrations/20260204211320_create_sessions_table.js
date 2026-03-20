exports.up = function(knex) {
  return knex.schema.createTable('visitor_sessions', function(table) {
    table.uuid('id').primary();
    table.uuid('profile_id').notNullable();
    table.timestamp('started_at').defaultTo(knex.fn.now());
    table.timestamp('last_activity_at').defaultTo(knex.fn.now());
    table.string('ip_address');
    table.string('user_agent');
    table.string('referrer');
    table.boolean('is_returning').defaultTo(false);
    
    // Foreign key
    table.foreign('profile_id').references('id').inTable('profiles').onDelete('CASCADE');
    
    // Indexes
    table.index('profile_id');
    table.index('started_at');
    table.index(['profile_id', 'started_at']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('visitor_sessions');
};
