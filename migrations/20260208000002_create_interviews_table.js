/**
 * Migration: Create interviews table for scheduling agency-talent meetings
 * Date: 2026-02-08
 * Purpose: Enable agencies to schedule and manage interviews with talent
 */

exports.up = function(knex) {
  return knex.schema.createTable('interviews', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    table.uuid('application_id').notNullable();
    table.uuid('agency_id').notNullable();
    table.uuid('talent_id').notNullable();

    // Interview details
    table.timestamp('proposed_datetime').notNullable();
    table.integer('duration_minutes').defaultTo(30); // Default 30-minute interview
    table.string('interview_type', 20).notNullable(); // 'video_call', 'phone_call', 'in_person'
    table.string('location', 500); // For in-person interviews
    table.string('meeting_url', 500); // For video calls (Zoom, Google Meet, etc.)
    table.text('notes'); // Agency notes/agenda

    // Status and response
    table.string('status', 20).notNullable().defaultTo('pending'); // 'pending', 'accepted', 'declined', 'rescheduled', 'cancelled', 'completed'
    table.text('response_message'); // Talent's response when accepting/declining
    table.timestamp('responded_at');

    // Timestamps
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    // Foreign keys
    table.foreign('application_id').references('id').inTable('applications').onDelete('CASCADE');
    table.foreign('agency_id').references('id').inTable('agencies').onDelete('CASCADE');
    table.foreign('talent_id').references('id').inTable('users').onDelete('CASCADE');

    // Indexes
    table.index('application_id');
    table.index(['agency_id', 'proposed_datetime']);
    table.index(['talent_id', 'proposed_datetime']);
    table.index(['status', 'proposed_datetime']);
  });
};

exports.down = function(knex) {
  return knex.schema.dropTableIfExists('interviews');
};
