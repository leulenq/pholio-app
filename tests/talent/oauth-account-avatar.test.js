/**
 * OAuth provider pictures belong on users.avatar_url (account avatar layer).
 * They must never appear in the talent book / images media collection.
 */

jest.mock("../../src/domains/auth/services/firebase-admin", () => ({
  initializeFirebaseAdmin: jest.fn(),
  verifyIdToken: jest.fn(),
  createUser: jest.fn(),
  getUserByEmail: jest.fn(),
}));

const request = require("supertest");
const knex = require("../../src/shared/db/knex");
const app = require("../../src/app");
const { verifyIdToken } = require("../../src/domains/auth/services/firebase-admin");

const PICTURE = "https://lh3.googleusercontent.com/a/oauth-avatar-test";

function cookieFrom(res) {
  const raw = res.headers["set-cookie"];
  if (!raw) return [];
  return (Array.isArray(raw) ? raw : [raw]).map((c) => c.split(";")[0]);
}

async function purgeUserByEmail(email) {
  const user = await knex("users").where({ email }).first();
  if (!user) return;
  const profile = await knex("profiles").where({ user_id: user.id }).first();
  if (profile) {
    await knex("images").where({ profile_id: profile.id }).del().catch(() => {});
    await knex("onboarding_signals").where({ profile_id: profile.id }).del().catch(() => {});
    await knex("profiles").where({ id: profile.id }).del();
  }
  await knex("sessions").where("sess", "like", `%${user.id}%`).del().catch(() => {});
  await knex("users").where({ id: user.id }).del();
}

describe("OAuth account avatar stays out of the talent book", () => {
  const email = "oauth.avatar.book@example.test";

  beforeAll(async () => {
    await knex.migrate.latest();
  });

  afterAll(async () => {
    await purgeUserByEmail(email);
    await knex.destroy();
  });

  beforeEach(async () => {
    await purgeUserByEmail(email);
    verifyIdToken.mockResolvedValue({
      uid: "oauth-avatar-uid",
      email,
      email_verified: true,
      name: "OAuth Avatar",
      given_name: "OAuth",
      family_name: "Avatar",
      picture: PICTURE,
    });
  });

  it("stores Google picture on users.avatar_url and inserts no images row", async () => {
    const agent = request.agent(app);
    const res = await agent.post("/casting/entry").send({
      firebase_token: "fake-token",
      terms_accepted: true,
      privacy_accepted: true,
      date_of_birth: "1996-04-01",
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const user = await knex("users").where({ email }).first();
    expect(user).toBeTruthy();
    expect(user.avatar_url).toBe(PICTURE);

    const profile = await knex("profiles").where({ user_id: user.id }).first();
    expect(profile).toBeTruthy();

    const images = await knex("images").where({ profile_id: profile.id });
    expect(images).toHaveLength(0);

    // Profile API may be gated until onboarding completes; stamp completion so
    // the talent dashboard media payload can be asserted.
    await knex("profiles")
      .where({ id: profile.id })
      .update({ onboarding_completed_at: knex.fn.now() });

    const cookie = cookieFrom(res);
    const profileRes = await agent
      .get("/api/talent/profile")
      .set("Cookie", cookie);

    expect(profileRes.status).toBe(200);
    const payload = profileRes.body.data || profileRes.body;
    expect(payload.user.avatar_url).toBe(PICTURE);
    expect(payload.images || []).toHaveLength(0);
  });
});
