const express = require("express");
const request = require("supertest");
const {
  REQUEST_HEADER,
  REQUEST_HEADER_VALUE,
  sameOriginMutationGuard,
} = require("../../src/shared/middleware/same-origin-mutation");

/**
 * /api/login and /api/logout are aliases of the /login and /logout handlers and
 * previously had no CSRF protection at all — login CSRF (forcing a victim into
 * an attacker's session) and drive-by logout were both reachable, made easier
 * by the marketing site proxying /api/* same-site.
 *
 * They are guarded by the custom header alone. Origin/Referer is checked as
 * defense in depth when present but tolerated when absent, because the
 * marketing site's Next.js server-side rewrite may not forward it.
 */
function createGuardedApp() {
  const app = express();
  app.use(
    sameOriginMutationGuard({
      allowedOrigins: new Set(["https://app.pholio.studio"]),
      allowedSessionOrigins: new Set([
        "https://app.pholio.studio",
        "https://www.pholio.studio",
      ]),
    }),
  );
  app.all("*", (req, res) => res.status(204).end());
  return app;
}

describe("session endpoint CSRF guard", () => {
  const app = createGuardedApp();
  const protectedPaths = [
    "/api/login",
    "/api/logout",
    "/api/auth/instagram/start",
    "/api/auth/password-reset",
  ];

  test.each(protectedPaths)(
    "rejects a headerless POST to %s (an HTML form cannot set the header)",
    async (path) => {
      const response = await request(app).post(path).send({});

      expect(response.status).toBe(403);
      expect(response.body.error).toEqual(
        expect.objectContaining({
          code: "SAME_ORIGIN_REQUIRED",
          reason: "missing_request_header",
        }),
      );
    },
  );

  test.each(protectedPaths)(
    "rejects a headerless cross-site form POST to %s carrying an attacker origin",
    async (path) => {
      const response = await request(app)
        .post(path)
        .set("Origin", "https://evil.example")
        .type("form")
        .send({ firebase_token: "x" });

      expect(response.status).toBe(403);
    },
  );

  test.each(protectedPaths)(
    "rejects %s when the header is present but the origin is untrusted",
    async (path) => {
      const response = await request(app)
        .post(path)
        .set(REQUEST_HEADER, REQUEST_HEADER_VALUE)
        .set("Origin", "https://evil.example")
        .send({});

      expect(response.status).toBe(403);
      expect(response.body.error.reason).toBe("untrusted_origin");
    },
  );

  test.each(protectedPaths)(
    "allows %s from the app origin with the header",
    async (path) => {
      const response = await request(app)
        .post(path)
        .set(REQUEST_HEADER, REQUEST_HEADER_VALUE)
        .set("Origin", "https://app.pholio.studio")
        .send({});

      expect(response.status).toBe(204);
    },
  );

  test.each(protectedPaths)(
    "allows %s from the marketing origin with the header",
    async (path) => {
      const response = await request(app)
        .post(path)
        .set(REQUEST_HEADER, REQUEST_HEADER_VALUE)
        .set("Origin", "https://www.pholio.studio")
        .send({});

      expect(response.status).toBe(204);
    },
  );

  test.each(protectedPaths)(
    "allows %s with the header and no Origin (proxy hop may drop it)",
    async (path) => {
      const response = await request(app)
        .post(path)
        .set(REQUEST_HEADER, REQUEST_HEADER_VALUE)
        .send({});

      expect(response.status).toBe(204);
    },
  );

  test("the marketing origin is still NOT trusted for dashboard mutations", async () => {
    const response = await request(app)
      .post("/api/talent/profile")
      .set(REQUEST_HEADER, REQUEST_HEADER_VALUE)
      .set("Origin", "https://www.pholio.studio")
      .send({});

    expect(response.status).toBe(403);
    expect(response.body.error.reason).toBe("untrusted_origin");
  });

  test("GET /api/login is untouched (safe method)", async () => {
    const response = await request(app).get("/api/login");
    expect(response.status).toBe(204);
  });
});
