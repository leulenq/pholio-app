"use strict";

/**
 * `GET /api/agency/messages/threads` (src/domains/agency/routes/messages.js).
 *
 * Regression: the handler always read `img.path` for the sender avatar and
 * prefixed it with a literal `/` (`` `/${imageMap[...]}` ``). An R2-hosted
 * primary image stores its URL in `public_url` and leaves `path` NULL, so
 * that talent's avatar came back as `null` even though a perfectly good
 * CDN URL existed. And for a LOCAL image whose `path` is already an
 * absolute `/uploads/...` string, the extra prefix produced a broken
 * `//uploads/...` URL. The fix prefers `public_url`, falls back to the
 * already-absolute `path` verbatim, and adds no prefix.
 *
 * Uses the same hand-built minimal schema and router-mounting convention as
 * tests/integration/agency-messages-read.test.js, next door.
 */

process.env.DATABASE_URL = "sqlite://./test-messages-thread-avatar.sqlite3";
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
  "../../test-messages-thread-avatar.sqlite3",
);

const AGENCY_ID = uuidv4();
const R2_APPLICATION_ID = uuidv4();
const LOCAL_APPLICATION_ID = uuidv4();
const R2_PROFILE_ID = uuidv4();
const LOCAL_PROFILE_ID = uuidv4();
const R2_URL = "https://cdn.example/x.jpg";
const LOCAL_PATH = "/uploads/a.jpg";

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
  await knex.schema.createTable("profiles", (table) => {
    table.string("id", 36).primary();
    table.string("first_name").notNullable();
    table.string("last_name").notNullable();
  });
  await knex.schema.createTable("images", (table) => {
    table.string("id", 36).primary();
    table.string("profile_id", 36).notNullable();
    table.string("path").nullable();
    table.string("public_url").nullable();
    table.boolean("is_primary").defaultTo(false);
  });
  await knex.schema.createTable("board_applications", (table) => {
    table.string("id", 36).primary();
    table.string("board_id", 36).notNullable();
    table.string("application_id", 36).notNullable();
  });
  await knex.schema.createTable("boards", (table) => {
    table.string("id", 36).primary();
    table.string("name").nullable();
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

beforeAll(async () => {
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  await createSchema();

  await knex("users").insert({
    id: AGENCY_ID,
    email: "messages-thread-avatar-agency@example.test",
    role: "AGENCY",
  });
  await knex("profiles").insert([
    { id: R2_PROFILE_ID, first_name: "Cdn", last_name: "Hosted" },
    { id: LOCAL_PROFILE_ID, first_name: "Local", last_name: "Hosted" },
  ]);
  await knex("applications").insert([
    {
      id: R2_APPLICATION_ID,
      profile_id: R2_PROFILE_ID,
      agency_id: AGENCY_ID,
      status: "submitted",
    },
    {
      id: LOCAL_APPLICATION_ID,
      profile_id: LOCAL_PROFILE_ID,
      agency_id: AGENCY_ID,
      status: "submitted",
    },
  ]);
  await knex("images").insert([
    {
      id: uuidv4(),
      profile_id: R2_PROFILE_ID,
      path: null,
      public_url: R2_URL,
      is_primary: true,
    },
    {
      id: uuidv4(),
      profile_id: LOCAL_PROFILE_ID,
      path: LOCAL_PATH,
      public_url: null,
      is_primary: true,
    },
  ]);
  await knex("messages").insert([
    {
      id: uuidv4(),
      application_id: R2_APPLICATION_ID,
      sender_id: uuidv4(),
      sender_type: "TALENT",
      message: "Hi from R2",
      is_read: false,
    },
    {
      id: uuidv4(),
      application_id: LOCAL_APPLICATION_ID,
      sender_id: uuidv4(),
      sender_type: "TALENT",
      message: "Hi from local",
      is_read: false,
    },
  ]);
});

afterAll(async () => {
  await knex.destroy();
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
});

describe("GET /api/agency/messages/threads", () => {
  test("prefers public_url verbatim for an R2-hosted primary image", async () => {
    const response = await request(app)
      .get("/api/agency/messages/threads")
      .expect(200);

    const thread = response.body.data.find(
      (t) => t.id === R2_APPLICATION_ID,
    );
    expect(thread).toBeDefined();
    expect(thread.senderAvatar).toBe(R2_URL);
  });

  test("uses an already-absolute local path verbatim, not double-prefixed", async () => {
    const response = await request(app)
      .get("/api/agency/messages/threads")
      .expect(200);

    const thread = response.body.data.find(
      (t) => t.id === LOCAL_APPLICATION_ID,
    );
    expect(thread).toBeDefined();
    expect(thread.senderAvatar).toBe(LOCAL_PATH);
    expect(thread.senderAvatar).not.toBe(`/${LOCAL_PATH}`);
  });
});
