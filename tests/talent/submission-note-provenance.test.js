"use strict";

/**
 * The submitted cover note shares the `messages` table with chat, so it must be
 * flagged rather than guessed. Regression: a note-less submission used to show
 * the talent's first chat message as "Your note".
 */

process.env.DATABASE_URL = "sqlite://./test-submission-note-provenance.sqlite3";
process.env.DB_CLIENT = "sqlite3";

const fs = require("fs");
const path = require("path");
const express = require("express");
const request = require("supertest");
const { v4: uuidv4 } = require("uuid");

const knex = require("../../src/shared/db/knex");
const markSubmissionNotes = require("../../migrations/20260729180000_mark_submission_note_messages");

const TEST_DB_PATH = path.resolve(
  __dirname,
  "../../test-submission-note-provenance.sqlite3",
);

const TALENT_ID = uuidv4();
const PROFILE_ID = uuidv4();
const AGENCY_ID = uuidv4();

// One application per behaviour under test, all owned by the same talent.
const WITH_NOTE = uuidv4();
const CHAT_ONLY = uuidv4();
const RESUBMITTED = uuidv4();

const iso = (ms) => new Date(ms).toISOString();
const SUBMITTED_AT = Date.parse("2026-07-01T12:00:00.000Z");
const RESUBMITTED_AT = Date.parse("2026-07-20T09:00:00.000Z");
const DAY = 24 * 60 * 60 * 1000;

let app;

async function createSchema() {
  await knex.schema.createTable("users", (table) => {
    table.string("id", 36).primary();
    table.string("email").notNullable();
    table.string("role").notNullable();
  });
  await knex.schema.createTable("profiles", (table) => {
    table.string("id", 36).primary();
    table.string("user_id", 36).notNullable();
    table.string("slug").notNullable();
  });
  await knex.schema.createTable("agencies", (table) => {
    table.string("id", 36).primary();
    table.string("name").notNullable();
    table.string("location").nullable();
    table.string("website").nullable();
    table.string("logo_path").nullable();
    table.text("open_boards").nullable();
  });
  await knex.schema.createTable("agency_memberships", (table) => {
    table.string("id", 36).primary();
    table.string("agency_id", 36).notNullable();
    table.string("user_id", 36).notNullable();
    table.string("membership_role", 20).notNullable();
    table.string("status", 20).notNullable();
  });
  await knex.schema.createTable("applications", (table) => {
    table.string("id", 36).primary();
    table.string("profile_id", 36).notNullable();
    table.string("agency_id", 36).notNullable();
    table.string("status", 40).notNullable();
    table.timestamp("created_at").nullable();
    table.timestamp("updated_at").nullable();
  });
  await knex.schema.createTable("talent_submission_packages", (table) => {
    table.string("id", 36).primary();
    table.string("application_id", 36).notNullable();
    table.timestamp("created_at").nullable();
  });
  // Deliberately created without `is_submission_note` so the migration under
  // test is what introduces and backfills the flag.
  await knex.schema.createTable("messages", (table) => {
    table.string("id", 36).primary();
    table.string("application_id", 36).notNullable();
    table.string("sender_id", 36).notNullable();
    table.string("sender_type", 20).notNullable();
    table.text("message").notNullable();
    table.boolean("is_read").defaultTo(false);
    table.timestamp("read_at").nullable();
    table.timestamp("created_at").nullable();
  });
}

async function seedFixture() {
  await knex("users").insert({
    id: TALENT_ID,
    email: "note-provenance@example.test",
    role: "TALENT",
  });
  await knex("profiles").insert({
    id: PROFILE_ID,
    user_id: TALENT_ID,
    slug: `note-provenance-${PROFILE_ID}`,
  });
  await knex("agencies").insert({ id: AGENCY_ID, name: "Anchor Agency" });

  await knex("applications").insert([
    {
      id: WITH_NOTE,
      profile_id: PROFILE_ID,
      agency_id: AGENCY_ID,
      status: "pending",
      created_at: iso(SUBMITTED_AT),
      updated_at: iso(SUBMITTED_AT),
    },
    {
      id: CHAT_ONLY,
      profile_id: PROFILE_ID,
      agency_id: AGENCY_ID,
      status: "pending",
      created_at: iso(SUBMITTED_AT),
      updated_at: iso(SUBMITTED_AT),
    },
    {
      // Withdrawn then sent again: the row keeps its original created_at, so
      // only the snapshot written by the second send anchors its note.
      id: RESUBMITTED,
      profile_id: PROFILE_ID,
      agency_id: AGENCY_ID,
      status: "pending",
      created_at: iso(SUBMITTED_AT),
      updated_at: iso(RESUBMITTED_AT),
    },
  ]);

  await knex("talent_submission_packages").insert([
    { id: uuidv4(), application_id: WITH_NOTE, created_at: iso(SUBMITTED_AT) },
    { id: uuidv4(), application_id: CHAT_ONLY, created_at: iso(SUBMITTED_AT) },
    { id: uuidv4(), application_id: RESUBMITTED, created_at: iso(RESUBMITTED_AT) },
  ]);

  await knex("messages").insert([
    {
      id: "with-note-cover",
      application_id: WITH_NOTE,
      sender_id: TALENT_ID,
      sender_type: "TALENT",
      message: "Cover note written at submission.",
      created_at: iso(SUBMITTED_AT + 400),
    },
    {
      id: "with-note-chat",
      application_id: WITH_NOTE,
      sender_id: TALENT_ID,
      sender_type: "TALENT",
      message: "Following up a week later.",
      created_at: iso(SUBMITTED_AT + 7 * DAY),
    },
    {
      id: "chat-only-first",
      application_id: CHAT_ONLY,
      sender_id: TALENT_ID,
      sender_type: "TALENT",
      message: "Hello",
      created_at: iso(SUBMITTED_AT + 3 * DAY),
    },
    {
      id: "resubmitted-cover",
      application_id: RESUBMITTED,
      sender_id: TALENT_ID,
      sender_type: "TALENT",
      message: "Note from the second send.",
      created_at: iso(RESUBMITTED_AT + 250),
    },
  ]);
}

beforeAll(async () => {
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  await createSchema();
  await seedFixture();
  await markSubmissionNotes.up(knex);

  // Router is required only after the migration so its cached schema probe sees
  // the flag, matching a migrated deployment.
  const applicationsRouter = require("../../src/domains/talent/routes/applications");
  app = express();
  app.use((req, _res, next) => {
    req.session = { userId: TALENT_ID, role: "TALENT" };
    next();
  });
  app.use("/api/talent/applications", applicationsRouter);
});

afterAll(async () => {
  await knex.destroy();
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
});

describe("submission note provenance", () => {
  test("backfill flags submission-time notes and leaves chat alone", async () => {
    const rows = await knex("messages").select("id", "is_submission_note");
    const flagged = Object.fromEntries(
      rows.map((row) => [row.id, Boolean(row.is_submission_note)]),
    );

    expect(flagged["with-note-cover"]).toBe(true);
    expect(flagged["resubmitted-cover"]).toBe(true);
    expect(flagged["with-note-chat"]).toBe(false);
    expect(flagged["chat-only-first"]).toBe(false);
  });

  test("note reads from the flagged row, never from later chat", async () => {
    const response = await request(app).get("/api/talent/applications").expect(200);
    const notes = Object.fromEntries(
      response.body.data.map((row) => [row.id, row.note]),
    );

    expect(notes[WITH_NOTE]).toBe("Cover note written at submission.");
    expect(notes[RESUBMITTED]).toBe("Note from the second send.");
    // The reported bug: chat used to be promoted into "Your note".
    expect(notes[CHAT_ONLY]).toBeNull();
  });

  test("a chat message sent after the fix never becomes the note", async () => {
    await knex("messages").insert({
      id: "chat-only-second",
      application_id: CHAT_ONLY,
      sender_id: TALENT_ID,
      sender_type: "TALENT",
      message: "Any update?",
      created_at: iso(SUBMITTED_AT + 4 * DAY),
    });

    const response = await request(app).get("/api/talent/applications").expect(200);
    const row = response.body.data.find((item) => item.id === CHAT_ONLY);

    expect(row.note).toBeNull();
  });
});
