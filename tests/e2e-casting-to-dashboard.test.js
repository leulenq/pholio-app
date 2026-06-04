/**
 * E2E Test: Casting Call → Dashboard (Full Flow)
 *
 * Exercises the live talent onboarding contract end-to-end and acts as the
 * regression net for the casting-flow resilience work (Phase 1):
 *
 *   entry → gender → scout (upload + confirm) → measurements → profile → done
 *
 * Specifically guards:
 *   - entry leaves the user on the `gender` step (not `scout`)
 *   - the `gender` endpoint persists gender AND advances `gender → scout`
 *     (without it, scout/confirm 403'd on an invalid gender → measurements jump)
 *   - /status rehydrates persisted answers (gender, measurements) for resume
 *   - /status surfaces AI predictions written into onboarding state
 *
 * Test User: Phoenix Test (phoenix.e2e.test@example.com)
 */

// Mock Firebase Admin SDK FIRST (before any imports). The casting entry route
// verifies the OAuth token through this module via the Google provider helper.
jest.mock("../src/domains/auth/services/firebase-admin", () => ({
  initializeFirebaseAdmin: jest.fn(),
  // Includes `picture` on purpose: entry seeds this remote Google avatar as a
  // primary image. The scout step must still promote the uploaded (local) photo
  // to primary and analyze it — this guards the Google-avatar regression where
  // scout/confirm tried to read the remote URL from disk and 500'd.
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

// Mock the master vision analysis used by scout/confirm. Resolving with "Low"
// confidence makes the fire-and-forget AI path a deterministic no-op (no
// external Groq call, no racy write into onboarding_state_json). The
// predictions-passthrough contract is verified separately by seeding state
// directly, which is deterministic.
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

    gender: "Non-Binary",

    photoPath: path.join(__dirname, "fixtures", "test-image.jpg"),

    // User confirms/edits measurements on the measurements step
    confirmedMeasurements: {
      height_cm: 180,
      weight_kg: 65,
      bust_cm: 91,
      waist_cm: 70,
      hips_cm: 96,
    },

    city: "Phoenix, AZ",
    experience_level: "Emerging",
  };

  // Helper: read the profile's parsed onboarding state JSON
  async function readState() {
    const profile = await knex("profiles").where({ id: testProfileId }).first();
    const raw = profile.onboarding_state_json;
    return typeof raw === "string" ? JSON.parse(raw) : raw;
  }

  beforeAll(async () => {
    // Create a minimal valid JPEG fixture if missing
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

    // Ensure no stale user from a prior aborted run
    const existing = await knex("users").where({ email: testEmail }).first();
    if (existing) {
      const profile = await knex("profiles")
        .where({ user_id: existing.id })
        .first();
      if (profile) {
        await knex("images")
          .where({ profile_id: profile.id })
          .del()
          .catch(() => {});
        await knex("onboarding_signals")
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
    await knex.destroy();
  });

  // ============================================
  // STEP 1: ENTRY (Account Creation → gender step)
  // ============================================
  describe("Step 1: Casting Entry", () => {
    it("creates the account and parks the user on the gender step", async () => {
      const res = await agent
        .post("/casting/entry")
        .send({ firebase_token: firebaseToken })
        .expect("Content-Type", /json/)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.user_id).toBeDefined();
      expect(res.body.profile_id).toBeDefined();
      expect(res.body.has_oauth_data).toBe(true);
      // Live contract: entry advances to `gender`, not straight to `scout`.
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

      const profile = await knex("profiles")
        .where({ id: testProfileId })
        .first();
      expect(profile.user_id).toBe(testUserId);
      expect(profile.first_name).toBe("Phoenix");
      expect(profile.last_name).toBe("Test");
      expect(profile.onboarding_stage).toBe("gender");
      expect(profile.visibility_mode).toBe("private_intake");
      expect(profile.services_locked).toBe(true);
    });

    it("establishes a session reporting the gender step", async () => {
      const res = await agent
        .get("/casting/status")
        .set("Cookie", sessionCookie)
        .expect(200);
      expect(res.body.success).toBe(true);
      expect(res.body.state.current_step).toBe("gender");
    });
  });

  // ============================================
  // STEP 2: GENDER (persist + advance → scout)
  // Regression guard: previously a client-only step that desynced the server.
  // ============================================
  describe("Step 2: Gender", () => {
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
  // STEP 3: SCOUT (upload + confirm)
  // ============================================
  describe("Step 3: Scout (Photo Upload + Confirm)", () => {
    it("uploads a primary photo without advancing the step", async () => {
      const res = await agent
        .post("/casting/scout")
        .set("Cookie", sessionCookie)
        .attach("digi", flowData.photoPath)
        .expect("Content-Type", /json/)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.imageId).toBeDefined();
      // The uploaded local photo becomes primary even though a remote Google
      // avatar was seeded at entry (the regression guard).
      expect(res.body.isPrimary).toBe(true);
      expect(res.body.photo_url).toBeDefined();

      // Exactly one primary, and it is the local upload (has absolute_path),
      // not the remote avatar seed.
      const primaries = await knex("images")
        .where({ profile_id: testProfileId, is_primary: true })
        .select("id", "absolute_path");
      expect(primaries).toHaveLength(1);
      expect(primaries[0].id).toBe(res.body.imageId);
      expect(primaries[0].absolute_path).toBeTruthy();

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
    });

    it("surfaces persisted AI predictions through /status (resume contract)", async () => {
      // Deterministically seed the predictions that scout/confirm's AI pass
      // would write, then assert getState passes them through to /status.
      const state = await readState();
      state.predictions = {
        confidence: "High",
        height_estimate_cm: 178,
        weight_kg: 66,
        bust_cm: 91,
        waist_cm: 71,
        hips_cm: 96,
      };
      await knex("profiles")
        .where({ id: testProfileId })
        .update({
          onboarding_state_json: isPostgres ? state : JSON.stringify(state),
        });

      const res = await agent
        .get("/casting/status")
        .set("Cookie", sessionCookie)
        .expect(200);
      expect(res.body.state.predictions).toBeTruthy();
      expect(res.body.state.predictions.height_estimate_cm).toBe(178);
    });
  });

  // ============================================
  // STEP 4: MEASUREMENTS (confirm/edit → profile)
  // ============================================
  describe("Step 4: Measurements", () => {
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
      expect(Number(profile.weight_kg)).toBe(
        flowData.confirmedMeasurements.weight_kg,
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
    });
  });

  // ============================================
  // STEP 5: PROFILE (location + experience → done)
  // ============================================
  describe("Step 5: Profile Details", () => {
    it("saves location + experience and completes onboarding", async () => {
      const res = await agent
        .post("/casting/profile")
        .set("Cookie", sessionCookie)
        .send({
          city: flowData.city,
          gender: flowData.gender,
          experience_level: flowData.experience_level,
        })
        .expect("Content-Type", /json/)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.next_step).toBe("done");

      const profile = await knex("profiles")
        .where({ id: testProfileId })
        .first();
      expect(profile.city).toBe(flowData.city);
      expect(profile.gender.toLowerCase()).toBe(flowData.gender.toLowerCase());
      expect(profile.experience_level).toBe(flowData.experience_level);
      expect(profile.onboarding_stage).toBe("done");
      expect(profile.onboarding_completed_at).toBeTruthy();
    });
  });

  // ============================================
  // STEP 6: COMPLETION (idempotent safety net)
  // ============================================
  describe("Step 6: Completion", () => {
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
  // STEP 7: DASHBOARD DATA INTEGRITY
  // ============================================
  describe("Step 7: Dashboard Data Verification", () => {
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
      expect(profile.experience_level).toBe(flowData.experience_level);

      expect(Number(profile.height_cm)).toBe(
        flowData.confirmedMeasurements.height_cm,
      );
      expect(Number(profile.weight_kg)).toBe(
        flowData.confirmedMeasurements.weight_kg,
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
