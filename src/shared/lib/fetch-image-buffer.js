"use strict";

const fs = require("fs/promises");
const path = require("path");
const config = require("../../config");

const FETCH_TIMEOUT_MS = 8000;

async function fetchHttpBuffer(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) return null;
    return Buffer.from(await response.arrayBuffer());
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function readLocalPathBuffer(src) {
  const relative = String(src).replace(/^\//, "");
  const basename = path.basename(relative);
  const candidates = [
    path.join(config.uploadsDir, basename),
    path.join(process.cwd(), relative),
    path.join(process.cwd(), "public", relative),
    path.join(process.cwd(), "uploads", basename),
  ];
  for (const candidate of candidates) {
    try {
      return await fs.readFile(candidate);
    } catch {
      /* try next */
    }
  }
  return null;
}

async function readR2Buffer(key) {
  if (!key) return null;
  try {
    const { s3 } = require("./uploader");
    const { GetObjectCommand } = require("@aws-sdk/client-s3");
    const config = require("../../config");
    const response = await s3.send(
      new GetObjectCommand({ Bucket: config.r2.bucket, Key: key }),
    );
    const body = response.Body;
    if (!body) return null;
    if (typeof body.transformToByteArray === "function") {
      return Buffer.from(await body.transformToByteArray());
    }
    const chunks = [];
    for await (const chunk of body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  } catch {
    return null;
  }
}

/**
 * Load image bytes for an images-table row (local path, URL, or R2).
 * @param {object} imageRow
 * @returns {Promise<Buffer|null>}
 */
async function fetchImageBuffer(imageRow) {
  if (!imageRow || typeof imageRow !== "object") return null;

  if (imageRow.absolute_path) {
    try {
      return await fs.readFile(imageRow.absolute_path);
    } catch {
      /* fall through */
    }
  }

  if (imageRow.storage_key) {
    const fromR2 = await readR2Buffer(imageRow.storage_key);
    if (fromR2?.length) return fromR2;
  }

  const src = imageRow.public_url || imageRow.path || null;
  if (!src) return null;

  if (/^https?:\/\//i.test(src)) {
    return fetchHttpBuffer(src);
  }

  return readLocalPathBuffer(src);
}

module.exports = {
  fetchImageBuffer,
  FETCH_TIMEOUT_MS,
};
