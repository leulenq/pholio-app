"use strict";

/**
 * Wave 2E — durable deletion truthfulness.
 *
 * `deleteUserAccount` (src/shared/lib/account-deletion.js) previously swallowed
 * R2/Firebase provider-purge failures, deleted the `users` row anyway, and
 * reported success — destroying the only signal that a retry was needed.
 *
 * This table is the minimal honest fix: one row per provider purge that did
 * not complete, captured BEFORE the `users` row is deleted so the retry
 * target (firebase_uid, storage keys) survives the account deletion. It is
 * intentionally NOT foreign-keyed to `users` — the referenced user row is
 * gone by design once the failure is durably recorded.
 *
 * TODO(outbox): this is a flat retry table, not a full job-runner outbox
 * (no worker/lease/backoff scheduling). A later wave should promote this to
 * a proper outbox processor if provider-purge failure volume warrants it.
 *
 * @param {import("knex").Knex} knex
 */
exports.up = async function up(knex) {
  const hasTable = await knex.schema.hasTable("account_deletion_failures");
  if (hasTable) return;

  await knex.schema.createTable("account_deletion_failures", (table) => {
    table.uuid("id").primary();
    // Intentionally not a FK — the referenced user is deleted by the time
    // this durably records the failure.
    table.uuid("user_id").notNullable();
    table.string("firebase_uid", 191).nullable();
    // 'r2' | 'firebase'
    table.string("provider", 20).notNullable();
    // 'pending' | 'resolved' | 'abandoned'
    table.string("status", 20).notNullable().defaultTo("pending");
    table.json("payload").nullable();
    table.text("last_error").nullable();
    table.integer("attempts").notNullable().defaultTo(1);
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("resolved_at").nullable();

    table.index(["status", "provider"]);
    table.index(["user_id"]);
  });
};

/**
 * @param {import("knex").Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("account_deletion_failures");
};
