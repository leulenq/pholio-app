"use strict";

const crypto = require("crypto");

/**
 * Wave 2B — Expand + Backfill (per-field audience controls).
 *
 * Model chosen: a normalized `profile_field_visibility` table keyed
 * (profile_id, field_key, audience) with a boolean `visible`. This mirrors the
 * DTO layer's per-audience question — "is field group X exposed to audience Y for
 * this profile?" — and makes per-field / per-audience overrides first-class
 * (design decision 1 + section C "per-field overrides allowed"). A columns-on-
 * profiles approach was rejected: it would need field_group x audience columns
 * (~54) and could not represent per-field overrides cleanly.
 *
 * `visible = false` means "not exposed to this audience by default"; the DTO layer
 * still applies audience-appropriate FORM (e.g. DOB shown only as an age band to
 * public/agency) — form nuance is a DTO concern, this flag is exposure only.
 *
 * Seeded defaults (design section C), for every existing profile:
 *   field_key            private public agency  submission roster confirmed
 *   identity                 ✓      ✓      ✓        ✓        ✓        ✓
 *   stats                    ✓      ✗(opt) ✓        ✓        ✓        ✓
 *   performer_credits        ✓      ✓      ✓        ✓        ✓        ✓
 *   creator_metrics          ✓      ✗(opt) ✓        ✓        ✓        ✓
 *   dob                      ✓      ✗      ✗        ✗        ✓        ✓  (age band via DTO)
 *   compliance               ✓      ✗      ✗        ✗        ✓        ✓
 *   emergency_references     ✓      ✗      ✗        ✗        ✗        ✓
 *   adult_content            ✓      ✗      ✗        ✗        ✗        ✗  (per-brief consent only)
 *   protected_traits         ✓      ✗      ✗        ✗        ✗        ✗
 *
 * @param {import("knex").Knex} knex
 */

const AUDIENCES = [
  "private",
  "public",
  "agency_discovery",
  "named_submission",
  "represented_roster",
  "confirmed_job",
];

// visible flags in AUDIENCES order.
const DEFAULT_MATRIX = {
  identity: [true, true, true, true, true, true],
  stats: [true, false, true, true, true, true],
  performer_credits: [true, true, true, true, true, true],
  creator_metrics: [true, false, true, true, true, true],
  dob: [true, false, false, false, true, true],
  compliance: [true, false, false, false, true, true],
  emergency_references: [true, false, false, false, false, true],
  adult_content: [true, false, false, false, false, false],
  protected_traits: [true, false, false, false, false, false],
};

exports.up = async function up(knex) {
  const hasTable = await knex.schema.hasTable("profile_field_visibility");
  if (!hasTable) {
    await knex.schema.createTable("profile_field_visibility", (table) => {
      table.uuid("id").primary();
      table
        .uuid("profile_id")
        .notNullable()
        .references("id")
        .inTable("profiles")
        .onDelete("CASCADE");
      table.string("field_key", 60).notNullable();
      table.string("audience", 40).notNullable();
      table.boolean("visible").notNullable().defaultTo(false);
      table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
      table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());

      table.unique(["profile_id", "field_key", "audience"]);
      table.index(["profile_id", "field_key"]);
    });
  }

  const profiles = await knex("profiles").select("id");
  for (const profile of profiles) {
    const existing = await knex("profile_field_visibility")
      .where({ profile_id: profile.id })
      .select("field_key", "audience");
    const existingSet = new Set(existing.map(r => `${r.field_key}:${r.audience}`));

    const rowsToInsert = [];
    for (const [fieldKey, flags] of Object.entries(DEFAULT_MATRIX)) {
      AUDIENCES.forEach((audience, i) => {
        if (!existingSet.has(`${fieldKey}:${audience}`)) {
          rowsToInsert.push({
            id: crypto.randomUUID(),
            profile_id: profile.id,
            field_key: fieldKey,
            audience,
            visible: flags[i],
            created_at: new Date(),
            updated_at: new Date(),
          });
        }
      });
    }

    if (rowsToInsert.length > 0) {
      await knex("profile_field_visibility").insert(rowsToInsert);
    }
  }
};

exports.down = async function down(knex) {
  if (await knex.schema.hasTable("profile_field_visibility")) {
    await knex.schema.dropTable("profile_field_visibility");
  }
};
