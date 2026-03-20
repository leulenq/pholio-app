/**
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  // Add viewed_at timestamp to applications table
  await knex.schema.table('applications', (table) => {
    table.timestamp('viewed_at').nullable();
  });

  // Create application_notes table for private agency notes
  await knex.schema.createTable('application_notes', (table) => {
    table.uuid('id').primary();
    table
      .uuid('application_id')
      .notNullable()
      .references('id')
      .inTable('applications')
      .onDelete('CASCADE');
    table.text('note').notNullable();
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());
    
    table.index('application_id');
  });

  // Create application_tags table for custom organization tags
  await knex.schema.createTable('application_tags', (table) => {
    table.uuid('id').primary();
    table
      .uuid('application_id')
      .notNullable()
      .references('id')
      .inTable('applications')
      .onDelete('CASCADE');
    table
      .uuid('agency_id')
      .notNullable()
      .references('id')
      .inTable('users')
      .onDelete('CASCADE');
    table.string('tag').notNullable();
    table.string('color', 20).nullable(); // For color-coding tags
    table.timestamp('created_at').defaultTo(knex.fn.now());
    
    // Unique constraint: one tag per application per agency
    table.unique(['application_id', 'agency_id', 'tag']);
    table.index('application_id');
    table.index('agency_id');
    table.index('tag');
  });
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists('application_tags');
  await knex.schema.dropTableIfExists('application_notes');
  await knex.schema.table('applications', (table) => {
    table.dropColumn('viewed_at');
  });
};

