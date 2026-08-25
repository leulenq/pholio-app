"use strict";

/**
 * The likeness-consent endpoints (plan C6).
 *
 * What is worth protecting at the route layer is the shape of the contract:
 * one purpose per call so the two can never be bundled, the Fashion Workers Act
 * refusal reaching the talent in words they can act on, and a withdrawal always
 * being available.
 */

const {
  dropIsolatedDatabase,
  migrate,
  useIsolatedDatabase,
} = require("../setup/isolated-db");

const DB_FILE = useIsolatedDatabase("likeness-consent-routes");
const knex = require("../../src/shared/db/knex");
const request = require("supertest");
const { v4: uuidv4 } = require("uuid");
const cookieSig = require("cookie-signature");
const SESSION_SECRET = require("../../src/config").sessionSecret;

const app = require("../../src/app");
const { PURPOSES, TABLE } = require("../../src/domains/talent/services/likeness-consent");

const EMAIL = `likeness-${Date.now()}@example.com`;
const USER_ID = uuidv4();
const PROFILE_ID = uuidv4();
let cookie;

/* A forged session row, the same idiom settings-contract.test.js uses. The dev
   login endpoint is deliberately unavailable here: it now requires an explicit
   development runtime, which is the hardening that made it safe. */
async function makeSession() {
  const sid = uuidv4();
  await knex("sessions").insert({
    sid,
    sess: JSON.stringify({
      cookie: { path: "/", originalMaxAge: 604800000 },
      userId: USER_ID,
      role: "TALENT",
    }),
    expired: new Date(Date.now() + 604800000).toISOString(),
  });
  return `connect.sid=${encodeURIComponent(`s:${cookieSig.sign(sid, SESSION_SECRET)}`)}`;
}

beforeAll(async () => {
  await migrate(knex);
  await knex("users").insert({
    id: USER_ID,
    email: EMAIL,
    role: "TALENT",
    email_verified: true,
  });
  await knex("profiles").insert({
    id: PROFILE_ID,
    user_id: USER_ID,
    slug: `ada-${PROFILE_ID.slice(0, 8)}`,
    first_name: "Ada",
    city: "New York",
    height_cm: 178,
    bio_raw: "x",
    bio_curated: "x",
    onboarding_completed_at: new Date().toISOString(),
  });

  /* The talent dashboard gates on current legal acceptance, so a fixture
     without it exercises that gate instead of the route under test. */
  const {
    recordLegalAcceptance,
  } = require("../../src/shared/lib/legal-acceptance");
  await recordLegalAcceptance(knex, USER_ID, { terms: true, privacy: true });

  cookie = await makeSession();
}, 90000);

afterEach(async () => {
  await knex(TABLE).del();
});

afterAll(async () => {
  await knex.destroy();
  dropIsolatedDatabase(DB_FILE);
});

/* The same-origin mutation guard requires this header on any state change, so
   a test that omitted it would be exercising the guard rather than the route. */
const post = (body) =>
  request(app)
    .post("/api/talent/settings/likeness-consent")
    .set("Cookie", cookie)
    .set("X-Pholio-Request", "same-origin")
    .set("Origin", "http://localhost:3000")
    .send(body);

describe("granting and withdrawing", () => {
  test("marketing use can be granted on its own", async () => {
    const res = await post({ purpose: PURPOSES.MARKETING, granted: true });
    expect(res.status).toBe(200);
    expect(res.body.data.state[PURPOSES.MARKETING]).toBe(true);
    // Independence, asserted at the boundary the client actually calls.
    expect(res.body.data.state[PURPOSES.AI_REPLICA]).toBe(false);
  });

  test("withdrawal is always available", async () => {
    await post({ purpose: PURPOSES.MARKETING, granted: true });
    const res = await post({ purpose: PURPOSES.MARKETING, granted: false });
    expect(res.status).toBe(200);
    expect(res.body.data.state[PURPOSES.MARKETING]).toBe(false);
  });

  test("a replica grant without its statutory terms is refused, in words", async () => {
    const res = await post({ purpose: PURPOSES.AI_REPLICA, granted: true });
    expect(res.status).toBe(400);
    expect(res.body.message || res.body.error).toMatch(/Fashion Workers Act/i);
  });

  test("a complete replica grant is accepted", async () => {
    const res = await post({
      purpose: PURPOSES.AI_REPLICA,
      granted: true,
      scope: "One campaign image",
      usePurpose: "Launch",
      compensation: "USD 500",
      startsOn: "2026-01-01",
      endsOn: "2027-12-31",
    });
    expect(res.status).toBe(200);
    expect(res.body.data.state[PURPOSES.AI_REPLICA]).toBe(true);
  });

  test("an unknown purpose is refused rather than silently stored", async () => {
    const res = await post({ purpose: "everything", granted: true });
    expect(res.status).toBe(400);
  });
});

describe("the talent can read their own record", () => {
  test("history returns what they agreed to, newest first", async () => {
    await post({ purpose: PURPOSES.MARKETING, granted: true });
    await post({ purpose: PURPOSES.MARKETING, granted: false });

    const res = await request(app)
      .get("/api/talent/settings/likeness-consent")
      .set("Cookie", cookie);

    expect(res.status).toBe(200);
    expect(res.body.data.history).toHaveLength(2);
    expect(res.body.data.history[0].event_type).toBe("withdrawn");
    expect(res.body.data.state.disclosures[PURPOSES.AI_REPLICA]).toMatch(/retouching/i);
  });
});

describe("authentication", () => {
  test("an anonymous caller cannot read or write consent", async () => {
    const read = await request(app).get("/api/talent/settings/likeness-consent");
    expect([401, 302]).toContain(read.status);

    const write = await request(app)
      .post("/api/talent/settings/likeness-consent")
      .send({ purpose: PURPOSES.MARKETING, granted: true });
    expect([401, 302, 403]).toContain(write.status);
  });
});
