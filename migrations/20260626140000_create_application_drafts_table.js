/**
 * Application drafts — an in-progress agency submission that has NOT been sent.
 *
 * A draft is deliberately a separate object from `applications`, not a `draft`
 * status on that table: agency-facing inbox/roster queries filter by status
 * across many files, and a draft must never leak into the agency's view. It is
 * also not yet bound by the "already applied" guard. One draft per
 * (profile, agency); upserted as the talent composes, deleted on send.
 *
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = function (knex) {
  return knex.schema.createTable('application_drafts', (table) => {
    table.uuid('id').primary().defaultTo(knex.fn.uuid());
    table
      .uuid('profile_id')
      .notNullable()
      .references('id')
      .inTable('profiles')
      .onDelete('CASCADE');
    table
      .uuid('agency_id')
      .notNullable()
      .references('id')
      .inTable('agencies')
      .onDelete('CASCADE');
    // The composed package: board, digitals slot map, excluded image ids,
    // media set, comp-card variant, note, consent — the whole in-progress dossier.
    table.jsonb('payload').notNullable().defaultTo('{}');
    table.timestamp('created_at').defaultTo(knex.fn.now());
    table.timestamp('updated_at').defaultTo(knex.fn.now());

    // One draft per talent + agency — the upsert key.
    table.unique(['profile_id', 'agency_id'], 'uq_application_drafts_profile_agency');
    table.index('profile_id', 'idx_application_drafts_profile');
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = function (knex) {
  return knex.schema.dropTableIfExists('application_drafts');
};
