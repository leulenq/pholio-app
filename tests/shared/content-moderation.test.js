const sharp = require("sharp");
const {
  MODERATION_STATUS,
  analyzeImageBuffer,
  getModerationProvider,
  isImageVisibleToViewer,
  isSkinTonePixel,
} = require("../../src/shared/lib/content-moderation");

/** Build a small solid-color PNG buffer for deterministic tests. */
async function makePng(width, height, rgb) {
  return sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: rgb[0], g: rgb[1], b: rgb[2] },
    },
  })
    .png()
    .toBuffer();
}

describe("content-moderation", () => {
  describe("getModerationProvider", () => {
    const original = process.env.MODERATION_PROVIDER;
    afterEach(() => {
      if (original === undefined) delete process.env.MODERATION_PROVIDER;
      else process.env.MODERATION_PROVIDER = original;
    });

    it("defaults to heuristic", () => {
      delete process.env.MODERATION_PROVIDER;
      expect(getModerationProvider()).toBe("heuristic");
    });

    it("reads the env override", () => {
      process.env.MODERATION_PROVIDER = "Hive";
      expect(getModerationProvider()).toBe("hive");
    });
  });

  describe("analyzeImageBuffer", () => {
    it("approves a small neutral-blue PNG (low skin-tone, normal aspect)", async () => {
      const buffer = await makePng(100, 100, [40, 90, 200]);
      const result = await analyzeImageBuffer(buffer);
      expect(result.status).toBe(MODERATION_STATUS.APPROVED);
      expect(result.flags.width).toBe(100);
      expect(result.flags.height).toBe(100);
      expect(result.flags.skinRatio).toBeLessThan(0.6);
    });

    it("flags a near-uniform skin-tone PNG for review", async () => {
      // A skin-tone fill should push skin ratio above the review threshold.
      const buffer = await makePng(100, 100, [200, 140, 110]);
      const result = await analyzeImageBuffer(buffer);
      expect(result.status).toBe(MODERATION_STATUS.REVIEW);
      expect(result.reason).toContain("high_skin_ratio");
    });

    it("flags an extreme aspect ratio for review", async () => {
      const buffer = await makePng(900, 100, [40, 90, 200]);
      const result = await analyzeImageBuffer(buffer);
      expect(result.status).toBe(MODERATION_STATUS.REVIEW);
      expect(result.reason).toContain("extreme_aspect_ratio");
    });

    it("rejects an undecodable buffer", async () => {
      const buffer = Buffer.from("this is definitely not an image", "utf8");
      const result = await analyzeImageBuffer(buffer);
      expect(result.status).toBe(MODERATION_STATUS.REJECTED);
      expect(result.reason).toBe("undecodable_image");
    });

    it("fails toward review on an empty/missing buffer", async () => {
      const result = await analyzeImageBuffer(null);
      expect(result.status).toBe(MODERATION_STATUS.REVIEW);
      expect(result.reason).toBe("missing_buffer");
    });
  });

  describe("isImageVisibleToViewer", () => {
    it("hides rejected and review images", () => {
      expect(
        isImageVisibleToViewer({ moderation_status: MODERATION_STATUS.REJECTED }),
      ).toBe(false);
      expect(
        isImageVisibleToViewer({ moderation_status: MODERATION_STATUS.REVIEW }),
      ).toBe(false);
    });

    it("shows approved, pending, and legacy (null) images", () => {
      expect(
        isImageVisibleToViewer({ moderation_status: MODERATION_STATUS.APPROVED }),
      ).toBe(true);
      expect(
        isImageVisibleToViewer({ moderation_status: MODERATION_STATUS.PENDING }),
      ).toBe(true);
      expect(isImageVisibleToViewer({ moderation_status: null })).toBe(true);
    });
  });

  describe("isSkinTonePixel", () => {
    it("classifies a typical skin RGB as skin-tone", () => {
      expect(isSkinTonePixel(200, 140, 110)).toBe(true);
    });
    it("rejects a blue pixel", () => {
      expect(isSkinTonePixel(40, 90, 200)).toBe(false);
    });
  });
});
