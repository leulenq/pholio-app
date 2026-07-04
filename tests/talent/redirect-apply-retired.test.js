const request = require("supertest");
const cookieSig = require("cookie-signature");
const { v4: uuidv4 } = require("uuid");

const app = require("../../src/app");
const knex = require("../../src/shared/db/knex");
const { recordLegalAcceptance } = require("../../src/shared/lib/legal-acceptance");

const SESSION_SECRET = process.env.SESSION_SECRET || "pholio-secret";

describe("retired redirect-apply endpoint", () => {
  const userId = uuidv4();
  const profileId = uuidv4();
  const agencyId = uuidv4();
  const sessionIds = [];

  beforeAll(async () => {
    await knex.migrate.latest();
    await knex("users").insert({
      id: userId,
      email: `redirect-retired-${userId}@example.com`,
      password_hash: "x",
      role: "TALENT",
    });
    await knex("profiles").insert({
      id: profileId,
      user_id: userId,
      slug: `redirect-retired-${profileId}`,
      first_name: "Redirect",
      last_name: "Retired",
      city: "Test",
      date_of_birth: "1998-01-01",
      gender: "Female",
      height_cm: 170,
      bio_raw: "",
      bio_curated: "",
      onboarding_completed_at: new Date().toISOString(),
    });
    await recordLegalAcceptance(knex, userId, {
      terms: true,
      privacy: true,
    });
  });

  afterAll(async () => {
    if (sessionIds.length > 0) {
      await knex("sessions").whereIn("sid", sessionIds).delete();
    }
    await knex("applications").where({ profile_id: profileId }).delete();
    await knex("profiles").where({ id: profileId }).delete();
    await knex("users").where({ id: userId }).delete();
    await knex.destroy();
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
        email: `redirect-retired-${userId}@example.com`,
      },
      expired: new Date(Date.now() + 86400000).toISOString(),
    });
    const signed = `s:${cookieSig.sign(sid, SESSION_SECRET)}`;
    return (req) =>
      req.set("Cookie", `connect.sid=${encodeURIComponent(signed)}`);
  }

  test("rejects unauthenticated callers", async () => {
    const response = await request(app)
      .post("/api/talent/applications/redirect-apply")
      .set("Accept", "application/json")
      .send({ agencyId, token: "legacy-token" });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe("Authentication required");
  });

  test("returns an explicit gone contract to authenticated talent", async () => {
    const auth = await withSession();
    const response = await auth(
      request(app)
        .post("/api/talent/applications/redirect-apply")
        .set("Accept", "application/json")
        .send({ agencyId, token: "legacy-token" }),
    );

    expect(response.status).toBe(410);
    expect(response.body).toEqual({
      success: false,
      error: "redirect_apply_retired",
      message:
        "Agency invite submissions must be reviewed and sent through the standard submission flow.",
      redirectTo: "/apply",
    });
  });

  test("never creates an application", async () => {
    const before = await knex("applications")
      .where({ profile_id: profileId })
      .count("id as count")
      .first();
    const auth = await withSession();

    const response = await auth(
      request(app)
        .post("/api/talent/applications/redirect-apply")
        .set("Accept", "application/json")
        .send({
          agencyId,
          token: "a".repeat(64),
          submissionPackage: { consentConfirmed: true },
        }),
    );

    const after = await knex("applications")
      .where({ profile_id: profileId })
      .count("id as count")
      .first();

    expect(response.status).toBe(410);
    expect(Number(after.count)).toBe(Number(before.count));
    expect(
      await knex("applications")
        .where({ profile_id: profileId, agency_id: agencyId })
        .first(),
    ).toBeUndefined();
  });
});
