"use strict";

const knexFactory = require("knex");
const { v4: uuidv4 } = require("uuid");

const queryLogMigration = require("../../migrations/20260710090000_create_discover_query_log");
const imageSignalsMigration = require("../../migrations/20260710090100_create_image_signals");
const embeddingMigration = require("../../migrations/20260710090200_add_images_embedding_vector");
const marketMigration = require("../../migrations/20260710090300_add_profile_market");
const availabilityMigration = require("../../migrations/20260710090400_profile_availability_and_bookouts");
const measuredMigration = require("../../migrations/20260710090500_profile_measured_in_person");
const cachesMigration = require("../../migrations/20260710090600_create_discover_caches");

const {
  persistImageSignals,
} = require("../../src/domains/ai/classify-portfolio-image");

const MIGRATIONS = [
  queryLogMigration,
  imageSignalsMigration,
  embeddingMigration,
  marketMigration,
  availabilityMigration,
  measuredMigration,
  cachesMigration,
];

describe("discover WS3 migrations bundle", () => {
  let db;

  beforeEach(async () => {
    db = knexFactory({
      client: "sqlite3",
      connection: { filename: ":memory:" },
      useNullAsDefault: true,
    });
    await db.raw("PRAGMA foreign_keys = ON");
    await db.schema.createTable("users", (table) => {
      table.uuid("id").primary();
      table.string("email").notNullable();
    });
    await db.schema.createTable("profiles", (table) => {
      table.uuid("id").primary();
      table.string("city").nullable();
    });
    await db.schema.createTable("images", (table) => {
      table.uuid("id").primary();
      table.uuid("profile_id").nullable();
    });
    for (const migration of MIGRATIONS) {
      await migration.up(db);
    }
  });

  afterEach(async () => {
    await db.destroy();
  });

  test("up() then down() run cleanly on SQLite (dual-dialect safety)", async () => {
    for (const migration of [...MIGRATIONS].reverse()) {
      await migration.down(db);
    }
    expect(await db.schema.hasTable("discover_query_log")).toBe(false);
    expect(await db.schema.hasTable("image_signals")).toBe(false);
    expect(await db.schema.hasTable("bookouts")).toBe(false);
    expect(await db.schema.hasColumn("profiles", "market")).toBe(false);
    expect(await db.schema.hasColumn("profiles", "availability_status")).toBe(
      false,
    );
    expect(
      await db.schema.hasColumn("profiles", "measured_in_person_at"),
    ).toBe(false);
    expect(await db.schema.hasTable("discover_parse_cache")).toBe(false);
    expect(await db.schema.hasTable("discover_embed_cache")).toBe(false);
  });

  test("query log + events accept rows; event value is check-constrained", async () => {
    const userId = uuidv4();
    const profileId = uuidv4();
    await db("users").insert({ id: userId, email: "a@example.com" });
    await db("profiles").insert({ id: profileId });

    const logId = uuidv4();
    await db("discover_query_log").insert({
      id: logId,
      agency_user_id: userId,
      raw_brief: "5'9 editorial girls available next week in nyc",
      parsed_contract: JSON.stringify({ roles: [] }),
      engine: "launch",
      result_profile_ids: JSON.stringify([profileId]),
      group_counts: JSON.stringify({ exact: 1 }),
      timings: JSON.stringify({ total_ms: 812 }),
    });

    await db("discover_query_events").insert({
      id: uuidv4(),
      query_log_id: logId,
      profile_id: profileId,
      event: "impression",
    });

    await expect(
      db("discover_query_events").insert({
        id: uuidv4(),
        query_log_id: logId,
        profile_id: profileId,
        event: "not_a_real_event",
      }),
    ).rejects.toThrow();

    // FK cascade: deleting the log removes its events.
    await db("discover_query_log").where({ id: logId }).del();
    expect(await db("discover_query_events").count("id as n").first()).toEqual(
      { n: 0 },
    );
  });

  test("image_signals enforces one row per image; persistImageSignals upserts", async () => {
    const profileId = uuidv4();
    const imageId = uuidv4();
    await db("profiles").insert({ id: profileId });
    await db("images").insert({ id: imageId, profile_id: profileId });

    const first = await persistImageSignals(db, imageId, {
      shot_type: "headshot",
      style_type: "editorial",
      image_type: "portfolio",
      signals: {
        expression: "neutral",
        pose_yaw: "front",
        body_visibility: "bust",
        background: "studio",
        styling_register: "editorial",
        retouch_likelihood: "light",
        makeup_level: "styled",
      },
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
    });
    expect(first).toBe(true);

    // Second persist for the same image updates in place (no duplicate row).
    const second = await persistImageSignals(db, imageId, {
      shot_type: "beauty",
      signals: { expression: "smile" },
      model: "heuristic-only",
    });
    expect(second).toBe(true);

    const rows = await db("image_signals").where({ image_id: imageId });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      shot_type: "beauty",
      expression: "smile",
      model: "heuristic-only",
    });

    // Direct duplicate insert violates the unique constraint.
    await expect(
      db("image_signals").insert({
        id: uuidv4(),
        image_id: imageId,
        shot_type: "half_body",
      }),
    ).rejects.toThrow();
  });

  test("profiles gain market, availability default, measured-in-person; bookouts insert", async () => {
    const profileId = uuidv4();
    await db("profiles").insert({ id: profileId, city: "New York" });

    const profile = await db("profiles").where({ id: profileId }).first();
    expect(profile.market).toBeNull();
    expect(profile.availability_status).toBe("available");
    expect(profile.measured_in_person_at).toBeNull();
    expect(profile.measured_by_agency_id).toBeNull();

    await db("bookouts").insert({
      id: uuidv4(),
      profile_id: profileId,
      starts_on: "2026-07-20",
      ends_on: "2026-07-26",
      note: "exams",
    });
    expect(await db("bookouts").count("id as n").first()).toEqual({ n: 1 });
  });

  test("parse/embed caches upsert on their hash primary keys", async () => {
    await db("discover_parse_cache").insert({
      query_hash: "abc123",
      contract: JSON.stringify({ roles: [] }),
      model: "openai/gpt-oss-120b",
    });
    await db("discover_parse_cache")
      .insert({
        query_hash: "abc123",
        contract: JSON.stringify({ roles: [{ id: 1 }] }),
        model: "openai/gpt-oss-120b",
      })
      .onConflict("query_hash")
      .merge();
    expect(
      await db("discover_parse_cache").count("query_hash as n").first(),
    ).toEqual({ n: 1 });

    await db("discover_embed_cache").insert({
      text_hash: "def456",
      embedding: JSON.stringify([0.1, 0.2]),
    });
    expect(
      await db("discover_embed_cache").count("text_hash as n").first(),
    ).toEqual({ n: 1 });
  });

  test("images.embedding is a no-op on SQLite (pgvector unavailable)", async () => {
    expect(await db.schema.hasColumn("images", "embedding")).toBe(false);
  });
});
