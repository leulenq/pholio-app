"use strict";

process.env.SMTP_HOST = "";
process.env.SMTP_USER = "";
process.env.SMTP_PASS = "";
process.env.AGENCY_LEGAL_ENFORCE = "false";
process.env.AGENCY_RBAC_ENFORCE = "true";

const request = require("supertest");
const express = require("express");
const { v4: uuidv4 } = require("uuid");
const {
  useIsolatedDatabase,
  migrate,
  dropIsolatedDatabase,
} = require("../setup/isolated-db");

const TEST_DB_FILE = useIsolatedDatabase("agency-operations-runtime");

jest.mock("../../src/shared/services/agency-notifications", () => ({
  notifyAgencyInterviewScheduled: jest.fn(() => Promise.resolve()),
}));
jest.mock("../../src/shared/services/notify-talent-interview", () => ({
  notifyTalentForInterview: jest.fn(() => Promise.resolve()),
}));

const knex = require("../../src/shared/db/knex");
const interviewsRouter = require("../../src/domains/agency/routes/interviews");
const remindersRouter = require("../../src/domains/agency/routes/reminders");
const {
  mapApplicationStatusToCastingStage,
} = require("../../src/domains/agency/routes/casting-stage-helpers");
const {
  syncRosterMembershipForApplication,
} = require("../../src/domains/agency/services/roster-memberships");

const AGENCY_ID = uuidv4();
const MEMBER_USER_ID = uuidv4();
const MEMBERSHIP_ID = uuidv4();
const TALENT_USER_ID = uuidv4();
const PROFILE_ID = uuidv4();
const APPLICATION_ID = uuidv4();
const BOARD_ID = uuidv4();

const testApp = express();
testApp.use(express.json());
testApp.use((req, _res, next) => {
  // The member and workspace IDs are deliberately different. The routes must
  // scope records to agencyId, while activity attribution uses the member.
  req.session = {
    userId: MEMBER_USER_ID,
    memberUserId: MEMBER_USER_ID,
    agencyId: AGENCY_ID,
    agencyMembershipId: MEMBERSHIP_ID,
    agencyMembershipRole: "OWNER",
    agencyOnboardingCompletedAt: new Date().toISOString(),
    role: "AGENCY",
  };
  next();
});
testApp.use(interviewsRouter);
testApp.use(remindersRouter);

beforeAll(async () => {
  await migrate(knex);

  await knex("users").insert([
    {
      id: MEMBER_USER_ID,
      email: `agency-member-${MEMBER_USER_ID}@example.com`,
      password_hash: "x",
      role: "AGENCY",
      account_status: "ACTIVE",
    },
    {
      id: TALENT_USER_ID,
      email: `talent-${TALENT_USER_ID}@example.com`,
      password_hash: "x",
      role: "TALENT",
      account_status: "ACTIVE",
    },
  ]);

  await knex("agencies").insert({
    id: AGENCY_ID,
    name: "Runtime Test Agency",
    status: "ACTIVE",
    onboarding_completed_at: new Date().toISOString(),
  });
  await knex("agency_memberships").insert({
    id: MEMBERSHIP_ID,
    agency_id: AGENCY_ID,
    user_id: MEMBER_USER_ID,
    membership_role: "OWNER",
    status: "ACTIVE",
    joined_at: new Date().toISOString(),
  });
  await knex("profiles").insert({
    id: PROFILE_ID,
    user_id: TALENT_USER_ID,
    slug: `runtime-${PROFILE_ID}`,
    first_name: "Runtime",
    last_name: "Talent",
    city: "New York",
    height_cm: 178,
    bio_raw: "",
    bio_curated: "",
    onboarding_completed_at: new Date().toISOString(),
  });
  await knex("boards").insert({
    id: BOARD_ID,
    agency_id: AGENCY_ID,
    name: "Main Board",
    kind: "roster",
  });
  await knex("applications").insert({
    id: APPLICATION_ID,
    profile_id: PROFILE_ID,
    agency_id: AGENCY_ID,
    board_id: BOARD_ID,
    status: "submitted",
  });
}, 120000);

afterAll(async () => {
  await knex.destroy();
  dropIsolatedDatabase(TEST_DB_FILE);
});

describe("agency operations runtime reconciliation", () => {
  test("booked and other real inbound outcomes retain their casting stages", () => {
    expect(mapApplicationStatusToCastingStage("kept_on_file")).toBe("Shortlisted");
    expect(mapApplicationStatusToCastingStage("development")).toBe("Offered");
    expect(mapApplicationStatusToCastingStage("accepted")).toBe("Represented");
    expect(mapApplicationStatusToCastingStage("booked")).toBe("Represented");
    expect(mapApplicationStatusToCastingStage("represented")).toBe("Represented");
  });

  test("a booked application creates its roster membership on the application board", async () => {
    const membership = await syncRosterMembershipForApplication(
      knex,
      {
        id: APPLICATION_ID,
        agency_id: AGENCY_ID,
        profile_id: PROFILE_ID,
        board_id: BOARD_ID,
      },
      "booked",
      { actorUserId: MEMBER_USER_ID },
    );

    expect(membership).toMatchObject({
      agency_id: AGENCY_ID,
      profile_id: PROFILE_ID,
      board_id: BOARD_ID,
      status: "active",
    });
    expect(
      await knex("roster_memberships").where({ id: membership.id }).first(),
    ).toMatchObject({ board_id: BOARD_ID, source_application_id: APPLICATION_ID });
  });

  test("reminders use the workspace agency rather than the member user id", async () => {
    const response = await request(testApp)
      .post(`/api/agency/applications/${APPLICATION_ID}/reminders`)
      .send({
        reminder_type: "follow_up",
        reminder_date: "2026-08-10T14:00:00.000Z",
        title: "Follow up on digitals",
      });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      application_id: APPLICATION_ID,
      agency_id: AGENCY_ID,
      title: "Follow up on digitals",
    });
  });

  test("interviews use the workspace agency and the profile's talent user", async () => {
    const response = await request(testApp)
      .post(`/api/agency/applications/${APPLICATION_ID}/interviews`)
      .send({
        proposed_datetime: "2026-08-12T16:30:00.000Z",
        interview_type: "video_call",
        meeting_url: "https://example.com/meeting",
      });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({
      application_id: APPLICATION_ID,
      agency_id: AGENCY_ID,
      talent_id: TALENT_USER_ID,
      status: "pending",
    });
  });
});
