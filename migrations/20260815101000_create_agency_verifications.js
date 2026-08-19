"use strict";

/**
 * Platform-curated registry verifications for agencies and reference entries.
 *
 * `docs/talent-trust-loop-design-2026-08.md` §(a) M2. This follows the
 * `agencies.org_kind` precedent, not the `agencies.agency_type` one: every row
 * here is set by the platform from a committed registry snapshot and is never
 * writable by the organisation it describes. `agency_type` is self-declared
 * display copy; a certificate number is an authorization-adjacent claim, and a
 * self-declared one would be worth less than nothing.
 *
 * Ruling R4: rows come only from a real registry pull. An organisation absent
 * from the registry gets no row — never an invented certificate number.
 * Ruling R3 makes that safe to display: absence renders nothing at all, so a
 * missing row is not read as a negative claim about the agency.
 *
 * Both owner columns are nullable because the two populations are disjoint in
 * practice: `organization_id` carries the spec-registry organisation slug for
 * reference entries (which have no `agencies` row — that is the point of the
 * reference set), `agency_id` carries live Pholio agencies. The invariant that
 * at least one is set is enforced in the pack validator and the sync script
 * rather than as a dual-dialect CHECK, matching how the spec-registry pipeline
 * already guards its own cross-field rules.
 *
 * @param {import("knex").Knex} knex
 */
exports.up = async function up(knex) {
  if (await knex.schema.hasTable("agency_verifications")) return;

  await knex.schema.createTable("agency_verifications", (table) => {
    table.uuid("id").primary();
    // Closed vocabulary — 'ny_dol' today. Constants both sides.
    table.string("registry", 24).notNullable();
    table.string("organization_id", 120).nullable();
    table
      .uuid("agency_id")
      .nullable()
      .references("id")
      .inTable("agencies")
      .onDelete("SET NULL");
    table.string("legal_name", 200).notNullable();
    table.string("dba", 200).nullable();
    table.string("certificate_number", 64).notNullable();
    table.date("registered_on").nullable();
    table.date("expires_on").nullable();
    table.string("registry_status", 24).notNullable().defaultTo("active");
    table.string("official_site_url", 500).nullable();
    table.string("official_apply_url", 500).nullable();
    // The Socrata row / source capture this entry was read from.
    table.string("evidence_url", 500).nullable();
    // When the registry row was pulled.
    table.date("retrieved_on").notNullable();
    // When a human matched that row to this organisation. Two dates, because
    // "the registry said this on the 15th" and "we believe this is them" are
    // different claims and the plate copy only ever shows the second.
    table.date("verified_on").notNullable();
    table.string("notes", 500).nullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());

    // The natural key the sync script upserts on: one row per certificate per
    // registry, so a re-pull updates rather than duplicates.
    table.unique(
      ["registry", "certificate_number"],
      "uq_agency_verifications_registry_certificate",
    );
    table.index("agency_id", "idx_agency_verifications_agency");
    table.index("organization_id", "idx_agency_verifications_organization");
  });
};

/** @param {import("knex").Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("agency_verifications");
};
