"use strict";

process.env.DATABASE_URL = "sqlite://./test-agency-roster-memberships.sqlite3";
process.env.DB_CLIENT = "sqlite3";
process.env.AGENCY_RBAC_ENFORCE = "true";
process.env.AGENCY_LEGAL_ENFORCE = "0";

const fs = require("fs");
const path = require("path");
const express = require("express");
const request = require("supertest");
const { v4: uuidv4 } = require("uuid");
const knex = require("../../src/shared/db/knex");
const rosterRouter = require("../../src/domains/agency/routes/roster-data");
const {
  syncRosterMembershipForApplication,
} = require("../../src/domains/agency/services/roster-memberships");

const TEST_DB_PATH = path.resolve(
  __dirname,
  "../../test-agency-roster-memberships.sqlite3",
);
const AGENCY_ID = uuidv4();
const USER_ID = uuidv4();

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.session = {
    userId: AGENCY_ID,
    agencyId: AGENCY_ID,
    memberUserId: USER_ID,
    role: "AGENCY",
    agencyMembershipRole: "OWNER",
    agencyOnboardingCompletedAt: new Date().toISOString(),
  };
  next();
});
app.use(rosterRouter);

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
    table.string("slug").nullable();
    table.string("first_name").nullable();
    table.string("last_name").nullable();
    table.string("city").nullable();
    table.string("gender").nullable();
    table.string("archetype").nullable();
    table.string("stats_track").nullable();
    table.integer("height_cm").nullable();
    table.integer("bust_cm").nullable();
    table.integer("chest_cm").nullable();
    table.integer("waist_cm").nullable();
    table.integer("hips_cm").nullable();
    table.integer("inseam_cm").nullable();
    table.string("shoe_size").nullable();
    table.string("dress_size").nullable();
    table.string("suit_size").nullable();
    table.string("hair_color").nullable();
    table.string("eye_color").nullable();
    table.timestamp("measurements_updated_at").nullable();
    table.timestamp("measured_in_person_at").nullable();
    table.string("nationality").nullable();
    table.text("languages").nullable();
    table.text("bio_curated").nullable();
    table.date("date_of_birth").nullable();
    table.string("availability_status").nullable();
  });
  await knex.schema.createTable("applications", (table) => {
    table.string("id", 36).primary();
    table.string("agency_id", 36).notNullable();
    table.string("profile_id", 36).notNullable();
    table.string("status").notNullable();
    table.timestamp("accepted_at").nullable();
    table.boolean("minor_at_submission").notNullable().defaultTo(false);
    table.timestamp("minor_access_revoked_at").nullable();
    table.string("guardian_consent_grant_id", 36).nullable();
    table.timestamp("guardian_consent_expires_at").nullable();
  });
  await knex.schema.createTable("minor_agency_consents", (table) => {
    table.string("id", 36).primary();
    table.timestamp("revoked_at").nullable();
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
    table.string("email").nullable();
    table.string("phone").nullable();
    table.string("gender").nullable();
    table.date("date_of_birth").nullable();
    table.integer("height_cm").nullable();
    table.text("measurements").nullable();
    table.string("board_hint").nullable();
    table.string("market").nullable();
    table.string("photo_path").nullable();
    table.boolean("is_minor").notNullable().defaultTo(false);
    table.string("minor_consent_status").notNullable();
    table.string("minor_consent_grant_id", 36).nullable();
    table.timestamp("minor_consent_expires_at").nullable();
    table.string("created_by_user_id").nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());
  });
  await knex.schema.createTable("roster_memberships", (table) => {
    table.string("id", 36).primary();
    table.string("agency_id", 36).notNullable();
    table.string("profile_id", 36).nullable();
    table.string("talent_record_id", 36).nullable();
    table.string("board_id", 36).nullable();
    table.string("stage").notNullable();
    table.string("status").notNullable();
    table.string("source_application_id", 36).nullable();
    table.timestamp("joined_at").notNullable();
    table.timestamp("left_at").nullable();
    table.text("notes").nullable();
    table.string("created_by_user_id").nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());
  });
  await knex.schema.createTable("images", (table) => {
    table.string("id", 36).primary();
    table.string("profile_id", 36).notNullable();
    table.string("public_url").nullable();
    table.string("path").nullable();
    table.boolean("is_primary").defaultTo(false);
    table.integer("sort").defaultTo(0);
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.string("moderation_status").defaultTo("approved");
    table.string("status").defaultTo("active");
    table.boolean("exclude_from_agency").defaultTo(false);
  });
  await knex.schema.createTable("talent_commitments", (table) => {
    table.string("id", 36).primary();
    table.string("profile_id", 36).notNullable();
    table.string("agency_id", 36).nullable();
    table.string("roster_membership_id", 36).nullable();
    table.string("kind").notNullable();
    table.integer("option_tier").nullable();
    table.date("start_date").nullable();
    table.date("end_date").nullable();
    table.string("status").notNullable().defaultTo("active");
    table.string("market").nullable();
    table.string("client_ref").nullable();
    table.string("category").nullable();
    table.text("notes").nullable();
  });
  await knex.schema.createTable("social_accounts", (table) => {
    table.string("id", 36).primary();
    table.string("profile_id", 36).notNullable();
    table.string("platform").nullable();
    table.string("handle").nullable();
    table.string("url").nullable();
    table.integer("follower_count").nullable();
    table.float("engagement_rate").nullable();
    table.boolean("is_oauth_connected").defaultTo(false);
    table.timestamp("metrics_updated_at").nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());
  });
}

beforeAll(async () => {
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  await createSchema();
  await knex("agencies").insert({ id: AGENCY_ID, name: "Roster Test" });
  await knex("users").insert({ id: USER_ID, email: "owner@example.test", role: "AGENCY" });
});

afterAll(async () => {
  await knex.destroy();
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
});

describe("persisted agency roster", () => {
  test("creates and lists an agency-private off-platform talent record", async () => {
    const created = await request(app)
      .post("/api/agency/talent-records")
      .send({
        firstName: "Private",
        lastName: "Talent",
        market: "London",
        dateOfBirth: "2001-03-02",
        email: "guardian@example.test",
      })
      .expect(201);

    const list = await request(app).get("/api/agency/roster").expect(200);
    expect(list.body.data.pagination.total).toBe(1);
    expect(list.body.data.items[0]).toMatchObject({
      id: created.body.data.membershipId,
      source: "agency_private",
      name: "Private Talent",
      location: "London",
      availability: "Unknown",
      isMinor: false,
    });
    expect(list.body.data.items[0]).not.toHaveProperty("email");
    expect(list.body.data.items[0]).not.toHaveProperty("dateOfBirth");
  });

  test("creates an idempotent membership independently of later application status", async () => {
    const profileId = uuidv4();
    const application = {
      id: uuidv4(),
      agency_id: AGENCY_ID,
      profile_id: profileId,
      status: "submitted",
      accepted_at: new Date(),
    };
    await knex("profiles").insert({
      id: profileId,
      first_name: "Platform",
      last_name: "Talent",
      availability_status: null,
    });
    await knex("applications").insert(application);

    await knex.transaction((trx) =>
      syncRosterMembershipForApplication(trx, application, "accepted", {
        actorUserId: USER_ID,
      }),
    );
    await knex.transaction((trx) =>
      syncRosterMembershipForApplication(trx, application, "represented", {
        actorUserId: USER_ID,
      }),
    );
    await knex("applications").where({ id: application.id }).update({ status: "archived" });

    const memberships = await knex("roster_memberships").where({
      agency_id: AGENCY_ID,
      profile_id: profileId,
    });
    expect(memberships).toHaveLength(1);
    expect(memberships[0]).toMatchObject({ status: "active", source_application_id: application.id });
  });

  test("archives a membership without mutating the historical submission", async () => {
    const membership = await knex("roster_memberships").whereNotNull("profile_id").first();
    await request(app)
      .patch(`/api/agency/roster-memberships/${membership.id}`)
      .send({ status: "inactive" })
      .expect(200);

    const application = await knex("applications")
      .where({ id: membership.source_application_id })
      .first();
    expect(application.status).toBe("archived");
    const updated = await knex("roster_memberships").where({ id: membership.id }).first();
    expect(updated.status).toBe("inactive");
  });

  test("released and other-agency commitments do not affect or leak into roster availability", async () => {
    const profileId = uuidv4();
    const membershipId = uuidv4();
    await knex("profiles").insert({
      id: profileId,
      first_name: "Calendar",
      last_name: "Scoped",
      availability_status: null,
    });
    await knex("roster_memberships").insert({
      id: membershipId,
      agency_id: AGENCY_ID,
      profile_id: profileId,
      stage: "main",
      status: "active",
      joined_at: new Date(),
    });
    await knex("talent_commitments").insert([
      {
        id: uuidv4(),
        profile_id: profileId,
        agency_id: AGENCY_ID,
        roster_membership_id: membershipId,
        kind: "booked",
        start_date: new Date().toISOString().slice(0, 10),
        end_date: new Date().toISOString().slice(0, 10),
        status: "released",
        client_ref: "Released own booking",
      },
      {
        id: uuidv4(),
        profile_id: profileId,
        agency_id: uuidv4(),
        kind: "booked",
        start_date: new Date().toISOString().slice(0, 10),
        end_date: new Date().toISOString().slice(0, 10),
        status: "active",
        client_ref: "Private other-agency job",
      },
    ]);

    const list = await request(app).get("/api/agency/roster").expect(200);
    const row = list.body.data.items.find((item) => item.id === membershipId);
    expect(row.availability).toBe("Unknown");

    const detail = await request(app)
      .get(`/api/agency/roster/${membershipId}`)
      .expect(200);
    expect(detail.body.data.commitments).toEqual([]);
  });
});
