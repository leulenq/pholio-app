/**
 * Regression net: a headshot held for moderation review must not dead-end
 * onboarding.
 *
 * The scout upload route deliberately withholds `is_primary` from an image whose
 * moderation verdict is `review`, so the photo cannot surface publicly before a
 * moderator clears it. `/scout/confirm` used to require a primary row and
 * answered `400 {"error":"No primary image set"}` when there wasn't one — so any
 * talent whose photo tripped the heuristic (a clothed selfie in front of a warm
 * wall was enough) could never leave the scout step.
 *
 * Confirm must now advance scout → measurements off the uploaded headshot while
 * leaving the image non-primary and hidden from viewers.
 */

jest.mock("../../src/domains/auth/services/firebase-admin", () => ({
  initializeFirebaseAdmin: jest.fn(),
  verifyIdToken: jest.fn().mockResolvedValue({
    uid: "review-hold-firebase-uid",
    email: "review.hold.test@example.com",
    name: "Review Hold",
    given_name: "Review",
    family_name: "Hold",
  }),
  createUser: jest.fn(),
  getUserByEmail: jest.fn(),
}));

jest.mock("../../src/domains/ai/analyzeProfileImage", () => ({
  masterVisionAnalysis: jest.fn().mockResolvedValue({ confidence: "Low" }),
}));

jest.mock("../../src/shared/lib/image-validator", () => ({
  validate: jest.fn().mockResolvedValue({ valid: true }),
}));

// Force the moderation verdict under test. Everything else in the module (the
// status constants, the visibility helpers the routes rely on) stays real.
jest.mock("../../src/shared/lib/content-moderation", () => {
  const actual = jest.requireActual("../../src/shared/lib/content-moderation");
  return {
    ...actual,
    analyzeImageBuffer: jest.fn().mockResolvedValue({
      status: actual.MODERATION_STATUS.REVIEW,
      reason: "high_skin_ratio",
      flags: { provider: "heuristic", skinRatio: 0.72 },
      provider: "heuristic",
    }),
  };
});

const path = require("path");
const fs = require("fs");
const request = require("supertest");
const knex = require("../../src/shared/db/knex");
const app = require("../../src/app");
const {
  MODERATION_STATUS,
  isImageVisibleToViewer,
} = require("../../src/shared/lib/content-moderation");

const TEST_EMAIL = "review.hold.test@example.com";
const PHOTO_PATH = path.join(__dirname, "..", "fixtures", "test-image.jpg");

async function purgeUserByEmail(email) {
  const existing = await knex("users").where({ email }).first();
  if (!existing) return;
  const profile = await knex("profiles").where({ user_id: existing.id }).first();
  if (profile) {
    for (const table of [
      "moderation_queue",
      "csam_escalations",
      "images",
      "onboarding_signals",
      "onboarding_analytics",
      "ai_profile_analysis",
    ]) {
      await knex(table)
        .where({ profile_id: profile.id })
        .del()
        .catch(() => {});
    }
    await knex("profiles").where({ id: profile.id }).del();
  }
  await knex("sessions")
    .where("sess", "like", `%${existing.id}%`)
    .del()
    .catch(() => {});
  await knex("users").where({ id: existing.id }).del();
}

describe("scout confirm — headshot held for moderation review", () => {
  let agent;
  let sessionCookie;
  let profileId;
  let uploadedImageId;

  beforeAll(async () => {
    await knex.migrate.latest();
    await purgeUserByEmail(TEST_EMAIL);
    expect(fs.existsSync(PHOTO_PATH)).toBe(true);
    agent = request.agent(app);

    const entry = await agent
      .post("/casting/entry")
      .send({
        firebase_token: "mock-firebase-token-review-hold",
        terms_accepted: true,
        privacy_accepted: true,
        date_of_birth: "1998-03-21",
      })
      .expect(200);

    sessionCookie = (entry.headers["set-cookie"] || []).map(
      (c) => c.split(";")[0],
    );
    profileId = entry.body.profile_id;

    await agent
      .post("/casting/gender")
      .set("Cookie", sessionCookie)
      .send({ gender: "Non-Binary" })
      .expect(200);
  });

  afterAll(async () => {
    await purgeUserByEmail(TEST_EMAIL);
  });

  it("stores the flagged headshot without promoting it to primary", async () => {
    const res = await agent
      .post("/casting/scout")
      .set("Cookie", sessionCookie)
      .field("shot_type", "headshot")
      .attach("digi", PHOTO_PATH)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.isPrimary).toBe(false);
    expect(res.body.pending_review).toBe(true);
    uploadedImageId = res.body.imageId;

    const row = await knex("images").where({ id: uploadedImageId }).first();
    expect(Boolean(row.is_primary)).toBe(false);
    expect(row.moderation_status).toBe(MODERATION_STATUS.REVIEW);
    // The whole point of withholding primary: viewers must not see it yet.
    expect(isImageVisibleToViewer(row)).toBe(false);

    const primaries = await knex("images").where({
      profile_id: profileId,
      is_primary: true,
    });
    expect(primaries).toHaveLength(0);
  });

  it("advances scout → measurements instead of 400 'No primary image set'", async () => {
    const res = await agent
      .post("/casting/scout/confirm")
      .set("Cookie", sessionCookie)
      .expect("Content-Type", /json/)
      .expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.redirect).toBe("/onboarding/measurements");
    // Truthful to the client: the step advanced, the photo is still on hold.
    expect(res.body.pending_review).toBe(true);

    const profile = await knex("profiles").where({ id: profileId }).first();
    expect(profile.onboarding_stage).toBe("measurements");

    const state =
      typeof profile.onboarding_state_json === "string"
        ? JSON.parse(profile.onboarding_state_json)
        : profile.onboarding_state_json;
    expect(state.completed_steps).toContain("scout");
    // The held photo is still recorded as the step's answer so a resume
    // rehydrates it rather than asking for the upload again.
    expect(state.step_data.scout.photo_uploaded).toBe(true);
    expect(state.step_data.scout.photo_url).toBeTruthy();

    // Advancing must not have quietly published the held image.
    const row = await knex("images").where({ id: uploadedImageId }).first();
    expect(Boolean(row.is_primary)).toBe(false);
    expect(row.moderation_status).toBe(MODERATION_STATUS.REVIEW);
  });

  it("still blocks confirm when no photo was uploaded at all", async () => {
    await knex("images").where({ profile_id: profileId }).del();

    const res = await agent
      .post("/casting/scout/confirm")
      .set("Cookie", sessionCookie)
      .expect(400);

    expect(res.body.error).toBe("HEADSHOT_REQUIRED");
  });
});
