"use strict";

/**
 * `agency_export_webhooks` — push a submission to whatever the agency already
 * uses.
 *
 * Plan §9.4 names export/handoff as one of two sanctioned adjacencies and says
 * why: "the single most-cited adoption killer ('the second inbox') and it is an
 * exit ramp, the opposite of back-office capture." CSV exists and is good. The
 * webhook is the half that removes the human step — a submission arrives in the
 * agency's own system without anyone exporting anything.
 *
 * One endpoint per agency, deliberately. Fan-out to several systems is a
 * different product (and an integration platform's job); one honest hand-off is
 * what closes the adoption gap.
 *
 * `secret` signs the payload (HMAC-SHA256, `X-Pholio-Signature`). Without it a
 * receiver cannot distinguish Pholio from anyone who learned the URL, and the
 * URL travels through whatever the agency pastes it into.
 *
 * `consecutive_failures` and `disabled_at` exist so a dead endpoint stops being
 * retried forever. An agency that changes systems and forgets this row should
 * cost a handful of failed deliveries, not an unbounded queue.
 *
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  if (await knex.schema.hasTable("agency_export_webhooks")) return;

  await knex.schema.createTable("agency_export_webhooks", (table) => {
    table.uuid("id").primary();
    table
      .uuid("agency_id")
      .notNullable()
      .references("id")
      .inTable("agencies")
      .onDelete("CASCADE");

    // https only, public hosts only — enforced in the service, not here, because
    // the rule is about resolved addresses rather than string shape.
    table.text("url").notNullable();
    table.string("secret", 128).nullable();
    table.boolean("active").notNullable().defaultTo(true);

    // Delivery health, kept on the row rather than in a log table: what an
    // agency needs is "is it working, and if not what did it say", not history.
    table.timestamp("last_delivered_at").nullable();
    table.integer("last_status_code").nullable();
    table.text("last_error").nullable();
    table.integer("consecutive_failures").notNullable().defaultTo(0);
    table.timestamp("disabled_at").nullable();

    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());

    // One endpoint per agency.
    table.unique(["agency_id"], {
      indexName: "agency_export_webhooks_agency_unique",
    });
  });
};

/**
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("agency_export_webhooks");
};
