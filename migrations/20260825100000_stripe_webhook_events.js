"use strict";

/**
 * `stripe_webhook_events` — an idempotency and ordering record for Stripe.
 *
 * Stripe delivers webhooks AT LEAST ONCE and IN NO GUARANTEED ORDER. The
 * handler had neither guard, so two things could happen and one of them costs
 * money in the wrong direction:
 *
 *   - the same event applied twice, harmless for an upsert but not for anything
 *     that ever becomes non-idempotent;
 *   - a `customer.subscription.updated` carrying `status: "active"` arriving
 *     AFTER a `deleted`, rewriting the row back to active and flipping
 *     `profiles.is_pro` back to true. Nothing corrected it afterwards, and the
 *     retry-on-error path makes reordering likelier rather than rarer.
 *
 * `event_id` is unique, which is the idempotency guarantee — a duplicate
 * delivery collides and is skipped rather than reapplied.
 *
 * `subscriptions.last_stripe_event_at` is the ordering guarantee. Stripe stamps
 * every event with `created`; an event older than the last one applied to a
 * subscription describes a world that has already been superseded, and applying
 * it would be time travel. Storing the high-water mark on the subscription
 * rather than deriving it from this table keeps the check to one read on the
 * row already being written.
 *
 * The table is a ledger, not a queue: rows are never updated and never deleted
 * by application code. If it needs trimming later that is a retention job with
 * its own decision to make.
 *
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable("stripe_webhook_events"))) {
    await knex.schema.createTable("stripe_webhook_events", (table) => {
      table.increments("sequence").primary();
      // Stripe's own id (`evt_...`). Unique IS the idempotency mechanism.
      table.string("event_id", 80).notNullable().unique();
      table.string("event_type", 80).notNullable();
      // Stripe's `created`, in epoch seconds — the only ordering authority.
      // Local clocks and arrival order are both unreliable here.
      table.bigInteger("event_created").notNullable();
      table.string("stripe_object_id", 80).nullable();
      table.string("outcome", 24).notNullable().defaultTo("processed");
      table.text("note").nullable();
      table.timestamp("received_at").notNullable().defaultTo(knex.fn.now());

      table.index(["event_type", "event_created"], "idx_stripe_events_type_created");
      table.index(["stripe_object_id"], "idx_stripe_events_object");
    });
  }

  if (!(await knex.schema.hasColumn("subscriptions", "last_stripe_event_at"))) {
    await knex.schema.alterTable("subscriptions", (table) => {
      table.bigInteger("last_stripe_event_at").nullable();
    });
  }
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  if (await knex.schema.hasColumn("subscriptions", "last_stripe_event_at")) {
    await knex.schema.alterTable("subscriptions", (table) => {
      table.dropColumn("last_stripe_event_at");
    });
  }
  await knex.schema.dropTableIfExists("stripe_webhook_events");
};

/**
 * NOT transactional — `down()` drops a column, and SQLite implements that as a
 * table rebuild whose `PRAGMA foreign_keys = OFF` guard is ignored inside a
 * transaction. See tests/migrations/event-casting-schema.test.js.
 */
exports.config = { transaction: false };
