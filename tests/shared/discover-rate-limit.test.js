const express = require("express");
const request = require("supertest");

const {
  createDiscoverRateLimit,
  discoverRateLimitKeyGenerator,
} = require("../../src/shared/middleware/discover-rate-limit");

function buildApp(options) {
  const app = express();

  app.use((req, _res, next) => {
    const userId = req.get("x-test-user");
    const sessionId = req.get("x-test-session");
    req.session = userId ? { userId } : {};
    req.sessionID = sessionId || undefined;
    next();
  });
  app.get("/api/agency/discover", createDiscoverRateLimit(options), (_req, res) =>
    res.status(200).json({ ok: true }),
  );

  return app;
}

describe("discover rate limit", () => {
  test("returns 429 with the discover error payload under burst", async () => {
    const app = buildApp({ max: 2, windowMs: 60_000 });
    const headers = { "x-test-user": "agency-1" };

    await request(app).get("/api/agency/discover").set(headers).expect(200);
    await request(app).get("/api/agency/discover").set(headers).expect(200);

    const limited = await request(app)
      .get("/api/agency/discover")
      .set(headers)
      .expect(429);

    expect(limited.body).toEqual({
      error: "DISCOVER_RATE_LIMITED",
      message:
        "Too many discovery requests. Please wait a minute and try again.",
    });
    expect(limited.headers["retry-after"]).toBeDefined();
  });

  test("shares the quota across sessions belonging to one user", async () => {
    const app = buildApp({ max: 1, windowMs: 60_000 });

    await request(app)
      .get("/api/agency/discover")
      .set("x-test-user", "agency-1")
      .set("x-test-session", "session-a")
      .expect(200);
    await request(app)
      .get("/api/agency/discover")
      .set("x-test-user", "agency-1")
      .set("x-test-session", "session-b")
      .expect(429);

    // A different account keeps its own quota.
    await request(app)
      .get("/api/agency/discover")
      .set("x-test-user", "agency-2")
      .set("x-test-session", "session-c")
      .expect(200);
  });

  test("falls back from user to session identity", () => {
    expect(
      discoverRateLimitKeyGenerator({
        session: { userId: "agency-1" },
        sessionID: "session-a",
      }),
    ).toBe("user:agency-1");
    expect(
      discoverRateLimitKeyGenerator({
        session: {},
        sessionID: "session-a",
      }),
    ).toBe("session:session-a");
  });

  test("reads DISCOVER_RATE_LIMIT_MAX / _WINDOW_MS from the environment", async () => {
    const prevMax = process.env.DISCOVER_RATE_LIMIT_MAX;
    const prevWindow = process.env.DISCOVER_RATE_LIMIT_WINDOW_MS;
    process.env.DISCOVER_RATE_LIMIT_MAX = "1";
    process.env.DISCOVER_RATE_LIMIT_WINDOW_MS = "60000";

    try {
      const app = buildApp(); // no explicit options — env must apply
      const headers = { "x-test-user": "agency-env" };
      await request(app).get("/api/agency/discover").set(headers).expect(200);
      await request(app).get("/api/agency/discover").set(headers).expect(429);
    } finally {
      if (prevMax === undefined) delete process.env.DISCOVER_RATE_LIMIT_MAX;
      else process.env.DISCOVER_RATE_LIMIT_MAX = prevMax;
      if (prevWindow === undefined)
        delete process.env.DISCOVER_RATE_LIMIT_WINDOW_MS;
      else process.env.DISCOVER_RATE_LIMIT_WINDOW_MS = prevWindow;
    }
  });
});
