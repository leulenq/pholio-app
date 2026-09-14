"use strict";

exports.up = async function (knex) {
  await knex.schema.createTable("submission_webhook_deliveries", (table) => {
    table.uuid("id").primary();
    table.uuid("application_id").notNullable().references("id").inTable("applications").onDelete("CASCADE");
    table.uuid("package_id").notNullable().references("id").inTable("talent_submission_packages").onDelete("CASCADE");
    table.uuid("webhook_id").notNullable().references("id").inTable("agency_export_webhooks").onDelete("CASCADE");
    table.string("endpoint_revision", 64).notNullable();
    table.string("state", 20).notNullable().defaultTo("pending");
    table.integer("attempts").notNullable().defaultTo(0);
    table.timestamp("next_attempt_at").notNullable();
    table.uuid("lease_token").nullable();
    table.timestamp("lease_expires_at").nullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("completed_at").nullable();
    table.string("last_error", 100).nullable();
    table.unique(["package_id", "webhook_id"]);
    table.index(["state", "next_attempt_at"]);
  });
};

exports.down = async function (knex) {
  const obligations = await knex("submission_webhook_deliveries").first("id");
  if (obligations) throw new Error("Refusing to roll back durable webhook delivery records; use a reviewed forward migration.");
  await knex.schema.dropTable("submission_webhook_deliveries");
};
