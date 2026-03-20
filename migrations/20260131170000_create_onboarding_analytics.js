
exports.up = async function(knex) {
  // Ensure UUID extension is available for Postgres
  if (knex.client.config.client === 'pg' || knex.client.config.client === 'postgresql') {
    await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
  }

  return knex.schema.createTable('onboarding_analytics', function(table) {
    if (knex.client.config.client === 'pg' || knex.client.config.client === 'postgresql') {
      table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    } else {
      table.uuid('id').primary();
    }
    
    table.uuid('profile_id').references('id').inTable('profiles').onDelete('CASCADE').index();
    table.string('step').notNullable(); // identity, upload, confirm, reveal
    table.string('event_type').notNullable(); // entered, completed, abandoned, error
    table.integer('duration_ms').nullable();
    table.json('metadata_json').nullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    table.index(['profile_id', 'created_at']);
    table.index(['step', 'event_type']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('onboarding_analytics');
};
