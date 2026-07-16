"use strict";

process.env.DATABASE_URL = "sqlite://./test-agency-inbox-export.sqlite3";
process.env.DB_CLIENT = "sqlite3";
process.env.AGENCY_RBAC_ENFORCE = "true";

const fs = require("fs");
const path = require("path");
const express = require("express");
const request = require("supertest");
const { v4: uuidv4 } = require("uuid");

// inbox.js imports discovery search at module load, but export behavior does not
// use it. Keep this focused suite independent of the optional chrono-node parser.
jest.mock("../../src/domains/agency/services/discover-search", () => ({
  searchDiscoverableTalent: jest.fn(),
}));

const knex = require("../../src/shared/db/knex");
const agencyInboxRouter = require("../../src/domains/agency/routes/inbox");

const TEST_DB_PATH = path.resolve(
  __dirname,
  "../../test-agency-inbox-export.sqlite3",
);
const AGENCY_ID = uuidv4();
const SECOND_AGENCY_ID = uuidv4();
const OWNER_USER_ID = uuidv4();
const ADMIN_USER_ID = uuidv4();
const VIEWER_USER_ID = uuidv4();
const TALENT_USER_ID = uuidv4();
const PROFILE_ID = uuidv4();
const APPLICATION_ID = uuidv4();
const MEMBERSHIP = {
  owner: uuidv4(),
  admin: uuidv4(),
  viewer: uuidv4(),
};

const SESSION_MEMBERS = {
  owner: {
    userId: OWNER_USER_ID,
    membershipId: MEMBERSHIP.owner,
    membershipRole: "OWNER",
  },
  admin: {
    userId: ADMIN_USER_ID,
    membershipId: MEMBERSHIP.admin,
    membershipRole: "ADMIN",
  },
  viewer: {
    userId: VIEWER_USER_ID,
    membershipId: MEMBERSHIP.viewer,
    membershipRole: "VIEWER",
  },
};

const app = express();
app.use((req, _res, next) => {
  const member = SESSION_MEMBERS[req.get("x-test-member") || "owner"];
  req.session = {
    userId: AGENCY_ID,
    memberUserId: member.userId,
    agencyId: AGENCY_ID,
    agencyMembershipId: member.membershipId,
    agencyMembershipRole: member.membershipRole,
    role: "AGENCY",
    agencyOnboardingCompletedAt: new Date().toISOString(),
  };
  next();
});
app.use(agencyInboxRouter);

async function createSchema() {
  await knex.schema.createTable("users", (table) => {
    table.string("id", 36).primary();
    table.string("email").notNullable().unique();
    table.string("role").notNullable();
  });

  await knex.schema.createTable("agencies", (table) => {
    table.string("id", 36).primary();
    table.string("name").notNullable();
  });

  await knex.schema.createTable("agency_memberships", (table) => {
    table.string("id", 36).primary();
    table.string("agency_id", 36).notNullable();
    table.string("user_id", 36).notNullable();
    table.string("membership_role", 20).notNullable();
    table.string("status", 20).notNullable();
  });

  await knex.schema.createTable("agency_membership_permissions", (table) => {
    table.string("id", 36).primary();
    table.string("agency_id", 36).notNullable();
    table.string("membership_id", 36).notNullable();
    table.string("permission_key", 80).notNullable();
    table.string("effect", 5).notNullable();
    table.text("reason").nullable();
    table.string("granted_by_membership_id", 36).nullable();
    table.timestamp("expires_at").nullable();
  });

  await knex.schema.createTable("agency_audit_events", (table) => {
    table.string("id", 36).primary();
    table.string("agency_id", 36).notNullable();
    table.string("actor_membership_id", 36).nullable();
    table.string("actor_user_id", 36).nullable();
    table.string("event_type", 60).notNullable();
    table.string("target_type", 40).nullable();
    table.string("target_id", 36).nullable();
    table.text("summary").notNullable();
    table.text("before_state").nullable();
    table.text("after_state").nullable();
    table.string("ip_address", 45).nullable();
    table.text("user_agent").nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("profiles", (table) => {
    table.string("id", 36).primary();
    table.string("user_id", 36).nullable();
    table.string("first_name", 100).nullable();
    table.string("last_name", 100).nullable();
    table.string("city", 100).nullable();
    table.integer("height_cm").nullable();
    table.integer("bust_cm").nullable();
    table.integer("waist_cm").nullable();
    table.integer("hips_cm").nullable();
    table.string("date_of_birth", 40).nullable();
    table.text("bio_curated").nullable();
  });

  await knex.schema.createTable("applications", (table) => {
    table.string("id", 36).primary();
    table.string("profile_id", 36).notNullable();
    table.string("agency_id", 36).notNullable();
    table.string("status", 40).notNullable();
    table.timestamp("accepted_at").nullable();
    table.timestamp("declined_at").nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("application_notes", (table) => {
    table.string("id", 36).primary();
    table.string("application_id", 36).notNullable();
    table.text("note").notNullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });

  await knex.schema.createTable("application_tags", (table) => {
    table.string("id", 36).primary();
    table.string("application_id", 36).notNullable();
    table.string("agency_id", 36).notNullable();
    table.string("tag", 100).notNullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });
}

async function seedFixture() {
  await knex("agency_membership_permissions").del();
  await knex("agency_audit_events").del();
  await knex("application_notes").del();
  await knex("application_tags").del();
  await knex("applications").del();
  await knex("profiles").del();
  await knex("agency_memberships").del();
  await knex("agencies").del();
  await knex("users").del();

  await knex("users").insert([
    { id: OWNER_USER_ID, email: "owner@example.test", role: "AGENCY" },
    { id: ADMIN_USER_ID, email: "admin@example.test", role: "AGENCY" },
    { id: VIEWER_USER_ID, email: "viewer@example.test", role: "AGENCY" },
    { id: TALENT_USER_ID, email: "talent@example.test", role: "TALENT" },
  ]);
  await knex("agencies").insert([
    { id: AGENCY_ID, name: "Export Test Agency" },
    { id: SECOND_AGENCY_ID, name: "Other Agency" },
  ]);
  await knex("agency_memberships").insert([
    {
      id: MEMBERSHIP.owner,
      agency_id: AGENCY_ID,
      user_id: OWNER_USER_ID,
      membership_role: "OWNER",
      status: "ACTIVE",
    },
    {
      id: MEMBERSHIP.admin,
      agency_id: AGENCY_ID,
      user_id: ADMIN_USER_ID,
      membership_role: "ADMIN",
      status: "ACTIVE",
    },
    {
      id: MEMBERSHIP.viewer,
      agency_id: AGENCY_ID,
      user_id: VIEWER_USER_ID,
      membership_role: "VIEWER",
      status: "ACTIVE",
    },
  ]);
  await knex("profiles").insert({
    id: PROFILE_ID,
    user_id: TALENT_USER_ID,
    first_name: "Casey",
    last_name: "Candidate",
    city: "=HYPERLINK(\"https://example.test\")",
    height_cm: 178,
    bust_cm: 84,
    waist_cm: 61,
    hips_cm: 89,
    date_of_birth: "1999-04-12",
    bio_curated: "Editorial and runway talent.",
  });
  await knex("applications").insert({
    id: APPLICATION_ID,
    profile_id: PROFILE_ID,
    agency_id: AGENCY_ID,
    status: "submitted",
    created_at: "2026-01-01T10:00:00.000Z",
  });
  await knex("application_notes").insert([
    {
      id: uuidv4(),
      application_id: APPLICATION_ID,
      note: "First internal note",
      created_at: "2026-01-01T11:00:00.000Z",
    },
    {
      id: uuidv4(),
      application_id: APPLICATION_ID,
      note: "Second internal note",
      created_at: "2026-01-01T12:00:00.000Z",
    },
  ]);
  await knex("application_tags").insert([
    {
      id: uuidv4(),
      application_id: APPLICATION_ID,
      agency_id: AGENCY_ID,
      tag: "New Face",
      created_at: "2026-01-01T11:00:00.000Z",
    },
    {
      id: uuidv4(),
      application_id: APPLICATION_ID,
      agency_id: AGENCY_ID,
      tag: "Priority",
      created_at: "2026-01-01T12:00:00.000Z",
    },
    {
      id: uuidv4(),
      application_id: APPLICATION_ID,
      agency_id: SECOND_AGENCY_ID,
      tag: "Other agency only",
      created_at: "2026-01-01T13:00:00.000Z",
    },
  ]);
}

beforeAll(createSchema);
beforeEach(seedFixture);

afterAll(async () => {
  await knex.destroy();
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
});

describe("GET /api/agency/export", () => {
  test("succeeds on SQLite with tenant-scoped portable tag aggregation", async () => {
    const response = await request(app).get("/api/agency/export?format=json");

    expect(response.status).toBe(200);
    expect(response.body.total).toBe(1);
    expect(response.body.applications[0]).toMatchObject({
      name: "Casey Candidate",
      tags: "New Face, Priority",
    });
    expect(response.body.applications[0].tags).not.toContain("Other agency");
  });

  test("redacts internal notes unless explicitly requested", async () => {
    const [response, csvResponse] = await Promise.all([
      request(app).get("/api/agency/export?format=json"),
      request(app).get("/api/agency/export"),
    ]);

    expect(response.status).toBe(200);
    expect(response.body.applications[0]).not.toHaveProperty("notes");
    expect(csvResponse.status).toBe(200);
    expect(csvResponse.text.split("\n")[0]).not.toContain("Notes");
    expect(csvResponse.text).toContain("'=HYPERLINK(");
  });

  test("allows an ADMIN to explicitly include ordered internal notes", async () => {
    const response = await request(app)
      .get("/api/agency/export?format=json&include_notes=true")
      .set("x-test-member", "admin");

    expect(response.status).toBe(200);
    expect(response.body.applications[0].notes).toBe(
      "First internal note | Second internal note",
    );
  });

  test("denies a VIEWER even when they are granted org.export_data", async () => {
    await knex("agency_membership_permissions").insert({
      id: uuidv4(),
      agency_id: AGENCY_ID,
      membership_id: MEMBERSHIP.viewer,
      permission_key: "org.export_data",
      effect: "ALLOW",
    });

    const response = await request(app)
      .get("/api/agency/export?format=json")
      .set("x-test-member", "viewer");

    expect(response.status).toBe(403);
    expect(response.body.requiredMembershipRoles).toEqual(["OWNER", "ADMIN"]);
  });

  test("records an audit event for each successful export", async () => {
    const response = await request(app).get(
      "/api/agency/export?format=json&include_notes=true",
    );

    expect(response.status).toBe(200);

    const event = await knex("agency_audit_events")
      .where({ agency_id: AGENCY_ID, event_type: "org.data_exported" })
      .first();
    expect(event).toMatchObject({
      actor_membership_id: MEMBERSHIP.owner,
      actor_user_id: OWNER_USER_ID,
      target_type: "applications",
    });
    expect(JSON.parse(event.after_state)).toEqual({
      format: "json",
      application_count: 1,
      include_notes: true,
    });
  });
});
