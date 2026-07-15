const express = require("express");
const request = require("supertest");
const {
  REQUEST_HEADER,
  REQUEST_HEADER_VALUE,
  sameOriginMutationGuard,
} = require("../../src/shared/middleware/same-origin-mutation");

function createGuardedApp() {
  const app = express();
  app.use(
    sameOriginMutationGuard({
      allowedOrigins: new Set(["https://app.pholio.studio"]),
    }),
  );
  app.all("*", (req, res) => res.status(204).end());
  return app;
}

describe("same-origin mutation guard", () => {
  const app = createGuardedApp();

  test.each([
    "/api/agency/profile",
    "/api/talent/profile",
    "/api/reply/token/messages",
    "/api/internal/agency-requests/request-id/approve",
  ])("rejects a headerless unsafe request to %s", async (path) => {
    const response = await request(app)
      .post(path)
      .set("Origin", "https://app.pholio.studio")
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.error).toEqual(
      expect.objectContaining({
        code: "SAME_ORIGIN_REQUIRED",
        reason: "missing_request_header",
      }),
    );
  });

  test("rejects a cross-site request even when the custom header is present", async () => {
    const response = await request(app)
      .patch("/api/agency/settings")
      .set(REQUEST_HEADER, REQUEST_HEADER_VALUE)
      .set("Origin", "https://attacker.example")
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.error.reason).toBe("untrusted_origin");
  });

  test("allows a verified app-origin mutation", async () => {
    const response = await request(app)
      .delete("/api/talent/settings/account")
      .set(REQUEST_HEADER, REQUEST_HEADER_VALUE)
      .set("Origin", "https://app.pholio.studio");

    expect(response.status).toBe(204);
  });

  test("uses Referer when Origin is unavailable", async () => {
    const response = await request(app)
      .post("/api/reply/token/session")
      .set(REQUEST_HEADER, REQUEST_HEADER_VALUE)
      .set("Referer", "https://app.pholio.studio/reply/token");

    expect(response.status).toBe(204);
  });

  test("does not trust Referer when a malformed Origin header is present", async () => {
    const response = await request(app)
      .post("/api/agency/team")
      .set(REQUEST_HEADER, REQUEST_HEADER_VALUE)
      .set("Origin", "null")
      .set("Referer", "https://app.pholio.studio/dashboard/agency/team")
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.error.reason).toBe("untrusted_origin");
  });

  test("does not guard safe methods or unrelated write routes", async () => {
    const [safeResponse, unrelatedResponse] = await Promise.all([
      request(app).get("/api/agency/me"),
      request(app).post("/stripe/webhook"),
    ]);

    expect(safeResponse.status).toBe(204);
    expect(unrelatedResponse.status).toBe(204);
  });
});
