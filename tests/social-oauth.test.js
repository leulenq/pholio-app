/**
 * Social Media Verification & OAuth Integration Tests (Phase 2)
 */

const request = require("supertest");
const app = require("../src/app");
const knex = require("../src/shared/db/knex");
const bcrypt = require("bcrypt");
const { v4: uuidv4 } = require("uuid");
const cookieSig = require("cookie-signature");
const config = require("../src/config");

// Bypasses onboarding & legal checks globally for testing
jest.mock("../src/shared/middleware/onboarding-redirect", () => ({
  requireOnboardingComplete: (req, res, next) => next(),
}));
jest.mock("../src/shared/middleware/require-legal-acceptance", () => ({
  requireTalentLegalAcceptance: () => (req, res, next) => next(),
  requireAgencyLegalAcceptance: () => (req, res, next) => next(),
}));

describe("Social OAuth & Verification Tests", () => {
  let testUserId;
  let testProfileId;
  let authCookie;

  beforeAll(async () => {
    // Clean up past entries
    await knex("social_accounts").del();
    await knex("profiles").where({ first_name: "OAuth" }).del();
    await knex("users").where({ email: "oauth.test@example.com" }).del();

    // Create test user
    testUserId = uuidv4();
    const passwordHash = await bcrypt.hash("testpassword123", 10);
    await knex("users").insert({
      id: testUserId,
      email: "oauth.test@example.com",
      password_hash: passwordHash,
      role: "TALENT",
    });

    // Create session
    const sessionId = "oauth-session-" + testUserId;
    const sessData = {
      cookie: {
        originalMaxAge: 86400000,
        expires: new Date(Date.now() + 86400000).toISOString(),
        secure: false,
        httpOnly: true,
        path: "/",
      },
      userId: testUserId,
      role: "TALENT",
    };

    await knex("sessions").insert({
      sid: sessionId,
      sess: JSON.stringify(sessData),
      expired: new Date(Date.now() + 86400000).toISOString(),
    });

    const signedId = "s:" + cookieSig.sign(sessionId, config.sessionSecret);
    authCookie = `connect.sid=${encodeURIComponent(signedId)}`;

    // Create mock profile
    testProfileId = uuidv4();
    await knex("profiles").insert({
      id: testProfileId,
      user_id: testUserId,
      slug: "oauth-tester",
      first_name: "OAuth",
      last_name: "Tester",
      city: "Los Angeles, CA",
      phone: "0000000000",
      height_cm: 175,
      bio_raw: "",
      bio_curated: "",
    });
  });

  afterAll(async () => {
    if (testUserId) {
      await knex("social_accounts").where({ profile_id: testProfileId }).del();
      await knex("profiles").where({ id: testProfileId }).del();
      await knex("users").where({ id: testUserId }).del();
      await knex("sessions").where("sess", "like", `%${testUserId}%`).del();
    }
    await knex.destroy();
  });

  test("POST /api/talent/socials/oauth/callback verifies account and sets metrics", async () => {
    const res = await request(app)
      .post("/api/talent/socials/oauth/callback")
      .set("Cookie", authCookie)
      .send({
        platform: "instagram",
        handle: "https://instagram.com/oauth_verified"
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.platform).toBe("instagram");
    expect(res.body.data.handle).toBe("oauth_verified");
    expect(res.body.data.follower_count).toBeGreaterThan(0);
    expect(res.body.data.engagement_rate).toBeGreaterThan(0);

    // Verify database directly
    const account = await knex("social_accounts")
      .where({ profile_id: testProfileId, platform: "instagram" })
      .first();
    expect(account).toBeDefined();
    expect(account.is_oauth_connected).toBe(1); // SQLite returns 1/0 for boolean
    expect(account.handle).toBe("oauth_verified");
    expect(account.url).toBe("https://instagram.com/oauth_verified");
    expect(account.follower_count).toBeGreaterThan(0);
    expect(account.engagement_rate).toBeDefined();
  });

  test("GET /api/talent/profile returns verified flags and metrics", async () => {
    const res = await request(app)
      .get("/api/talent/profile")
      .set("Cookie", authCookie);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    
    const profile = res.body.data?.profile || res.body.profile;
    expect(profile.instagram_handle).toBe("oauth_verified");
    expect(profile.instagram_verified).toBe(true);
    expect(profile.instagram_followers).toBeGreaterThan(0);
    expect(profile.instagram_engagement).toBeGreaterThan(0);
  });

  test("POST /api/talent/socials/oauth/disconnect/:platform resets verified flag and clears metrics", async () => {
    const disconnectRes = await request(app)
      .post("/api/talent/socials/oauth/disconnect/instagram")
      .set("Cookie", authCookie);

    expect(disconnectRes.status).toBe(200);
    expect(disconnectRes.body.success).toBe(true);

    // Verify DB
    const account = await knex("social_accounts")
      .where({ profile_id: testProfileId, platform: "instagram" })
      .first();
    expect(account.is_oauth_connected).toBe(0);
    expect(account.follower_count).toBeNull();
    expect(account.engagement_rate).toBeNull();
    expect(account.metrics_data).toBeNull();

    // Verify GET response
    const profileRes = await request(app)
      .get("/api/talent/profile")
      .set("Cookie", authCookie);
    const profile = profileRes.body.data?.profile || profileRes.body.profile;
    expect(profile.instagram_handle).toBe("oauth_verified"); // retains handle
    expect(profile.instagram_verified).toBe(false); // verification cleared
    expect(profile.instagram_followers).toBeNull();
    expect(profile.instagram_engagement).toBeNull();
  });
});
