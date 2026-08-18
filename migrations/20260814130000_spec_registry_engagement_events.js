"use strict";

/**
 * What talent actually did with a published route.
 *
 * Guardrail 4 of `docs/spec-correct-export-brief.md`: the payoff for carrying
 * fifty agencies Pholio cannot deliver to is a sentence you can put in front of
 * one of them — *"142 people prepared an Elite-spec set on Pholio last quarter
 * and applied on your site."* That sentence needs two counts per agency, so
 * they are recorded here rather than inferred later from something that was
 * never measured.
 *
 * The row keys on `series_id`, not on an agency row, because most of these
 * agencies have no agency row — that is the entire point of the reference set.
 * `agency_id` is filled in only when the series maps to a live Pholio agency,
 * which keeps "prepared a set for a customer" separable from "prepared a set
 * for a reference agency" without a join back through a mapping that may change.
 *
 * @param {import("knex").Knex} knex
 */
exports.up = async function up(knex) {
  if (await knex.schema.hasTable("spec_registry_engagement_events")) return;

  await knex.schema.createTable("spec_registry_engagement_events", (table) => {
    table.uuid("id").primary();
    table
      .string("series_id", 180)
      .notNullable()
      .references("series_id")
      .inTable("spec_registry_series")
      .onDelete("CASCADE");
    // Null for every reference agency. Not a foreign key gap — a fact.
    table
      .uuid("agency_id")
      .nullable()
      .references("id")
      .inTable("agencies")
      .onDelete("SET NULL");
    table
      .uuid("profile_id")
      .notNullable()
      .references("id")
      .inTable("profiles")
      .onDelete("CASCADE");
    // "export" — downloaded a spec-correct set.
    // "outbound_click" — followed the link to the agency's own application page.
    table.string("event_type", 32).notNullable();
    table.string("revision_id", 200).nullable();
    table.integer("file_count").nullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());

    table.index(["series_id", "event_type", "created_at"], "idx_sr_engagement_series_type");
    table.index(["profile_id", "created_at"], "idx_sr_engagement_profile");
  });
};

/** @param {import("knex").Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("spec_registry_engagement_events");
};
