"use strict";

/**
 * Decline routes in src/domains/agency/routes/inbox.js — single decline
 * (`POST /api/agency/applications/:applicationId/decline`) and bulk decline
 * (`POST /api/agency/applications/bulk-decline`).
 *
 * Regression: both handlers set `status: "declined"` but never touched
 * `status_changed_at` or `declined_at`, so a declined application's status
 * clock never advanced and `declined_at` stayed permanently null — breaking
 * anything that orders or reports on declines by when they actually
 * happened (e.g. the signing-board freshness clock, which reads
 * `status_changed_at`). The fix stamps both columns with `knex.fn.now()`
 * alongside the status update.
 */

const {
  useIsolatedDatabase,
  migrate,
  dropIsolatedDatabase,
} = require("../setup/isolated-db");

const DB_FILE = useIsolatedDatabase("decline-status-timestamps");

const express = require("express");
const request = require("supertest");
const { v4: uuidv4 } = require("uuid");

jest.mock("../../src/shared/lib/email", () => ({
  ...jest.requireActual("../../src/shared/lib/email"),
  sendApplicationStatusEmail: jest.fn().mockResolvedValue({ ok: true }),
}));

const knex = require("../../src/shared/db/knex");
const {
  recordLegalAcceptance,
} = require("../../src/shared/lib/legal-acceptance");

const AGENCY_ID = uuidv4();
const AGENCY_USER_ID = uuidv4();
const AGENCY_NAME = "Decline Timestamp Test Agency";

let app;

async function seedTalent(label) {
  const userId = uuidv4();
  const profileId = uuidv4();
  await knex("users").insert({
    id: userId,
    email: `decline-timestamp-${label}-${userId}@example.com`,
    password_hash: "x",
    role: "TALENT",
  });
  await knex("profiles").insert({
    id: profileId,
    user_id: userId,
    slug: `decline-timestamp-${label}-${profileId}`,
    first_name: "Test",
    last_name: label,
    city: "Brooklyn",
    date_of_birth: "1999-04-02",
    gender: "Female",
    height_cm: 178,
    bio_raw: "",
    bio_curated: "",
    onboarding_completed_at: new Date().toISOString(),
  });
  return { userId, profileId };
}

async function seedApplication(profileId) {
  const id = uuidv4();
  await knex("applications").insert({
    id,
    profile_id: profileId,
    agency_id: AGENCY_ID,
    status: "pending",
    status_changed_at: null,
    declined_at: null,
  });
  return id;
}

beforeAll(async () => {
  await migrate(knex);

  await knex("users").insert({
    id: AGENCY_USER_ID,
    email: `decline-timestamp-agency-${AGENCY_USER_ID}@example.com`,
    password_hash: "x",
    role: "AGENCY",
  });
  await knex("agencies").insert({
    id: AGENCY_ID,
    name: AGENCY_NAME,
    status: "ACTIVE",
  });
  await knex("agency_memberships").insert({
    id: uuidv4(),
    agency_id: AGENCY_ID,
    user_id: AGENCY_USER_ID,
    membership_role: "OWNER",
    status: "ACTIVE",
  });
  await recordLegalAcceptance(knex, AGENCY_USER_ID, {
    terms: true,
    privacy: true,
  });

  // Mounted bare with the session injected: inbox.js is the unit under
  // test, not the full app's Firebase-backed login flow (matches the
  // convention in tests/agency/inbox-application-status-email.test.js).
  const inboxRouter = require("../../src/domains/agency/routes/inbox");
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = {
      userId: AGENCY_ID,
      memberUserId: AGENCY_USER_ID,
      role: "AGENCY",
      agencyId: AGENCY_ID,
      agencyMembershipRole: "OWNER",
      agencyOnboardingCompletedAt: new Date().toISOString(),
    };
    next();
  });
  app.use(inboxRouter);
}, 120000);

afterAll(async () => {
  await knex.destroy();
  dropIsolatedDatabase(DB_FILE);
});

describe("POST /api/agency/applications/:applicationId/decline", () => {
  test("stamps status_changed_at and declined_at on the declined row", async () => {
    const { profileId } = await seedTalent("single");
    const applicationId = await seedApplication(profileId);

    const before = await knex("applications")
      .where({ id: applicationId })
      .first();
    expect(before.status_changed_at).toBeFalsy();
    expect(before.declined_at).toBeFalsy();

    const response = await request(app)
      .post(`/api/agency/applications/${applicationId}/decline`)
      .set("Accept", "application/json")
      .send({});

    expect(response.status).toBe(200);

    const after = await knex("applications")
      .where({ id: applicationId })
      .first();
    expect(after.status).toBe("declined");
    expect(after.status_changed_at).toBeTruthy();
    expect(after.declined_at).toBeTruthy();
  });
});

describe("POST /api/agency/applications/bulk-decline", () => {
  test("stamps status_changed_at and declined_at on every declined row", async () => {
    const talentA = await seedTalent("bulk-a");
    const talentB = await seedTalent("bulk-b");
    const applicationIdA = await seedApplication(talentA.profileId);
    const applicationIdB = await seedApplication(talentB.profileId);

    const response = await request(app)
      .post("/api/agency/applications/bulk-decline")
      .set("Accept", "application/json")
      .send({ applicationIds: [applicationIdA, applicationIdB] });

    expect(response.status).toBe(200);

    const rows = await knex("applications")
      .whereIn("id", [applicationIdA, applicationIdB])
      .select("id", "status", "status_changed_at", "declined_at");

    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row.status).toBe("declined");
      expect(row.status_changed_at).toBeTruthy();
      expect(row.declined_at).toBeTruthy();
    }
  });
});
