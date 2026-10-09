"use strict";

/**
 * Agency arrival — `GET/POST /api/agency/setup/arrival`.
 *
 * Runs on a real migrated schema: the commit writes across agencies, boards,
 * and agency_setup_steps, and the guard reads memberships + agency status, so
 * a hand-built schema would let a wrong column pass silently.
 */

const {
  useIsolatedDatabase,
  migrate,
  dropIsolatedDatabase,
} = require("../setup/isolated-db");

const DB_FILE = useIsolatedDatabase("agency-arrival");

const express = require("express");
const request = require("supertest");
const { v4: uuidv4 } = require("uuid");

const knex = require("../../src/shared/db/knex");
const arrivalRouter = require("../../src/domains/agency/routes/arrival");

const AGENCY_ID = uuidv4();
const OWNER_USER_ID = uuidv4();
const MEMBERSHIP_ID = uuidv4();
const VIEWER_USER_ID = uuidv4();
const VIEWER_MEMBERSHIP_ID = uuidv4();

function buildApp(session) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.session = { ...session, save: (cb) => cb() };
    next();
  });
  app.use(arrivalRouter);
  return app;
}

const ownerSession = {
  userId: OWNER_USER_ID,
  agencyId: AGENCY_ID,
  memberUserId: OWNER_USER_ID,
  agencyMembershipId: MEMBERSHIP_ID,
  agencyMembershipRole: "OWNER",
  role: "AGENCY",
};

const validAnswers = {
  name: "Maison Nord",
  location: "Copenhagen, Denmark",
  openBoards: ["Women", "Men", "New Faces"],
  acceptsMinors: false,
  minorCustodyAccepted: false,
  reviewWindowDays: 21,
  timezone: "Europe/Copenhagen",
  units: "metric",
};

beforeAll(async () => {
  await migrate(knex);
  await knex("users").insert([
    { id: OWNER_USER_ID, email: "owner@maison-nord.test", role: "AGENCY", email_verified: true, first_name: "Ida" },
    { id: VIEWER_USER_ID, email: "viewer@maison-nord.test", role: "AGENCY", email_verified: true },
  ]);
  await knex("agencies").insert({
    id: AGENCY_ID,
    name: "Maison Nord Models",
    status: "PENDING_SETUP",
    onboarding_started_at: knex.fn.now(),
  });
  await knex("agency_memberships").insert([
    { id: MEMBERSHIP_ID, agency_id: AGENCY_ID, user_id: OWNER_USER_ID, membership_role: "OWNER", status: "ACTIVE" },
    { id: VIEWER_MEMBERSHIP_ID, agency_id: AGENCY_ID, user_id: VIEWER_USER_ID, membership_role: "VIEWER", status: "ACTIVE" },
  ]);
  await knex("agency_access_requests").insert({
    id: uuidv4(),
    agency_name: "Maison Nord Models",
    website_url: "https://maisonnord.test",
    primary_market_city: "Copenhagen",
    primary_market_country: "Denmark",
    agency_type: "Mother agency",
    primary_boards: JSON.stringify(["Women", "Men"]),
    roster_size_range: "50-150",
    team_size_range: "4-10",
    contact_name: "Ida Holm",
    contact_email: "owner@maison-nord.test",
    contact_role: "Director",
    timezone: "Europe/Copenhagen",
    status: "approved",
    approved_at: new Date("2026-10-02T10:00:00Z").toISOString(),
    provisioned_agency_id: AGENCY_ID,
    provisioned_owner_user_id: OWNER_USER_ID,
  });
}, 120000);

afterAll(async () => {
  await knex.destroy();
  dropIsolatedDatabase(DB_FILE);
});

describe("GET /api/agency/setup/arrival", () => {
  test("composes the introduction from the approved record before setup completes", async () => {
    const res = await request(buildApp(ownerSession)).get("/api/agency/setup/arrival");
    expect(res.status).toBe(200);
    const intro = res.body.data;
    expect(intro.agency.name).toBe("Maison Nord Models");
    expect(intro.agency.location).toBe("Copenhagen, Denmark");
    expect(intro.agency.completedAt).toBeNull();
    expect(intro.approval.timezone).toBe("Europe/Copenhagen");
    expect(intro.approval).toMatchObject({ agencyName: "Maison Nord Models", city: "Copenhagen", boards: ["Women", "Men"], rosterSize: "50-150" });
    expect(intro.approval.requestedAt).toBeTruthy();
    expect(intro.viewer).toMatchObject({ firstName: "Ida", role: "OWNER" });
    expect(intro.boards.chosen).toEqual(["Women", "Men"]);
    expect(intro.boards.source).toBe("request");
    expect(intro.boards.offered.slice(0, 2)).toEqual(["Women", "Men"]);
    expect(intro.reviewWindow.days).toBe(30);
    expect(intro.units).toBe("metric");
  });
});

describe("POST /api/agency/setup/arrival", () => {
  test("rejects a minors answer without the custody acceptance", async () => {
    const res = await request(buildApp(ownerSession))
      .post("/api/agency/setup/arrival")
      .send({ ...validAnswers, acceptsMinors: true, minorCustodyAccepted: false });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe("MINOR_PRIVACY_ACK_REQUIRED");
  });

  test("rejects an unanswered minors question and an unoffered reply window", async () => {
    const app = buildApp(ownerSession);
    const noMinors = await request(app)
      .post("/api/agency/setup/arrival")
      .send({ ...validAnswers, acceptsMinors: undefined });
    expect(noMinors.body.error).toBe("MINORS_ANSWER_REQUIRED");
    const badWindow = await request(app)
      .post("/api/agency/setup/arrival")
      .send({ ...validAnswers, reviewWindowDays: 0 });
    expect(badWindow.body.error).toBe("REVIEW_WINDOW_INVALID");
    const fractional = await request(app)
      .post("/api/agency/setup/arrival")
      .send({ ...validAnswers, reviewWindowDays: 12.5 });
    expect(fractional.body.error).toBe("REVIEW_WINDOW_INVALID");
  });

  test("a view-only member cannot open the agency", async () => {
    const res = await request(
      buildApp({ ...ownerSession, memberUserId: VIEWER_USER_ID, userId: VIEWER_USER_ID, agencyMembershipId: VIEWER_MEMBERSHIP_ID, agencyMembershipRole: "VIEWER" }),
    )
      .post("/api/agency/setup/arrival")
      .send(validAnswers);
    expect(res.status).toBe(403);
    const agency = await knex("agencies").where({ id: AGENCY_ID }).first();
    expect(agency.status).toBe("PENDING_SETUP");
  });

  test("commits every answer at once and opens the agency", async () => {
    const res = await request(buildApp(ownerSession))
      .post("/api/agency/setup/arrival")
      .send({ ...validAnswers, reviewWindowDays: 25 });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ completed: true, redirect: "/dashboard/agency" });

    const agency = await knex("agencies").where({ id: AGENCY_ID }).first();
    expect(agency.status).toBe("ACTIVE");
    expect(agency.name).toBe("Maison Nord");
    expect(agency.location).toBe("Copenhagen, Denmark");
    expect(JSON.parse(agency.open_boards)).toEqual(["Women", "Men", "New Faces"]);
    expect(agency.application_review_window_days).toBe(25);
    expect(agency.agency_type).toBe("Mother agency");
    expect(agency.onboarding_completed_at).toBeTruthy();
    expect(agency.onboarding_completed_by_user_id).toBe(OWNER_USER_ID);
    expect(agency.minor_data_acknowledged_at).toBeNull();

    const boards = await knex("boards").where({ agency_id: AGENCY_ID }).orderBy("sort_order");
    expect(boards.map((b) => b.name)).toEqual(["Women", "Men", "New Faces"]);
    expect(boards.every((b) => b.kind === "division")).toBe(true);

    const steps = await knex("agency_setup_steps").where({ agency_id: AGENCY_ID });
    expect(steps).toHaveLength(6);
    expect(steps.every((s) => s.status === "complete")).toBe(true);
  });

  test("the introduction reports completion afterwards", async () => {
    const res = await request(buildApp(ownerSession)).get("/api/agency/setup/arrival");
    expect(res.body.data.agency.completedAt).toBeTruthy();
    expect(res.body.data.boards.chosen).toEqual(["Women", "Men", "New Faces"]);
    expect(res.body.data.reviewWindow.days).toBe(25);
  });
});
