"use strict";

process.env.DATABASE_URL = "sqlite://./test-agency-booking-desk.sqlite3";
process.env.DB_CLIENT = "sqlite3";
process.env.AGENCY_RBAC_ENFORCE = "true";
process.env.AGENCY_LEGAL_ENFORCE = "0";

const fs = require("fs");
const path = require("path");
const express = require("express");
const request = require("supertest");
const { v4: uuidv4 } = require("uuid");
const knex = require("../../src/shared/db/knex");
const commitmentsRouter = require("../../src/domains/agency/routes/commitments");

const DB_PATH = path.resolve(__dirname, "../../test-agency-booking-desk.sqlite3");
const AGENCY_ID = uuidv4();
const OTHER_AGENCY_ID = uuidv4();
const USER_ID = uuidv4();
const PROFILE_ID = uuidv4();
const BOARD_ID = uuidv4();
const MEMBERSHIP_ID = uuidv4();

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.session = {
    userId: AGENCY_ID,
    agencyId: AGENCY_ID,
    memberUserId: USER_ID,
    role: "AGENCY",
    agencyMembershipRole: req.get("x-test-role") || "OWNER",
    agencyOnboardingCompletedAt: new Date().toISOString(),
  };
  next();
});
app.use(commitmentsRouter);
app.use((error, _req, res, _next) => {
  res.status(500).json({ error: error.message });
});

async function createSchema() {
  await knex.schema.createTable("agencies", (table) => {
    table.string("id", 36).primary();
    table.string("name").notNullable();
  });
  await knex.schema.createTable("users", (table) => {
    table.string("id", 36).primary();
    table.string("email").notNullable();
    table.string("role").notNullable();
  });
  await knex.schema.createTable("profiles", (table) => {
    table.string("id", 36).primary();
    table.string("first_name").nullable();
    table.string("last_name").nullable();
  });
  await knex.schema.createTable("minor_agency_consents", (table) => {
    table.string("id", 36).primary();
    table.timestamp("revoked_at").nullable();
  });
  await knex.schema.createTable("applications", (table) => {
    table.string("id", 36).primary();
    table.string("agency_id", 36).notNullable();
    table.boolean("minor_at_submission").notNullable().defaultTo(false);
    table.timestamp("minor_access_revoked_at").nullable();
    table.string("guardian_consent_grant_id", 36).nullable();
    table.timestamp("guardian_consent_expires_at").nullable();
  });
  await knex.schema.createTable("boards", (table) => {
    table.string("id", 36).primary();
    table.string("agency_id", 36).notNullable();
    table.string("name").notNullable();
  });
  await knex.schema.createTable("talent_records", (table) => {
    table.string("id", 36).primary();
    table.string("agency_id", 36).notNullable();
    table.string("first_name").notNullable();
    table.string("last_name").notNullable();
  });
  await knex.schema.createTable("roster_memberships", (table) => {
    table.string("id", 36).primary();
    table.string("agency_id", 36).notNullable();
    table.string("profile_id", 36).nullable();
    table.string("talent_record_id", 36).nullable();
    table.string("board_id", 36).nullable();
    table.string("status").notNullable();
  });
  await knex.schema.createTable("bookouts", (table) => {
    table.string("id", 36).primary();
    table.string("profile_id", 36).notNullable();
    table.date("starts_on").notNullable();
    table.date("ends_on").notNullable();
    table.text("note").nullable();
  });
  await knex.schema.createTable("talent_commitments", (table) => {
    table.string("id", 36).primary();
    table.string("profile_id", 36).nullable();
    table.string("talent_record_id", 36).nullable();
    table.string("roster_membership_id", 36).nullable();
    table.string("agency_id", 36).nullable();
    table.string("kind").notNullable();
    table.integer("option_tier").nullable();
    table.date("start_date").nullable();
    table.date("end_date").nullable();
    table.string("market").nullable();
    table.string("client_ref").nullable();
    table.string("category").nullable();
    table.boolean("exclusivity").defaultTo(false);
    table.date("exclusivity_until").nullable();
    table.text("usage").nullable();
    table.text("notes").nullable();
    table.string("status").notNullable().defaultTo("active");
    table.string("created_by_user_id", 36).nullable();
    table.string("updated_by_user_id", 36).nullable();
    table.timestamp("confirmed_at").nullable();
    table.string("confirmed_by_user_id", 36).nullable();
    table.timestamp("released_at").nullable();
    table.string("released_by_user_id", 36).nullable();
    table.text("release_reason").nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());
  });
  await knex.schema.createTable("agency_audit_events", (table) => {
    table.string("id", 36).primary();
    table.string("agency_id", 36).notNullable();
    table.string("actor_membership_id", 36).nullable();
    table.string("actor_user_id", 36).nullable();
    table.string("event_type").notNullable();
    table.string("target_type").nullable();
    table.string("target_id", 36).nullable();
    table.text("summary").notNullable();
    table.text("before_state").nullable();
    table.text("after_state").nullable();
    table.string("ip_address").nullable();
    table.text("user_agent").nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });
}

beforeAll(async () => {
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
  await createSchema();
  await knex("agencies").insert([
    { id: AGENCY_ID, name: "Booking Desk Agency" },
    { id: OTHER_AGENCY_ID, name: "Other Agency" },
  ]);
  await knex("users").insert({ id: USER_ID, email: "booker@example.test", role: "AGENCY" });
  await knex("profiles").insert({ id: PROFILE_ID, first_name: "Alex", last_name: "River" });
  await knex("boards").insert({ id: BOARD_ID, agency_id: AGENCY_ID, name: "Editorial" });
  await knex("roster_memberships").insert({
    id: MEMBERSHIP_ID,
    agency_id: AGENCY_ID,
    profile_id: PROFILE_ID,
    board_id: BOARD_ID,
    status: "active",
  });
});

afterEach(async () => {
  await knex("agency_audit_events").del();
  await knex("talent_commitments").del();
  await knex("bookouts").del();
});

afterAll(async () => {
  await knex.destroy();
  if (fs.existsSync(DB_PATH)) fs.unlinkSync(DB_PATH);
});

describe("agency Booking Desk", () => {
  test("allows read-only calendar access while restricting writes to calendar managers", async () => {
    await request(app)
      .get("/api/agency/commitments?start=2026-08-03&end=2026-08-09")
      .set("x-test-role", "VIEWER")
      .expect(200);

    const denied = await request(app)
      .post("/api/agency/commitments")
      .set("x-test-role", "VIEWER")
      .send({
        membershipId: MEMBERSHIP_ID,
        kind: "hold",
        startDate: "2026-08-05",
        endDate: "2026-08-05",
      })
      .expect(403);
    expect(denied.body.missingPermissions).toContain("calendar.manage");
  });

  test("lists the roster by division and includes talent-declared bookouts as read-only", async () => {
    await knex("bookouts").insert({
      id: uuidv4(),
      profile_id: PROFILE_ID,
      starts_on: "2026-08-05",
      ends_on: "2026-08-07",
      note: "Travel",
    });

    const response = await request(app)
      .get("/api/agency/commitments?start=2026-08-03&end=2026-08-09")
      .expect(200);

    expect(response.body.data.roster).toEqual([
      expect.objectContaining({
        membershipId: MEMBERSHIP_ID,
        name: "Alex River",
        board: { id: BOARD_ID, name: "Editorial" },
      }),
    ]);
    expect(response.body.data.events).toEqual([
      expect.objectContaining({ kind: "bookout", source: "talent", canEdit: false }),
    ]);
  });

  test("attributes an agency-authored option and records an append-only audit event", async () => {
    const response = await request(app)
      .post("/api/agency/commitments")
      .send({
        membershipId: MEMBERSHIP_ID,
        kind: "option",
        optionTier: 1,
        startDate: "2026-08-05",
        endDate: "2026-08-06",
        clientRef: "Autumn campaign",
      })
      .expect(201);

    const row = await knex("talent_commitments").where({ id: response.body.data.commitment.id }).first();
    expect(row).toMatchObject({
      agency_id: AGENCY_ID,
      roster_membership_id: MEMBERSHIP_ID,
      profile_id: PROFILE_ID,
      kind: "option",
      option_tier: 1,
      created_by_user_id: USER_ID,
      status: "active",
    });
    expect(await knex("agency_audit_events").where({ target_id: row.id }).first()).toMatchObject({
      agency_id: AGENCY_ID,
      actor_user_id: USER_ID,
      event_type: "calendar.commitment_created",
    });
  });

  test("requires explicit release of an overlapping option before confirmation", async () => {
    const first = await request(app)
      .post("/api/agency/commitments")
      .send({
        membershipId: MEMBERSHIP_ID,
        kind: "option",
        optionTier: 1,
        startDate: "2026-08-05",
        endDate: "2026-08-06",
        clientRef: "First client",
      })
      .expect(201);
    const second = await request(app)
      .post("/api/agency/commitments")
      .send({
        membershipId: MEMBERSHIP_ID,
        kind: "option",
        optionTier: 2,
        startDate: "2026-08-05",
        endDate: "2026-08-06",
        clientRef: "Second client",
      })
      .expect(201);
    expect(second.body.data.warnings).toEqual([
      expect.objectContaining({ id: first.body.data.commitment.id, kind: "option", releasable: true }),
    ]);

    const blocked = await request(app)
      .post(`/api/agency/commitments/${second.body.data.commitment.id}/confirm`)
      .send({})
      .expect(409);
    expect(blocked.body.error).toMatchObject({ code: "COMMITMENT_CONFLICT" });
    expect(blocked.body.error.conflicts).toEqual([
      expect.objectContaining({ id: first.body.data.commitment.id, releasable: true }),
    ]);

    await request(app)
      .post(`/api/agency/commitments/${second.body.data.commitment.id}/confirm`)
      .send({ releaseConflictIds: [first.body.data.commitment.id] })
      .expect(200);

    expect(await knex("talent_commitments").where({ id: first.body.data.commitment.id }).first()).toMatchObject({ status: "released" });
    expect(await knex("talent_commitments").where({ id: second.body.data.commitment.id }).first()).toMatchObject({ kind: "booked", status: "active" });
  });

  test("never allows an agency to override a talent-declared bookout", async () => {
    await knex("bookouts").insert({
      id: uuidv4(),
      profile_id: PROFILE_ID,
      starts_on: "2026-08-05",
      ends_on: "2026-08-07",
      note: "Unavailable",
    });

    const blocked = await request(app)
      .post("/api/agency/commitments")
      .send({
        membershipId: MEMBERSHIP_ID,
        kind: "booked",
        startDate: "2026-08-06",
        endDate: "2026-08-06",
      })
      .expect(409);

    expect(blocked.body.error.conflicts).toEqual([
      expect.objectContaining({ source: "talent", kind: "bookout", releasable: false }),
    ]);
    expect(await knex("talent_commitments").count("id as count").first()).toEqual({ count: 0 });
  });

  test("does not allow another agency's commitment to be edited or released", async () => {
    const id = uuidv4();
    await knex("talent_commitments").insert({
      id,
      profile_id: PROFILE_ID,
      agency_id: OTHER_AGENCY_ID,
      kind: "hold",
      start_date: "2026-08-05",
      end_date: "2026-08-06",
      status: "active",
    });

    await request(app)
      .patch(`/api/agency/commitments/${id}`)
      .send({ notes: "Cross-tenant edit" })
      .expect(404);
    await request(app).delete(`/api/agency/commitments/${id}`).expect(404);
    expect(await knex("talent_commitments").where({ id }).first()).toMatchObject({ status: "active", notes: null });
  });
});
