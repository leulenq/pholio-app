"use strict";

/**
 * An image that cannot be processed must not be published.
 *
 * processImage used to swallow every failure and return a success-shaped
 * object pointing at the ORIGINAL file. The webp re-encode is what strips EXIF,
 * so that degraded mode served whatever the camera wrote — GPS coordinates
 * included — on photographs of a person, often a minor. And because the return
 * shape was indistinguishable from success, nothing downstream could tell.
 *
 * These tests assert the inverted rule: a processing failure is a refusal, and
 * it is loud.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");

const UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "pholio-failclosed-"));
process.env.UPLOAD_DIR = UPLOAD_DIR;

const { getSharp } = require("../../src/shared/lib/lazy-sharp");
const {
  ImageProcessingError,
  processImage,
} = require("../../src/shared/lib/uploader");

const sharp = getSharp();
const describeSharp = sharp ? describe : describe.skip;

afterAll(() => {
  fs.rmSync(UPLOAD_DIR, { recursive: true, force: true });
});

describeSharp("processImage refuses what it cannot process", () => {
  /** Bytes that claim to be a JPEG and are not. */
  function writeCorruptJpeg(name) {
    const p = path.join(UPLOAD_DIR, name);
    fs.writeFileSync(p, Buffer.from("this is not an image, it is a sentence."));
    return p;
  }

  function fileAt(p, name) {
    return {
      mimetype: "image/jpeg",
      originalname: name,
      filename: path.basename(p),
      path: p,
    };
  }

  test("an undecodable image throws instead of returning a usable-looking result", async () => {
    const p = writeCorruptJpeg(`corrupt-${Date.now()}.jpg`);

    await expect(processImage(fileAt(p, "corrupt.jpg"), "test-profile")).rejects.toThrow(
      ImageProcessingError,
    );
  });

  test("the refusal carries a 422 and words a person can act on", async () => {
    const p = writeCorruptJpeg(`corrupt2-${Date.now()}.jpg`);

    const error = await processImage(fileAt(p, "corrupt.jpg"), "x").catch((e) => e);

    expect(error).toBeInstanceOf(ImageProcessingError);
    // 422, not 500: the request was fine, the file was not. The central error
    // handler keys off `status`, so this is what the talent actually sees.
    expect(error.status).toBe(422);
    expect(error.code).toBe("IMAGE_PROCESSING_FAILED");
    expect(error.message).toMatch(/could not be processed/i);
    // The underlying sharp error is kept for the log and kept out of the copy.
    expect(error.cause).toBeInstanceOf(Error);
    expect(error.message).not.toContain(String(error.cause.message));
  });

  test("it does not fall back to serving the unprocessed original", async () => {
    const p = writeCorruptJpeg(`corrupt3-${Date.now()}.jpg`);

    const result = await processImage(fileAt(p, "corrupt.jpg"), "x").catch(() => null);

    // The specific regression: any resolved value here is the old fail-open,
    // because every resolved shape carries a publicUrl pointing somewhere.
    expect(result).toBeNull();
  });

  test("the temp file is not left behind", async () => {
    const p = writeCorruptJpeg(`corrupt4-${Date.now()}.jpg`);

    await processImage(fileAt(p, "corrupt.jpg"), "x").catch(() => {});

    expect(fs.existsSync(p)).toBe(false);
  });

  test("a valid image is unaffected — this is a refusal, not a stricter filter", async () => {
    const buffer = await sharp({
      create: { width: 60, height: 40, channels: 3, background: { r: 10, g: 90, b: 10 } },
    })
      .jpeg()
      .toBuffer();
    const p = path.join(UPLOAD_DIR, `good-${Date.now()}.jpg`);
    fs.writeFileSync(p, buffer);

    const result = await processImage(fileAt(p, "good.jpg"), "test-profile");

    expect(result.publicUrl).toMatch(/\.webp$/);
    expect(result.deliveryWidthPx).toBe(60);
    expect(result.processedBuffer.length).toBeGreaterThan(0);
  });
});
