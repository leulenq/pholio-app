"use strict";

/**
 * Lane C — Discover semantic write hooks
 * (tasks/discover-semantic-2026-09.md §3.5, §6).
 *
 * The corpus is only as good as the moment it is rebuilt. These tests hold the
 * write paths to their contract: every save or media change that alters what a
 * chunk is built from marks the profile stale AND enqueues a reindex, the
 * whole thing is skipped when the feature flag is off, and a failing indexer
 * can never fail a talent's save.
 *
 * `src/domains/ai/discover-index` is mocked — CI never calls a provider.
 */

const request = require("supertest");
const cookieSig = require("cookie-signature");
const { v4: uuidv4 } = require("uuid");

jest.mock("../../src/domains/ai/discover-index", () => ({
  markProfileStale: jest.fn(async () => {}),
  reindexProfile: jest.fn(async () => ({
    status: "indexed",
    chunks: 0,
    embedded: 0,
  })),
  findStaleProfileIds: jest.fn(async () => []),
  purgeDiscoverChunks: jest.fn(async () => {}),
}));

const discoverIndex = require("../../src/domains/ai/discover-index");
const knex = require("../../src/shared/db/knex");
const app = require("../../src/app");
const {
  recordLegalAcceptance,
} = require("../../src/shared/lib/legal-acceptance");
const {
  scheduleDiscoverReindex,
  touchesDiscoverIndex,
} = require("../../src/domains/talent/services/discover-reindex-hooks");
const {
  AI_CONSENT_DISCLOSURE_VERSION,
  AI_CONSENT_PURPOSES,
} = require("../../src/domains/talent/routes/settings").__testables;

const SESSION_SECRET = require("../../src/config").sessionSecret;

jest.setTimeout(60000);

/** The hooks are fire-and-forget; wait for the enqueued job to land. */
async function waitForReindex(profileId, timeoutMs = 2000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const called = discoverIndex.reindexProfile.mock.calls.some(
      (call) => call[1] === profileId,
    );
    if (called) return true;
    // eslint-disable-next-line no-await-in-loop
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  return false;
}

describe("discover semantic — write hooks", () => {
  const userId = uuidv4();
  const profileId = uuidv4();
  const imageA = uuidv4();
  const imageB = uuidv4();
  const sessionIds = [];
  const previousFlag = process.env.PHOLIO_ENABLE_PROFILE_EMBEDDINGS;

  beforeAll(async () => {
    await knex.migrate.latest();

    await knex("users").insert({
      id: userId,
      email: `discover-hooks-${userId}@example.com`,
      password_hash: "x",
      role: "TALENT",
      email_verified: true,
    });
    await knex("profiles").insert({
      id: profileId,
      user_id: userId,
      slug: `discover-hooks-${profileId}`,
      first_name: "Indexed",
      last_name: "Talent",
      city: "Paris",
      date_of_birth: "1994-05-05",
      gender: "Female",
      height_cm: 178,
      bio_raw: "Editorial new face.",
      bio_curated: "Editorial new face.",
      onboarding_completed_at: new Date().toISOString(),
    });
    await recordLegalAcceptance(knex, userId, { terms: true, privacy: true });
    await knex("images").insert([
      {
        id: imageA,
        profile_id: profileId,
        path: `/uploads/${imageA}.jpg`,
        public_url: `/uploads/${imageA}.jpg`,
        image_type: "portfolio",
        shot_type: "headshot",
        status: "active",
        sort: 1,
        is_primary: true,
      },
      {
        id: imageB,
        profile_id: profileId,
        path: `/uploads/${imageB}.jpg`,
        public_url: `/uploads/${imageB}.jpg`,
        image_type: "portfolio",
        shot_type: "profile",
        status: "active",
        sort: 2,
        is_primary: false,
      },
    ]);
  });

  afterAll(async () => {
    if (previousFlag === undefined) {
      delete process.env.PHOLIO_ENABLE_PROFILE_EMBEDDINGS;
    } else {
      process.env.PHOLIO_ENABLE_PROFILE_EMBEDDINGS = previousFlag;
    }
    if (sessionIds.length) {
      await knex("sessions").whereIn("sid", sessionIds).delete();
    }
    await knex("images").where({ profile_id: profileId }).delete();
    await knex("profiles").where({ id: profileId }).delete();
    await knex("users").where({ id: userId }).delete();
    await knex.destroy();
  });

  beforeEach(() => {
    process.env.PHOLIO_ENABLE_PROFILE_EMBEDDINGS = "true";
    discoverIndex.markProfileStale.mockClear();
    discoverIndex.reindexProfile.mockClear();
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
        email: `discover-hooks-${userId}@example.com`,
      },
      expired: new Date(Date.now() + 86400000).toISOString(),
    });
    const signed = `connect.sid=s:${cookieSig.sign(sid, SESSION_SECRET)}`;
    return (req) => req.set("Cookie", signed);
  }

  async function currentVersion() {
    const row = await knex("profiles").where({ id: profileId }).first();
    return row.updated_at;
  }

  describe("scheduleDiscoverReindex", () => {
    test("marks the profile stale and enqueues the reindex", async () => {
      const scheduled = await scheduleDiscoverReindex(profileId);

      expect(scheduled).toBe(true);
      expect(discoverIndex.markProfileStale).toHaveBeenCalledWith(
        expect.anything(),
        profileId,
      );
      expect(discoverIndex.reindexProfile).toHaveBeenCalledWith(
        expect.anything(),
        profileId,
      );
    });

    test("does nothing when the embedding feature flag is off", async () => {
      process.env.PHOLIO_ENABLE_PROFILE_EMBEDDINGS = "false";

      const scheduled = await scheduleDiscoverReindex(profileId);

      expect(scheduled).toBe(false);
      expect(discoverIndex.markProfileStale).not.toHaveBeenCalled();
      expect(discoverIndex.reindexProfile).not.toHaveBeenCalled();
    });

    test("swallows an indexer failure instead of surfacing it to the caller", async () => {
      discoverIndex.reindexProfile.mockRejectedValueOnce(
        new Error("embedding provider down"),
      );

      await expect(scheduleDiscoverReindex(profileId)).resolves.toBe(false);
    });

    test("recognizes every profile column a chunk is built from", () => {
      for (const field of [
        "bio_raw",
        "bio_curated",
        "specialties",
        "specializations",
        "experience_level",
        "languages",
        "market",
        "city",
        "discipline",
        "modeling_categories",
        "is_discoverable",
      ]) {
        expect(touchesDiscoverIndex({ [field]: "x" })).toBe(true);
      }
      // A measurement is never rendered into a chunk (§3.1), so it must not
      // spend an embedding call.
      expect(touchesDiscoverIndex({ height_cm: 180, updated_at: "now" })).toBe(
        false,
      );
    });
  });

  describe("profile save", () => {
    test("reindexes when the bio changes", async () => {
      const auth = await withSession();
      const response = await auth(
        request(app)
          .put("/api/talent/profile")
          .send({
            bio: "Paris-based editorial new face with a strong runway walk.",
            expected_updated_at: await currentVersion(),
          }),
      );

      expect(response.status).toBe(200);
      expect(await waitForReindex(profileId)).toBe(true);
      expect(discoverIndex.markProfileStale).toHaveBeenCalledWith(
        expect.anything(),
        profileId,
      );
    });

    test("does not reindex when only a measurement changes", async () => {
      const auth = await withSession();
      const response = await auth(
        request(app)
          .put("/api/talent/profile")
          .send({
            height_cm: 179,
            expected_updated_at: await currentVersion(),
          }),
      );

      expect(response.status).toBe(200);
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(discoverIndex.reindexProfile).not.toHaveBeenCalled();
    });
  });

  describe("media", () => {
    test("reorder reindexes the profile", async () => {
      const auth = await withSession();
      const response = await auth(
        request(app)
          .put("/api/talent/media/reorder")
          .send({ imageIds: [imageB, imageA] }),
      );

      expect(response.status).toBe(200);
      expect(await waitForReindex(profileId)).toBe(true);
    });

    test("excluding an image from agencies reindexes the profile", async () => {
      const auth = await withSession();
      const response = await auth(
        request(app)
          .put(`/api/talent/media/${imageA}`)
          .send({ exclude_from_agency: true }),
      );

      expect(response.status).toBe(200);
      expect(await waitForReindex(profileId)).toBe(true);

      discoverIndex.reindexProfile.mockClear();
      const undo = await (await withSession())(
        request(app)
          .put(`/api/talent/media/${imageA}`)
          .send({ exclude_from_agency: false }),
      );
      expect(undo.status).toBe(200);
      expect(await waitForReindex(profileId)).toBe(true);
    });

    test("deleting an image reindexes the profile", async () => {
      const doomed = uuidv4();
      await knex("images").insert({
        id: doomed,
        profile_id: profileId,
        path: `/uploads/${doomed}.jpg`,
        public_url: `/uploads/${doomed}.jpg`,
        image_type: "portfolio",
        shot_type: "headshot",
        status: "active",
        sort: 3,
        is_primary: false,
      });

      const auth = await withSession();
      const response = await auth(
        request(app).delete(`/api/talent/media/${doomed}`),
      );

      expect(response.status).toBe(200);
      expect(await waitForReindex(profileId)).toBe(true);
    });
  });

  describe("consent disclosure", () => {
    test("presents the refreshed embedding disclosure under its new version", () => {
      expect(AI_CONSENT_DISCLOSURE_VERSION).toBe("2026-09-02");
      expect(AI_CONSENT_PURPOSES.agency_search_matching.disclosure).toBe(
        "Allow Pholio to send your bio, your declared profile details, and short descriptions of your portfolio photos (written by the image-analysis provider and describing styling, lighting, mood, and setting, never your face, age, heritage, or body) to its embedding provider, so vetted agency searches can find you by the look they describe. You can withdraw this at any time; the stored descriptions and vectors are deleted when you do.",
      );
      // The image-analysis purpose did not change; only the embedding one did.
      expect(AI_CONSENT_PURPOSES.image_analysis.disclosure).toBe(
        "Allow Pholio to send portfolio images to its image-analysis provider for shot classification and profile insights.",
      );
      // What actually happens is named: the photo descriptions, what they may
      // describe, what they may not, and that withdrawal deletes them.
      const embedding = AI_CONSENT_PURPOSES.agency_search_matching.disclosure;
      for (const phrase of [
        "your bio",
        "descriptions of your portfolio photos",
        "never your face, age, heritage, or body",
        "deleted when you do",
      ]) {
        expect(embedding).toContain(phrase);
      }
    });

    test("granting embedding consent reindexes the profile", async () => {
      const auth = await withSession();
      const response = await auth(
        request(app).put("/api/talent/settings").send({
          embeddingProcessingConsent: true,
          aiConsentDisclosureVersion: AI_CONSENT_DISCLOSURE_VERSION,
        }),
      );

      expect(response.status).toBe(200);
      expect(await waitForReindex(profileId)).toBe(true);

      // Leave the fixture as it was found.
      await (await withSession())(
        request(app)
          .put("/api/talent/settings")
          .send({ embeddingProcessingConsent: false }),
      );
    });

    test("a grant recorded under the previous version stays a grant", async () => {
      await knex("profiles")
        .where({ id: profileId })
        .update({ embedding_processing_consent: true });
      const auth = await withSession();

      // Reading settings must not revoke an older grant just because the
      // disclosure text has since been rewritten (§6).
      const response = await auth(request(app).get("/api/talent/settings"));

      expect(response.status).toBe(200);
      expect(response.body.settings.ai.profileEmbedding).toBe(true);
      expect(response.body.settings.ai.disclosureVersion).toBe("2026-09-02");

      await knex("profiles")
        .where({ id: profileId })
        .update({ embedding_processing_consent: false });
    });
  });
});
