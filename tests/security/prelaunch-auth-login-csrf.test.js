"use strict";

const express = require("express");
const request = require("supertest");
const {
  REQUEST_HEADER,
  REQUEST_HEADER_VALUE,
  sameOriginMutationGuard,
} = require("../../src/shared/middleware/same-origin-mutation");

function guardedApp() {
  const app = express();
  app.use(
    sameOriginMutationGuard({
      allowedSessionOrigins: new Set(["https://app.pholio.studio"]),
    }),
  );
  app.all("*", (_req, res) => res.status(204).end());
  return app;
}

describe("prelaunch session alias CSRF boundary", () => {
  test.each(["/login", "/logout", "/api/login", "/api/logout"])(
    "rejects a headerless form POST to %s",
    async (path) => {
      const response = await request(guardedApp())
        .post(path)
        .set("Origin", "https://attacker.invalid")
        .type("form")
        .send({ firebase_token: "attacker-token" });

      expect(response.status).toBe(403);
      expect(response.body.error).toMatchObject({
        code: "SAME_ORIGIN_REQUIRED",
        reason: "missing_request_header",
      });
    },
  );

  test("allows a verified first-party legacy login request", async () => {
    const response = await request(guardedApp())
      .post("/login")
      .set(REQUEST_HEADER, REQUEST_HEADER_VALUE)
      .set("Origin", "https://app.pholio.studio");

    expect(response.status).toBe(204);
  });
});
