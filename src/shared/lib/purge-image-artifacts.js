/**
 * Remove all stored artifacts for an image that must not be retained — e.g. a
 * buffer that was persisted to R2 / local disk before content moderation
 * rejected it. Deletes the primary object plus its derived originals/thumbnails
 * in R2 and the local .webp (and _400w thumbnail) on disk. Best-effort: every
 * op is settled independently so one failure never blocks the others.
 *
 * Extracted from the talent media route so the onboarding scout upload path can
 * reuse the exact same cleanup when a scout photo is blocked by moderation.
 */
const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
const fs = require("fs").promises;
const path = require("path");
const { s3 } = require("./uploader");
const config = require("../../config");

async function purgeStoredImageArtifacts({ storage_key, absolute_path }) {
  const ops = [];
  if (storage_key) {
    // Derive all related R2 keys using the same segment-marker logic as
    // account-deletion.js:deriveRelatedKeys, so originals/thumbnails are not
    // orphaned when only the processed key is known.
    const SEGMENTS = ["/processed/", "/originals/", "/thumbnails/"];
    const marker = SEGMENTS.find((m) => storage_key.includes(m));
    const ext = path.extname(storage_key);
    const baseName = path.basename(storage_key, ext).replace(/_400w$/, "");
    const keys = new Set([storage_key]);
    if (marker && baseName) {
      const prefix = storage_key.split(marker)[0];
      keys.add(`${prefix}/processed/${baseName}.webp`);
      keys.add(`${prefix}/thumbnails/${baseName}_400w.webp`);
      for (const origExt of [".jpg", ".jpeg", ".png", ".webp"]) {
        keys.add(`${prefix}/originals/${baseName}${origExt}`);
      }
    }
    for (const Key of keys) {
      ops.push(
        s3.send(new DeleteObjectCommand({ Bucket: config.r2.bucket, Key })),
      );
    }
  }
  if (absolute_path) {
    ops.push(fs.unlink(absolute_path).catch(() => {}));
    ops.push(
      fs.unlink(absolute_path.replace(".webp", "_400w.webp")).catch(() => {}),
    );
  }
  await Promise.allSettled(ops);
}

module.exports = { purgeStoredImageArtifacts };
