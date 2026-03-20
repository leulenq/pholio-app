/**
 * Migration: Create messages table for agency-talent communication
 * Date: 2026-02-08
 * Purpose: Enable direct messaging between agencies and talent regarding applications
 */

exports.up = function(knex) {
  return knex.schema.createTable('messages', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('application_id').notNullable();
    table.uuid('sender_id').notNullable(); // user_id of sender (agency or talent)
    table.string('sender_type', 20).notNullable(); // 'AGENCY' or 'TALENT'
    table.text('message').notNullable();
    table.string('attachment_url', 500); // optional file attachment
    table.boolean('is_read').defaultTo(false);
    table.timestamp('read_at');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    // Foreign keys
    table.foreign('application_id').references('id').inTable('applications').onDelete('CASCADE');
    table.foreign('sender_id').references('id').inTable('users').onDelete('CASCADE');

    // Indexes
    table.index('application_id');
    table.index(['application_id', 'created_at']);
    table.index(['sender_id', 'created_at']);
    table.index(['application_id', 'is_read']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('messages');
};
