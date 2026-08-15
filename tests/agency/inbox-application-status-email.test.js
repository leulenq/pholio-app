"use strict";

/**
 * Agency accept/decline dispatches a status email to the applicant.
 *
 * `applications` has no `talent_id` column — only `profile_id` (see
 * migrations/20250103000000_create_applications_table.js). The accept and
 * decline handlers in inbox.js used to read `application.talent_id` when
 * resolving the recipient for `sendApplicationStatusEmail`. That column
 * never existed, so the value was always `undefined`, the `users` lookup
 * always missed, and the email was silently skipped on every accept/decline
 * — forever, with no error anywhere.
 *
 * The fix resolves the recipient through `profiles.user_id`, the same idiom
 * roster.js's accept/decline flow already uses.
 */

const {
  useIsolatedDatabase,
  migrate,
  dropIsolatedDatabase,
} = require("../setup/isolated-db");

const DB_FILE = useIsolatedDatabase("agency-inbox-status-email");

const express = require("express");
const request = require("supertest");
const { v4: uuidv4 } = require("uuid");

jest.mock("../../src/shared/lib/email", () => ({
  ...jest.requireActual("../../src/shared/lib/email"),
  sendApplicationStatusEmail: jest.fn().mockResolvedValue({ ok: true }),
}));

const knex = require("../../src/shared/db/knex");
const { sendApplicationStatusEmail } = require("../../src/shared/lib/email");
const {
  recordLegalAcceptance,
} = require("../../src/shared/lib/legal-acceptance");

const AGENCY_ID = uuidv4();
const AGENCY_USER_ID = uuidv4();
const TALENT_USER_ID = uuidv4();
const PROFILE_ID = uuidv4();
const TALENT_EMAIL = `inbox-status-talent-${TALENT_USER_ID}@example.com`;
const TALENT_NAME = "Mireille Okafor";
const AGENCY_NAME = "Match & Muse Casting";

let app;

async function seed() {
  await knex("users").insert([
    {
      id: AGENCY_USER_ID,
      email: `inbox-status-agency-${AGENCY_USER_ID}@example.com`,
      password_hash: "x",
      role: "AGENCY",
    },
    {
      id: TALENT_USER_ID,
      email: TALENT_EMAIL,
      password_hash: "x",
      role: "TALENT",
    },
  ]);
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
  await knex("profiles").insert({
    id: PROFILE_ID,
    user_id: TALENT_USER_ID,
    slug: `inbox-status-talent-${PROFILE_ID}`,
    first_name: "Mireille",
    last_name: "Okafor",
    city: "Brooklyn",
    date_of_birth: "1999-04-02",
    gender: "Female",
    height_cm: 178,
    bust_cm: 84,
    waist_cm: 61,
    hips_cm: 89,
    phone: "555-0142",
    bio_raw: "",
    bio_curated: "",
    onboarding_completed_at: new Date().toISOString(),
  });
  await recordLegalAcceptance(knex, AGENCY_USER_ID, {
    terms: true,
    privacy: true,
  });
}

/**
 * A fresh pending application from the seeded talent to the seeded agency.
 * `applications` has UNIQUE(profile_id, agency_id), so clear any leftover
 * row from a previous test before inserting the new one.
 */
async function makeApplication(status = "pending") {
  await knex("applications")
    .where({ profile_id: PROFILE_ID, agency_id: AGENCY_ID })
    .del();
  const id = uuidv4();
  await knex("applications").insert({
    id,
    profile_id: PROFILE_ID,
    agency_id: AGENCY_ID,
    status,
  });
  return id;
}

/** The email dispatch runs fire-and-forget after the response is sent. */
async function waitForEmailDispatch(timeoutMs = 2000) {
  const start = Date.now();
  while (sendApplicationStatusEmail.mock.calls.length === 0) {
    if (Date.now() - start > timeoutMs) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

beforeAll(async () => {
  await migrate(knex);
  await seed();

  // Mounted bare, with the session injected: inbox.js is the unit under
  // test, not the full app's Firebase-backed login flow.
  const inboxRouter = require("../../src/domains/agency/routes/inbox");
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // Mirrors what a real AGENCY login (auth.js) actually puts in the
    // session: userId and agencyId are both the agencies.id row, and the
    // logged-in team member's own users.id lives separately in
    // memberUserId. The decline route reads `session.userId` directly as
    // the agency id, so getting this shape right matters here.
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

beforeEach(() => {
  sendApplicationStatusEmail.mockClear();
});

describe("POST /api/agency/applications/:id/accept", () => {
  test("emails the applicant's own address, not an undefined recipient", async () => {
    const applicationId = await makeApplication("pending");

    const response = await request(app)
      .post(`/api/agency/applications/${applicationId}/accept`)
      .set("Accept", "application/json");

    expect(response.status).toBe(200);

    await waitForEmailDispatch();

    expect(sendApplicationStatusEmail).toHaveBeenCalledTimes(1);
    expect(sendApplicationStatusEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: TALENT_EMAIL,
        talentName: TALENT_NAME,
        agencyName: AGENCY_NAME,
        status: "accepted",
      }),
    );
  });
});

describe("POST /api/agency/applications/:id/decline", () => {
  test("emails the applicant's own address, not an undefined recipient", async () => {
    const applicationId = await makeApplication("pending");

    const response = await request(app)
      .post(`/api/agency/applications/${applicationId}/decline`)
      .set("Accept", "application/json");

    expect(response.status).toBe(200);

    await waitForEmailDispatch();

    expect(sendApplicationStatusEmail).toHaveBeenCalledTimes(1);
    expect(sendApplicationStatusEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: TALENT_EMAIL,
        talentName: TALENT_NAME,
        agencyName: AGENCY_NAME,
        status: "declined",
      }),
    );
  });
});
