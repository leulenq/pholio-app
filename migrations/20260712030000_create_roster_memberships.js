"use strict";

const { v4: uuidv4 } = require("uuid");

/**
 * Persisted agency roster membership (DATA-1.1).
 *
 * Roster was previously DERIVED at read time from
 * `applications.status IN ('accepted','booked','represented')`, which:
 *   - conflated "submitted to a board" with "sits on the roster",
 *   - made "remove from roster" mutate a historical application row,
 *   - gave division assignment (board_id) no home, and
 *   - made off-platform talent impossible.
 *
 * This table makes membership a first-class, mutable record. It is backfilled
 * from qualifying applications so existing derived rosters are preserved.
 *
 * @param {import("knex").Knex} knex
 */
const ROSTER_STATUSES = ["accepted", "booked", "represented"];

exports.up = async function up(knex) {
  if (await knex.schema.hasTable("roster_memberships")) return;

  await knex.schema.createTable("roster_memberships", (table) => {
    table.uuid("id").primary();
    table
      .uuid("agency_id")
      .notNullable()
      .references("id")
      .inTable("agencies")
      .onDelete("CASCADE");
    // Platform talent (profile_id) OR off-platform talent (talent_record_id);
    // exactly one is required (see subject check below).
    table
      .uuid("profile_id")
      .nullable()
      .references("id")
      .inTable("profiles")
      .onDelete("CASCADE");
    table
      .uuid("talent_record_id")
      .nullable()
      .references("id")
      .inTable("talent_records")
      .onDelete("CASCADE");
    // Division assignment (finally has a home distinct from the application).
    table
      .uuid("board_id")
      .nullable()
      .references("id")
      .inTable("boards")
      .onDelete("SET NULL");
    table.string("stage", 20).notNullable().defaultTo("main");
    table.string("status", 20).notNullable().defaultTo("active");
    table
      .uuid("source_application_id")
      .nullable()
      .references("id")
      .inTable("applications")
      .onDelete("SET NULL");
    table.timestamp("joined_at").nullable();
    table.timestamp("left_at").nullable();
    table.text("notes").nullable();
    table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());
    table.timestamp("updated_at").notNullable().defaultTo(knex.fn.now());

    table.check(
      "stage in ('new_face', 'development', 'main')",
      [],
      "roster_memberships_stage_check",
    );
    table.check(
      "status in ('active', 'inactive', 'left', 'ended')",
      [],
      "roster_memberships_status_check",
    );
    table.check(
      "(profile_id is not null or talent_record_id is not null)",
      [],
      "roster_memberships_subject_check",
    );

    table.index(["agency_id", "status"]);
    table.index(["profile_id"]);
  });

  // One active membership per (agency, platform profile). Partial unique index
  // works on both SQLite and Postgres.
  await knex.raw(
    "create unique index roster_memberships_active_profile_unique on roster_memberships (agency_id, profile_id) where status = 'active' and profile_id is not null",
  );

  // Backfill from qualifying applications. `applications` has UNIQUE(profile_id,
  // agency_id), so there is at most one qualifying row per (agency, profile) —
  // no duplicate active memberships are produced.
  const applicationColumns = await knex("applications").columnInfo();
  const backfillColumns = ["id", "agency_id", "profile_id"];
  if (applicationColumns.accepted_at) backfillColumns.push("accepted_at");
  if (applicationColumns.created_at) backfillColumns.push("created_at");
  const rows = await knex("applications")
    .whereIn("status", ROSTER_STATUSES)
    .whereNotNull("profile_id")
    .whereNotNull("agency_id")
    .select(backfillColumns);

  const memberships = rows.map((app) => ({
    id: uuidv4(),
    agency_id: app.agency_id,
    profile_id: app.profile_id,
    talent_record_id: null,
    board_id: null,
    stage: "main",
    status: "active",
    source_application_id: app.id,
    joined_at: app.accepted_at || app.created_at || knex.fn.now(),
    left_at: null,
    notes: null,
  }));

  if (memberships.length) {
    // Chunk to keep parameter counts within SQLite limits.
    for (let i = 0; i < memberships.length; i += 200) {
      await knex("roster_memberships").insert(memberships.slice(i, i + 200));
    }
  }
};

/**
 * @param {import("knex").Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("roster_memberships");
};
