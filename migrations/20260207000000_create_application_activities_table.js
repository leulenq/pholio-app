/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function(knex) {
  return knex.schema.createTable('application_activities', (table) => {
    table.uuid('id').primary().defaultTo(knex.raw('uuid_generate_v4()'));
    table.uuid('application_id').notNullable()
      .references('id').inTable('applications').onDelete('CASCADE');
    table.uuid('agency_id').notNullable()
      .references('id').inTable('agencies');
    table.uuid('user_id').nullable()
      .references('id').inTable('users'); // Who performed the action
    table.string('activity_type', 50).notNullable();
    // Types: 'status_change', 'note_added', 'note_edited', 'note_deleted',
    //        'tag_added', 'tag_removed', 'profile_viewed', 'email_sent', 'application_created'
    table.text('description').nullable();
    table.jsonb('metadata').defaultTo('{}'); // Additional data (old_status, new_status, tag_name, etc.)
    table.timestamp('created_at').defaultTo(knex.fn.now());

    // Indexes for performance
    table.index('application_id', 'idx_app_activities_application');
    table.index('agency_id', 'idx_app_activities_agency');
    table.index('activity_type', 'idx_app_activities_type');
    table.index('created_at', 'idx_app_activities_created');
    table.index(['application_id', 'created_at'], 'idx_app_activities_app_date');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function(knex) {
  return knex.schema.dropTableIfExists('application_activities');
};
