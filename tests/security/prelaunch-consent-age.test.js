"use strict";

const {
  isSafetyExit,
  requireLaunchAgeEligibility,
} = require("../../src/shared/middleware/launch-age-policy");
const {
  applyMinorSubmissionFilter,
  canViewMinorSubmissions,
  getApplicationAccessDecision,
} = require("../../src/domains/agency/services/minor-submission-access");

function responseRecorder() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function profileDb(profile) {
  return () => ({
    where: () => ({ first: async () => profile }),
  });
}

describe("prelaunch adults-only consent and age policy", () => {
  test("known minors cannot mutate product state", async () => {
    const middleware = requireLaunchAgeEligibility(
      profileDb({ date_of_birth: "2012-01-01" }),
    );
    const req = {
      method: "POST",
      originalUrl: "/api/talent/applications",
      session: { role: "TALENT", userId: "talent-1" },
    };
    const res = responseRecorder();
    const next = jest.fn();

    await middleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe("ADULTS_ONLY_LAUNCH");
  });

  test.each([
    ["POST", "/api/talent/applications/application-1/withdraw"],
    ["POST", "/api/talent/settings/data-export"],
    ["POST", "/api/talent/settings/deactivate"],
    ["DELETE", "/api/talent/settings/account"],
    ["POST", "/api/reports"],
  ])("minor safety exit remains usable: %s %s", async (method, originalUrl) => {
    const middleware = requireLaunchAgeEligibility(
      profileDb({ date_of_birth: "2012-01-01" }),
    );
    const next = jest.fn();

    await middleware(
      {
        method,
        originalUrl,
        session: { role: "TALENT", userId: "talent-1" },
      },
      responseRecorder(),
      next,
    );

    expect(next).toHaveBeenCalledTimes(1);
    expect(isSafetyExit({ method, originalUrl })).toBe(
      !originalUrl.startsWith("/api/reports"),
    );
  });

  test("unknown age may reach the DOB correction write path", async () => {
    const middleware = requireLaunchAgeEligibility(profileDb({ date_of_birth: null }));
    const next = jest.fn();
    await middleware(
      {
        method: "PATCH",
        originalUrl: "/api/talent/profile",
        session: { role: "TALENT", userId: "talent-1" },
      },
      responseRecorder(),
      next,
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  test("agency permissions and live guardian grants cannot expose retained minors", async () => {
    expect(
      canViewMinorSubmissions({
        agencyPermissions: new Set(["talent.view_minor_submissions"]),
      }),
    ).toBe(false);

    const row = {
      id: "application-1",
      minor_at_submission: true,
      guardian_consent_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    };
    const query = {
      leftJoin: () => query,
      where: () => query,
      first: async () => row,
    };
    const decision = await getApplicationAccessDecision(() => query, {
      agencyId: "agency-1",
      applicationId: "application-1",
      allowMinor: true,
    });
    expect(decision).toMatchObject({
      allowed: false,
      reason: "adults_only_launch",
    });
  });

  test("forced and deployed collection queries always exclude minor rows", () => {
    const query = { where: jest.fn(() => query) };
    expect(applyMinorSubmissionFilter(query, { force: true })).toBe(query);
    expect(query.where).toHaveBeenCalledWith(
      "applications.minor_at_submission",
      false,
    );
  });
});
