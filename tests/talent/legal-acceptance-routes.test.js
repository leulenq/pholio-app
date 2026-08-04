/**
 * Legal acceptance middleware + settings endpoints
 */

const request = require("supertest");
const cookieSig = require("cookie-signature");
const { v4: uuidv4 } = require("uuid");

const knex = require("../../src/shared/db/knex");
const app = require("../../src/app");

const SESSION_SECRET = require("../../src/config").sessionSecret;

describe("talent legal acceptance enforcement", () => {
  const TALENT_ID = uuidv4();
  const PROFILE_ID = uuidv4();
  const sessionIds = [];

  beforeAll(async () => {
    const now = new Date().toISOString();
    await knex("users").insert({
      id: TALENT_ID,
      email: `legal-gate-${TALENT_ID}@example.com`,
      password_hash: "x",
      role: "TALENT",
      email_verified: true,
    });
    await knex("profiles").insert({
      id: PROFILE_ID,
      user_id: TALENT_ID,
      slug: `legal-${PROFILE_ID}`,
      first_name: "Legal",
      last_name: "Gate",
      city: "Test",
      height_cm: 170,
      bio_raw: "",
      bio_curated: "",
      onboarding_completed_at: now,
    });
  });

  afterAll(async () => {
    if (sessionIds.length) {
      await knex("sessions").whereIn("sid", sessionIds).delete();
    }
    await knex("profiles").where({ id: PROFILE_ID }).delete();
    await knex("users").where({ id: TALENT_ID }).delete();
    await knex.destroy();
  });

  async function withSession() {
    const sid = uuidv4();
    sessionIds.push(sid);
    await knex("sessions").insert({
      sid,
      sess: {
        cookie: { path: "/" },
        userId: TALENT_ID,
        role: "TALENT",
        email: `legal-gate-${TALENT_ID}@example.com`,
      },
      expired: new Date(Date.now() + 86400000).toISOString(),
    });
    const signed = `s:${cookieSig.sign(sid, SESSION_SECRET)}`;
    return (req) => req.set("Cookie", `connect.sid=${encodeURIComponent(signed)}`);
  }

  it("allows GET /api/talent/profile without legal acceptance for dashboard bootstrap", async () => {
    const auth = await withSession();
    const res = await auth(
      request(app).get("/api/talent/profile").set("Accept", "application/json"),
    );
    expect(res.status).toBe(200);
    expect(res.body.data?.user?.id).toBe(TALENT_ID);
  });

  it("blocks profile writes without legal acceptance", async () => {
    const auth = await withSession();
    const res = await auth(
      request(app)
        .put("/api/talent/profile")
        .set("Accept", "application/json")
        .send({ first_name: "Blocked" }),
    );
    expect(res.status).toBe(403);
    expect(res.body.error).toBe("LEGAL_ACCEPTANCE_REQUIRED");
  });

  it("allows legal-status and records acceptance", async () => {
    const auth = await withSession();
    const statusRes = await auth(
      request(app).get("/api/talent/settings/legal-status").set("Accept", "application/json"),
    );
    expect(statusRes.status).toBe(200);
    expect(statusRes.body.data.needsAcceptance).toBe(true);

    const acceptRes = await auth(
      request(app)
        .post("/api/talent/settings/legal-acceptance")
        .set("Accept", "application/json")
        .send({ terms_accepted: true, privacy_accepted: true }),
    );
    expect(acceptRes.status).toBe(200);

    const profileRes = await auth(
      request(app).get("/api/talent/profile").set("Accept", "application/json"),
    );
    expect(profileRes.status).toBe(200);
  });
});
