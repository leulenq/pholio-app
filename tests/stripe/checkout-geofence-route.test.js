/**
 * The jurisdiction gate as the checkout route actually applies it:
 * blocked → 403 with a renderable message; geo failure → checkout proceeds.
 */

const request = require("supertest");
const cookieSig = require("cookie-signature");
const { v4: uuidv4 } = require("uuid");

jest.mock("../../src/shared/lib/stripe", () => ({
  getOrCreateCustomer: jest.fn().mockResolvedValue({ id: "cus_geo_test" }),
  createCheckoutSession: jest.fn().mockResolvedValue({
    id: "cs_test",
    url: "https://checkout.stripe.test/session",
  }),
  createCustomerPortalSession: jest.fn(),
  getSubscription: jest.fn(),
  stripe: { customers: { retrieve: jest.fn() } },
}));

jest.mock("../../src/shared/lib/subscriptions", () => ({
  getSubscriptionStatus: jest.fn().mockResolvedValue(null),
  upsertSubscriptionFromStripe: jest.fn(),
}));

// The gate's only external dependency. Mocked so no test ever reaches ipapi.co.
jest.mock("../../src/shared/lib/geolocation", () => ({
  getIPGeolocation: jest.fn().mockResolvedValue(null),
  createVerifiedLocationIntel: jest.fn(),
}));

const {
  useIsolatedDatabase,
  migrate,
  dropIsolatedDatabase,
} = require("../setup/isolated-db");

const TEST_DB_FILE = useIsolatedDatabase("stripe-checkout-geofence");

const {
  CURRENT_TERMS_VERSION,
  CURRENT_PRIVACY_VERSION,
} = require("../../src/shared/lib/legal-acceptance");
const knex = require("../../src/shared/db/knex");
const app = require("../../src/app");
const { createCheckoutSession } = require("../../src/shared/lib/stripe");
const { getIPGeolocation } = require("../../src/shared/lib/geolocation");

const SESSION_SECRET = require("../../src/config").sessionSecret;

// A routable address, so the gate does not short-circuit on a private IP.
// x-forwarded-for is what app.js's IP-resolution middleware reads.
const PUBLIC_IP = "8.8.8.8";

describe("POST /stripe/create-checkout-session jurisdiction gate", () => {
  const TALENT_ID = uuidv4();
  const PROFILE_ID = uuidv4();
  const sessionIds = [];
  const originalBlocked = process.env.STUDIO_BLOCKED_REGIONS;

  beforeAll(async () => {
    await migrate(knex);

    await knex("users").insert({
      id: TALENT_ID,
      email: `geo-${TALENT_ID}@example.com`,
      password_hash: "x",
      role: "TALENT",
      email_verified: true,
      terms_accepted_at: new Date(),
      terms_accepted_version: CURRENT_TERMS_VERSION,
      privacy_accepted_at: new Date(),
      privacy_accepted_version: CURRENT_PRIVACY_VERSION,
    });
    await knex("profiles").insert({
      id: PROFILE_ID,
      user_id: TALENT_ID,
      slug: `geo-${PROFILE_ID}`,
      first_name: "Geo",
      last_name: "Tester",
      city: "Test City",
      height_cm: 170,
      bio_raw: "",
      bio_curated: "",
      onboarding_completed_at: knex.fn.now(),
    });
  }, 60000);

  beforeEach(async () => {
    createCheckoutSession.mockClear();
    getIPGeolocation.mockReset();
    delete process.env.STUDIO_BLOCKED_REGIONS; // default: block CA
    await knex("users").where({ id: TALENT_ID }).update({ stripe_customer_id: null });
  });

  afterAll(async () => {
    if (originalBlocked === undefined) delete process.env.STUDIO_BLOCKED_REGIONS;
    else process.env.STUDIO_BLOCKED_REGIONS = originalBlocked;
    if (sessionIds.length) {
      await knex("sessions").whereIn("sid", sessionIds).delete();
    }
    await knex("profiles").where({ id: PROFILE_ID }).delete();
    await knex("users").where({ id: TALENT_ID }).delete();
    await knex.destroy();
    dropIsolatedDatabase(TEST_DB_FILE);
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
        email: `geo-${TALENT_ID}@example.com`,
      },
      expired: new Date(Date.now() + 86400000).toISOString(),
    });
    const signed = `s:${cookieSig.sign(sid, SESSION_SECRET)}`;
    return (req) =>
      req
        .set("Cookie", `connect.sid=${encodeURIComponent(signed)}`)
        .set("X-Forwarded-For", PUBLIC_IP);
  }

  async function postCheckout() {
    const auth = await withTalentSession();
    return auth(
      request(app)
        .post("/stripe/create-checkout-session")
        .set("Accept", "application/json")
        .send({ billing_disclosure_accepted: true, interval: "monthly" }),
    );
  }

  it("returns 403 with a renderable message for a California requester", async () => {
    getIPGeolocation.mockResolvedValue({
      country: "US",
      region: "California",
      region_code: "CA",
      city: "Los Angeles",
    });

    const res = await postCheckout();

    expect(res.status).toBe(403);
    expect(res.body.code).toBe("region_unavailable");
    expect(res.body.region).toBe("CA");
    expect(res.body.error).toMatch(/aren't offered in California yet/i);
    expect(res.body.error).toMatch(/legal review/i);
    // The free tier is explicitly untouched, and no Stripe session was created.
    expect(res.body.error).toMatch(/free/i);
    expect(createCheckoutSession).not.toHaveBeenCalled();
  });

  it("fails open: a geolocation outage still creates the checkout session", async () => {
    getIPGeolocation.mockRejectedValue(new Error("ETIMEDOUT"));

    const res = await postCheckout();

    expect(res.status).toBe(200);
    expect(res.body.url).toBe("https://checkout.stripe.test/session");
    expect(createCheckoutSession).toHaveBeenCalled();
  });

  it("fails open: a null geolocation result still creates the checkout session", async () => {
    getIPGeolocation.mockResolvedValue(null);

    const res = await postCheckout();

    expect(res.status).toBe(200);
    expect(createCheckoutSession).toHaveBeenCalled();
  });

  it("allows a New York requester through to Stripe", async () => {
    getIPGeolocation.mockResolvedValue({
      country: "US",
      region: "New York",
      region_code: "NY",
      city: "New York",
    });

    const res = await postCheckout();

    expect(res.status).toBe(200);
    expect(res.body.url).toBe("https://checkout.stripe.test/session");
  });

  it("allows a Canadian requester — country CA is not state CA", async () => {
    getIPGeolocation.mockResolvedValue({
      country: "CA",
      region: "Ontario",
      region_code: "ON",
      city: "Toronto",
    });

    const res = await postCheckout();

    expect(res.status).toBe(200);
    expect(createCheckoutSession).toHaveBeenCalled();
  });
});
