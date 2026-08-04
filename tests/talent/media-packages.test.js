const request = require("supertest");
const cookieSig = require("cookie-signature");
const { v4: uuidv4 } = require("uuid");

const knex = require("../../src/shared/db/knex");
const app = require("../../src/app");
const { recordLegalAcceptance } = require("../../src/shared/lib/legal-acceptance");

const SESSION_SECRET = require("../../src/config").sessionSecret;

describe("talent media submission packages endpoint", () => {
  const userId = uuidv4();
  const profileId = uuidv4();
  const imageId = uuidv4();
  const sessionIds = [];

  beforeAll(async () => {
    await knex.migrate.latest();
    await knex("users").insert({
      id: userId,
      email: `media-pkg-${userId}@example.com`,
      password_hash: "x",
      role: "TALENT",
      email_verified: true,
    });
    await knex("profiles").insert({
      id: profileId,
      user_id: userId,
      slug: `media-pkg-${profileId}`,
      first_name: "Media",
      last_name: "Packager",
      city: "Test",
      date_of_birth: "1998-01-01",
      gender: "Female",
      height_cm: 170,
      phone: "555-0100",
      bio_raw: "",
      bio_curated: "",
      onboarding_completed_at: new Date().toISOString(),
    });
    await recordLegalAcceptance(knex, userId, { terms: true, privacy: true });

    await knex("images").insert({
      id: imageId,
      profile_id: profileId,
      path: `/uploads/${imageId}.jpg`,
      public_url: `/uploads/${imageId}.jpg`,
      image_type: "digital",
      shot_type: "headshot",
      status: "active",
      captured_at: new Date().toISOString(),
      sort: 0,
    });
  });

  afterAll(async () => {
    if (sessionIds.length) {
      await knex("sessions").whereIn("sid", sessionIds).delete();
    }
    await knex("talent_submission_packages").where({ profile_id: profileId }).delete();
    await knex("images").where({ profile_id: profileId }).delete();
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
        email: `media-pkg-${userId}@example.com`,
      },
      expired: new Date(Date.now() + 86400000).toISOString(),
    });
    const signed = `connect.sid=s:${cookieSig.sign(sid, SESSION_SECRET)}`;
    return (req) => req.set("Cookie", signed);
  }

  test("POST /api/talent/media/submission-packages sets retention_expires_at", async () => {
    const auth = await withSession();
    const res = await auth(
      request(app)
        .post("/api/talent/media/submission-packages")
        .send({
          imageIds: [imageId],
          label: "Test Portfolio Package",
          includeCompCard: false,
          notes: "A simple portfolio test package",
        })
    );

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);

    const packageRow = await knex("talent_submission_packages")
      .where({ profile_id: profileId })
      .first();

    expect(packageRow).toBeDefined();
    expect(packageRow.retention_expires_at).toBeTruthy();

    const expiryDate = new Date(packageRow.retention_expires_at);
    const expectedExpiry = new Date();
    expectedExpiry.setUTCMonth(expectedExpiry.getUTCMonth() + 24);

    // Difference in milliseconds between calculated and expected expiry should be very small
    const diff = Math.abs(expiryDate.getTime() - expectedExpiry.getTime());
    expect(diff).toBeLessThan(1000 * 60 * 5); // under 5 minutes buffer
  });
});
