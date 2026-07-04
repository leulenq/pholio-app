"use strict";

const knexFactory = require("knex");
const { v4: uuidv4 } = require("uuid");
const migration = require("../../migrations/20260629234500_create_talent_representations");
const motherConstraintMigration = require("../../migrations/20260629234600_enforce_single_active_mother_agency");

describe("talent representations migration", () => {
  let db;

  beforeEach(async () => {
    db = knexFactory({
      client: "sqlite3",
      connection: { filename: ":memory:" },
      useNullAsDefault: true,
    });
    await db.raw("PRAGMA foreign_keys = ON");
    await db.schema.createTable("profiles", (table) => {
      table.uuid("id").primary();
      table.string("current_agency", 255).nullable();
      table.timestamp("created_at").nullable();
    });
    await db.schema.createTable("agencies", (table) => {
      table.uuid("id").primary();
      table.string("name").notNullable();
    });
  });

  afterEach(async () => {
    await db.destroy();
  });

  test("backfills current_agency and enforces active duplicate/counterparty constraints", async () => {
    const profileId = uuidv4();
    const agencyId = uuidv4();
    await db("profiles").insert({
      id: profileId,
      current_agency: "Legacy Management",
      created_at: "2025-01-01T00:00:00.000Z",
    });
    await db("agencies").insert({ id: agencyId, name: "Internal Agency" });

    await migration.up(db);
    await motherConstraintMigration.up(db);

    const legacy = await db("talent_representations")
      .where({ profile_id: profileId })
      .first();
    expect(legacy).toMatchObject({
      external_agency_name: "Legacy Management",
      external_agency_key: "legacy management",
      relationship_type: "mother",
      status: "active",
      source: "legacy",
    });
    await expect(
      db("talent_representations").insert({
        ...legacy,
        id: uuidv4(),
        external_agency_name: "Second Mother",
        external_agency_key: "second mother",
      }),
    ).rejects.toThrow();

    await expect(
      db("talent_representations").insert({
        id: uuidv4(),
        profile_id: profileId,
        agency_id: agencyId,
        external_agency_name: "Invalid duplicate counterparty",
        external_agency_key: "invalid duplicate counterparty",
        relationship_type: "placement",
        market: "New York",
        territory: null,
        scope_key: "new york|",
        division: null,
        is_exclusive: false,
        status: "active",
        started_on: null,
        ended_on: null,
        source: "profile",
      }),
    ).rejects.toThrow();

    const placement = {
      id: uuidv4(),
      profile_id: profileId,
      agency_id: agencyId,
      external_agency_name: null,
      external_agency_key: null,
      relationship_type: "placement",
      market: "New York",
      territory: null,
      scope_key: "new york|",
      division: null,
      is_exclusive: false,
      status: "active",
      started_on: null,
      ended_on: null,
      source: "profile",
    };
    await db("talent_representations").insert(placement);
    await expect(
      db("talent_representations").insert({ ...placement, id: uuidv4() }),
    ).rejects.toThrow();

    await db("talent_representations")
      .where({ id: placement.id })
      .update({ status: "ended", ended_on: "2026-06-29" });
    await expect(
      db("talent_representations").insert({ ...placement, id: uuidv4() }),
    ).resolves.toBeDefined();
  });
});
