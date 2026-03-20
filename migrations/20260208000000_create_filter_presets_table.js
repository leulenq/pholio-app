/**
 * Migration: Create filter_presets table
 * Date: 2026-02-08
 * Purpose: Store saved filter combinations for agencies
 */

exports.up = function(knex) {
  return knex.schema.createTable('filter_presets', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('agency_id').notNullable();
    table.string('name', 100).notNullable();
    table.text('filters').notNullable(); // JSON string of filter state
    table.boolean('is_default').defaultTo(false);
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    // Foreign key
    table.foreign('agency_id').references('id').inTable('users').onDelete('CASCADE');

    // Indexes
    table.index('agency_id');
    table.index(['agency_id', 'is_default']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('filter_presets');
};
