"use strict";

/**
 * `GET /api/agency/applications` — talent card metadata
 * (`docs/superpowers/specs/2026-09-01-talent-card-metadata.md` §5).
 *
 * Each row (`safeProfiles`) gains `digitalsFreshness` (the dossier/board
 * engine's shape, computed from the raw image rows the row is already built
 * from — never the shaped image DTOs, which drop `captured_at`) and
 * `ageUnknown` (true whenever no recorded DOB backs the row).
 *
 * Run against a REAL migrated schema, like the sibling inbox suites, because
 * the fields under test (`profiles.date_of_birth`, `images.captured_at`,
 * `images.image_type`) all matter to columns that only exist after
 * migration.
 */

const {
  useIsolatedDatabase,
  migrate,
  dropIsolatedDatabase,
} = require("../setup/isolated-db");

// MUST run before `src/shared/db/knex` is required anywhere.
const DB_FILE = useIsolatedDatabase("applications-list-digitals");

const express = require("express");
const request = require("supertest");
const { v4: uuidv4 } = require("uuid");

const knex = require("../../src/shared/db/knex");
const inboxRouter = require("../../src/domains/agency/routes/inbox");

const AGENCY_ID = uuidv4();
const OWNER_USER_ID = uuidv4();
const MEMBERSHIP_ID = uuidv4();

/** Adult, profile-backed, a dated digital headshot. */
const AVA = { userId: uuidv4(), profileId: uuidv4(), applicationId: uuidv4() };
/** Adult, profile-backed, no images at all. */
const BEN = { userId: uuidv4(), profileId: uuidv4(), applicationId: uuidv4() };
/** Profile-backed, no recorded date of birth. */
const NOA = { userId: uuidv4(), profileId: uuidv4(), applicationId: uuidv4() };

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.session = {
    userId: AGENCY_ID,
    agencyId: AGENCY_ID,
    memberUserId: OWNER_USER_ID,
    agencyMembershipId: MEMBERSHIP_ID,
    agencyMembershipRole: "OWNER",
    role: "AGENCY",
    agencyOnboardingCompletedAt: new Date().toISOString(),
  };
  next();
});
app.use(inboxRouter);

function daysAgoIso(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

async function seedFixtures() {
  await knex("users").insert([
    {
      id: OWNER_USER_ID,
      email: "owner@digitals-list.test",
      role: "AGENCY",
      email_verified: true,
    },
    { id: AVA.userId, email: "ava@talent.test", role: "TALENT", email_verified: true },
    { id: BEN.userId, email: "ben@talent.test", role: "TALENT", email_verified: true },
    { id: NOA.userId, email: "noa@talent.test", role: "TALENT", email_verified: true },
  ]);

  await knex("agencies").insert({ id: AGENCY_ID, name: "Digitals List Test Agency" });
  await knex("agency_memberships").insert({
    id: MEMBERSHIP_ID,
    agency_id: AGENCY_ID,
    user_id: OWNER_USER_ID,
    membership_role: "OWNER",
    status: "ACTIVE",
  });

  await knex("profiles").insert([
    {
      id: AVA.profileId,
      user_id: AVA.userId,
      slug: "ava-headshot",
      first_name: "Ava",
      last_name: "Headshot",
      city: "New York",
      height_cm: 176,
      gender: "female",
      date_of_birth: "1999-06-01",
      bio_raw: "Runway.",
      bio_curated: "Runway and editorial.",
    },
    {
      id: BEN.profileId,
      user_id: BEN.userId,
      slug: "ben-blank",
      first_name: "Ben",
      last_name: "Blank",
      city: "Chicago",
      height_cm: 182,
      gender: "male",
      date_of_birth: "1995-02-10",
      bio_raw: "Print.",
      bio_curated: "Print and commercial.",
    },
    {
      id: NOA.profileId,
      user_id: NOA.userId,
      slug: "noa-nodate",
      first_name: "Noa",
      last_name: "Nodate",
      city: "Berlin",
      height_cm: 178,
      gender: "female",
      date_of_birth: null,
      bio_raw: "Editorial.",
      bio_curated: "Editorial and commercial.",
    },
  ]);

  await knex("images").insert([
    {
      id: uuidv4(),
      profile_id: AVA.profileId,
      path: "https://cdn.example.test/ava-headshot.jpg",
      is_primary: true,
      sort: 0,
      image_type: "digital",
      shot_type: "headshot",
      captured_at: daysAgoIso(5),
    },
  ]);
  // BEN and NOA have no images at all.

  await knex("applications").insert([
    {
      id: AVA.applicationId,
      profile_id: AVA.profileId,
      agency_id: AGENCY_ID,
      status: "shortlisted",
      created_at: daysAgoIso(3),
      status_changed_at: "2026-08-20T09:30:00.000Z",
    },
    {
      id: BEN.applicationId,
      profile_id: BEN.profileId,
      agency_id: AGENCY_ID,
      status: "shortlisted",
      created_at: daysAgoIso(4),
      // status_changed_at intentionally omitted (stays null).
    },
    {
      id: NOA.applicationId,
      profile_id: NOA.profileId,
      agency_id: AGENCY_ID,
      status: "shortlisted",
      created_at: daysAgoIso(2),
    },
  ]);
}

beforeAll(async () => {
  await migrate(knex);
  await seedFixtures();
}, 120000);

afterAll(async () => {
  await knex.destroy();
  dropIsolatedDatabase(DB_FILE);
});

// ---------------------------------------------------------------------------

describe("GET /api/agency/applications — digitalsFreshness and ageUnknown", () => {
  let byApplication;

  beforeAll(async () => {
    const response = await request(app).get("/api/agency/applications");
    expect(response.status).toBe(200);
    byApplication = new Map(
      response.body.profiles.map((row) => [row.application_id, row]),
    );
  });

  test("a row with a dated digital headshot gets a currentSet with a capturedOn", () => {
    const ava = byApplication.get(AVA.applicationId);
    expect(ava.digitalsFreshness).not.toBeNull();
    expect(ava.digitalsFreshness.hasDigitals).toBe(true);
    expect(ava.digitalsFreshness.currentSet).not.toBeNull();
    expect(ava.digitalsFreshness.currentSet.capturedOn).toEqual(
      expect.any(String),
    );
    expect(ava.digitalsFreshness.state).toBe("current");
  });

  test("a row with no digitals gets a null digitalsFreshness", () => {
    const ben = byApplication.get(BEN.applicationId);
    expect(ben.digitalsFreshness).toBeNull();
  });

  test("ageUnknown is false when a DOB is on file", () => {
    expect(byApplication.get(AVA.applicationId).ageUnknown).toBe(false);
    expect(byApplication.get(BEN.applicationId).ageUnknown).toBe(false);
  });

  test("ageUnknown is true when no DOB is recorded", () => {
    expect(byApplication.get(NOA.applicationId).ageUnknown).toBe(true);
  });

  test("statusChangedAt is the applications.status_changed_at instant, in ISO form", () => {
    expect(byApplication.get(AVA.applicationId).statusChangedAt).toBe(
      "2026-08-20T09:30:00.000Z",
    );
  });

  test("statusChangedAt is null when applications.status_changed_at is null", () => {
    expect(byApplication.get(BEN.applicationId).statusChangedAt).toBeNull();
  });

  test("every pre-existing key is still present", () => {
    const ava = byApplication.get(AVA.applicationId);
    for (const key of [
      "application_status",
      "application_id",
      "application_created_at",
      "submission_package",
      "tags",
      "images",
      "first_name",
      "last_name",
      "city",
      "height_cm",
    ]) {
      expect(ava).toHaveProperty(key);
    }
  });
});

describe("GET /api/agency/applications/:id/details — digitalsFreshness", () => {
  test("candidate with dated digitals returns digitalsFreshness with state and capturedOn", async () => {
    const response = await request(app).get(
      `/api/agency/applications/${AVA.applicationId}/details`,
    );
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("digitalsFreshness");
    expect(response.body.digitalsFreshness).not.toBeNull();
    expect(response.body.digitalsFreshness.hasDigitals).toBe(true);
    expect(response.body.digitalsFreshness.state).toBe("current");
    expect(response.body.digitalsFreshness.currentSet?.capturedOn).toEqual(
      expect.any(String),
    );
  });

  test("candidate with no digitals returns digitalsFreshness: null", async () => {
    const response = await request(app).get(
      `/api/agency/applications/${BEN.applicationId}/details`,
    );
    expect(response.status).toBe(200);
    expect(response.body.digitalsFreshness).toBeNull();
  });
});

describe("GET /api/agency/profiles/:id/details — digitalsFreshness", () => {
  test("profile with dated digitals returns digitalsFreshness", async () => {
    const response = await request(app).get(
      `/api/agency/profiles/${AVA.profileId}/details`,
    );
    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("digitalsFreshness");
    expect(response.body.digitalsFreshness).not.toBeNull();
    expect(response.body.digitalsFreshness.hasDigitals).toBe(true);
    expect(response.body.digitalsFreshness.state).toBe("current");
  });

  test("profile with no digitals returns digitalsFreshness: null", async () => {
    const response = await request(app).get(
      `/api/agency/profiles/${BEN.profileId}/details`,
    );
    expect(response.status).toBe(200);
    expect(response.body.digitalsFreshness).toBeNull();
  });
});
