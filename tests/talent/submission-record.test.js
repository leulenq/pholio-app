// tests/talent/submission-record.test.js
// GET /api/talent/applications/:id/record — the talent's receipt for one
// submission: the frozen package summary, and the chronology behind it.
//
// The surface this feeds used to link to the talent's *current* book and comp
// card, which answers "what do I have now" and not "what did they get". These
// tests pin the difference.
"use strict";

const request = require("supertest");
const cookieSig = require("cookie-signature");
const { v4: uuidv4 } = require("uuid");

const knex = require("../../src/shared/db/knex");
const app = require("../../src/app");
const {
  CURRENT_TERMS_VERSION,
  CURRENT_PRIVACY_VERSION,
} = require("../../src/shared/lib/legal-acceptance");

const SESSION_SECRET = require("../../src/config").sessionSecret;

const SESSION_IDS = [];
const FIXTURES = [];
const AGENCY_IDS = [];
const APPLICATION_IDS = [];

beforeAll(async () => {
  await knex.migrate.latest();
});

async function makeProfile() {
  const userId = uuidv4();
  const profileId = uuidv4();

  await knex("users").insert({
    id: userId,
    email: `record-${userId}@example.com`,
    password_hash: "x",
    role: "TALENT",
    email_verified: true,
    terms_accepted_at: knex.fn.now(),
    terms_accepted_version: CURRENT_TERMS_VERSION,
    privacy_accepted_at: knex.fn.now(),
    privacy_accepted_version: CURRENT_PRIVACY_VERSION,
  });

  await knex("profiles").insert({
    id: profileId,
    user_id: userId,
    slug: `record-${profileId}`,
    first_name: "Record",
    last_name: "Tester",
    city: "Test City",
    height_cm: 172,
    bio_raw: "",
    bio_curated: "",
    onboarding_completed_at: knex.fn.now(),
  });

  const fixture = { userId, profileId };
  FIXTURES.push(fixture);
  return fixture;
}

async function withSession(fixture, req) {
  const sid = uuidv4();
  SESSION_IDS.push(sid);
  await knex("sessions").insert({
    sid,
    sess: {
      cookie: {
        originalMaxAge: 86400000,
        expires: new Date(Date.now() + 86400000).toISOString(),
        secure: false,
        httpOnly: true,
        path: "/",
      },
      userId: fixture.userId,
      role: "TALENT",
    },
    expired: new Date(Date.now() + 86400000).toISOString(),
  });
  const signed = "s:" + cookieSig.sign(sid, SESSION_SECRET);
  return req.set("Cookie", `connect.sid=${encodeURIComponent(signed)}`);
}

async function makeApplication(fixture, { withPackage = true, revoked = false } = {}) {
  const agencyId = uuidv4();
  await knex("agencies").insert({
    id: agencyId,
    name: `Record House ${agencyId.slice(0, 6)}`,
    status: "ACTIVE",
  });
  AGENCY_IDS.push(agencyId);

  const applicationId = uuidv4();
  await knex("applications").insert({
    id: applicationId,
    profile_id: fixture.profileId,
    agency_id: agencyId,
    status: "pending",
  });
  APPLICATION_IDS.push(applicationId);

  if (withPackage) {
    await knex("talent_submission_packages").insert({
      id: uuidv4(),
      application_id: applicationId,
      user_id: fixture.userId,
      profile_id: fixture.profileId,
      label: `Application to ${agencyId}`,
      revoked_at: revoked ? new Date() : null,
      payload: JSON.stringify({
        packageSchemaVersion: 2,
        mediaSetName: "Spring digitals",
        compCardName: "Paris card",
        boardLabels: ["Women", "Development"],
        imageIds: ["a", "b", "c"],
        images: [{ id: "a" }, { id: "b" }, { id: "c" }],
        // Present in the real payload and deliberately never returned.
        contact: { email: "private@example.com", phone: "+1 555 0000" },
        profile: { first_name: "Record" },
      }),
    });
  }

  return { agencyId, applicationId };
}

afterAll(async () => {
  await knex("application_activities").whereIn("application_id", APPLICATION_IDS).del();
  await knex("talent_submission_packages").whereIn("application_id", APPLICATION_IDS).del();
  await knex("applications").whereIn("id", APPLICATION_IDS).del();
  await knex("agencies").whereIn("id", AGENCY_IDS).del();
  await knex("sessions").whereIn("sid", SESSION_IDS).del();
  await knex("profiles")
    .whereIn("id", FIXTURES.map((f) => f.profileId))
    .del();
  await knex("users")
    .whereIn("id", FIXTURES.map((f) => f.userId))
    .del();
  await knex.destroy();
});

describe("GET /api/talent/applications/:id/record", () => {
  test("returns what was sent, from the frozen package rather than the live book", async () => {
    const fixture = await makeProfile();
    const { applicationId } = await makeApplication(fixture);

    const res = await withSession(
      fixture,
      request(app).get(`/api/talent/applications/${applicationId}/record`),
    );

    expect(res.status).toBe(200);
    expect(res.body.data.sent).toMatchObject({
      available: true,
      frameCount: 3,
      mediaSetName: "Spring digitals",
      compCardName: "Paris card",
      boards: ["Women", "Development"],
    });
  });

  test("never re-exposes the personal data the package carries", async () => {
    // The payload holds a full profile snapshot and contact details. A receipt
    // needs counts and names; putting the rest on another surface would be a
    // second copy of the talent's data for no reason.
    const fixture = await makeProfile();
    const { applicationId } = await makeApplication(fixture);

    const res = await withSession(
      fixture,
      request(app).get(`/api/talent/applications/${applicationId}/record`),
    );

    const body = JSON.stringify(res.body);
    expect(body).not.toContain("private@example.com");
    expect(body).not.toContain("555 0000");
    expect(res.body.data.sent.profile).toBeUndefined();
  });

  test("a revoked package says so instead of under-reporting what was sent", async () => {
    const fixture = await makeProfile();
    const { applicationId } = await makeApplication(fixture, { revoked: true });

    const res = await withSession(
      fixture,
      request(app).get(`/api/talent/applications/${applicationId}/record`),
    );

    expect(res.body.data.sent).toMatchObject({ available: false, reason: "revoked" });
    expect(res.body.data.sent.frameCount).toBeUndefined();
  });

  test("a submission with no package reports nothing rather than inventing one", async () => {
    const fixture = await makeProfile();
    const { applicationId } = await makeApplication(fixture, { withPackage: false });

    const res = await withSession(
      fixture,
      request(app).get(`/api/talent/applications/${applicationId}/record`),
    );

    expect(res.status).toBe(200);
    expect(res.body.data.sent).toBeNull();
  });

  test("returns the whole chronology, oldest first, not just status changes", async () => {
    const fixture = await makeProfile();
    const { applicationId, agencyId } = await makeApplication(fixture);

    await knex("application_activities").insert([
      {
        id: uuidv4(),
        application_id: applicationId,
        agency_id: agencyId,
        activity_type: "submitted",
        description: "Submission received",
        created_at: new Date(Date.now() - 3 * 86400000),
      },
      {
        id: uuidv4(),
        application_id: applicationId,
        agency_id: agencyId,
        activity_type: "status_change",
        description: "Moved to shortlisted",
        created_at: new Date(Date.now() - 86400000),
      },
    ]);

    const res = await withSession(
      fixture,
      request(app).get(`/api/talent/applications/${applicationId}/record`),
    );

    expect(res.body.data.timeline).toHaveLength(2);
    expect(res.body.data.timeline.map((e) => e.type)).toEqual([
      "submitted",
      "status_change",
    ]);
  });

  test("is scoped to the talent who sent it", async () => {
    const owner = await makeProfile();
    const stranger = await makeProfile();
    const { applicationId } = await makeApplication(owner);

    const res = await withSession(
      stranger,
      request(app).get(`/api/talent/applications/${applicationId}/record`),
    );

    expect(res.status).toBe(404);
  });
});
