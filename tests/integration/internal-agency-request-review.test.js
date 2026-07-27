"use strict";

process.env.DATABASE_URL = "sqlite://./test-internal-agency-review.sqlite3";
process.env.DB_CLIENT = "sqlite3";
process.env.NODE_ENV = "test";

const fs = require("fs");
const path = require("path");
const express = require("express");
const request = require("supertest");
const { v4: uuidv4 } = require("uuid");
const knex = require("../../src/shared/db/knex");
const {
  createAgencyRequestsRouter,
} = require("../../src/domains/internal/routes/agency-requests");

const TEST_DB_PATH = path.resolve(
  __dirname,
  "../../test-internal-agency-review.sqlite3",
);
const ADMIN_USER_ID = uuidv4();
const NON_ADMIN_USER_ID = uuidv4();
const REQUEST_ID = uuidv4();
const DECLINE_REQUEST_ID = uuidv4();

const identity = {
  getUserByEmail: jest.fn().mockResolvedValue(null),
  createUser: jest.fn().mockResolvedValue({ uid: "firebase-approved-owner" }),
  deleteUser: jest.fn().mockResolvedValue(undefined),
  generatePasswordResetLink: jest
    .fn()
    .mockResolvedValue("https://identity.example.test/set-password"),
};
const emailService = {
  sendAgencyActivationEmail: jest
    .fn()
    .mockResolvedValue({ messageId: "activation" }),
};

const app = express();
app.use(express.json());
app.use((req, _res, next) => {
  req.session = {
    userId:
      req.get("x-test-admin") === "1" ? ADMIN_USER_ID : NON_ADMIN_USER_ID,
    email:
      req.get("x-test-admin") === "1"
        ? "staff@pholio.studio"
        : "member@example.test",
    role: "TALENT",
  };
  next();
});
app.use(
  createAgencyRequestsRouter({
    dependencies: { db: knex, identity, emailService },
  }),
);
app.post("/api/talent/applications", (_req, res) => res.status(204).end());
app.post("/api/agency/actions", (_req, res) => res.status(204).end());
app.use((error, _req, res, _next) => {
  res.status(error.status || 500).json({
    success: false,
    error: error.code || "TEST_ERROR",
    message: error.message,
  });
});

async function createSchema() {
  await knex.schema.createTable("users", (table) => {
    table.string("id", 36).primary();
    table.string("email").notNullable().unique();
    table.string("password_hash").nullable();
    table.string("firebase_uid").nullable().unique();
    table.string("role").notNullable();
    table.string("first_name").nullable();
    table.string("last_name").nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });
  await knex.schema.createTable("agencies", (table) => {
    table.string("id", 36).primary();
    table.string("name").notNullable();
    table.string("location").nullable();
    table.string("website").nullable();
    table.text("description").nullable();
    table.string("logo_path").nullable();
    table.string("brand_color").nullable();
    table.string("status").notNullable();
    table.string("agency_type").nullable();
    table.string("support_email").nullable();
    table.timestamp("onboarding_started_at").nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());
  });
  await knex.schema.createTable("agency_memberships", (table) => {
    table.string("id", 36).primary();
    table.string("agency_id", 36).notNullable();
    table.string("user_id", 36).notNullable();
    table.string("membership_role").notNullable();
    table.string("status").notNullable();
    table.timestamp("joined_at").nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());
  });
  await knex.schema.createTable("platform_admins", (table) => {
    table.string("id", 36).primary();
    table.string("user_id", 36).notNullable().unique();
    table.string("status").notNullable();
    table.string("display_name").nullable();
    table.timestamp("granted_at").defaultTo(knex.fn.now());
    table.timestamp("revoked_at").nullable();
  });
  await knex.schema.createTable("agency_access_requests", (table) => {
    table.string("id", 36).primary();
    table.string("agency_name").notNullable();
    table.string("website_url").notNullable();
    table.string("primary_market_city").notNullable();
    table.string("primary_market_country").nullable();
    table.text("additional_locations").nullable();
    table.string("agency_type").notNullable();
    table.text("primary_boards").nullable();
    table.string("roster_size_range").notNullable();
    table.string("team_size_range").notNullable();
    table.string("current_system").nullable();
    table.text("first_use_cases").nullable();
    table.string("migration_interest").nullable();
    table.string("contact_name").notNullable();
    table.string("contact_email").notNullable();
    table.string("contact_role").notNullable();
    table.string("contact_phone").nullable();
    table.string("timezone").nullable();
    table.string("heard_from").nullable();
    table.text("notes").nullable();
    table.string("status").notNullable();
    table.string("reviewer_user_id").nullable();
    table.text("review_notes_internal").nullable();
    table.timestamp("qualification_call_at").nullable();
    table.timestamp("approved_at").nullable();
    table.timestamp("declined_at").nullable();
    table.string("provisioned_agency_id").nullable();
    table.string("provisioned_owner_user_id").nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
    table.timestamp("updated_at").defaultTo(knex.fn.now());
  });
  await knex.schema.createTable("agency_access_request_events", (table) => {
    table.string("id", 36).primary();
    table.string("request_id", 36).notNullable();
    table.string("actor_user_id").nullable();
    table.string("actor_email").nullable();
    table.string("event_type").notNullable();
    table.string("previous_status").nullable();
    table.string("next_status").nullable();
    table.string("provisioned_agency_id").nullable();
    table.string("provisioned_owner_user_id").nullable();
    table.string("source_ip").nullable();
    table.text("metadata").nullable();
    table.timestamp("created_at").defaultTo(knex.fn.now());
  });
}

beforeAll(async () => {
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  await createSchema();
  await knex("users").insert([
    {
      id: ADMIN_USER_ID,
      email: "staff@pholio.studio",
      role: "TALENT",
      password_hash: "x",
    },
    {
      id: NON_ADMIN_USER_ID,
      email: "member@example.test",
      role: "TALENT",
      password_hash: "x",
    },
  ]);
  await knex("platform_admins").insert({
    id: uuidv4(),
    user_id: ADMIN_USER_ID,
    status: "ACTIVE",
    display_name: "Review Staff",
  });
  await knex("agency_access_requests").insert({
    id: REQUEST_ID,
    agency_name: "North Star Models",
    website_url: "https://northstar.example.test",
    primary_market_city: "Toronto",
    primary_market_country: "Canada",
    additional_locations: JSON.stringify(["Montreal"]),
    agency_type: "full_service",
    primary_boards: JSON.stringify(["Women", "Men"]),
    roster_size_range: "51-100",
    team_size_range: "6-10",
    current_system: "Spreadsheets",
    first_use_cases: JSON.stringify(["Submissions", "Roster"]),
    migration_interest: "yes",
    contact_name: "Avery Booker",
    contact_email: "avery@northstar.example.test",
    contact_role: "Agency Director",
    status: "submitted",
  });
  await knex("agency_access_requests").insert({
    id: DECLINE_REQUEST_ID,
    agency_name: "Unverified Studio",
    website_url: "https://unverified.example.test",
    primary_market_city: "New York",
    primary_market_country: "United States",
    agency_type: "boutique",
    roster_size_range: "1-25",
    team_size_range: "1-5",
    contact_name: "Casey Contact",
    contact_email: "casey@unverified.example.test",
    contact_role: "Founder",
    status: "submitted",
  });
  await knex("agency_access_request_events").insert({
    id: uuidv4(),
    request_id: REQUEST_ID,
    event_type: "submitted",
    next_status: "submitted",
    metadata: JSON.stringify({ source: "test" }),
  });
});

afterAll(async () => {
  await knex.destroy();
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
});

describe("internal agency request review", () => {
  test("does not intercept ordinary talent or agency API namespaces", async () => {
    await request(app).post("/api/talent/applications").send({}).expect(204);
    await request(app).post("/api/agency/actions").send({}).expect(204);
  });

  test("blocks a signed-in non-admin even when their product role is valid", async () => {
    const response = await request(app)
      .get("/api/internal/agency-requests")
      .expect(403);
    expect(response.body.error).toBe("PLATFORM_ADMIN_REQUIRED");
  });

  test("schedules a qualification call and approves through the staff API", async () => {
    const listed = await request(app)
      .get("/api/internal/agency-requests?status=submitted")
      .set("x-test-admin", "1")
      .expect(200);
    expect(listed.body.data.items).toHaveLength(2);
    expect(listed.body.data.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: REQUEST_ID,
          agencyName: "North Star Models",
          status: "submitted",
        }),
      ]),
    );

    await request(app)
      .patch(`/api/internal/agency-requests/${REQUEST_ID}/qualification-call`)
      .set("x-test-admin", "1")
      .send({
        callAt: "2026-07-20T15:00:00.000Z",
        notes: "Verified the agency website and market references.",
      })
      .expect(200)
      .expect((response) => {
        expect(response.body.data.status).toBe("qualification_call");
      });

    const approved = await request(app)
      .post(`/api/internal/agency-requests/${REQUEST_ID}/approve`)
      .set("x-test-admin", "1")
      .send({ notes: "References confirmed." })
      .expect(200);

    expect(approved.body.data.invitationDelivered).toBe(true);
    expect(approved.body.data.request).toMatchObject({
      id: REQUEST_ID,
      status: "approved",
      contactEmail: "avery@northstar.example.test",
    });
    expect(approved.body.data.request.provisionedAgencyId).toBeTruthy();
    expect(approved.body.data.request.provisionedOwnerUserId).toBeTruthy();
    expect(approved.body.data.request.events.map((event) => event.eventType)).toEqual(
      expect.arrayContaining([
        "submitted",
        "qualification_call_scheduled",
        "approved_and_provisioned",
        "approval_invitation_sent",
      ]),
    );

    const owner = await knex("users")
      .where({ email: "avery@northstar.example.test" })
      .first();
    expect(owner).toMatchObject({
      role: "AGENCY",
      firebase_uid: "firebase-approved-owner",
    });
    const membership = await knex("agency_memberships")
      .where({ user_id: owner.id })
      .first();
    expect(membership).toMatchObject({ membership_role: "OWNER", status: "ACTIVE" });
    const agency = await knex("agencies").where({ id: membership.agency_id }).first();
    expect(agency).toMatchObject({
      name: "North Star Models",
      status: "PENDING_SETUP",
      agency_type: "full_service",
      support_email: "avery@northstar.example.test",
    });
    expect(identity.generatePasswordResetLink).toHaveBeenCalledWith(
      "avery@northstar.example.test",
      expect.objectContaining({ handleCodeInApp: false }),
    );
    expect(identity.createUser).toHaveBeenCalledWith(
      "avery@northstar.example.test",
      expect.any(String),
      expect.objectContaining({ emailVerified: true }),
    );
    // An approved agency has never had a password, so the first email must be
    // an activation, not a reset.
    expect(emailService.sendAgencyActivationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "avery@northstar.example.test",
        agencyName: "North Star Models",
        activationUrl: "https://identity.example.test/set-password",
      }),
    );

    const idempotent = await request(app)
      .post(`/api/internal/agency-requests/${REQUEST_ID}/approve`)
      .set("x-test-admin", "1")
      .send({})
      .expect(200);
    expect(idempotent.body.data.invitationDelivered).toBeNull();
    const agencyCount = await knex("agencies").count("id as count").first();
    expect(Number(agencyCount.count)).toBe(1);
  });

  test("re-sends the activation link for an approved request", async () => {
    await request(app)
      .post(`/api/internal/agency-requests/${REQUEST_ID}/approve`)
      .set("x-test-admin", "1")
      .send({})
      .expect(200);
    emailService.sendAgencyActivationEmail.mockClear();

    await request(app)
      .post(`/api/internal/agency-requests/${REQUEST_ID}/resend-invitation`)
      .set("x-test-admin", "1")
      .send({})
      .expect(200);

    expect(emailService.sendAgencyActivationEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "avery@northstar.example.test",
        activationUrl: "https://identity.example.test/set-password",
      }),
    );

    const events = await knex("agency_access_request_events")
      .where({ request_id: REQUEST_ID, event_type: "approval_invitation_sent" })
      .orderBy("created_at", "asc");
    expect(events.length).toBeGreaterThanOrEqual(2);
  });

  test("refuses to re-send an activation link for an unapproved request", async () => {
    emailService.sendAgencyActivationEmail.mockClear();
    const response = await request(app)
      .post(`/api/internal/agency-requests/${DECLINE_REQUEST_ID}/resend-invitation`)
      .set("x-test-admin", "1")
      .send({})
      .expect(409);
    expect(response.body.error).toBe("AGENCY_REQUEST_NOT_APPROVED");
    expect(emailService.sendAgencyActivationEmail).not.toHaveBeenCalled();
  });

  test("requires and records a reason when staff decline a request", async () => {
    const endpoint = `/api/internal/agency-requests/${DECLINE_REQUEST_ID}/decline`;
    const missingReason = await request(app)
      .post(endpoint)
      .set("x-test-admin", "1")
      .send({})
      .expect(400);
    expect(missingReason.body.error).toBe("DECLINE_REASON_REQUIRED");

    const declined = await request(app)
      .post(endpoint)
      .set("x-test-admin", "1")
      .send({ notes: "Unable to verify the business identity." })
      .expect(200);
    expect(declined.body).toMatchObject({
      success: true,
      data: {
        id: DECLINE_REQUEST_ID,
        status: "declined",
        reviewNotesInternal: "Unable to verify the business identity.",
      },
    });
    expect(declined.body.data.events.at(-1)).toMatchObject({
      eventType: "declined",
      metadata: { reason: "Unable to verify the business identity." },
    });
  });
});
