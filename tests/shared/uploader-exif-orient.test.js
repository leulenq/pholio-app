"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");

// Point the uploader at a throwaway dir BEFORE config/uploader load.
const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pholio-exif-test-"));
process.env.UPLOAD_DIR = UPLOAD_DIR;

const { getSharp } = require("../../src/shared/lib/lazy-sharp");
const { processImage } = require("../../src/shared/lib/uploader");

const sharp = getSharp();
const describeSharp = sharp ? describe : describe.skip;

afterAll(() => {
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
});

describeSharp("processImage EXIF auto-orientation", () => {
  // 120x60 stored pixels + EXIF orientation 6 ("rotate 90 CW to display"):
  // a phone photo shot sideways. Correct derivatives are 60x120.
  async function makeSidewaysJpeg() {
    const buffer = await sharp({
      create: {
        width: 120,
        height: 60,
        channels: 3,
        background: { r: 180, g: 40, b: 40 },
      },
    })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();

    const inputPath = path.join(UPLOAD_DIR, `input-${Date.now()}.jpg`);
    fs.writeFileSync(inputPath, buffer);
    return inputPath;
  }

  test("processed image and thumbnail render upright (orientation 6)", async () => {
    const inputPath = await makeSidewaysJpeg();

    const result = await processImage(
      {
        mimetype: "image/jpeg",
        originalname: "sideways.jpg",
        filename: path.basename(inputPath),
        path: inputPath,
      },
      "test-profile",
    );

    expect(result.absolutePath).toBeTruthy();

    const processedMeta = await sharp(result.absolutePath).metadata();
    expect(processedMeta.width).toBe(60);
    expect(processedMeta.height).toBe(120);
    // Auto-orient bakes the rotation into pixels; no stale EXIF tag remains.
    expect(processedMeta.orientation).toBeUndefined();

    const thumbPath = result.absolutePath.replace(/\.webp$/, "_400w.webp");
    const thumbMeta = await sharp(thumbPath).metadata();
    expect(thumbMeta.width).toBe(60);
    expect(thumbMeta.height).toBe(120);
  });

  test("images without EXIF orientation pass through unchanged", async () => {
    const buffer = await sharp({
      create: {
        width: 120,
        height: 60,
        channels: 3,
        background: { r: 40, g: 40, b: 180 },
      },
    })
      .jpeg()
      .toBuffer();
    const inputPath = path.join(UPLOAD_DIR, `plain-${Date.now()}.jpg`);
    fs.writeFileSync(inputPath, buffer);

    const result = await processImage(
      {
        mimetype: "image/jpeg",
        originalname: "plain.jpg",
        filename: path.basename(inputPath),
        path: inputPath,
      },
      "test-profile",
    );

    const meta = await sharp(result.absolutePath).metadata();
    expect(meta.width).toBe(120);
    expect(meta.height).toBe(60);
  });
});
