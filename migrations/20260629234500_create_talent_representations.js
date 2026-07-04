"use strict";

const { v4: uuidv4 } = require("uuid");

function normalizedKey(value) {
  return String(value || "")
    .trim()
    .toLocaleLowerCase("en-US");
}

/**
 * Structured representation relationships. `profiles.current_agency` remains
 * as a compatibility projection for older readers.
 *
 * @param {import("knex").Knex} knex
 */
exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable("talent_representations"))) {
    await knex.schema.createTable("talent_representations", (table) => {
      table.uuid("id").primary();
      table
        .uuid("profile_id")
        .notNullable()
        .references("id")
        .inTable("profiles")
        .onDelete("CASCADE");
      table
        .uuid("agency_id")
        .nullable()
        .references("id")
        .inTable("agencies")
        .onDelete("SET NULL");
      table.string("external_agency_name", 160).nullable();
      table.string("external_agency_key", 160).nullable();
      table.string("relationship_type", 20).notNullable();
      table.string("market", 120).nullable();
      table.string("territory", 120).nullable();
      table.string("scope_key", 245).notNullable().defaultTo("|");
      table.string("division", 100).nullable();
      table.boolean("is_exclusive").notNullable().defaultTo(false);
      table.string("status", 20).notNullable().defaultTo("active");
      table.date("started_on").nullable();
      table.date("ended_on").nullable();
      table.string("source", 20).notNullable().defaultTo("profile");
      table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
      table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());

      table.check(
        "relationship_type in ('mother', 'placement')",
        [],
        "talent_representations_relationship_type_check",
      );
      table.check(
        "status in ('active', 'ended')",
        [],
        "talent_representations_status_check",
      );
      table.check(
        "source in ('legacy', 'profile')",
        [],
        "talent_representations_source_check",
      );
      table.check(
        "((agency_id is not null and external_agency_name is null and external_agency_key is null) or (agency_id is null and external_agency_name is not null and external_agency_key is not null))",
        [],
        "talent_representations_counterparty_check",
      );
      table.check(
        "((status = 'active' and ended_on is null) or (status = 'ended' and ended_on is not null))",
        [],
        "talent_representations_lifecycle_check",
      );
      table.index(["profile_id", "status"]);
      table.index(["agency_id", "status"]);
    });

    await knex.raw(
      "create unique index talent_representations_active_internal_unique on talent_representations (profile_id, agency_id, relationship_type, scope_key) where status = 'active' and agency_id is not null",
    );
    await knex.raw(
      "create unique index talent_representations_active_external_unique on talent_representations (profile_id, external_agency_key, relationship_type, scope_key) where status = 'active' and agency_id is null",
    );
  }

  const legacyProfiles = await knex("profiles")
    .whereNotNull("current_agency")
    .select("id", "current_agency", "created_at");

  for (const profile of legacyProfiles) {
    const name = String(profile.current_agency || "").trim();
    if (!name) continue;
    const externalKey = normalizedKey(name);
    const existing = await knex("talent_representations")
      .where({
        profile_id: profile.id,
        external_agency_key: externalKey,
        relationship_type: "mother",
        scope_key: "|",
        status: "active",
      })
      .first();
    if (existing) continue;

    await knex("talent_representations").insert({
      id: uuidv4(),
      profile_id: profile.id,
      agency_id: null,
      external_agency_name: name,
      external_agency_key: externalKey,
      relationship_type: "mother",
      market: null,
      territory: null,
      scope_key: "|",
      division: null,
      is_exclusive: false,
      status: "active",
      started_on: null,
      ended_on: null,
      source: "legacy",
      created_at: profile.created_at || knex.fn.now(),
      updated_at: knex.fn.now(),
    });
  }
};

/**
 * @param {import("knex").Knex} knex
 */
exports.down = async function down(knex) {
  if (await knex.schema.hasTable("talent_representations")) {
    await knex.schema.dropTable("talent_representations");
  }
};
