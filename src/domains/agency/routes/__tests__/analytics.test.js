"use strict";

const express = require("express");
const request = require("supertest");

jest.mock("../../../auth/middleware/require-auth", () => ({
  requireRole: () => (req, res, next) => next(),
}));
jest.mock("../../../../shared/db/knex", () => ({}));
jest.mock("../agency-api-guard", () => ({
  mountAgencyApiGuard: () => {},
}));
jest.mock("../../services/context", () => ({
  getSessionAgencyId: () => "agency-1",
}));
jest.mock("../../queries/season.queries", () => ({
  buildSeasonAnalytics: jest.fn(),
}));

const { buildSeasonAnalytics } = require("../../queries/season.queries");
const analyticsRouter = require("../analytics");

function testApp() {
  const app = express();
  app.use(analyticsRouter);
  return app;
}

describe("GET /api/agency/analytics/season validation", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test.each([
    ["ANALYTICS_INVALID_RANGE", "range must be one of the allowed values"],
    ["ANALYTICS_INVALID_TIMEZONE", "timezone must be an IANA timezone"],
  ])("maps %s to the stable 400 response contract", async (code, message) => {
    buildSeasonAnalytics.mockRejectedValueOnce(
      Object.assign(new Error(message), { code, statusCode: 400 }),
    );

    const response = await request(testApp()).get(
      "/api/agency/analytics/season",
    );

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      error: "The analytics request is invalid.",
      code,
    });
  });

  test("preserves the existing invalid-board response", async () => {
    buildSeasonAnalytics.mockRejectedValueOnce(
      Object.assign(new Error("Unknown analytics board"), {
        code: "ANALYTICS_INVALID_BOARD",
        statusCode: 400,
      }),
    );

    const response = await request(testApp()).get(
      "/api/agency/analytics/season",
    );

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      error: "The selected analytics board is no longer available.",
      code: "ANALYTICS_INVALID_BOARD",
    });
  });
});
