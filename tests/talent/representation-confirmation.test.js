"use strict";

/**
 * The talent's half of the signing loop (industry audit §3.2, decision §7.6).
 *
 * An agency moving an application to `represented` now writes a
 * `talent_representations` row with `source = 'agency'`, `status = 'pending'`.
 * Representation is a two-party fact, so that row is the talent's to answer —
 * confirm or decline — and nobody else's to edit.
 */

const {
  useIsolatedDatabase,
  migrate,
  dropIsolatedDatabase,
} = require("../setup/isolated-db");

// `useIsolatedDatabase` rewrites process.env.DATABASE_URL for the whole
// process, and Jest does not reset the environment between test files. Suites
// that share the run database (e.g. tests/talent/field-visibility.test.js)
// would then resolve to this suite's file — which afterAll deletes. Capture
// the previous value and put it back.
const PRIOR_DATABASE_URL = process.env.DATABASE_URL;
const DB_FILE = useIsolatedDatabase("talent-representation-confirmation");

function restoreDatabaseUrl() {
  if (PRIOR_DATABASE_URL === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = PRIOR_DATABASE_URL;
}

const express = require("express");
const request = require("supertest");
const { v4: uuidv4 } = require("uuid");

const knex = require("../../src/shared/db/knex");

const AGENCY_ID = uuidv4();
const OWNER_USER_ID = uuidv4();
const OWNER_PROFILE_ID = uuidv4();
const OTHER_USER_ID = uuidv4();
const OTHER_PROFILE_ID = uuidv4();

let app;
// Which talent the injected session belongs to; flipped per test.
let sessionUserId = OWNER_USER_ID;

async function insertTalent(userId, profileId, label) {
  await knex("users").insert({
    id: userId,
    email: `${label}-${userId}@example.com`,
    password_hash: "x",
    role: "TALENT",
    email_verified: true,
  });
  await knex("profiles").insert({
    id: profileId,
    user_id: userId,
    slug: `${label}-${profileId}`,
    first_name: label,
    last_name: "Talent",
    city: "New York",
    date_of_birth: "1997-02-14",
    height_cm: 176,
    bio_raw: "",
    bio_curated: "",
    onboarding_completed_at: new Date().toISOString(),
  });
}

async function seed() {
  await insertTalent(OWNER_USER_ID, OWNER_PROFILE_ID, "owner");
  await insertTalent(OTHER_USER_ID, OTHER_PROFILE_ID, "other");
  await knex("agencies").insert({
    id: AGENCY_ID,
    name: "Meridian Management",
    status: "ACTIVE",
    location: "New York",
  });
}

function pendingRow(overrides = {}) {
  return {
    id: uuidv4(),
    profile_id: OWNER_PROFILE_ID,
    agency_id: AGENCY_ID,
    external_agency_name: null,
    external_agency_key: null,
    relationship_type: "placement",
    market: "New York",
    territory: null,
    scope_key: "new york|",
    division: null,
    board_name: "Women — Main",
    is_exclusive: false,
    status: "pending",
    started_on: "2026-09-06",
    ended_on: null,
    source: "agency",
    ...overrides,
  };
}

async function givenPendingSigning(overrides = {}) {
  const row = pendingRow(overrides);
  await knex("talent_representations").insert(row);
  return row;
}

beforeAll(async () => {
  await migrate(knex);
  await seed();

  const router = require("../../src/domains/talent/routes/representations");
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = { userId: sessionUserId, role: "TALENT" };
    next();
  });
  app.use("/api/talent", router);
}, 120000);

afterAll(async () => {
  await knex.destroy();
  dropIsolatedDatabase(DB_FILE);
  restoreDatabaseUrl();
});

beforeEach(async () => {
  sessionUserId = OWNER_USER_ID;
  await knex("talent_representations").del();
  await knex("profiles").update({ current_agency: null });
});

describe("GET /api/talent/profile/representations", () => {
  test("surfaces a pending signing in its own bucket, flagged, never as active", async () => {
    await givenPendingSigning();

    const response = await request(app)
      .get("/api/talent/profile/representations")
      .set("Accept", "application/json")
      .expect(200);

    expect(response.body.data.active).toHaveLength(0);
    expect(response.body.data.history).toHaveLength(0);
    expect(response.body.data.pending).toHaveLength(1);
    expect(response.body.data.pending[0]).toMatchObject({
      agency_name: "Meridian Management",
      market: "New York",
      board_name: "Women — Main",
      relationship_type: "placement",
      status: "pending",
      pending_confirmation: true,
    });
  });
});

describe("POST /api/talent/profile/representations/:id/confirm", () => {
  test("makes the relationship real and records who confirmed it", async () => {
    const row = await givenPendingSigning();

    const response = await request(app)
      .post(`/api/talent/profile/representations/${row.id}/confirm`)
      .set("Accept", "application/json")
      .expect(200);

    expect(response.body.data.representation).toMatchObject({
      status: "active",
      agency_name: "Meridian Management",
    });

    const stored = await knex("talent_representations")
      .where({ id: row.id })
      .first();
    expect(stored.status).toBe("active");
    expect(stored.confirmed_at).toBeTruthy();
    expect(stored.confirmed_by_user_id).toBe(OWNER_USER_ID);
    expect(stored.ended_on).toBeNull();

    // Only now does the legacy projection see the agency.
    const profile = await knex("profiles")
      .where({ id: OWNER_PROFILE_ID })
      .first("current_agency");
    expect(profile.current_agency).toBe("Meridian Management");

    // The list moves it out of `pending` and into `active`.
    const list = await request(app)
      .get("/api/talent/profile/representations")
      .expect(200);
    expect(list.body.data.pending).toHaveLength(0);
    expect(list.body.data.active).toHaveLength(1);
  });

  test("404 for another talent's row — the id is not confirmed to exist", async () => {
    const row = await givenPendingSigning();
    sessionUserId = OTHER_USER_ID;

    await request(app)
      .post(`/api/talent/profile/representations/${row.id}/confirm`)
      .set("Accept", "application/json")
      .expect(404);

    expect(
      await knex("talent_representations").where({ id: row.id }).first("status"),
    ).toMatchObject({ status: "pending" });
  });

  test("404 for an id that does not exist at all", async () => {
    await request(app)
      .post(`/api/talent/profile/representations/${uuidv4()}/confirm`)
      .set("Accept", "application/json")
      .expect(404);
  });

  test("409 once answered — confirming twice is not a second signing", async () => {
    const row = await givenPendingSigning();
    await request(app)
      .post(`/api/talent/profile/representations/${row.id}/confirm`)
      .expect(200);

    const response = await request(app)
      .post(`/api/talent/profile/representations/${row.id}/confirm`)
      .set("Accept", "application/json")
      .expect(409);
    expect(response.body.code).toBe("REPRESENTATION_NOT_PENDING");
  });

  test("409 on a row the talent wrote themselves — nothing to confirm", async () => {
    const row = await givenPendingSigning({
      status: "active",
      source: "profile",
      board_name: null,
    });

    const response = await request(app)
      .post(`/api/talent/profile/representations/${row.id}/confirm`)
      .set("Accept", "application/json")
      .expect(409);
    expect(response.body.code).toBe("REPRESENTATION_NOT_PENDING");
  });
});

describe("POST /api/talent/profile/representations/:id/decline", () => {
  test("closes the row and keeps it as a record, rather than deleting it", async () => {
    const row = await givenPendingSigning();

    await request(app)
      .post(`/api/talent/profile/representations/${row.id}/decline`)
      .set("Accept", "application/json")
      .expect(200);

    const stored = await knex("talent_representations")
      .where({ id: row.id })
      .first();
    expect(stored.status).toBe("ended");
    expect(stored.ended_on).toBeTruthy();
    expect(stored.declined_at).toBeTruthy();
    expect(stored.confirmed_at).toBeNull();

    const profile = await knex("profiles")
      .where({ id: OWNER_PROFILE_ID })
      .first("current_agency");
    expect(profile.current_agency).toBeNull();

    const list = await request(app)
      .get("/api/talent/profile/representations")
      .expect(200);
    expect(list.body.data.pending).toHaveLength(0);
    expect(list.body.data.history).toHaveLength(1);
  });

  test("404 for another talent's row", async () => {
    const row = await givenPendingSigning();
    sessionUserId = OTHER_USER_ID;

    await request(app)
      .post(`/api/talent/profile/representations/${row.id}/decline`)
      .set("Accept", "application/json")
      .expect(404);
  });
});

describe("a pending signing is answered, not edited", () => {
  test("PATCH is refused so a market edit cannot become an accidental yes", async () => {
    const row = await givenPendingSigning();

    const response = await request(app)
      .patch(`/api/talent/profile/representations/${row.id}`)
      .set("Accept", "application/json")
      .send({ market: "Paris" })
      .expect(409);
    expect(response.body.code).toBe("REPRESENTATION_PENDING_CONFIRMATION");

    expect(
      await knex("talent_representations").where({ id: row.id }).first(),
    ).toMatchObject({ status: "pending", market: "New York" });
  });

  test("DELETE is refused — declining is the way to say no", async () => {
    const row = await givenPendingSigning();

    const response = await request(app)
      .delete(`/api/talent/profile/representations/${row.id}`)
      .set("Accept", "application/json")
      .send({})
      .expect(409);
    expect(response.body.code).toBe("REPRESENTATION_PENDING_CONFIRMATION");
  });

  test("the talent can still edit and end their own rows", async () => {
    const row = await givenPendingSigning({
      status: "active",
      source: "profile",
      board_name: null,
    });

    await request(app)
      .patch(`/api/talent/profile/representations/${row.id}`)
      .send({ division: "Women" })
      .expect(200);
    expect(
      await knex("talent_representations").where({ id: row.id }).first("division"),
    ).toMatchObject({ division: "Women" });

    await request(app)
      .delete(`/api/talent/profile/representations/${row.id}`)
      .send({ ended_on: "2026-09-06" })
      .expect(200);
    expect(
      await knex("talent_representations").where({ id: row.id }).first("status"),
    ).toMatchObject({ status: "ended" });
  });
});
