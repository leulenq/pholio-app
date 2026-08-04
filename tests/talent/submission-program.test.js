/**
 * Submission program notice (A2) — lib + API routes
 */

const request = require("supertest");
const cookieSig = require("cookie-signature");
const { v4: uuidv4 } = require("uuid");

const knex = require("../../src/shared/db/knex");
const app = require("../../src/app");
const {
  CURRENT_SUBMISSION_PROGRAM_VERSION,
  recordSubmissionProgramAcknowledgment,
  requireSubmissionProgramAcknowledgment,
} = require("../../src/shared/lib/submission-program");
const { recordLegalAcceptance } = require("../../src/shared/lib/legal-acceptance");

const SESSION_SECRET = require("../../src/config").sessionSecret;

describe("submission program acknowledgment", () => {
  const TALENT_ID = uuidv4();
  const PROFILE_ID = uuidv4();
  const sessionIds = [];

  beforeAll(async () => {
    const now = new Date().toISOString();
    await knex("users").insert({
      id: TALENT_ID,
      email: `submission-program-${TALENT_ID}@example.com`,
      password_hash: "x",
      role: "TALENT",
      email_verified: true,
    });
    await knex("profiles").insert({
      id: PROFILE_ID,
      user_id: TALENT_ID,
      slug: `sp-${PROFILE_ID}`,
      first_name: "Submit",
      last_name: "Tester",
      city: "Test",
      height_cm: 170,
      bio_raw: "",
      bio_curated: "",
      onboarding_completed_at: now,
    });
    await recordLegalAcceptance(knex, TALENT_ID, { terms: true, privacy: true });
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
        email: `submission-program-${TALENT_ID}@example.com`,
      },
      expired: new Date(Date.now() + 86400000).toISOString(),
    });
    const signed = `s:${cookieSig.sign(sid, SESSION_SECRET)}`;
    return (req) => req.set("Cookie", `connect.sid=${encodeURIComponent(signed)}`);
  }

  describe("lib", () => {
    it("requireSubmissionProgramAcknowledgment returns false when never acknowledged", () => {
      expect(
        requireSubmissionProgramAcknowledgment(
          { id: TALENT_ID },
          { throwOnMissing: false },
        ),
      ).toBe(false);
    });

    it("requireSubmissionProgramAcknowledgment throws when missing and throwOnMissing", () => {
      expect(() => requireSubmissionProgramAcknowledgment({ id: TALENT_ID })).toThrow(
        "Submission program acknowledgment required",
      );
      try {
        requireSubmissionProgramAcknowledgment({ id: TALENT_ID });
      } catch (err) {
        expect(err.code).toBe("SUBMISSION_PROGRAM_ACKNOWLEDGMENT_REQUIRED");
      }
    });

    it("recordSubmissionProgramAcknowledgment stores current version", async () => {
      await recordSubmissionProgramAcknowledgment(knex, TALENT_ID);
      const user = await knex("users").where({ id: TALENT_ID }).first();
      expect(user.submission_program_acknowledged_at).toBeTruthy();
      expect(user.submission_program_acknowledged_version).toBe(
        CURRENT_SUBMISSION_PROGRAM_VERSION,
      );
      expect(requireSubmissionProgramAcknowledgment(user)).toBe(true);
    });

    it("stale version re-prompts", async () => {
      await knex("users").where({ id: TALENT_ID }).update({
        submission_program_acknowledged_version: "2020-01-01",
      });
      const user = await knex("users").where({ id: TALENT_ID }).first();
      expect(
        requireSubmissionProgramAcknowledgment(user, { throwOnMissing: false }),
      ).toBe(false);
    });
  });

  describe("API routes", () => {
    beforeEach(async () => {
      await knex("users").where({ id: TALENT_ID }).update({
        submission_program_acknowledged_at: null,
        submission_program_acknowledged_version: null,
      });
    });

    it("GET status returns needsAcknowledgment true for new user", async () => {
      const auth = await withSession();
      const res = await auth(
        request(app)
          .get("/api/talent/applications/submission-program-status")
          .set("Accept", "application/json"),
      );
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.needsAcknowledgment).toBe(true);
      expect(res.body.data.currentVersion).toBe(CURRENT_SUBMISSION_PROGRAM_VERSION);
      expect(res.body.data.content.title).toMatch(/submission/i);
      expect(res.body.data.content.sections.length).toBeGreaterThan(0);
      const noticeText = res.body.data.content.sections
        .map((section) => `${section.heading} ${section.body}`)
        .join(" ");
      expect(noticeText).toContain("date of birth");
      expect(noticeText).toContain("24 months");
      expect(noticeText).toContain("cannot recall");
      expect(noticeText).toContain("separate recipient");
    });

    it("POST records acknowledgment and GET then returns false", async () => {
      const auth = await withSession();

      const postRes = await auth(
        request(app)
          .post("/api/talent/applications/submission-program-acknowledgment")
          .set("Accept", "application/json")
          .send({ acknowledged: true }),
      );
      expect(postRes.status).toBe(200);
      expect(postRes.body.data.acknowledged).toBe(true);
      expect(postRes.body.data.version).toBe(CURRENT_SUBMISSION_PROGRAM_VERSION);

      const statusRes = await auth(
        request(app)
          .get("/api/talent/applications/submission-program-status")
          .set("Accept", "application/json"),
      );
      expect(statusRes.status).toBe(200);
      expect(statusRes.body.data.needsAcknowledgment).toBe(false);
    });

    it("version mismatch re-prompts via GET status", async () => {
      await knex("users").where({ id: TALENT_ID }).update({
        submission_program_acknowledged_at: knex.fn.now(),
        submission_program_acknowledged_version: "2020-01-01",
      });

      const auth = await withSession();
      const res = await auth(
        request(app)
          .get("/api/talent/applications/submission-program-status")
          .set("Accept", "application/json"),
      );
      expect(res.status).toBe(200);
      expect(res.body.data.needsAcknowledgment).toBe(true);
    });

    it("POST rejects body without acknowledged: true", async () => {
      const auth = await withSession();
      const res = await auth(
        request(app)
          .post("/api/talent/applications/submission-program-acknowledgment")
          .set("Accept", "application/json")
          .send({ acknowledged: false }),
      );
      expect(res.status).toBe(400);
    });

    it("POST /applications rejects when submission program not acknowledged", async () => {
      const auth = await withSession();
      const agencyId = uuidv4();
      await knex("agencies").insert({
        id: agencyId,
        name: "Test Agency",
        slug: `sp-agency-${agencyId}`,
        status: "ACTIVE",
      });

      try {
        const res = await auth(
          request(app)
            .post("/api/talent/applications")
            .set("Accept", "application/json")
            .send({ agencyId }),
        );
        expect(res.status).toBe(403);
        expect(res.body.error).toBe("SUBMISSION_PROGRAM_ACKNOWLEDGMENT_REQUIRED");
      } finally {
        await knex("agencies").where({ id: agencyId }).delete();
      }
    });
  });
});
