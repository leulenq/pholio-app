"use strict";

exports.up = async function (knex) {
  await knex.schema.alterTable('stripe_webhook_events', t => {
    t.text('payload').nullable();
    t.string('claim_token', 80).nullable();
    t.timestamp('lease_until').nullable();
    t.integer('attempts').notNullable().defaultTo(0);
    t.timestamp('completed_at').nullable();
  });
  // Old rows preceded their effects; provider replay must establish completion.
  await knex('stripe_webhook_events').where({ outcome: 'processed' }).update({ outcome: 'legacy_unknown' });
  await knex.schema.createTable('stripe_processing_locks', t => {
    t.string('resource', 160).primary();
    t.string('claim_token', 80).nullable();
    t.timestamp('lease_until').nullable();
  });
  await knex.schema.createTable('stripe_checkout_reservations', t => {
    t.uuid('user_id').primary().references('id').inTable('users').onDelete('CASCADE');
    t.uuid('attempt_id').notNullable();
    t.text('request').notNullable();
    t.string('session_id').nullable();
    t.text('session_url').nullable();
    t.timestamp('created_at').notNullable();
    t.timestamp('expires_at').notNullable();
  });
  await knex.schema.createTable('stripe_notice_deliveries', t => {
    t.string('delivery_key', 200).primary();
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.text('payload').notNullable();
    t.string('state', 24).notNullable().defaultTo('pending');
    t.string('claim_token', 80).nullable();
    t.timestamp('lease_until').nullable();
    t.timestamp('completed_at').nullable();
  });
  await knex.schema.alterTable('subscriptions', t => { t.dropUnique(['stripe_customer_id']); });
};

exports.down = async function (knex) {
  const duplicate = await knex('subscriptions').select('stripe_customer_id')
    .groupBy('stripe_customer_id').havingRaw('count(*) > 1').first();
  const [event, notice, checkout] = await Promise.all([
    knex('stripe_webhook_events').first(), knex('stripe_notice_deliveries').first(),
    knex('stripe_checkout_reservations').first(),
  ]);
  if (duplicate || event || notice || checkout) {
    throw new Error('Stripe recovery rollback would discard billing records; use a reviewed forward migration');
  }
  await knex.schema.alterTable('subscriptions', t => t.unique(['stripe_customer_id']));
  await knex.schema.dropTable('stripe_notice_deliveries');
  await knex.schema.dropTable('stripe_checkout_reservations');
  await knex.schema.dropTable('stripe_processing_locks');
  await knex.schema.alterTable('stripe_webhook_events', t => {
    t.dropColumns('payload', 'claim_token', 'lease_until', 'attempts', 'completed_at');
  });
};
