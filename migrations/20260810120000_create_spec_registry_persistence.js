"use strict";

function isPostgres(knex) {
  const client = String(knex.client.config.client || "").toLowerCase();
  return client === "pg" || client === "postgresql";
}

function jsonColumn(knex, table, name) {
  return isPostgres(knex) ? table.jsonb(name) : table.text(name);
}

/**
 * Create a table only if it is not already there.
 *
 * Seven tables in one migration means seven chances to abort halfway through on
 * a database that has some of them. Guarding each one lets a partially-applied
 * run be re-run to completion instead of needing a hand-repair.
 */
async function createTableIfMissing(knex, name, build) {
  if (await knex.schema.hasTable(name)) return;
  await knex.schema.createTable(name, build);
}

/**
 * Materialized persistence for the file-authored Spec Registry.
 *
 * The JSON package remains the editorial source of truth. These tables keep
 * immutable revisions and historical manifests queryable at runtime while a
 * singleton pointer activates one complete dataset atomically.
 *
 * @param {import("knex").Knex} knex
 */
exports.up = async function up(knex) {
  await createTableIfMissing(knex, "spec_registry_datasets", (table) => {
    table.string("dataset_version", 64).primary();
    table.string("schema_version", 24).notNullable();
    table.string("taxonomy_version", 24).notNullable();
    table.date("published_on").notNullable();
    table.string("manifest_sha256", 64).notNullable();
    table.string("taxonomy_sha256", 64).notNullable();
    table.string("package_sha256", 64).notNullable().unique();
    jsonColumn(knex, table, "manifest_json").notNullable();
    jsonColumn(knex, table, "taxonomy_json").notNullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
  });

  await createTableIfMissing(knex, "spec_registry_series", (table) => {
    table.string("series_id", 180).primary();
    table.string("organization_key", 120).notNullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
  });

  await createTableIfMissing(knex, "spec_registry_revisions", (table) => {
    table.string("revision_id", 200).primary();
    table
      .string("series_id", 180)
      .notNullable()
      .references("series_id")
      .inTable("spec_registry_series")
      .onDelete("RESTRICT");
    table.integer("revision_number").notNullable();
    table
      .string("supersedes_revision_id", 200)
      .nullable()
      .references("revision_id")
      .inTable("spec_registry_revisions")
      .onDelete("RESTRICT");
    table.string("schema_version", 24).notNullable();
    table.string("taxonomy_version", 24).notNullable();
    table.string("status", 24).notNullable();
    table.string("evaluation_mode", 24).notNullable();
    table.boolean("enforcement_authorized").notNullable().defaultTo(false);
    table.string("organization_name", 180).notNullable();
    table.string("market_kind", 40).notNullable();
    table.string("market_code", 180).nullable();
    table.string("channel_type", 60).notNullable();
    table.text("channel_url").notNullable();
    table.date("observed_on").notNullable();
    table.date("effective_from").nullable();
    table.date("effective_until").nullable();
    table.date("reviewed_on").nullable();
    table.date("next_review_on").nullable();
    table.string("payload_sha256", 64).notNullable();
    jsonColumn(knex, table, "payload_json").notNullable();
    table.timestamp("imported_at").notNullable().defaultTo(knex.fn.now());

    table.unique(
      ["series_id", "revision_number"],
      "uq_sr_revisions_series_number",
    );
    table.index(
      ["series_id", "revision_number"],
      "idx_sr_revisions_series_revision",
    );
    table.index(
      ["next_review_on", "status"],
      "idx_sr_revisions_review_due",
    );
    table.index(
      ["status", "evaluation_mode"],
      "idx_sr_revisions_status_mode",
    );
  });

  await createTableIfMissing(knex, "spec_registry_dataset_records", (table) => {
    table
      .string("dataset_version", 64)
      .notNullable()
      .references("dataset_version")
      .inTable("spec_registry_datasets")
      .onDelete("CASCADE");
    table
      .string("series_id", 180)
      .notNullable()
      .references("series_id")
      .inTable("spec_registry_series")
      .onDelete("RESTRICT");
    table
      .string("revision_id", 200)
      .notNullable()
      .references("revision_id")
      .inTable("spec_registry_revisions")
      .onDelete("RESTRICT");
    table.string("manifest_status", 24).notNullable();
    table.string("source_path", 500).notNullable();

    table.primary(
      ["dataset_version", "series_id"],
      "pk_sr_dataset_records",
    );
    table.unique(
      ["dataset_version", "revision_id"],
      "uq_sr_dataset_records_revision",
    );
    table.index("revision_id", "idx_sr_dataset_records_revision");
  });

  await createTableIfMissing(knex, "spec_registry_sync_runs", (table) => {
    table.uuid("id").primary();
    table.string("dataset_version", 64).nullable();
    table.string("manifest_sha256", 64).nullable();
    table.string("package_sha256", 64).nullable();
    table.string("status", 24).notNullable();
    table.timestamp("started_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("completed_at").nullable();
    jsonColumn(knex, table, "counts_json").nullable();
    table.string("error_code", 80).nullable();
    table.text("error_detail").nullable();

    table.index("started_at", "idx_sr_sync_runs_started");
    table.index(
      ["dataset_version", "started_at"],
      "idx_sr_sync_runs_dataset",
    );
  });

  await createTableIfMissing(knex, "spec_registry_state", (table) => {
    table.string("state_key", 32).primary();
    table
      .string("dataset_version", 64)
      .notNullable()
      .references("dataset_version")
      .inTable("spec_registry_datasets")
      .onDelete("RESTRICT");
    table
      .uuid("sync_run_id")
      .nullable()
      .references("id")
      .inTable("spec_registry_sync_runs")
      .onDelete("SET NULL");
    table.timestamp("activated_at").notNullable().defaultTo(knex.fn.now());
  });

  await createTableIfMissing(knex, "spec_registry_agency_routes", (table) => {
    table
      .uuid("agency_id")
      .notNullable()
      .references("id")
      .inTable("agencies")
      .onDelete("CASCADE");
    table
      .string("series_id", 180)
      .notNullable()
      .references("series_id")
      .inTable("spec_registry_series")
      .onDelete("RESTRICT");
    table.integer("priority").notNullable().defaultTo(100);
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());

    table.primary(["agency_id", "series_id"], "pk_sr_agency_routes");
    table.index("series_id", "idx_sr_agency_routes_series");
    table.index(
      ["agency_id", "priority"],
      "idx_sr_agency_routes_agency_priority",
    );
  });

  await createTableIfMissing(knex, "application_spec_snapshots", (table) => {
    table.uuid("id").primary();
    table
      .uuid("application_id")
      .notNullable()
      .references("id")
      .inTable("applications")
      .onDelete("CASCADE");
    table
      .uuid("submission_request_id")
      .notNullable()
      .unique()
      .references("id")
      .inTable("application_submission_requests")
      .onDelete("RESTRICT");
    table
      .string("dataset_version", 64)
      .notNullable()
      .references("dataset_version")
      .inTable("spec_registry_datasets")
      .onDelete("RESTRICT");
    table
      .string("revision_id", 200)
      .notNullable()
      .references("revision_id")
      .inTable("spec_registry_revisions")
      .onDelete("RESTRICT");
    table.string("spec_payload_sha256", 64).notNullable();
    table.string("evaluation_engine_version", 24).notNullable();
    table.string("input_fingerprint", 64).notNullable();
    jsonColumn(knex, table, "evaluation_json").notNullable();
    table.timestamp("evaluated_at").notNullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());

    table.index("application_id", "idx_app_spec_snapshots_application");
    table.index("revision_id", "idx_app_spec_snapshots_revision");
    table.index("dataset_version", "idx_app_spec_snapshots_dataset");
  });
};

/** @param {import("knex").Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("application_spec_snapshots");
  await knex.schema.dropTableIfExists("spec_registry_agency_routes");
  await knex.schema.dropTableIfExists("spec_registry_state");
  await knex.schema.dropTableIfExists("spec_registry_sync_runs");
  await knex.schema.dropTableIfExists("spec_registry_dataset_records");
  await knex.schema.dropTableIfExists("spec_registry_revisions");
  await knex.schema.dropTableIfExists("spec_registry_series");
  await knex.schema.dropTableIfExists("spec_registry_datasets");
};
