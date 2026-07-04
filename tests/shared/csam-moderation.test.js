const { v4: uuidv4 } = require("uuid");
const {
  CSAM_SEVERITY,
  CSAM_ESCALATION_STATUS,
  getCsamProvider,
  screenImageForCsam,
  recordCsamEscalation,
} = require("../../src/shared/lib/csam-moderation");

const knex = require("../../src/shared/db/knex");

describe("csam-moderation", () => {
  const originalProvider = process.env.CSAM_MODERATION_PROVIDER;

  afterEach(() => {
    if (originalProvider === undefined) {
      delete process.env.CSAM_MODERATION_PROVIDER;
    } else {
      process.env.CSAM_MODERATION_PROVIDER = originalProvider;
    }
  });

  describe("getCsamProvider", () => {
    it("defaults to heuristic_escalation", () => {
      delete process.env.CSAM_MODERATION_PROVIDER;
      expect(getCsamProvider()).toBe("heuristic_escalation");
    });

    it("reads env override", () => {
      process.env.CSAM_MODERATION_PROVIDER = "none";
      expect(getCsamProvider()).toBe("none");
    });
  });

  describe("screenImageForCsam", () => {
    it("returns no escalation when provider is none", async () => {
      process.env.CSAM_MODERATION_PROVIDER = "none";
      const result = await screenImageForCsam(Buffer.from("x"), {
        moderationFlags: { skin_tone_ratio: 0.99 },
        moderationReason: "high_skin_ratio",
      });
      expect(result.shouldEscalate).toBe(false);
      expect(result.shouldBlock).toBe(false);
      expect(result.severity).toBeNull();
    });

    it("escalates critical severity for high skin ratio heuristic", async () => {
      process.env.CSAM_MODERATION_PROVIDER = "heuristic_escalation";
      const result = await screenImageForCsam(Buffer.from("x"), {
        moderationFlags: { skin_tone_ratio: 0.8 },
        moderationReason: "high_skin_ratio",
      });
      expect(result.shouldEscalate).toBe(true);
      expect(result.severity).toBe(CSAM_SEVERITY.CRITICAL);
      expect(result.flags.csam_heuristic).toBe(true);
    });

    it("escalates medium severity for moderation_error", async () => {
      const result = await screenImageForCsam(Buffer.from("x"), {
        moderationReason: "moderation_error",
      });
      expect(result.shouldEscalate).toBe(true);
      expect(result.severity).toBe(CSAM_SEVERITY.MEDIUM);
    });

    it("does not escalate benign images", async () => {
      const result = await screenImageForCsam(Buffer.from("x"), {
        moderationFlags: { skin_tone_ratio: 0.1 },
        moderationReason: "ok",
      });
      expect(result.shouldEscalate).toBe(false);
      expect(result.severity).toBe(CSAM_SEVERITY.LOW);
    });
  });

  describe("recordCsamEscalation", () => {
    const userId = uuidv4();
    const profileId = uuidv4();
    const imageId = uuidv4();
    let escalationId;

    beforeAll(async () => {
      await knex("users").insert({
        id: userId,
        email: `csam-test-${userId}@example.com`,
        password_hash: "x",
        role: "TALENT",
      });
      await knex("profiles").insert({
        id: profileId,
        user_id: userId,
        slug: `csam-${profileId}`,
        first_name: "CSAM",
        last_name: "Test",
        city: "Test",
        height_cm: 170,
        bio_raw: "",
        bio_curated: "",
        onboarding_completed_at: knex.fn.now(),
      });
      await knex("images").insert({
        id: imageId,
        profile_id: profileId,
        path: "/uploads/csam-test.png",
      });
    });

    afterAll(async () => {
      if (escalationId) {
        await knex("csam_escalations").where({ id: escalationId }).delete();
      }
      await knex("images").where({ id: imageId }).delete();
      await knex("profiles").where({ id: profileId }).delete();
      await knex("users").where({ id: userId }).delete();
      await knex.destroy();
    });

    it("inserts a pending_review escalation row", async () => {
      escalationId = await recordCsamEscalation(knex, {
        imageId,
        profileId,
        provider: "heuristic_escalation",
        severity: CSAM_SEVERITY.CRITICAL,
        flags: { csam_heuristic: true },
        notes: "unit test",
      });

      expect(escalationId).toBeTruthy();

      const row = await knex("csam_escalations").where({ id: escalationId }).first();
      expect(row.status).toBe(CSAM_ESCALATION_STATUS.PENDING_REVIEW);
      expect(row.image_id).toBe(imageId);
      expect(row.profile_id).toBe(profileId);
    });
  });
});
