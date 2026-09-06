"use strict";

/**
 * `GET /api/talent/applications/prompt-context`
 * (src/domains/talent/routes/applications.js).
 *
 * Regression: when a talent had withdrawn their only application to an
 * agency that separately invited them (a standing `agency_invitations`
 * row), the handler's `alreadyAppliedToTarget` check used to find that
 * withdrawn row and report `true` — permanently hiding the "apply here"
 * prompt for an agency the talent had, in truth, never successfully
 * applied to. The fix excludes withdrawn rows from that check
 * (`.whereNot("status", "withdrawn")`), matching the same exclusion the
 * open-call branch above it already applies.
 */

const {
  useIsolatedDatabase,
  migrate,
  dropIsolatedDatabase,
} = require("../setup/isolated-db");

const DB_FILE = useIsolatedDatabase("prompt-context-withdrawn");

const express = require("express");
const request = require("supertest");
const { v4: uuidv4 } = require("uuid");

const knex = require("../../src/shared/db/knex");

const AGENCY_ID = uuidv4();
const TALENT_USER_ID = uuidv4();
const PROFILE_ID = uuidv4();
const APPLICATION_ID = uuidv4();
const INVITATION_ID = uuidv4();

let app;

beforeAll(async () => {
  await migrate(knex);

  await knex("users").insert({
    id: TALENT_USER_ID,
    email: `prompt-context-talent-${TALENT_USER_ID}@example.com`,
    password_hash: "x",
    role: "TALENT",
  });
  await knex("agencies").insert({
    id: AGENCY_ID,
    name: "Prompt Context Test Agency",
    slug: `prompt-context-agency-${AGENCY_ID.slice(0, 8)}`,
    status: "ACTIVE",
  });
  await knex("profiles").insert({
    id: PROFILE_ID,
    user_id: TALENT_USER_ID,
    slug: `prompt-context-talent-${PROFILE_ID.slice(0, 8)}`,
    first_name: "Prompt",
    last_name: "Context",
    city: "Brooklyn",
    date_of_birth: "1999-04-02",
    gender: "Female",
    height_cm: 178,
    bio_raw: "",
    bio_curated: "",
  });

  // A standing invitation from the agency (the redirect signal the route
  // reads via latestInvitationForProfile).
  await knex("agency_invitations").insert({
    id: INVITATION_ID,
    agency_id: AGENCY_ID,
    profile_id: PROFILE_ID,
    created_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  });

  // The talent's ONLY application to that agency, withdrawn.
  await knex("applications").insert({
    id: APPLICATION_ID,
    profile_id: PROFILE_ID,
    agency_id: AGENCY_ID,
    status: "withdrawn",
  });

  const applicationsRouter = require("../../src/domains/talent/routes/applications");
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = {
      userId: TALENT_USER_ID,
      role: "TALENT",
    };
    next();
  });
  app.use("/api/talent/applications", applicationsRouter);
}, 120000);

afterAll(async () => {
  await knex.destroy();
  dropIsolatedDatabase(DB_FILE);
});

describe("GET /api/talent/applications/prompt-context", () => {
  test("a withdrawn application does not count as already applied", async () => {
    const response = await request(app).get(
      "/api/talent/applications/prompt-context",
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual(
      expect.objectContaining({
        hasRedirectSignal: true,
        source: "agency_invitation",
        alreadyAppliedToTarget: false,
      }),
    );
    expect(response.body.data.targetAgency).toEqual(
      expect.objectContaining({ id: AGENCY_ID }),
    );
  });
});
