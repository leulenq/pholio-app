"use strict";

/**
 * `GET /api/public/session` (src/routes/api/public.js).
 *
 * Regression: an AGENCY session stores the agency's own id in
 * `session.userId` (agencies.id) and the signed-in member's real
 * `users.id` separately, in `session.memberUserId` — see auth.js's login
 * handler and `resolveAccountUserId` in
 * src/domains/auth/middleware/require-auth.js. The old handler here read
 * `req.session.userId` directly as a `users.id` for EVERY role, so for an
 * agency session it looked up a `users` row by the agency's id, which
 * never matches a users row, and every signed-in agency member read back
 * as `authenticated: false` from this endpoint. The fix resolves the
 * account id the same way `requireAuth` does.
 */

const {
  useIsolatedDatabase,
  migrate,
  dropIsolatedDatabase,
} = require("../setup/isolated-db");

const DB_FILE = useIsolatedDatabase("agency-session-endpoint");

const express = require("express");
const request = require("supertest");
const { v4: uuidv4 } = require("uuid");

const knex = require("../../src/shared/db/knex");

const AGENCY_ID = uuidv4();
const AGENCY_MEMBER_USER_ID = uuidv4();
const AGENCY_MEMBER_EMAIL = `agency-member-${AGENCY_MEMBER_USER_ID}@example.com`;

let app;

beforeAll(async () => {
  await migrate(knex);

  await knex("users").insert({
    id: AGENCY_MEMBER_USER_ID,
    email: AGENCY_MEMBER_EMAIL,
    password_hash: "x",
    role: "AGENCY",
  });
  await knex("agencies").insert({
    id: AGENCY_ID,
    name: "Session Endpoint Test Agency",
    status: "ACTIVE",
  });
  await knex("agency_memberships").insert({
    id: uuidv4(),
    agency_id: AGENCY_ID,
    user_id: AGENCY_MEMBER_USER_ID,
    membership_role: "OWNER",
    status: "ACTIVE",
  });

  // Mounted bare with an injected session, same idiom the agency route
  // suites use to unit-test one router without the full login flow.
  const publicRoutes = require("../../src/routes/api/public");
  app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    // Mirrors what a real AGENCY login actually puts in the session:
    // userId/agencyId are the agencies.id row, and the signed-in team
    // member's own users.id lives separately in memberUserId.
    req.session = {
      userId: AGENCY_ID,
      agencyId: AGENCY_ID,
      memberUserId: AGENCY_MEMBER_USER_ID,
      role: "AGENCY",
    };
    next();
  });
  app.use("/api/public", publicRoutes);
}, 120000);

afterAll(async () => {
  await knex.destroy();
  dropIsolatedDatabase(DB_FILE);
});

describe("GET /api/public/session", () => {
  test("an agency session resolves through memberUserId, not the agency id", async () => {
    const response = await request(app).get("/api/public/session");

    expect(response.status).toBe(200);
    expect(response.body).toEqual(
      expect.objectContaining({
        authenticated: true,
        role: "AGENCY",
      }),
    );
    expect(response.body.user).toEqual(
      expect.objectContaining({ email: AGENCY_MEMBER_EMAIL }),
    );
  });
});
