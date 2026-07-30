/**
 * Moderation queue API — auth, listing, and approve/reject actions.
 */

const request = require("supertest");
const cookieSig = require("cookie-signature");
const { v4: uuidv4 } = require("uuid");
const {
  MODERATION_STATUS,
  MODERATION_QUEUE_STATUS,
} = require("../../src/shared/lib/content-moderation");

const knex = require("../../src/shared/db/knex");
const app = require("../../src/app");

const SESSION_SECRET = require("../../src/config").sessionSecret;

describe("moderation queue API", () => {
  const MODERATOR_ID = uuidv4();
  const TALENT_ID = uuidv4();
  const PROFILE_ID = uuidv4();
  const IMAGE_ID = uuidv4();
  const QUEUE_ID = uuidv4();
  const sessionIds = [];

  beforeAll(async () => {
    // Own the schema rather than inheriting whatever the previously-run suite
    // left in the shared SQLite file. Suites that point DATABASE_URL at their
    // own database (and delete it on teardown) otherwise leave this one reading
    // a path with no tables — or no file at all.
    await knex.migrate.latest();

    const now = new Date().toISOString();
    await knex("users").insert([
      {
        id: MODERATOR_ID,
        email: "mod@pholio.studio",
        password_hash: "x",
        role: "TALENT",
      },
      {
        id: TALENT_ID,
        email: `talent-queue-${TALENT_ID}@example.com`,
        password_hash: "x",
        role: "TALENT",
      },
    ]);
    await knex("profiles").insert({
      id: PROFILE_ID,
      user_id: TALENT_ID,
      slug: `queue-${PROFILE_ID}`,
      first_name: "Queue",
      last_name: "Tester",
      city: "Test",
      height_cm: 170,
      bio_raw: "",
      bio_curated: "",
      onboarding_completed_at: now,
    });
    await knex("images").insert({
      id: IMAGE_ID,
      profile_id: PROFILE_ID,
      path: "/uploads/queue-test.png",
      moderation_status: MODERATION_STATUS.REVIEW,
    });
    await knex("moderation_queue").insert({
      id: QUEUE_ID,
      image_id: IMAGE_ID,
      profile_id: PROFILE_ID,
      status: MODERATION_QUEUE_STATUS.PENDING,
      flags: JSON.stringify({ skin_tone_ratio: 0.7 }),
      created_at: now,
    });
  }, 30000);

  afterAll(async () => {
    await knex("moderation_queue").where({ id: QUEUE_ID }).delete();
    await knex("images").where({ id: IMAGE_ID }).delete();
    await knex("profiles").where({ id: PROFILE_ID }).delete();
    await knex("users").whereIn("id", [MODERATOR_ID, TALENT_ID]).delete();
    if (sessionIds.length) {
      await knex("sessions").whereIn("sid", sessionIds).delete();
    }
    await knex.destroy();
  });

  async function withSession(userId, role, email) {
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
        userId,
        role,
        email,
      },
      expired: new Date(Date.now() + 86400000).toISOString(),
    });
    const signed = `s:${cookieSig.sign(sid, SESSION_SECRET)}`;
    return (req) => req.set("Cookie", `connect.sid=${encodeURIComponent(signed)}`);
  }

  it("GET /api/moderation/queue returns 401 when unauthenticated", async () => {
    const res = await request(app)
      .get("/api/moderation/queue")
      .set("Accept", "application/json");
    expect(res.status).toBe(401);
  });

  it("GET /api/moderation/queue returns 403 for non-moderator", async () => {
    const auth = await withSession(
      TALENT_ID,
      "TALENT",
      `talent-queue-${TALENT_ID}@example.com`,
    );
    const res = await auth(
      request(app).get("/api/moderation/queue").set("Accept", "application/json"),
    );
    expect(res.status).toBe(403);
  });

  it("GET /api/moderation/queue lists pending items for moderators", async () => {
    const auth = await withSession(MODERATOR_ID, "TALENT", "mod@pholio.studio");
    const res = await auth(
      request(app).get("/api/moderation/queue").set("Accept", "application/json"),
    );
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    const item = res.body.data.find((row) => row.id === QUEUE_ID);
    expect(item).toMatchObject({
      id: QUEUE_ID,
      imageId: IMAGE_ID,
      status: MODERATION_QUEUE_STATUS.PENDING,
    });
    expect(item.flags).toMatchObject({ skin_tone_ratio: 0.7 });
  });

  it("PATCH /api/moderation/queue/:id rejects invalid action", async () => {
    const auth = await withSession(MODERATOR_ID, "TALENT", "mod@pholio.studio");
    const res = await auth(
      request(app)
        .patch(`/api/moderation/queue/${QUEUE_ID}`)
        .set("Accept", "application/json")
        .send({ action: "maybe" }),
    );
    expect(res.status).toBe(400);
  });

  it("PATCH /api/moderation/queue/:id approves and updates image moderation_status", async () => {
    const auth = await withSession(MODERATOR_ID, "TALENT", "mod@pholio.studio");
    const res = await auth(
      request(app)
        .patch(`/api/moderation/queue/${QUEUE_ID}`)
        .set("Accept", "application/json")
        .send({ action: "approve", note: "looks fine" }),
    );
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({
      id: QUEUE_ID,
      action: "approve",
      queueStatus: MODERATION_QUEUE_STATUS.APPROVED,
      imageStatus: MODERATION_STATUS.APPROVED,
    });

    const image = await knex("images").where({ id: IMAGE_ID }).first();
    expect(image.moderation_status).toBe(MODERATION_STATUS.APPROVED);
  });
});
