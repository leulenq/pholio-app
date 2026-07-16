/**
 * Studio+ checkout requires explicit billing disclosure acceptance (ROSCA / CA ARL).
 */

const request = require("supertest");
const cookieSig = require("cookie-signature");
const { v4: uuidv4 } = require("uuid");

jest.mock("../../src/shared/lib/stripe", () => ({
  getOrCreateCustomer: jest.fn().mockResolvedValue({ id: "cus_test" }),
  createCheckoutSession: jest.fn().mockResolvedValue({
    id: "cs_test",
    url: "https://checkout.stripe.test/session",
  }),
  createCustomerPortalSession: jest.fn(),
  getSubscription: jest.fn(),
  stripe: {
    customers: { retrieve: jest.fn() },
  },
}));

jest.mock("../../src/shared/lib/subscriptions", () => ({
  getSubscriptionStatus: jest.fn().mockResolvedValue(null),
  upsertSubscriptionFromStripe: jest.fn(),
}));

const knex = require("../../src/shared/db/knex");
const app = require("../../src/app");
const { createCheckoutSession } = require("../../src/shared/lib/stripe");

const SESSION_SECRET = require("../../src/config").sessionSecret;

describe("POST /stripe/create-checkout-session billing disclosure", () => {
  const TALENT_ID = uuidv4();
  const PROFILE_ID = uuidv4();
  const sessionIds = [];

  beforeAll(async () => {
    await knex("users").insert({
      id: TALENT_ID,
      email: `billing-${TALENT_ID}@example.com`,
      password_hash: "x",
      role: "TALENT",
    });
    await knex("profiles").insert({
      id: PROFILE_ID,
      user_id: TALENT_ID,
      slug: `billing-${PROFILE_ID}`,
      first_name: "Billing",
      last_name: "Tester",
      city: "Test City",
      height_cm: 170,
      bio_raw: "",
      bio_curated: "",
      onboarding_completed_at: knex.fn.now(),
    });
  });

  beforeEach(async () => {
    createCheckoutSession.mockClear();
    await knex("users").where({ id: TALENT_ID }).update({ stripe_customer_id: null });
  });

  afterAll(async () => {
    if (sessionIds.length) {
      await knex("sessions").whereIn("sid", sessionIds).delete();
    }
    await knex("profiles").where({ id: PROFILE_ID }).delete();
    await knex("users").where({ id: TALENT_ID }).delete();
    await knex.destroy();
  });

  async function withTalentSession() {
    const sid = uuidv4();
    sessionIds.push(sid);
    await knex("sessions").insert({
      sid,
      sess: {
        cookie: {
          originalMaxAge: 86400000,
          expires: new Date(Date.now() + 86400000).toISOString(),
          secure: false,
          httpOnly: true,
          path: "/",
        },
        userId: TALENT_ID,
        role: "TALENT",
        email: `billing-${TALENT_ID}@example.com`,
      },
      expired: new Date(Date.now() + 86400000).toISOString(),
    });
    const signed = `s:${cookieSig.sign(sid, SESSION_SECRET)}`;
    return (req) => req.set("Cookie", `connect.sid=${encodeURIComponent(signed)}`);
  }

  it("returns 401 when unauthenticated", async () => {
    const res = await request(app)
      .post("/stripe/create-checkout-session")
      .set("Accept", "application/json")
      .send({ billing_disclosure_accepted: true });
    expect(res.status).toBe(401);
  });

  it("returns 400 when billing_disclosure_accepted is missing", async () => {
    const auth = await withTalentSession();
    const res = await auth(
      request(app)
        .post("/stripe/create-checkout-session")
        .set("Accept", "application/json")
        .send({ interval: "monthly" }),
    );
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/auto-renewal/i);
  });

  it("returns checkout url when disclosure is accepted", async () => {
    const auth = await withTalentSession();
    const res = await auth(
      request(app)
        .post("/stripe/create-checkout-session")
        .set("Accept", "application/json")
        .send({ billing_disclosure_accepted: true, interval: "monthly" }),
    );
    expect(res.status).toBe(200);
    expect(res.body.url).toBe("https://checkout.stripe.test/session");
  });

  it("passes annual interval through to Stripe checkout", async () => {
    const auth = await withTalentSession();
    const res = await auth(
      request(app)
        .post("/stripe/create-checkout-session")
        .set("Accept", "application/json")
        .send({ billing_disclosure_accepted: true, interval: "annual" }),
    );

    expect(res.status).toBe(200);
    expect(createCheckoutSession).toHaveBeenCalledWith(
      "cus_test",
      TALENT_ID,
      expect.stringContaining("@example.com"),
      "annual",
      expect.objectContaining({ trialEligible: true }),
    );
  });
});
