"use strict";

const crypto = require("crypto");
const path = require("path");
const fs = require("fs").promises;
const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
const config = require("../../config");
const { s3 } = require("./uploader");

const ORIGINAL_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

function normalizeR2Key(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const markerIndex = trimmed.indexOf("pholio-media/");
  if (markerIndex < 0) return null;
  const leading = trimmed.slice(0, markerIndex);
  if (leading && leading !== "/") return null;
  const candidate = trimmed.slice(markerIndex);
  if (
    candidate.includes("\\") ||
    candidate.includes("?") ||
    candidate.includes("#") ||
    /[\u0000-\u001f]/.test(candidate)
  ) {
    return null;
  }
  let decoded;
  try {
    decoded = decodeURIComponent(candidate);
  } catch {
    return null;
  }
  if (decoded.split("/").some((segment) => segment === "." || segment === "..")) {
    return null;
  }
  return candidate;
}

function keyFromUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  if (value.startsWith("/uploads/")) return null;
  try {
    if (/^https?:\/\//i.test(value)) {
      return normalizeR2Key(new URL(value).pathname);
    }
  } catch {
    return null;
  }
  return normalizeR2Key(value);
}

function deriveRelatedImageKeys(value) {
  const rootKey = normalizeR2Key(value);
  if (!rootKey) return [];
  const keys = new Set([rootKey]);
  const marker = ["/processed/", "/originals/", "/thumbnails/"].find((part) =>
    rootKey.includes(part),
  );
  if (!marker) return [...keys];

  const prefix = rootKey.split(marker)[0];
  const ext = path.extname(rootKey);
  const baseName = path.basename(rootKey, ext || undefined).replace(/_400w$/, "");
  if (!baseName) return [...keys];

  keys.add(`${prefix}/processed/${baseName}.webp`);
  keys.add(`${prefix}/thumbnails/${baseName}_400w.webp`);
  for (const originalExt of ORIGINAL_EXTENSIONS) {
    // Includes legacy raw-original objects. New uploads no longer create them,
    // but deletion remains responsible for old data.
    keys.add(`${prefix}/originals/${baseName}${originalExt}`);
  }
  return [...keys];
}

function safeLocalUploadPath(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const uploadsRoot = path.resolve(config.uploadsDir);
  let candidate;
  if (value.startsWith("/uploads/")) {
    let relative;
    try {
      relative = decodeURIComponent(value.slice("/uploads/".length));
    } catch {
      return null;
    }
    if (relative.includes("?") || relative.includes("#")) return null;
    candidate = path.resolve(uploadsRoot, relative);
  } else if (path.isAbsolute(value)) {
    candidate = path.resolve(value);
  } else {
    return null;
  }
  if (candidate === uploadsRoot || !candidate.startsWith(`${uploadsRoot}${path.sep}`)) {
    return null;
  }
  return candidate;
}

function addLocalImagePaths(paths, value) {
  const resolved = safeLocalUploadPath(value);
  if (!resolved) return;
  paths.add(resolved);
  if (resolved.endsWith(".webp") && !resolved.endsWith("_400w.webp")) {
    paths.add(resolved.replace(/\.webp$/, "_400w.webp"));
  }
}

function collectImageArtifacts(imageRow = {}) {
  const r2Keys = new Set();
  const localPaths = new Set();
  const seeds = [
    imageRow.storage_key,
    imageRow.original_storage_key,
    keyFromUrl(imageRow.path),
    keyFromUrl(imageRow.public_url),
    keyFromUrl(imageRow.original_path),
    keyFromUrl(imageRow.original_public_url),
  ].filter(Boolean);
  for (const seed of seeds) {
    for (const key of deriveRelatedImageKeys(seed)) r2Keys.add(key);
  }
  addLocalImagePaths(localPaths, imageRow.absolute_path);
  addLocalImagePaths(localPaths, imageRow.original_absolute_path);
  addLocalImagePaths(localPaths, imageRow.path);
  addLocalImagePaths(localPaths, imageRow.original_path);
  return { r2Keys, localPaths };
}

function collectExternalCardArtifacts(cardRow = {}) {
  const r2Keys = new Set();
  const localPaths = new Set();
  const key = normalizeR2Key(cardRow.storage_key) || keyFromUrl(cardRow.public_url);
  if (key) r2Keys.add(key);
  const local = safeLocalUploadPath(cardRow.public_url);
  if (local) localPaths.add(local);
  return { r2Keys, localPaths };
}

async function deleteR2Objects(keys) {
  const keyList = [...(keys || [])];
  if (keyList.length === 0) {
    return { attempted: 0, deleted: 0, failed: 0, failedKeys: [] };
  }
  if (!config.r2.bucket || !s3) {
    return { attempted: keyList.length, deleted: 0, failed: keyList.length, failedKeys: keyList };
  }
  const settled = await Promise.allSettled(
    keyList.map((Key) =>
      s3.send(new DeleteObjectCommand({ Bucket: config.r2.bucket, Key })),
    ),
  );
  const failedKeys = [];
  settled.forEach((result, index) => {
    if (result.status === "rejected") failedKeys.push(keyList[index]);
  });
  return {
    attempted: settled.length,
    deleted: settled.length - failedKeys.length,
    failed: failedKeys.length,
    failedKeys,
  };
}

async function deleteLocalFiles(paths) {
  const pathList = [...(paths || [])];
  const settled = await Promise.allSettled(
    pathList.map(async (filePath) => {
      try {
        await fs.unlink(filePath);
      } catch (error) {
        if (error?.code !== "ENOENT") throw error;
      }
    }),
  );
  const failedPaths = [];
  settled.forEach((result, index) => {
    if (result.status === "rejected") failedPaths.push(pathList[index]);
  });
  return {
    attempted: settled.length,
    deleted: settled.length - failedPaths.length,
    failed: failedPaths.length,
    failedPaths,
  };
}

async function recordProviderDeletionFailure(
  knex,
  { userId, provider, payload, error },
) {
  if (!(await knex.schema.hasTable("account_deletion_failures"))) return null;
  const id = crypto.randomUUID();
  await knex("account_deletion_failures").insert({
    id,
    user_id: userId,
    firebase_uid: null,
    provider,
    status: "pending",
    payload: JSON.stringify(payload ?? null),
    last_error: String(error || "Artifact deletion failed").slice(0, 2000),
    attempts: 1,
    created_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  });
  return id;
}

/**
 * Delete an artifact inventory and durably queue every provider failure before
 * its owning database row is removed. `safeToDropReference` is false when a
 * failure could not be recorded (for example during a deploy-before-migrate
 * window), allowing callers to keep the discoverable row and return 503.
 */
async function deleteMediaArtifacts(
  knex,
  { userId, r2Keys = new Set(), localPaths = new Set(), source = "media" },
) {
  const [r2, local] = await Promise.all([
    deleteR2Objects(r2Keys),
    deleteLocalFiles(localPaths),
  ]);
  const pendingFailureIds = [];
  if (r2.failed > 0) {
    const id = await recordProviderDeletionFailure(knex, {
      userId,
      provider: "r2",
      payload: { failedKeys: r2.failedKeys, source },
      error: `${r2.failed}/${r2.attempted} R2 object deletes failed`,
    });
    if (id) pendingFailureIds.push(id);
  }
  if (local.failed > 0) {
    const id = await recordProviderDeletionFailure(knex, {
      userId,
      provider: "local_media",
      payload: { failedPaths: local.failedPaths, source },
      error: `${local.failed}/${local.attempted} local artifact deletes failed`,
    });
    if (id) pendingFailureIds.push(id);
  }
  const failureGroups = Number(r2.failed > 0) + Number(local.failed > 0);
  return {
    r2,
    local,
    fullyErased: failureGroups === 0,
    pendingFailureIds,
    safeToDropReference:
      failureGroups === 0 || pendingFailureIds.length === failureGroups,
  };
}

module.exports = {
  collectExternalCardArtifacts,
  collectImageArtifacts,
  deleteLocalFiles,
  deleteMediaArtifacts,
  deleteR2Objects,
  deriveRelatedImageKeys,
  normalizeR2Key,
  recordProviderDeletionFailure,
  safeLocalUploadPath,
};
