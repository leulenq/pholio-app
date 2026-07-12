const request = require("supertest");
const cookieSig = require("cookie-signature");
const { v4: uuidv4 } = require("uuid");

const knex = require("../../src/shared/db/knex");
const app = require("../../src/app");
const { recordLegalAcceptance } = require("../../src/shared/lib/legal-acceptance");

const SESSION_SECRET = require("../../src/config").sessionSecret;

describe("talent media bulk operations and classification status", () => {
  const adultUserId = uuidv4();
  const adultProfileId = uuidv4();
  const minorUserId = uuidv4();
  const minorProfileId = uuidv4();

  const adultImgId1 = uuidv4();
  const adultImgId2 = uuidv4();
  const minorImgId = uuidv4();

  const sessionIds = [];

  beforeAll(async () => {
    await knex.migrate.latest();

    // 1. Setup adult user
    await knex("users").insert({
      id: adultUserId,
      email: `media-bulk-adult-${adultUserId}@example.com`,
      password_hash: "x",
      role: "TALENT",
    });
    await knex("profiles").insert({
      id: adultProfileId,
      user_id: adultUserId,
      slug: `media-bulk-adult-${adultProfileId}`,
      first_name: "Adult",
      last_name: "Talent",
      city: "Test",
      date_of_birth: "1990-01-01", // Adult
      gender: "Male",
      height_cm: 180,
      bio_raw: "",
      bio_curated: "",
      onboarding_completed_at: new Date().toISOString(),
    });
    await recordLegalAcceptance(knex, adultUserId, { terms: true, privacy: true });

    // 2. Setup minor user (unconsented)
    await knex("users").insert({
      id: minorUserId,
      email: `media-bulk-minor-${minorUserId}@example.com`,
      password_hash: "x",
      role: "TALENT",
    });
    await knex("profiles").insert({
      id: minorProfileId,
      user_id: minorUserId,
      slug: `media-bulk-minor-${minorProfileId}`,
      first_name: "Minor",
      last_name: "Talent",
      city: "Test",
      date_of_birth: "2015-01-01", // Minor
      gender: "Female",
      height_cm: 140,
      bio_raw: "",
      bio_curated: "",
      onboarding_completed_at: new Date().toISOString(),
    });
    await recordLegalAcceptance(knex, minorUserId, { terms: true, privacy: true });

    // 3. Setup images for adult
    await knex("images").insert([
      {
        id: adultImgId1,
        profile_id: adultProfileId,
        path: `/uploads/${adultImgId1}.jpg`,
        public_url: `/uploads/${adultImgId1}.jpg`,
        image_type: "digital",
        shot_type: "headshot",
        status: "active",
        sort: 1,
        is_primary: true,
      },
      {
        id: adultImgId2,
        profile_id: adultProfileId,
        path: `/uploads/${adultImgId2}.jpg`,
        public_url: `/uploads/${adultImgId2}.jpg`,
        image_type: "digital",
        shot_type: "profile",
        status: "active",
        sort: 2,
        is_primary: false,
      },
    ]);

    // 4. Setup image for minor
    await knex("images").insert({
      id: minorImgId,
      profile_id: minorProfileId,
      path: `/uploads/${minorImgId}.jpg`,
      public_url: `/uploads/${minorImgId}.jpg`,
      image_type: "digital",
      shot_type: "headshot",
      status: "active",
      sort: 1,
      is_primary: true,
      exclude_from_public: true,
      exclude_from_agency: true,
    });
  });

  afterAll(async () => {
    if (sessionIds.length) {
      await knex("sessions").whereIn("sid", sessionIds).delete();
    }
    await knex("images").whereIn("profile_id", [adultProfileId, minorProfileId]).delete();
    await knex("profiles").whereIn("id", [adultProfileId, minorProfileId]).delete();
    await knex("users").whereIn("id", [adultUserId, minorUserId]).delete();
    await knex.destroy();
  });

  async function withSession(uid, email) {
    const sid = uuidv4();
    sessionIds.push(sid);
    await knex("sessions").insert({
      sid,
      sess: {
        cookie: { path: "/" },
        userId: uid,
        role: "TALENT",
        email,
      },
      expired: new Date(Date.now() + 86400000).toISOString(),
    });
    const signed = `connect.sid=s:${cookieSig.sign(sid, SESSION_SECRET)}`;
    return (req) => req.set("Cookie", signed);
  }

  test("GET /api/talent/media/classification-status returns image list", async () => {
    const auth = await withSession(adultUserId, `media-bulk-adult-${adultUserId}@example.com`);
    const res = await auth(
      request(app).get("/api/talent/media/classification-status")
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.images)).toBe(true);
    expect(res.body.images.length).toBe(2);

    const img1 = res.body.images.find((i) => i.id === adultImgId1);
    expect(img1).toBeDefined();
    expect(img1.image_type).toBe("digital");
    expect(img1.shot_type).toBe("headshot");
    expect(img1.classification_status).toBe("ready");
  });

  test("POST /api/talent/media/bulk-update updates multiple images", async () => {
    const auth = await withSession(adultUserId, `media-bulk-adult-${adultUserId}@example.com`);
    const res = await auth(
      request(app)
        .post("/api/talent/media/bulk-update")
        .send({
          imageIds: [adultImgId1, adultImgId2],
          patch: {
            image_type: "tearsheet",
          },
        })
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const updatedImages = await knex("images")
      .whereIn("id", [adultImgId1, adultImgId2])
      .select("id", "image_type");

    expect(updatedImages[0].image_type).toBe("tearsheet");
    expect(updatedImages[1].image_type).toBe("tearsheet");
  });

  test("POST /api/talent/media/bulk-update enforces minor safety check", async () => {
    const auth = await withSession(minorUserId, `media-bulk-minor-${minorUserId}@example.com`);
    
    // Attempting to change minor headshot to sensitive body framing (full_length)
    // while keeping it public/agency-visible (exclude_from_public/exclude_from_agency: false)
    const res = await auth(
      request(app)
        .post("/api/talent/media/bulk-update")
        .send({
          imageIds: [minorImgId],
          patch: {
            shot_type: "full_length",
            exclude_from_public: false,
            exclude_from_agency: false,
          },
        })
    );

    // Should return 403 Forbidden since unconsented minor body imagery exposure is locked
    expect(res.status).toBe(403);
    expect(res.body.success).toBe(false);
    expect(res.body.code).toBe("MINOR_CONSENT_REQUIRED");
  });

  test("POST /api/talent/media/bulk-delete deletes multiple images", async () => {
    const auth = await withSession(adultUserId, `media-bulk-adult-${adultUserId}@example.com`);
    const res = await auth(
      request(app)
        .post("/api/talent/media/bulk-delete")
        .send({
          imageIds: [adultImgId1, adultImgId2],
        })
    );

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    const remainingImages = await knex("images")
      .whereIn("id", [adultImgId1, adultImgId2]);
    expect(remainingImages.length).toBe(0);
  });
});
