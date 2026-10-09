"use strict";

/**
 * Talent launch gate (src/shared/lib/talent-launch.js).
 *
 * Load-bearing:
 *  - before launch, talent signup and talent surfaces are refused, by JSON for
 *    API calls and by a redirect to pholio-site's notify page for pages;
 *  - agency sessions, preview sessions and safety exits are never held;
 *  - a forgotten env var in production holds the gate closed, never open;
 *  - the notify endpoint is idempotent and never discloses whether an address
 *    is already listed.
 */

const request = require("supertest");

const {
  useIsolatedDatabase,
  migrate,
  dropIsolatedDatabase,
} = require("../setup/isolated-db");

const DB_FILE = useIsolatedDatabase("talent-launch-gate");

const {
  DEFAULT_LAUNCH_AT,
  isTalentLaunchOpen,
  previewKeyMatches,
  talentLaunchStatus,
} = require("../../src/shared/lib/talent-launch");
const { requireTalentLaunchOpen } = require("../../src/shared/middleware/talent-launch-gate");

const knex = require("../../src/shared/db/knex");
const app = require("../../src/app");

const BEFORE = Date.parse("2026-10-20T12:00:00Z");
const AFTER = Date.parse("2026-11-01T12:00:00Z");

function recorder() {
  return {
    statusCode: 200,
    body: null,
    location: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    redirect(code, url) {
      this.statusCode = code;
      this.location = url;
      return this;
    },
  };
}

function run(req) {
  const res = recorder();
  const next = jest.fn();
  requireTalentLaunchOpen()({ headers: {}, ...req }, res, next);
  return { res, next };
}

describe("launch timing", () => {
  test("unset in production falls back to the default date, closed before it", () => {
    const env = { NODE_ENV: "production" };
    expect(isTalentLaunchOpen(BEFORE, env)).toBe(false);
    expect(isTalentLaunchOpen(AFTER, env)).toBe(true);
    expect(talentLaunchStatus(BEFORE, env).launchAt).toBe(new Date(DEFAULT_LAUNCH_AT).toISOString());
  });

  test("unset outside production is open", () => {
    expect(isTalentLaunchOpen(BEFORE, { NODE_ENV: "test" })).toBe(true);
  });

  test("explicit open, closed, and unparseable values", () => {
    expect(isTalentLaunchOpen(BEFORE, { TALENT_LAUNCH_AT: "open" })).toBe(true);
    expect(isTalentLaunchOpen(AFTER, { TALENT_LAUNCH_AT: "closed" })).toBe(false);
    expect(isTalentLaunchOpen(AFTER, { TALENT_LAUNCH_AT: "not a date" })).toBe(false);
  });

  test("preview key must match exactly and must be configured", () => {
    expect(previewKeyMatches("abc", { TALENT_LAUNCH_PREVIEW_KEY: "abc" })).toBe(true);
    expect(previewKeyMatches("abd", { TALENT_LAUNCH_PREVIEW_KEY: "abc" })).toBe(false);
    expect(previewKeyMatches("", { TALENT_LAUNCH_PREVIEW_KEY: "" })).toBe(false);
    expect(previewKeyMatches("abc", {})).toBe(false);
  });
});

describe("gate middleware before launch", () => {
  const saved = process.env.TALENT_LAUNCH_AT;
  beforeAll(() => {
    process.env.TALENT_LAUNCH_AT = "closed";
  });
  afterAll(() => {
    if (saved === undefined) delete process.env.TALENT_LAUNCH_AT;
    else process.env.TALENT_LAUNCH_AT = saved;
  });

  test.each([
    ["POST", "/onboarding/entry"],
    ["POST", "/casting/entry"],
    ["POST", "/signup"],
  ])("anonymous signup is refused as JSON: %s %s", (method, originalUrl) => {
    const { res, next } = run({ method, originalUrl, session: {} });
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toBe("TALENT_LAUNCH_PENDING");
    expect(res.body.redirect).toMatch(/\/opening$/);
  });

  test("anonymous GET /signup page is redirected to the notify page", () => {
    const { res } = run({ method: "GET", originalUrl: "/signup?plan=studio", session: {} });
    expect(res.statusCode).toBe(303);
    expect(res.location).toMatch(/\/opening$/);
  });

  test.each([
    ["GET", "/api/talent/profile"],
    ["POST", "/api/talent/media"],
    ["POST", "/stripe/create-checkout-session"],
    ["GET", "/pro/upgrade"],
  ])("a talent session is held from %s %s", (method, originalUrl) => {
    const { res, next } = run({
      method,
      originalUrl,
      session: { role: "TALENT", userId: "t-1" },
    });
    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode === 403 || res.statusCode === 303).toBe(true);
  });

  test.each([
    ["DELETE", "/api/talent/settings/account"],
    ["POST", "/api/talent/settings/data-export"],
    ["GET", "/api/session"],
    ["POST", "/api/logout"],
    ["GET", "/portfolio/elara-k"],
  ])("a talent session keeps %s %s", (method, originalUrl) => {
    const { next } = run({ method, originalUrl, session: { role: "TALENT", userId: "t-1" } });
    expect(next).toHaveBeenCalledTimes(1);
  });

  test("agency sessions are never held", () => {
    const { next } = run({
      method: "POST",
      originalUrl: "/onboarding/entry",
      session: { role: "AGENCY", userId: "a-1" },
    });
    expect(next).toHaveBeenCalledTimes(1);
  });

  test("a preview session passes", () => {
    const { next } = run({
      method: "GET",
      originalUrl: "/api/talent/profile",
      session: { role: "TALENT", userId: "t-1", talentLaunchAccess: true },
    });
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe("public launch endpoints", () => {
  beforeAll(async () => {
    await migrate(knex);
  });
  afterAll(async () => {
    await knex.destroy();
    dropIsolatedDatabase(DB_FILE);
  });

  test("status is uncached and names the notify page", async () => {
    const res = await request(app).get("/api/public/talent-launch");
    expect(res.status).toBe(200);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.body.data).toEqual(
      expect.objectContaining({ open: expect.any(Boolean), access: expect.any(Boolean) }),
    );
    expect(res.body.data.notifyUrl).toMatch(/\/opening$/);
  });

  test("an address is stored once, normalized, and repeats look identical", async () => {
    const first = await request(app)
      .post("/api/public/launch-notifications")
      .send({ email: "  Model@Example.com ", source: "studio" });
    expect(first.status).toBe(201);
    expect(first.body).toEqual({ success: true });

    const again = await request(app)
      .post("/api/public/launch-notifications")
      .send({ email: "model@example.com", source: "talent" });
    expect(again.status).toBe(202);
    expect(again.body).toEqual(first.body);

    const rows = await knex("launch_notifications").select("email", "source");
    expect(rows).toEqual([{ email: "model@example.com", source: "studio" }]);
  });

  test("an unknown source is not stored", async () => {
    await request(app)
      .post("/api/public/launch-notifications")
      .send({ email: "other@example.com", source: "<script>" })
      .expect(201);
    const row = await knex("launch_notifications").where({ email: "other@example.com" }).first();
    expect(row.source).toBeNull();
  });

  test("an invalid address is a field error", async () => {
    const res = await request(app)
      .post("/api/public/launch-notifications")
      .send({ email: "not-an-email" });
    expect(res.status).toBe(400);
    expect(res.body.errors.email).toBeTruthy();
  });

  test("a wrong preview key grants nothing", async () => {
    const res = await request(app).get("/api/public/talent-launch/preview?key=wrong");
    expect(res.status).toBe(303);
    expect(res.headers.location).toMatch(/\/opening$/);
  });
});
