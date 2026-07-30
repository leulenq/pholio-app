/**
 * WS10 / PR 12 — moderation review queue: ops CLI + queue routing + surface
 * visibility at the query level.
 *
 * Verifies:
 *   - flagged (review) images always have a visible pending queue entry
 *     (applyModerationResult enqueues; CLI `list` also surfaces orphans),
 *   - CLI approve/reject transitions update both images.moderation_status and
 *     the queue rows,
 *   - while pending: excluded from PUBLIC and AGENCY_DISCOVERY image queries
 *     (profile-visibility.applyImageVisibility) but still visible to the
 *     owner-path query; after approve it becomes viewer-visible.
 */

const { v4: uuidv4 } = require("uuid");

const knex = require("../../src/shared/db/knex");
const {
  MODERATION_STATUS,
  MODERATION_QUEUE_STATUS,
  applyModerationResult,
  enqueueImageForReview,
  ensureModerationColumnChecked,
} = require("../../src/shared/lib/content-moderation");
const {
  applyImageVisibility,
} = require("../../src/shared/lib/profile-visibility");
const { AUDIENCE } = require("../../src/shared/lib/audience-dto");
const cli = require("../../scripts/moderation-queue");

describe("moderation review queue (WS10)", () => {
  const USER_ID = uuidv4();
  const PROFILE_ID = uuidv4();

  const IMAGE_REVIEW = uuidv4(); // review + pending queue row
  const IMAGE_ORPHAN = uuidv4(); // review, NO queue row (limbo guard)
  const IMAGE_APPROVED = uuidv4(); // approved control
  const IMAGE_ROUTED = uuidv4(); // target of applyModerationResult
  const QUEUE_ROW = uuidv4();

  const allImageIds = [IMAGE_REVIEW, IMAGE_ORPHAN, IMAGE_APPROVED, IMAGE_ROUTED];

  beforeAll(async () => {
    // Own the schema rather than inheriting whatever the previously-run suite
    // left in the shared SQLite file (see queue-actions.test.js).
    await knex.migrate.latest();
    await ensureModerationColumnChecked(knex);
    const now = new Date().toISOString();

    await knex("users").insert({
      id: USER_ID,
      email: `queue-cli-${USER_ID}@example.com`,
      password_hash: "x",
      role: "TALENT",
    });
    await knex("profiles").insert({
      id: PROFILE_ID,
      user_id: USER_ID,
      slug: `queue-cli-${PROFILE_ID}`,
      first_name: "Queue",
      last_name: "Cli",
      city: "Test",
      height_cm: 175,
      bio_raw: "",
      bio_curated: "",
    });

    await knex("images").insert([
      {
        id: IMAGE_REVIEW,
        profile_id: PROFILE_ID,
        path: "/uploads/queue-cli-review.webp",
        storage_key: "pholio-media/dev/profiles/x/processed/review.webp",
        moderation_status: MODERATION_STATUS.REVIEW,
        moderation_reason: "high_skin_ratio",
        created_at: now,
      },
      {
        id: IMAGE_ORPHAN,
        profile_id: PROFILE_ID,
        path: "/uploads/queue-cli-orphan.webp",
        moderation_status: MODERATION_STATUS.REVIEW,
        moderation_reason: "hive_general_suggestive",
        created_at: now,
      },
      {
        id: IMAGE_APPROVED,
        profile_id: PROFILE_ID,
        path: "/uploads/queue-cli-approved.webp",
        moderation_status: MODERATION_STATUS.APPROVED,
        created_at: now,
      },
      {
        id: IMAGE_ROUTED,
        profile_id: PROFILE_ID,
        path: "/uploads/queue-cli-routed.webp",
        moderation_status: MODERATION_STATUS.PENDING,
        created_at: now,
      },
    ]);

    await knex("moderation_queue").insert({
      id: QUEUE_ROW,
      image_id: IMAGE_REVIEW,
      profile_id: PROFILE_ID,
      status: MODERATION_QUEUE_STATUS.PENDING,
      flags: JSON.stringify({
        provider: "heuristic",
        skinRatio: 0.82,
        highSkin: true,
      }),
      created_at: now,
    });
  }, 30000);

  afterAll(async () => {
    await knex("moderation_queue").whereIn("image_id", allImageIds).delete();
    await knex("images").whereIn("id", allImageIds).delete();
    await knex("profiles").where({ id: PROFILE_ID }).delete();
    await knex("users").where({ id: USER_ID }).delete();
    await knex.destroy();
  });

  describe("queue routing (no silent limbo)", () => {
    it("applyModerationResult(review) creates a pending queue row", async () => {
      const status = await applyModerationResult(knex, IMAGE_ROUTED, {
        status: MODERATION_STATUS.REVIEW,
        reason: "hive_general_nsfw",
        flags: { provider: "hive", hiveScores: { general_nsfw: 0.9 } },
      });
      expect(status).toBe(MODERATION_STATUS.REVIEW);

      const row = await knex("moderation_queue")
        .where({ image_id: IMAGE_ROUTED, status: MODERATION_QUEUE_STATUS.PENDING })
        .first();
      expect(row).toBeTruthy();
      expect(row.profile_id).toBe(PROFILE_ID);
      expect(cli.parseFlags(row.flags).provider).toBe("hive");
    });

    it("enqueueImageForReview is idempotent (no duplicate pending rows)", async () => {
      const first = await enqueueImageForReview(knex, {
        imageId: IMAGE_ROUTED,
        profileId: PROFILE_ID,
      });
      const second = await enqueueImageForReview(knex, {
        imageId: IMAGE_ROUTED,
        profileId: PROFILE_ID,
      });
      expect(first).toBe(second);
      const rows = await knex("moderation_queue").where({
        image_id: IMAGE_ROUTED,
        status: MODERATION_QUEUE_STATUS.PENDING,
      });
      expect(rows).toHaveLength(1);
    });
  });

  describe("surface visibility while pending (query level)", () => {
    function imagesQueryFor(audience) {
      const qb = knex("images").where({ profile_id: PROFILE_ID });
      applyImageVisibility(qb, audience);
      return qb.pluck("id");
    }

    it("PUBLIC image query excludes review images", async () => {
      const visible = await imagesQueryFor(AUDIENCE.PUBLIC);
      expect(visible).toContain(IMAGE_APPROVED);
      expect(visible).not.toContain(IMAGE_REVIEW);
      expect(visible).not.toContain(IMAGE_ORPHAN);
    });

    it("AGENCY_DISCOVERY image query excludes review images", async () => {
      const visible = await imagesQueryFor(AUDIENCE.AGENCY_DISCOVERY);
      expect(visible).toContain(IMAGE_APPROVED);
      expect(visible).not.toContain(IMAGE_REVIEW);
    });

    it("owner-path query (no viewer filter) still returns the review image", async () => {
      // Owner routes (media.js / profile.js) query by profile_id without the
      // viewer-visibility filter — the talent always sees their own image,
      // with moderation_status carried for the "Under review" state.
      const ownRows = await knex("images")
        .where({ profile_id: PROFILE_ID })
        .select("id", "moderation_status");
      const own = ownRows.find((r) => r.id === IMAGE_REVIEW);
      expect(own).toBeTruthy();
      expect(own.moderation_status).toBe(MODERATION_STATUS.REVIEW);
    });
  });

  describe("ops CLI", () => {
    it("list surfaces pending items with profile, verdict, and R2 key", async () => {
      const items = await cli.listQueue({ status: "pending", limit: 100 });
      const item = items.find((i) => i.imageId === IMAGE_REVIEW);
      expect(item).toBeTruthy();
      expect(item.queueId).toBe(QUEUE_ROW);
      expect(item.profileName).toBe("Queue Cli");
      expect(item.flags.skinRatio).toBe(0.82);
      expect(item.moderationReason).toBe("high_skin_ratio");
      expect(item.storageKey).toBe(
        "pholio-media/dev/profiles/x/processed/review.webp",
      );
      expect(item.orphaned).toBe(false);
    });

    it("list also surfaces orphaned review images (no queue row)", async () => {
      const items = await cli.listQueue({ status: "pending", limit: 100 });
      const orphan = items.find((i) => i.imageId === IMAGE_ORPHAN);
      expect(orphan).toBeTruthy();
      expect(orphan.orphaned).toBe(true);
      expect(orphan.queueId).toBeNull();
    });

    it("approve flips image to approved + queue row resolved, restoring visibility", async () => {
      const result = await cli.approveImage(IMAGE_REVIEW);
      expect(result.previousStatus).toBe(MODERATION_STATUS.REVIEW);
      expect(result.imageStatus).toBe(MODERATION_STATUS.APPROVED);

      const image = await knex("images").where({ id: IMAGE_REVIEW }).first();
      expect(image.moderation_status).toBe(MODERATION_STATUS.APPROVED);
      expect(image.moderated_at).toBeTruthy();

      const queueRow = await knex("moderation_queue")
        .where({ id: QUEUE_ROW })
        .first();
      expect(queueRow.status).toBe(MODERATION_QUEUE_STATUS.APPROVED);
      expect(queueRow.reviewed_at).toBeTruthy();
      expect(cli.parseFlags(queueRow.flags).reviewed_via).toBe("cli");

      const qb = knex("images").where({ profile_id: PROFILE_ID });
      applyImageVisibility(qb, AUDIENCE.PUBLIC);
      const visible = await qb.pluck("id");
      expect(visible).toContain(IMAGE_REVIEW);
    });

    it("reject records the reason and creates an audit row for an orphan", async () => {
      const consoleSpy = jest
        .spyOn(console, "warn")
        .mockImplementation(() => {});
      const result = await cli.rejectImage(IMAGE_ORPHAN, {
        reason: "not portfolio-appropriate",
      });
      consoleSpy.mockRestore();
      expect(result.imageStatus).toBe(MODERATION_STATUS.REJECTED);

      const image = await knex("images").where({ id: IMAGE_ORPHAN }).first();
      expect(image.moderation_status).toBe(MODERATION_STATUS.REJECTED);
      expect(image.moderation_reason).toBe("not portfolio-appropriate");

      // Orphan had no queue row: reject must create a resolved audit row.
      const auditRow = await knex("moderation_queue")
        .where({ image_id: IMAGE_ORPHAN })
        .first();
      expect(auditRow).toBeTruthy();
      expect(auditRow.status).toBe(MODERATION_QUEUE_STATUS.REJECTED);
      expect(cli.parseFlags(auditRow.flags).orphaned_review_image).toBe(true);

      // Rejected stays hidden from viewers.
      const qb = knex("images").where({ profile_id: PROFILE_ID });
      applyImageVisibility(qb, AUDIENCE.PUBLIC);
      const visible = await qb.pluck("id");
      expect(visible).not.toContain(IMAGE_ORPHAN);
    });

    it("rejects unknown image ids", async () => {
      await expect(cli.approveImage(uuidv4())).rejects.toThrow(
        /Image not found/,
      );
    });

    it("stats reports queue counts and pending ages", async () => {
      const s = await cli.stats();
      expect(typeof s.queue).toBe("object");
      expect(typeof s.images).toBe("object");
      expect(s.pending).toHaveProperty("total");
      expect(s.pending).toHaveProperty("over24h");
      expect(s.pending).toHaveProperty("over72h");
      expect(s.pending).toHaveProperty("orphanedReviewImages");
      // IMAGE_ROUTED is still pending from the routing tests above.
      expect(s.pending.total).toBeGreaterThanOrEqual(1);
    });
  });
});
