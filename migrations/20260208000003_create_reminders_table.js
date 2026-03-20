/**
 * Migration: Create reminders table for follow-up tracking
 * Date: 2026-02-08
 * Purpose: Enable agencies to set reminders for following up with talent
 */

exports.up = function(knex) {
  return knex.schema.createTable('reminders', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('application_id').notNullable();
    table.uuid('agency_id').notNullable();

    // Reminder details
    table.string('reminder_type', 50).notNullable(); // 'follow_up', 'callback', 'review', 'interview_prep', 'custom'
    table.timestamp('reminder_date').notNullable();
    table.string('title', 200).notNullable();
    table.text('notes');

    // Status management
    table.string('status', 20).notNullable().defaultTo('pending'); // 'pending', 'completed', 'snoozed', 'cancelled'
    table.timestamp('completed_at');
    table.timestamp('snoozed_until');

    // Priority (optional)
    table.string('priority', 20).defaultTo('normal'); // 'low', 'normal', 'high'

    // Timestamps
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    // Foreign keys
    table.foreign('application_id').references('id').inTable('applications').onDelete('CASCADE');
    table.foreign('agency_id').references('id').inTable('users').onDelete('CASCADE');

    // Indexes
    table.index('application_id');
    table.index(['agency_id', 'reminder_date']);
    table.index(['agency_id', 'status', 'reminder_date']);
    table.index(['status', 'reminder_date']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('reminders');
};
