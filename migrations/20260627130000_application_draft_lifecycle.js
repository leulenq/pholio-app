"use strict";

/**
 * Production lifecycle support for application drafts.
 *
 * Existing draft migrations may already be applied, so this is deliberately a
 * forward-only extension. Deleted/expired rows act as tombstones during the
 * seven-day recovery window, then are purged by the lifecycle cleanup.
 *
 * @param {import("knex").Knex} knex
 */
exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable("application_drafts"))) return;

  const columns = [
    ["generation", (table) => table.integer("generation").notNullable().defaultTo(1)],
    [
      "lifecycle_state",
      (table) => table.string("lifecycle_state", 24).notNullable().defaultTo("active"),
    ],
    ["expires_at", (table) => table.timestamp("expires_at").nullable()],
    ["deleted_at", (table) => table.timestamp("deleted_at").nullable()],
    ["expired_at", (table) => table.timestamp("expired_at").nullable()],
    ["recoverable_until", (table) => table.timestamp("recoverable_until").nullable()],
    ["repair_warnings", (table) => table.jsonb("repair_warnings").notNullable().defaultTo("[]")],
  ];

  for (const [name, addColumn] of columns) {
    if (!(await knex.schema.hasColumn("application_drafts", name))) {
      await knex.schema.alterTable("application_drafts", addColumn);
    }
  }

  const rows = await knex("application_drafts").select("id", "updated_at");
  for (const row of rows) {
    const rawUpdatedAt = row.updated_at;
    const timestampText =
      rawUpdatedAt && !(rawUpdatedAt instanceof Date)
        ? String(rawUpdatedAt).trim().replace(" ", "T")
        : null;
    const updatedAt =
      rawUpdatedAt instanceof Date
        ? rawUpdatedAt
        : timestampText
          ? new Date(
              /(?:Z|[+-]\d{2}:?\d{2})$/i.test(timestampText)
                ? timestampText
                : `${timestampText}Z`,
            )
          : new Date();
    const safeUpdatedAt = Number.isNaN(updatedAt.getTime()) ? new Date() : updatedAt;
    await knex("application_drafts").where({ id: row.id }).update({
      lifecycle_state: "active",
      generation: 1,
      expires_at: new Date(
        safeUpdatedAt.getTime() + 90 * 24 * 60 * 60 * 1000,
      ).toISOString(),
      repair_warnings: JSON.stringify([]),
    });
  }

  await knex.schema.alterTable("application_drafts", (table) => {
    table.index(
      ["profile_id", "lifecycle_state", "updated_at"],
      "idx_application_drafts_profile_lifecycle",
    );
    table.index(
      ["lifecycle_state", "expires_at"],
      "idx_application_drafts_expiry",
    );
  });

  if (!(await knex.schema.hasTable("application_draft_events"))) {
    await knex.schema.createTable("application_draft_events", (table) => {
      table.uuid("id").primary();
      table.uuid("draft_id").nullable();
      table
        .uuid("profile_id")
        .notNullable()
        .references("id")
        .inTable("profiles")
        .onDelete("CASCADE");
      table
        .uuid("agency_id")
        .notNullable()
        .references("id")
        .inTable("agencies")
        .onDelete("CASCADE");
      table.string("event_type", 48).notNullable();
      table.integer("version").nullable();
      table.integer("generation").nullable();
      table.string("lifecycle_state", 24).nullable();
      // Metadata is restricted in the service to counts/codes. Draft payload,
      // notes, image IDs, and other user-authored text are never recorded.
      table.jsonb("metadata").notNullable().defaultTo("{}");
      table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
      table.index(["profile_id", "created_at"], "idx_draft_events_profile_created");
      table.index(["event_type", "created_at"], "idx_draft_events_type_created");
    });
  }

  if (!(await knex.schema.hasTable("application_submission_requests"))) {
    await knex.schema.createTable("application_submission_requests", (table) => {
      table.uuid("id").primary();
      table
        .uuid("profile_id")
        .notNullable()
        .references("id")
        .inTable("profiles")
        .onDelete("CASCADE");
      table
        .uuid("agency_id")
        .notNullable()
        .references("id")
        .inTable("agencies")
        .onDelete("CASCADE");
      table.string("idempotency_key", 128).notNullable();
      table.string("request_hash", 64).notNullable();
      table
        .uuid("application_id")
        .nullable()
        .references("id")
        .inTable("applications")
        .onDelete("SET NULL");
      table.string("status", 24).notNullable().defaultTo("processing");
      table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
      table.timestamp("completed_at").nullable();
      table.unique(
        ["profile_id", "idempotency_key"],
        "uq_submission_requests_profile_key",
      );
      table.index(["profile_id", "created_at"], "idx_submission_requests_profile_created");
    });
  }
};

/**
 * @param {import("knex").Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("application_submission_requests");
  await knex.schema.dropTableIfExists("application_draft_events");

  if (!(await knex.schema.hasTable("application_drafts"))) return;
  for (const indexName of [
    "idx_application_drafts_expiry",
    "idx_application_drafts_profile_lifecycle",
  ]) {
    try {
      await knex.schema.alterTable("application_drafts", (table) => {
        table.dropIndex([], indexName);
      });
    } catch {
      // Some SQLite versions drop indexes while rebuilding the table below.
    }
  }
  for (const name of [
    "repair_warnings",
    "recoverable_until",
    "expired_at",
    "deleted_at",
    "expires_at",
    "lifecycle_state",
    "generation",
  ]) {
    if (await knex.schema.hasColumn("application_drafts", name)) {
      await knex.schema.alterTable("application_drafts", (table) => {
        table.dropColumn(name);
      });
    }
  }
};
