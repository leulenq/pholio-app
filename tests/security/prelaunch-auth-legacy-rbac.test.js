"use strict";

jest.mock("../../src/domains/agency/routes/agency-api-guard", () => ({
  mountAgencyApiGuard: jest.fn(),
}));
jest.mock("../../src/domains/agency/services/audit", () => ({
  recordAuditEvent: jest.fn(),
}));
jest.mock("../../src/shared/db/knex", () => {
  const db = jest.fn(() => {
    throw new Error("database must not be reached for a self-edit denial");
  });
  db.fn = { now: jest.fn() };
  return db;
});

const express = require("express");
const request = require("supertest");
const rosterRoutes = require("../../src/domains/agency/routes/roster");
const teamRbacRoutes = require("../../src/domains/agency/routes/team-rbac");
const knex = require("../../src/shared/db/knex");

describe("prelaunch legacy and permission-mutation boundaries", () => {
  test.each([
    "/dashboard/agency/applications/application-1/accept",
    "/dashboard/agency/applications/application-1/decline",
    "/dashboard/agency/applications/application-1/archive",
    "/dashboard/agency/discover/profile-1/invite",
  ])("does not expose retired mutation %s", async (path) => {
    const app = express();
    app.use(rosterRoutes);

    const response = await request(app).post(path);
    expect(response.status).toBe(404);
  });

  test("an administrator cannot remove a DENY from their own membership", async () => {
    const app = express();
    app.use((req, _res, next) => {
      req.session = {
        role: "AGENCY",
        userId: "agency-1",
        agencyId: "agency-1",
        memberUserId: "user-1",
        agencyMembershipId: "membership-1",
        agencyMembershipRole: "ADMIN",
      };
      next();
    });
    app.use(teamRbacRoutes);

    const response = await request(app).delete(
      "/api/agency/team/membership-1/permissions/org.export_data?effect=DENY",
    );

    expect(response.status).toBe(403);
    expect(response.body.error).toBe("You cannot modify your own permissions");
    expect(knex).not.toHaveBeenCalled();
  });
});
