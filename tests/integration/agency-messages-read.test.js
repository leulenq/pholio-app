"use strict";

process.env.DATABASE_URL = "sqlite://./test-agency-messages-read.sqlite3";
process.env.DB_CLIENT = "sqlite3";
process.env.AGENCY_RBAC_ENFORCE = "true";

const fs = require("fs");
const path = require("path");
const express = require("express");
const request = require("supertest");
const { v4: uuidv4 } = require("uuid");

const knex = require("../../src/shared/db/knex");
const messagesRouter = require("../../src/domains/agency/routes/messages");

const TEST_DB_PATH = path.resolve(
  __dirname,
  "../../test-agency-messages-read.sqlite3",
);
const AGENCY_ID = uuidv4();
const OTHER_AGENCY_ID = uuidv4();
const TALENT_ID = uuidv4();
const APPLICATION_ID = uuidv4();
const WITHDRAWN_APPLICATION_ID = uuidv4();
const OTHER_APPLICATION_ID = uuidv4();

const app = express();
app.use((req, _res, next) => {
  req.session = {
    userId: AGENCY_ID,
    role: "AGENCY",
    agencyMembershipRole: "OWNER",
    agencyOnboardingCompletedAt: new Date().toISOString(),
  };
  next();
});
app.use(messagesRouter);

async function createSchema() {
  await knex.schema.createTable("users", (table) => {
    table.string("id", 36).primary();
    table.string("email").notNullable();
    table.string("role").notNullable();
  });
  await knex.schema.createTable("applications", (table) => {
    table.string("id", 36).primary();
    table.string("profile_id", 36).notNullable();
    table.string("agency_id", 36).notNullable();
    table.string("status", 40).notNullable();
  });
  await knex.schema.createTable("messages", (table) => {
    table.string("id", 36).primary();
    table.string("application_id", 36).notNullable();
    table.string("sender_id", 36).notNullable();
    table.string("sender_type", 20).notNullable();
    table.text("message").notNullable();
    table.boolean("is_read").defaultTo(false);
    table.timestamp("read_at").nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });
}

async function seedFixture() {
  await knex("messages").del();
  await knex("applications").del();
  await knex("users").del();

  await knex("users").insert([
    { id: AGENCY_ID, email: "agency@example.test", role: "AGENCY" },
    { id: OTHER_AGENCY_ID, email: "other@example.test", role: "AGENCY" },
    { id: TALENT_ID, email: "talent@example.test", role: "TALENT" },
  ]);
  await knex("applications").insert([
    {
      id: APPLICATION_ID,
      profile_id: uuidv4(),
      agency_id: AGENCY_ID,
      status: "submitted",
    },
    {
      id: WITHDRAWN_APPLICATION_ID,
      profile_id: uuidv4(),
      agency_id: AGENCY_ID,
      status: "withdrawn",
    },
    {
      id: OTHER_APPLICATION_ID,
      profile_id: uuidv4(),
      agency_id: OTHER_AGENCY_ID,
      status: "submitted",
    },
  ]);
  await knex("messages").insert([
    {
      id: "visible-talent",
      application_id: APPLICATION_ID,
      sender_id: TALENT_ID,
      sender_type: "TALENT",
      message: "New submission message",
      is_read: false,
    },
    {
      id: "agency-authored",
      application_id: APPLICATION_ID,
      sender_id: AGENCY_ID,
      sender_type: "AGENCY",
      message: "Agency reply",
      is_read: false,
    },
    {
      id: "withdrawn-talent",
      application_id: WITHDRAWN_APPLICATION_ID,
      sender_id: TALENT_ID,
      sender_type: "TALENT",
      message: "Withdrawn thread",
      is_read: false,
    },
    {
      id: "other-agency-talent",
      application_id: OTHER_APPLICATION_ID,
      sender_id: TALENT_ID,
      sender_type: "TALENT",
      message: "Private to another agency",
      is_read: false,
    },
  ]);
}

beforeAll(async () => {
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  await createSchema();
});

beforeEach(seedFixture);

afterAll(async () => {
  await knex.destroy();
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
});

describe("agency message read state", () => {
  test("mark-all persists only visible inbound messages for the current agency", async () => {
    const response = await request(app)
      .post("/api/agency/messages/read-all")
      .expect(200);

    expect(response.body).toEqual({ success: true, data: { updated: 1 } });

    const rows = await knex("messages").select("id", "is_read", "read_at");
    const byId = Object.fromEntries(rows.map((row) => [row.id, row]));
    expect(Boolean(byId["visible-talent"].is_read)).toBe(true);
    expect(byId["visible-talent"].read_at).toBeTruthy();
    expect(Boolean(byId["agency-authored"].is_read)).toBe(false);
    expect(Boolean(byId["withdrawn-talent"].is_read)).toBe(false);
    expect(Boolean(byId["other-agency-talent"].is_read)).toBe(false);
  });

  test("single-message read cannot mutate outbound, withdrawn, or other-agency rows", async () => {
    for (const id of [
      "agency-authored",
      "withdrawn-talent",
      "other-agency-talent",
    ]) {
      await request(app).post(`/api/agency/messages/${id}/read`).expect(404);
    }

    await request(app)
      .post("/api/agency/messages/visible-talent/read")
      .expect(200);
  });
});
