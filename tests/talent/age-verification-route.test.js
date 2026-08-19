/**
 * Route-level coverage for POST /api/talent/age-verification/session.
 *
 * The frontend's Stripe.js handoff (client/src/domains/talent/pages/ProfilePage/
 * stripeIdentity.js) prefers `stripe.verifyIdentity(client_secret)` — an in-app
 * modal — and only falls back to a full-page redirect via `session.url` when no
 * client_secret (or no publishable key) is available. This suite pins the
 * response shape the route hands back to the client: `url` and `status` keep
 * working for the existing redirect fallback, and `client_secret` is now
 * additionally present so the modal path can engage.
 */

const request = require("supertest");
const cookieSig = require("cookie-signature");
const { v4: uuidv4 } = require("uuid");

const { useIsolatedDatabase, migrate, dropIsolatedDatabase } = require("../setup/isolated-db");

const DB_FILE = useIsolatedDatabase("talent-age-verification-route");

const mockCreate = jest.fn();
const mockRetrieve = jest.fn();
const mockRedact = jest.fn().mockResolvedValue({ id: "redacted" });
jest.mock("../../src/shared/lib/stripe", () => ({
  stripe: {
    identity: {
      verificationSessions: {
        create: (...args) => mockCreate(...args),
        retrieve: (...args) => mockRetrieve(...args),
        redact: (...args) => mockRedact(...args),
      },
    },
  },
}));

const { acceptedLegal } = require("../setup/legal-fixture");
const knex = require("../../src/shared/db/knex");
const app = require("../../src/app");

const SESSION_SECRET = require("../../src/config").sessionSecret;

describe("POST /api/talent/age-verification/session — response shape", () => {
  const userId = uuidv4();
  const profileId = uuidv4();
  const sessionIds = [];

  beforeAll(async () => {
    await migrate(knex);

    await knex("users").insert({
      id: userId,
      email: `age-verification-route-${userId}@example.com`,
      password_hash: "x",
      role: "TALENT",
      email_verified: true,
      ...acceptedLegal(),
    });
    await knex("profiles").insert({
      id: profileId,
      user_id: userId,
      slug: `age-verification-route-${profileId}`,
      first_name: "Jordan",
      last_name: "Ashford",
      city: "New York",
      height_cm: 178,
      gender: "Female",
      bio_raw: "",
      bio_curated: "",
      date_of_birth: "1990-04-12",
      onboarding_completed_at: new Date().toISOString(),
    });
  }, 120000);

  afterAll(async () => {
    if (sessionIds.length) {
      await knex("sessions").whereIn("sid", sessionIds).delete();
    }
    await knex.destroy();
    dropIsolatedDatabase(DB_FILE);
  });

  async function withSession() {
    const sid = uuidv4();
    sessionIds.push(sid);
    await knex("sessions").insert({
      sid,
      sess: {
        cookie: { path: "/" },
        userId,
        role: "TALENT",
        email: `age-verification-route-${userId}@example.com`,
      },
      expired: new Date(Date.now() + 86400000).toISOString(),
    });
    const signed = `s:${cookieSig.sign(sid, SESSION_SECRET)}`;
    return (req) => req.set("Cookie", `connect.sid=${encodeURIComponent(signed)}`);
  }

  beforeEach(async () => {
    mockCreate.mockReset();
    mockRetrieve.mockReset();
    // Clear out any verification rows left by a previous test so
    // createVerificationSession always takes the create-a-new-session path.
    await knex("age_verifications").where({ profile_id: profileId }).delete();
  });

  it("includes client_secret alongside the existing url/status fields", async () => {
    mockCreate.mockResolvedValue({
      id: "vs_test_client_secret",
      status: "requires_input",
      url: "https://verify.stripe.com/start/test_abc",
      client_secret: "vs_test_client_secret_secret_xyz",
    });
    const auth = await withSession();

    const res = await auth(
      request(app)
        .post("/api/talent/age-verification/session")
        .set("Accept", "application/json")
        .send({ consent: true }),
    );

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      success: true,
      data: {
        url: "https://verify.stripe.com/start/test_abc",
        status: "requires_input",
        client_secret: "vs_test_client_secret_secret_xyz",
      },
    });
    // The redirect fallback keeps working unmodified: url/status are untouched,
    // client_secret is purely additive.
    expect(Object.keys(res.body.data).sort()).toEqual(["client_secret", "status", "url"]);
  });

  it("falls back to null client_secret rather than breaking when Stripe omits it", async () => {
    mockCreate.mockResolvedValue({
      id: "vs_test_no_secret",
      status: "requires_input",
      url: "https://verify.stripe.com/start/test_def",
      client_secret: null,
    });
    const auth = await withSession();

    const res = await auth(
      request(app)
        .post("/api/talent/age-verification/session")
        .set("Accept", "application/json")
        .send({ consent: true }),
    );

    expect(res.status).toBe(201);
    expect(res.body.data.client_secret).toBeNull();
    expect(res.body.data.url).toBe("https://verify.stripe.com/start/test_def");
  });

  it("never persists client_secret on the age_verifications row", async () => {
    mockCreate.mockResolvedValue({
      id: "vs_test_not_stored",
      status: "requires_input",
      url: "https://verify.stripe.com/start/test_ghi",
      client_secret: "vs_test_not_stored_secret",
    });
    const auth = await withSession();

    await auth(
      request(app)
        .post("/api/talent/age-verification/session")
        .set("Accept", "application/json")
        .send({ consent: true }),
    );

    const row = await knex("age_verifications")
      .where({ provider_session_id: "vs_test_not_stored" })
      .first();
    expect(row).toBeTruthy();
    expect(row).not.toHaveProperty("client_secret");
    expect(Object.values(row)).not.toContain("vs_test_not_stored_secret");
  });
});
