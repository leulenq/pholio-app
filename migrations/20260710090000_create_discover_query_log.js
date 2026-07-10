"use strict";

/**
 * Discover search — query/outcome logging (WS3.1–2).
 *
 * `discover_query_log` — one row per agency Discover search: the raw brief,
 * the parsed contract, deterministic-extraction disagreements, which engine
 * served it, the result set, group counts, and stage timings.
 *
 * `discover_query_events` — per-profile outcome events attributed back to a
 * logged query (impression / detail_open / invite / shortlist / tag), feeding
 * eval and the talent-side Intel demand pipeline.
 *
 * Dual-dialect (PG + SQLite). JSON columns use knex `json` (jsonb on PG,
 * TEXT on SQLite) — these are logs, not query-indexed documents.
 *
 * @param {import("knex").Knex} knex
 */
exports.up = async function up(knex) {
  const hasLog = await knex.schema.hasTable("discover_query_log");
  if (!hasLog) {
    await knex.schema.createTable("discover_query_log", (table) => {
      table.uuid("id").primary();
      table
        .uuid("agency_user_id")
        .notNullable()
        .references("id")
        .inTable("users")
        .onDelete("CASCADE");
      table.text("raw_brief").nullable();
      table.json("parsed_contract").nullable();
      table.json("extraction_disagreements").nullable();
      // 'launch' | 'hybrid' | 'browse'
      table.string("engine", 20).nullable();
      table.json("result_profile_ids").nullable();
      table.json("group_counts").nullable();
      table.json("timings").nullable();
      table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());

      table.index(["agency_user_id", "created_at"]);
    });
  }

  const hasEvents = await knex.schema.hasTable("discover_query_events");
  if (!hasEvents) {
    await knex.schema.createTable("discover_query_events", (table) => {
      table.uuid("id").primary();
      table
        .uuid("query_log_id")
        .notNullable()
        .references("id")
        .inTable("discover_query_log")
        .onDelete("CASCADE");
      table
        .uuid("profile_id")
        .notNullable()
        .references("id")
        .inTable("profiles")
        .onDelete("CASCADE");
      // Check-constrained on both dialects via knex enu (text + CHECK).
      table
        .enu("event", [
          "impression",
          "detail_open",
          "invite",
          "shortlist",
          "tag",
        ])
        .notNullable();
      table.timestamp("created_at").notNullable().defaultTo(knex.fn.now());

      table.index(["query_log_id"]);
      table.index(["profile_id"]);
    });
  }
};

/**
 * @param {import("knex").Knex} knex
 */
exports.down = async function down(knex) {
  await knex.schema.dropTableIfExists("discover_query_events");
  await knex.schema.dropTableIfExists("discover_query_log");
};
