"use strict";

const knexFactory = require("knex");
const { v4: uuidv4 } = require("uuid");
const migration = require("../../migrations/20260714120000_harden_talent_commitments");

describe("Booking Desk commitment migration", () => {
  let db;

  beforeEach(async () => {
    db = knexFactory({
      client: "sqlite3",
      connection: { filename: ":memory:" },
      useNullAsDefault: true,
    });
    await db.schema.createTable("agencies", (table) => table.string("id", 36).primary());
    await db.schema.createTable("users", (table) => table.string("id", 36).primary());
    await db.schema.createTable("profiles", (table) => table.string("id", 36).primary());
    await db.schema.createTable("talent_records", (table) => table.string("id", 36).primary());
    await db.schema.createTable("roster_memberships", (table) => {
      table.string("id", 36).primary();
      table.string("agency_id", 36).notNullable();
      table.string("profile_id", 36).nullable();
      table.string("talent_record_id", 36).nullable();
      table.string("status").notNullable();
    });
    await db.schema.createTable("talent_commitments", (table) => {
      table.string("id", 36).primary();
      table.string("profile_id", 36).notNullable();
      table.string("agency_id", 36).nullable();
      table.string("kind", 20).notNullable();
      table.integer("option_tier").nullable();
      table.date("start_date").nullable();
      table.date("end_date").nullable();
      table.string("market").nullable();
      table.string("client_ref").nullable();
      table.string("category").nullable();
      table.boolean("exclusivity").notNullable().defaultTo(false);
      table.date("exclusivity_until").nullable();
      table.text("usage").nullable();
      table.text("notes").nullable();
      table.timestamp("created_at").defaultTo(db.fn.now());
      table.timestamp("updated_at").defaultTo(db.fn.now());
    });
  });

  afterEach(async () => {
    await db.destroy();
  });

  test("adds authorship/release fields, backfills membership, and permits private roster subjects", async () => {
    const agencyId = uuidv4();
    const profileId = uuidv4();
    const membershipId = uuidv4();
    const historicalId = uuidv4();
    await db("agencies").insert({ id: agencyId });
    await db("profiles").insert({ id: profileId });
    await db("roster_memberships").insert({
      id: membershipId,
      agency_id: agencyId,
      profile_id: profileId,
      status: "active",
    });
    await db("talent_commitments").insert({
      id: historicalId,
      agency_id: agencyId,
      profile_id: profileId,
      kind: "option",
      start_date: "2026-08-01",
      end_date: "2026-08-02",
    });

    await migration.up(db);

    const columns = await db("talent_commitments").columnInfo();
    expect(columns.profile_id.nullable).toBe(true);
    expect(columns).toEqual(expect.objectContaining({
      roster_membership_id: expect.any(Object),
      talent_record_id: expect.any(Object),
      created_by_user_id: expect.any(Object),
      released_at: expect.any(Object),
      release_reason: expect.any(Object),
    }));
    expect(await db("talent_commitments").where({ id: historicalId }).first()).toMatchObject({
      roster_membership_id: membershipId,
      status: "active",
    });

    const recordId = uuidv4();
    const privateMembershipId = uuidv4();
    await db("talent_records").insert({ id: recordId });
    await db("roster_memberships").insert({
      id: privateMembershipId,
      agency_id: agencyId,
      talent_record_id: recordId,
      status: "active",
    });
    await expect(db("talent_commitments").insert({
      id: uuidv4(),
      agency_id: agencyId,
      profile_id: null,
      talent_record_id: recordId,
      roster_membership_id: privateMembershipId,
      kind: "hold",
      status: "active",
      start_date: "2026-08-03",
      end_date: "2026-08-03",
    })).resolves.toBeDefined();
  });
});
