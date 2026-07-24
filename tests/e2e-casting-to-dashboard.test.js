/**
 * E2E Test: Casting Call → Dashboard (Full Flow)
 *
 * Exercises the live talent onboarding contract end-to-end and acts as the
 * regression net for the casting-flow resilience work:
 *
 *   entry → birthdate → gender → scout (upload + confirm) → measurements
 *         → profile → done
 *
 * Specifically guards:
 *   - entry leaves the user on the `birthdate` step (not `gender`/`scout`)
 *   - the `birthdate` endpoint persists DOB AND advances `birthdate → gender`
 *   - the `gender` endpoint persists gender AND advances `gender → scout`
 *   - /status rehydrates persisted answers (gender, measurements) for resume
 *   - onboarding completes and the profile persists (name, gender, dob, height,
 *     measurements, city)
 *   - the state-integrity gate blocks skipping scout + measurements
 *
 * Test User: Phoenix Test (phoenix.e2e.test@example.com)
 */

// Mock Firebase Admin SDK FIRST (before any imports). The casting entry route
// verifies the OAuth token through this module via the Google provider helper.
jest.mock("../src/domains/auth/services/firebase-admin", () => ({
  initializeFirebaseAdmin: jest.fn(),
  // Includes `picture` on purpose: entry must park this on users.avatar_url
  // (account avatar), never as a book/images primary. Scout upload becomes the
  // only primary casting photo.
  verifyIdToken: jest.fn().mockResolvedValue({
    uid: "phoenix-firebase-uid-e2e",
    email: "phoenix.e2e.test@example.com",
    name: "Phoenix Test",
    given_name: "Phoenix",
    family_name: "Test",
    picture: "https://example.com/phoenix-avatar.jpg",
  }),
  createUser: jest.fn(),
  getUserByEmail: jest.fn(),
}));

// Mock the master vision analysis (defensive — the upload path may consult it).
jest.mock("../src/domains/ai/analyzeProfileImage", () => ({
  masterVisionAnalysis: jest.fn().mockResolvedValue({ confidence: "Low" }),
}));

// Mock Image Validator (defensive — upload path may consult it)
jest.mock("../src/shared/lib/image-validator", () => ({
  validate: jest.fn().mockResolvedValue({ valid: true }),
}));

// Now import modules that depend on mocks
const request = require("supertest");
const knex = require("../src/shared/db/knex");
const app = require("../src/app");
const path = require("path");
const fs = require("fs");

const isPostgres =
  knex.client.config.client === "pg" ||
  knex.client.config.client === "postgresql";

// A minimal valid JPEG fixture shared across suites in this file.
function ensureFixture() {
  const fixturesDir = path.join(__dirname, "fixtures");
  if (!fs.existsSync(fixturesDir)) {
    fs.mkdirSync(fixturesDir, { recursive: true });
  }
  const testImagePath = path.join(fixturesDir, "test-image.jpg");
  if (!fs.existsSync(testImagePath)) {
    const buffer = Buffer.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xdb, 0x00, 0x43,
      0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
      0x09, 0x08, 0x0a, 0x0c, 0x14, 0x0d, 0x0c, 0x0b, 0x0b, 0x0c, 0x19, 0x12,
      0x13, 0x0f, 0x14, 0x1d, 0x1a, 0x1f, 0x1e, 0x1d, 0x1a, 0x1c, 0x1c, 0x20,
      0x24, 0x2e, 0x27, 0x20, 0x22, 0x2c, 0x23, 0x1c, 0x1c, 0x28, 0x37, 0x29,
      0x2c, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1f, 0x27, 0x39, 0x3d, 0x38, 0x32,
      0x3c, 0x2e, 0x33, 0x34, 0x32, 0xff, 0xc0, 0x00, 0x0b, 0x08, 0x00, 0x01,
      0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x14, 0x00, 0x01,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x03, 0xff, 0xc4, 0x00, 0x14, 0x10, 0x01, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00,
      0x37, 0xff, 0xd9,
    ]);
    fs.writeFileSync(testImagePath, buffer);
  }
  return testImagePath;
}

// Remove any user/profile/child rows left over from a prior aborted run.
async function purgeUserByEmail(email) {
  const existing = await knex("users").where({ email }).first();
  if (!existing) return;
  const profile = await knex("profiles")
    .where({ user_id: existing.id })
    .first();
  if (profile) {
    await knex("images").where({ profile_id: profile.id }).del().catch(() => {});
    await knex("ai_profile_analysis")
      .where({ profile_id: profile.id })
      .del()
      .catch(() => {});
    await knex("onboarding_signals")
      .where({ profile_id: profile.id })
      .del()
      .catch(() => {});
    await knex("onboarding_analytics")
      .where({ profile_id: profile.id })
      .del()
      .catch(() => {});
    await knex("profiles").where({ id: profile.id }).del();
  }
  await knex("sessions")
    .where("sess", "like", `%${existing.id}%`)
    .del()
    .catch(() => {});
  await knex("users").where({ id: existing.id }).del();
}

describe("E2E: Casting Call → Dashboard Flow", () => {
  let agent;
  let testUserId;
  let testProfileId;
  // Session cookie captured from the entry response and forwarded on every
  // subsequent request. Supertest addresses the app as 127.0.0.1 while the
  // session cookie carries Domain=localhost, so the agent's jar would drop it;
  // forwarding the raw connect.sid explicitly sidesteps that mismatch.
  let sessionCookie;

  const testEmail = "phoenix.e2e.test@example.com";
  const firebaseToken = "mock-firebase-token-phoenix-e2e";

  // Data submitted during the flow
  const flowData = {
    firstName: "Phoenix",
    lastName: "Test",
    email: testEmail,

    dateOfBirth: "2000-05-15", // adult — unlocks sensitive measurement fields

    gender: "Non-Binary",

    photoPath: path.join(__dirname, "fixtures", "test-image.jpg"),

    // User confirms/edits measurements on the measurements step.
    // weight is intentionally excluded (no longer collected at intake).
    // hair/eye/shoe are optional NON-SENSITIVE stats collected for all talent.
    confirmedMeasurements: {
      height_cm: 180,
      bust_cm: 91,
      waist_cm: 70,
      hips_cm: 96,
      hair_color: "Brown",
      eye_color: "Green",
      shoe_size: 42,
      shoe_region: "EU",
    },

    city: "Phoenix, AZ",
  };

  // Helper: read the profile's parsed onboarding state JSON
  async function readState() {
    const profile = await knex("profiles").where({ id: testProfileId }).first();
    const raw = profile.onboarding_state_json;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  }

  beforeAll(async () => {
    ensureFixture();
    await knex.migrate.latest();
    await purgeUserByEmail(testEmail);
    agent = request.agent(app);
  });

  afterAll(async () => {
    if (testUserId) {
      if (!testProfileId) {
        const profile = await knex("profiles")
          .where({ user_id: testUserId })
          .first();
        testProfileId = profile?.id;
      }
      if (testProfileId) {
        await knex("images")
          .where({ profile_id: testProfileId })
          .del()
          .catch(() => {});
        await knex("ai_profile_analysis")
          .where({ profile_id: testProfileId })
          .del()
          .catch(() => {});
        await knex("onboarding_signals")
          .where({ profile_id: testProfileId })
          .del()
          .catch(() => {});
        await knex("onboarding_analytics")
          .where({ profile_id: testProfileId })
          .del()
          .catch(() => {});
        await knex("profiles").where({ id: testProfileId }).del();
      }
      await knex("sessions")
        .where("sess", "like", `%${testUserId}%`)
        .del()
        .catch(() => {});
      await knex("users").where({ id: testUserId }).del();
    }
  });

  // ============================================
  // STEP 1: ENTRY (Account Creation → birthdate step)
  // ============================================
  describe("Step 1: Casting Entry", () => {
    it("creates the account with adult DOB evidence and parks on gender", async () => {
      const res = await agent
        .post("/casting/entry")
        .send({
          firebase_token: firebaseToken,
          terms_accepted: true,
          privacy_accepted: true,
          date_of_birth: flowData.dateOfBirth,
        })
        .expect("Content-Type", /json/)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.user_id).toBeDefined();
      expect(res.body.profile_id).toBeDefined();
      expect(res.body.has_oauth_data).toBe(true);
      // Live contract: adult DOB is required at entry; next step is gender.
      expect(res.body.next_step).toBe("gender");

      // Capture the session for all subsequent authenticated requests.
      sessionCookie = (res.headers["set-cookie"] || []).map(
        (c) => c.split(";")[0],
      );
      expect(sessionCookie.length).toBeGreaterThan(0);

      testUserId = res.body.user_id;
      testProfileId = res.body.profile_id;

      const user = await knex("users").where({ id: testUserId }).first();
      expect(user.email).toBe(testEmail);
      expect(user.role).toBe("TALENT");
      expect(user.firebase_uid).toBe("phoenix-firebase-uid-e2e");
      // Google picture lands on the account avatar layer only.
      expect(user.avatar_url).toBe("https://example.com/phoenix-avatar.jpg");
      const seededImages = await knex("images").where({ profile_id: testProfileId });
      expect(seededImages).toHaveLength(0);

      const profile = await knex("profiles")
        .where({ id: testProfileId })
        .first();
      expect(profile.user_id).toBe(testUserId);
      expect(profile.first_name).toBe("Phoenix");
      expect(profile.last_name).toBe("Test");
      expect(profile.onboarding_stage).toBe("gender");
      expect(String(profile.date_of_birth).slice(0, 10)).toBe(flowData.dateOfBirth);
      expect(profile.visibility_mode).toBe("private_intake");
      // SQLite stores booleans as 0/1 — assert truthiness so the suite can run
      // against a local SQLite copy as well as PostgreSQL.
      expect(Boolean(profile.services_locked)).toBe(true);
    });

    it("establishes a session reporting the gender step", async () => {
      const res = await agent
        .get("/casting/status")
        .set("Cookie", sessionCookie)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.state.current_step).toBe("gender");
      // The status user block drives the client's resume-time inbox beat.
      expect(res.body.user.email).toBe(testEmail);
      expect(res.body.user.email_verified).toBe(false);
      expect(res.body.user.auth_method).toBe("google");
    });

    it("syncs email_verified from a verified token claim (inbox beat)", async () => {
      const firebaseAdmin = require("../src/domains/auth/services/firebase-admin");

      // A token whose uid does NOT match the signed-in user is rejected and
      // must not flip the flag.
      firebaseAdmin.verifyIdToken.mockResolvedValueOnce({
        uid: "someone-else-uid",
        email: "other@example.com",
        email_verified: true,
      });
      await agent
        .post("/casting/email-verified")
        .set("Cookie", sessionCookie)
        .send({ firebase_token: "mock-token-wrong-user" })
        .expect(403);
      let user = await knex("users").where({ id: testUserId }).first();
      expect(Boolean(user.email_verified)).toBe(false);

      // The user's own refreshed token with a verified claim records it.
      firebaseAdmin.verifyIdToken.mockResolvedValueOnce({
        uid: "phoenix-firebase-uid-e2e",
        email: testEmail,
        email_verified: true,
      });
      const res = await agent
        .post("/casting/email-verified")
        .set("Cookie", sessionCookie)
        .send({ firebase_token: "mock-token-verified" })
        .expect(200);
      expect(res.body.email_verified).toBe(true);

      user = await knex("users").where({ id: testUserId }).first();
      expect(Boolean(user.email_verified)).toBe(true);

      const status = await agent
        .get("/casting/status")
        .set("Cookie", sessionCookie)
        .expect(200);
      expect(status.body.user.email_verified).toBe(true);
    });
  });

  // ============================================
  // STEP 2: BIRTHDATE (already recorded at entry)
  // ============================================
  describe("Step 2: Birthdate", () => {
    it("keeps the established adult DOB immutable on legacy birthdate replay", async () => {
      const replay = await agent
        .post("/casting/birthdate")
        .set("Cookie", sessionCookie)
        .send({ date_of_birth: "1991-07-18" })
        .expect("Content-Type", /json/)
        .expect(409);

      expect(replay.body.error).toBe("DOB_IMMUTABLE");

      const profile = await knex("profiles")
        .where({ id: testProfileId })
        .first();
      expect(String(profile.date_of_birth).slice(0, 10)).toBe(flowData.dateOfBirth);
      expect(profile.onboarding_stage).toBe("gender");

      const state = await readState();
      expect(state.completed_steps).toContain("entry");
    });
  });

  // ============================================
  // STEP 3: GENDER (persist + advance → scout)
  // ============================================
  describe("Step 3: Gender", () => {
    it("persists gender and advances the state machine to scout", async () => {
      const res = await agent
        .post("/casting/gender")
        .set("Cookie", sessionCookie)
        .send({ gender: flowData.gender })
        .expect("Content-Type", /json/)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.next_step).toBe("scout");

      const profile = await knex("profiles")
        .where({ id: testProfileId })
        .first();
      expect(profile.gender).toBe(flowData.gender);
      expect(profile.onboarding_stage).toBe("scout");

      const state = await readState();
      expect(state.completed_steps).toContain("gender");
    });

    it("rehydrates the persisted gender via /status (resume contract)", async () => {
      const res = await agent
        .get("/casting/status")
        .set("Cookie", sessionCookie)
        .expect(200);
      expect(res.body.state.current_step).toBe("scout");
      expect(res.body.profile.gender).toBe(flowData.gender);
    });
  });

  // ============================================
  // STEP 4: SCOUT (upload + confirm)
  // ============================================
  describe("Step 4: Scout (Photo Upload + Confirm)", () => {
    it("uploads a primary photo without advancing the step", async () => {
      const res = await agent
        .post("/casting/scout")
        .set("Cookie", sessionCookie)
        .field("shot_type", "headshot")
        .attach("digi", flowData.photoPath)
        .expect("Content-Type", /json/)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.imageId).toBeDefined();
      // Local scout upload is the sole book primary; OAuth picture stays off images.
      expect(res.body.isPrimary).toBe(true);
      expect(res.body.photo_url).toBeDefined();

      const imageRows = await knex("images")
        .where({ profile_id: testProfileId })
        .select("id", "absolute_path", "is_primary", "path");
      expect(imageRows).toHaveLength(1);
      expect(imageRows[0].id).toBe(res.body.imageId);
      expect(Boolean(imageRows[0].is_primary)).toBe(true);
      expect(imageRows[0].absolute_path).toBeTruthy();
      expect(String(imageRows[0].path || "")).not.toMatch(/^https?:\/\//i);

      const accountUser = await knex("users").where({ id: testUserId }).first();
      expect(accountUser.avatar_url).toBe("https://example.com/phoenix-avatar.jpg");

      // Upload alone does not transition the state machine.
      const profile = await knex("profiles")
        .where({ id: testProfileId })
        .first();
      expect(profile.onboarding_stage).toBe("scout");
    });

    it("confirms the photo and advances scout → measurements", async () => {
      const res = await agent
        .post("/casting/scout/confirm")
        .set("Cookie", sessionCookie)
        .expect("Content-Type", /json/)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.next_steps).toBeDefined();

      const profile = await knex("profiles")
        .where({ id: testProfileId })
        .first();
      expect(profile.onboarding_stage).toBe("measurements");
      expect(profile.analysis_status).toBe("complete");

      const state = await readState();
      expect(state.completed_steps).toContain("scout");
    });
  });

  // ============================================
  // STEP 5: MEASUREMENTS (confirm/edit → profile)
  // ============================================
  describe("Step 5: Measurements", () => {
    it("saves confirmed measurements and advances to profile", async () => {
      const res = await agent
        .post("/casting/measurements")
        .set("Cookie", sessionCookie)
        .send(flowData.confirmedMeasurements)
        .expect("Content-Type", /json/)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.next_step).toBe("profile");

      const profile = await knex("profiles")
        .where({ id: testProfileId })
        .first();
      expect(Number(profile.height_cm)).toBe(
        flowData.confirmedMeasurements.height_cm,
      );
      expect(Number(profile.bust_cm)).toBe(
        flowData.confirmedMeasurements.bust_cm,
      );
      expect(Number(profile.waist_cm)).toBe(
        flowData.confirmedMeasurements.waist_cm,
      );
      expect(Number(profile.hips_cm)).toBe(
        flowData.confirmedMeasurements.hips_cm,
      );
      expect(profile.onboarding_stage).toBe("profile");

      // Optional non-sensitive appearance stats persist for all talent.
      expect(profile.hair_color).toBe("Brown");
      expect(profile.eye_color).toBe("Green");
      expect(Number(profile.shoe_size)).toBe(42);
      expect(profile.shoe_region).toBe("EU");

      const state = await readState();
      expect(state.completed_steps).toContain("measurements");
    });

    it("rehydrates persisted measurements via /status (resume contract)", async () => {
      const res = await agent
        .get("/casting/status")
        .set("Cookie", sessionCookie)
        .expect(200);
      expect(res.body.state.current_step).toBe("profile");
      expect(Number(res.body.profile.height_cm)).toBe(
        flowData.confirmedMeasurements.height_cm,
      );
      expect(Number(res.body.profile.waist_cm)).toBe(
        flowData.confirmedMeasurements.waist_cm,
      );
      // Optional non-sensitive stats round-trip through /status for resume.
      expect(res.body.profile.hair_color).toBe("Brown");
      expect(res.body.profile.eye_color).toBe("Green");
      expect(Number(res.body.profile.shoe_size)).toBe(42);
      expect(res.body.profile.shoe_region).toBe("EU");
    });
  });

  // ============================================
  // STEP 6: PROFILE (location → done)
  // ============================================
  describe("Step 6: Profile Details", () => {
    it("saves location and completes onboarding", async () => {
      const res = await agent
        .post("/casting/profile")
        .set("Cookie", sessionCookie)
        .send({ city: flowData.city })
        .expect("Content-Type", /json/)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.next_step).toBe("done");

      const profile = await knex("profiles")
        .where({ id: testProfileId })
        .first();
      expect(profile.city).toBe(flowData.city);
      expect(profile.gender.toLowerCase()).toBe(flowData.gender.toLowerCase());
      expect(profile.onboarding_stage).toBe("done");
      expect(profile.onboarding_completed_at).toBeTruthy();
    });
  });

  // ============================================
  // STEP 7: COMPLETION (idempotent safety net)
  // ============================================
  describe("Step 7: Completion", () => {
    it("marks the casting call complete and points at the dashboard", async () => {
      const res = await agent
        .post("/casting/complete")
        .set("Cookie", sessionCookie)
        .expect("Content-Type", /json/)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.redirect_url).toBe("/dashboard/talent");

      const profile = await knex("profiles")
        .where({ id: testProfileId })
        .first();
      expect(profile.onboarding_stage).toBe("done");
      expect(profile.onboarding_completed_at).toBeTruthy();
    });

    it("reports the terminal `done` state via /status", async () => {
      const res = await agent
        .get("/casting/status")
        .set("Cookie", sessionCookie)
        .expect(200);
      expect(res.body.state.current_step).toBe("done");
    });
  });

  // ============================================
  // STEP 8: DASHBOARD DATA INTEGRITY
  // ============================================
  describe("Step 8: Dashboard Data Verification", () => {
    it("returns the complete, accurate profile via the talent API", async () => {
      const res = await agent
        .get("/api/talent/profile")
        .set("Cookie", sessionCookie)
        .expect("Content-Type", /json/)
        .expect(200);

      expect(res.body.success).toBe(true);
      const profile = res.body.data.profile;

      expect(profile.city).toBe(flowData.city);
      expect(profile.gender?.toLowerCase()).toBe(flowData.gender.toLowerCase());

      expect(Number(profile.height_cm)).toBe(
        flowData.confirmedMeasurements.height_cm,
      );

      const bust = profile.bust ?? profile.bust_cm;
      const waist = profile.waist ?? profile.waist_cm;
      const hips = profile.hips ?? profile.hips_cm;
      expect(Number(bust)).toBe(flowData.confirmedMeasurements.bust_cm);
      expect(Number(waist)).toBe(flowData.confirmedMeasurements.waist_cm);
      expect(Number(hips)).toBe(flowData.confirmedMeasurements.hips_cm);

      // Onboarding gating status reflects completion
      expect(res.body.data.onboarding?.isComplete).toBe(true);
    });
  });
});

// =============================================================================
// E2E: State-integrity guard — the skip-to-completion exploit is blocked.
// A client parked at an earlier step must not be able to POST /onboarding/profile
// and finish onboarding without ever uploading a photo (scout) or a height
// (measurements).
// =============================================================================
describe("E2E: Skip exploit is blocked at completion", () => {
  let agent;
  let userId;
  let profileId;
  let sessionCookie;

  const skipEmail = "skip.e2e.test@example.com";

  beforeAll(async () => {
    await knex.migrate.latest();
    await purgeUserByEmail(skipEmail);
    // A distinct Firebase identity so this suite gets its own user/profile.
    const firebaseAdmin = require("../src/domains/auth/services/firebase-admin");
    firebaseAdmin.verifyIdToken.mockResolvedValueOnce({
      uid: "skip-firebase-uid-e2e",
      email: skipEmail,
      name: "Skip Test",
      given_name: "Skip",
      family_name: "Test",
    });
    agent = request.agent(app);

    const entry = await agent
      .post("/casting/entry")
      .send({
        firebase_token: "mock-firebase-token-skip-e2e",
        terms_accepted: true,
        privacy_accepted: true,
        date_of_birth: "2000-05-15",
      })
      .expect(200);

    userId = entry.body.user_id;
    profileId = entry.body.profile_id;
    sessionCookie = (entry.headers["set-cookie"] || []).map(
      (c) => c.split(";")[0],
    );
  });

  afterAll(async () => {
    if (profileId) {
      await knex("images").where({ profile_id: profileId }).del().catch(() => {});
      await knex("onboarding_signals")
        .where({ profile_id: profileId })
        .del()
        .catch(() => {});
      await knex("onboarding_analytics")
        .where({ profile_id: profileId })
        .del()
        .catch(() => {});
      await knex("profiles").where({ id: profileId }).del().catch(() => {});
    }
    if (userId) {
      await knex("sessions")
        .where("sess", "like", `%${userId}%`)
        .del()
        .catch(() => {});
      await knex("users").where({ id: userId }).del().catch(() => {});
    }
    await knex.destroy();
  });

  it("blocks completion (403) when scout + measurements were never done", async () => {
    // Adult DOB was recorded at entry. Advance only gender. Scout (photo) and
    // measurements (height) are deliberately skipped.
    await agent
      .post("/casting/gender")
      .set("Cookie", sessionCookie)
      .send({ gender: "Non-Binary" })
      .expect(200);

    // Attempt to jump straight to completion.
    const res = await agent
      .post("/casting/profile")
      .set("Cookie", sessionCookie)
      .send({ city: "Phoenix, AZ" })
      .expect("Content-Type", /json/)
      .expect(403);

    expect(res.body.error).toBeDefined();

    // Completion must NOT have been recorded.
    const profile = await knex("profiles").where({ id: profileId }).first();
    expect(profile.onboarding_completed_at).toBeFalsy();
    expect(profile.onboarding_stage).not.toBe("done");
  });
});
