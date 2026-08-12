"use strict";

function isPostgres(knex) {
  const client = String(knex.client.config.client || "").toLowerCase();
  return client === "pg" || client === "postgresql";
}

function jsonColumn(knex, table, name) {
  return isPostgres(knex) ? table.jsonb(name) : table.text(name);
}

/**
 * Agency-authored Spec Registry routes.
 *
 * The editorial package stays what it is: file-authored, hash-locked, and
 * published as one complete dataset behind a singleton pointer. An agency
 * authoring its own route cannot join that package without republishing it, so
 * an agency series carries its own current-revision pointer instead and
 * resolves through `spec_registry_agency_routes`.
 *
 * Revisions themselves are shared. Both origins mint immutable, hashed rows in
 * `spec_registry_revisions`; only the way a series decides which revision is
 * current differs.
 *
 * @param {import("knex").Knex} knex
 */
exports.up = async function up(knex) {
  await knex.schema.alterTable("spec_registry_series", (table) => {
    // "editorial" — a head in the published dataset, as today.
    // "agency"    — authored in-product, current revision named on this row.
    table.string("origin", 16).notNullable().defaultTo("editorial");
    table
      .uuid("agency_id")
      .nullable()
      .references("id")
      .inTable("agencies")
      .onDelete("CASCADE");
    table
      .string("current_revision_id", 200)
      .nullable()
      .references("revision_id")
      .inTable("spec_registry_revisions")
      .onDelete("RESTRICT");
  });

  await knex.schema.alterTable("spec_registry_series", (table) => {
    table.index(["origin", "agency_id"], "idx_sr_series_origin_agency");
  });

  // One authored series per agency. A partial unique index would be tighter,
  // but SQLite and Postgres disagree on the syntax and the application-level
  // series id (`agency:<id>:open-call`) is already deterministic per agency.
  await knex.schema.createTable("agency_spec_drafts", (table) => {
    table.uuid("id").primary();
    table
      .uuid("agency_id")
      .notNullable()
      .unique()
      .references("id")
      .inTable("agencies")
      .onDelete("CASCADE");
    table.string("series_id", 180).notNullable();
    // The revision this draft was opened from — null for a first draft.
    table
      .string("base_revision_id", 200)
      .nullable()
      .references("revision_id")
      .inTable("spec_registry_revisions")
      .onDelete("SET NULL");
    jsonColumn(knex, table, "draft_json").notNullable();
    table
      .uuid("updated_by_user_id")
      .nullable()
      .references("id")
      .inTable("users")
      .onDelete("SET NULL");
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());

    table.index("series_id", "idx_agency_spec_drafts_series");
  });

  // An agency-authored revision has no dataset record, so a submission
  // evaluated against one cannot name a dataset version. The pairing is
  // enforced in `saveApplicationSnapshot`, which requires either a dataset
  // record or an agency-origin series — never neither.
  await knex.schema.alterTable("application_spec_snapshots", (table) => {
    table.string("dataset_version", 64).nullable().alter();
  });
};

/** @param {import("knex").Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("agency_spec_drafts");

  /*
   * Agency-authored series must go before the column that identifies them.
   *
   * Dropping `origin` first would strand them: they resolve through their own
   * pointer, have no dataset record, and once the column is gone they are
   * indistinguishable from an editorial head that has simply lost its manifest
   * entry. Rolling back has to leave a database that is merely older, not one
   * carrying rows nothing can interpret.
   */
  const authoredSeries = await knex("spec_registry_series")
    .where({ origin: "agency" })
    .pluck("series_id");

  if (authoredSeries.length > 0) {
    const authoredRevisions = await knex("spec_registry_revisions")
      .whereIn("series_id", authoredSeries)
      .pluck("revision_id");

    await knex("application_spec_snapshots")
      .whereIn("revision_id", authoredRevisions)
      .del();
    await knex("spec_registry_agency_routes").whereIn("series_id", authoredSeries).del();
    // Release the series → revision pointer before deleting what it references.
    await knex("spec_registry_series")
      .whereIn("series_id", authoredSeries)
      .update({ current_revision_id: null });
    // Newest first: each revision may be referenced by its successor.
    await knex("spec_registry_revisions")
      .whereIn("series_id", authoredSeries)
      .orderBy("revision_number", "desc")
      .del();
    await knex("spec_registry_series").whereIn("series_id", authoredSeries).del();
  }

  await knex.schema.alterTable("spec_registry_series", (table) => {
    table.dropIndex(["origin", "agency_id"], "idx_sr_series_origin_agency");
  });

  await knex.schema.alterTable("spec_registry_series", (table) => {
    table.dropColumn("current_revision_id");
    table.dropColumn("agency_id");
    table.dropColumn("origin");
  });

  // Any snapshot still lacking a dataset version would block the column going
  // back to NOT NULL. The authored ones are already gone above.
  await knex("application_spec_snapshots").whereNull("dataset_version").del();
  await knex.schema.alterTable("application_spec_snapshots", (table) => {
    table.string("dataset_version", 64).notNullable().alter();
  });
};
