const path = require("path");
const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
const config = require("../../config");
const { s3 } = require("./uploader");
const { deleteUser } = require("../../domains/auth/services/firebase-admin");

const ORIGINAL_EXTENSIONS = [".jpg", ".jpeg", ".png", ".webp"];

function normalizeKey(value) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("pholio-media/")) return trimmed;

  const markerIndex = trimmed.indexOf("pholio-media/");
  if (markerIndex >= 0) {
    return trimmed.slice(markerIndex);
  }

  return null;
}

function keyFromUrl(value) {
  if (typeof value !== "string" || !value.trim()) return null;

  const trimmed = value.trim();
  const direct = normalizeKey(trimmed);
  if (direct) return direct;

  if (trimmed.startsWith("/uploads/")) return null;

  try {
    const parsed = new URL(trimmed);
    return normalizeKey(parsed.pathname);
  } catch {
    return null;
  }
}

function deriveRelatedKeys(storageKey) {
  const rootKey = normalizeKey(storageKey);
  if (!rootKey) return [];

  const keys = new Set([rootKey]);
  if (rootKey.includes("/logos/")) {
    return [...keys];
  }

  const marker = ["/processed/", "/originals/", "/thumbnails/"].find((item) =>
    rootKey.includes(item),
  );
  if (!marker) {
    return [...keys];
  }

  const prefix = rootKey.split(marker)[0];
  const ext = path.extname(rootKey);
  const baseName = path.basename(rootKey, ext || undefined).replace(/_400w$/, "");
  if (!baseName) {
    return [...keys];
  }

  keys.add(`${prefix}/processed/${baseName}.webp`);
  keys.add(`${prefix}/thumbnails/${baseName}_400w.webp`);
  for (const originalExt of ORIGINAL_EXTENSIONS) {
    keys.add(`${prefix}/originals/${baseName}${originalExt}`);
  }

  return [...keys];
}

function collectImageKeys(imageRow) {
  const seedCandidates = [
    imageRow.storage_key,
    imageRow.original_storage_key,
    imageRow.r2_key,
    keyFromUrl(imageRow.path),
    keyFromUrl(imageRow.public_url),
    keyFromUrl(imageRow.original_path),
    keyFromUrl(imageRow.original_public_url),
  ].filter(Boolean);

  const keys = new Set();
  for (const candidate of seedCandidates) {
    for (const key of deriveRelatedKeys(candidate)) {
      keys.add(key);
    }
  }
  return keys;
}

async function deleteR2Objects(keys) {
  if (!config.r2.bucket || !s3 || keys.size === 0) {
    return { attempted: 0, deleted: 0, failed: 0 };
  }

  const operations = [...keys].map((key) =>
    s3.send(
      new DeleteObjectCommand({
        Bucket: config.r2.bucket,
        Key: key,
      }),
    ),
  );
  const settled = await Promise.allSettled(operations);

  const failed = settled.filter((result) => result.status === "rejected").length;
  return {
    attempted: settled.length,
    deleted: settled.length - failed,
    failed,
  };
}

async function deleteUserAccount(knex, userId) {
  if (!knex || !userId) {
    throw new Error("deleteUserAccount requires knex and userId");
  }

  const user = await knex("users").where({ id: userId }).first();
  if (!user) {
    return {
      deleted: false,
      userFound: false,
      imagesScanned: 0,
      r2KeysAttempted: 0,
      deletedR2Objects: 0,
      failedR2Objects: 0,
      firebaseAttempted: false,
      firebaseDeleted: false,
    };
  }

  const profile = await knex("profiles").where({ user_id: userId }).first();
  const images = profile
    ? await knex("images")
        .where({ profile_id: profile.id })
        .select(
          "path",
          "public_url",
          "storage_key",
          "original_path",
          "original_public_url",
          "original_storage_key",
          "r2_key",
        )
    : [];

  const allKeys = new Set();
  for (const image of images) {
    const imageKeys = collectImageKeys(image);
    for (const key of imageKeys) {
      allKeys.add(key);
    }
  }

  const r2Result = await deleteR2Objects(allKeys);

  let firebaseDeleted = false;
  if (user.firebase_uid) {
    try {
      await deleteUser(user.firebase_uid);
      firebaseDeleted = true;
    } catch (error) {
      console.warn(
        `[AccountDeletion] Firebase delete failed for ${userId}: ${error.message}`,
      );
    }
  }

  const deletedRows = await knex("users").where({ id: userId }).del();

  return {
    deleted: deletedRows > 0,
    userFound: true,
    imagesScanned: images.length,
    r2KeysAttempted: r2Result.attempted,
    deletedR2Objects: r2Result.deleted,
    failedR2Objects: r2Result.failed,
    firebaseAttempted: !!user.firebase_uid,
    firebaseDeleted,
  };
}

module.exports = {
  deleteUserAccount,
};
