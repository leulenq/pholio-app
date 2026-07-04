const path = require("path");
const crypto = require("crypto");
const { DeleteObjectCommand } = require("@aws-sdk/client-s3");
const config = require("../../config");
const { s3 } = require("./uploader");
const { deleteUser } = require("../../domains/auth/services/firebase-admin");
const {
  TABLES_REQUIRING_EXPLICIT_CLEANUP,
} = require("./talent-data-inventory");

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

/**
 * Deletes every key from R2 and reports exactly which ones failed, so a
 * caller can durably record them for retry rather than silently losing
 * track of what still needs to be purged.
 */
async function deleteR2Objects(keys) {
  if (!config.r2.bucket || !s3 || keys.size === 0) {
    return { attempted: 0, deleted: 0, failed: 0, failedKeys: [] };
  }

  const keyList = [...keys];
  const operations = keyList.map((key) =>
    s3.send(
      new DeleteObjectCommand({
        Bucket: config.r2.bucket,
        Key: key,
      }),
    ),
  );
  const settled = await Promise.allSettled(operations);

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

function parseSessJson(raw) {
  if (raw == null) return null;
  if (typeof raw === "object") return raw;
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Every FK-cascaded table in TALENT_DATA_INVENTORY is already cleaned up by
 * `ON DELETE CASCADE` from `users`/`profiles` when the `users` row is
 * deleted below. `TABLES_REQUIRING_EXPLICIT_CLEANUP` is the (small) set of
 * tables that have no such cascade and would otherwise be orphaned —
 * currently `sessions` (opaque `sess` JSON blob, no FK) and
 * `moderation_queue` (profile-level rows with no `profile_id` FK).
 */
async function cleanupTablesWithoutCascade(knex, { userId, profileId }) {
  for (const entry of TABLES_REQUIRING_EXPLICIT_CLEANUP) {
    if (!(await knex.schema.hasTable(entry.table))) continue;

    if (entry.scope === "session-json") {
      if (!userId) continue;
      const rows = await knex(entry.table).select("sid", "sess");
      for (const row of rows) {
        const sess = parseSessJson(row.sess);
        if (sess && sess.userId === userId) {
          await knex(entry.table).where({ sid: row.sid }).del();
        }
      }
      continue;
    }

    const id = entry.scope === "profile" ? profileId : userId;
    if (!id || !entry.column) continue;
    await knex(entry.table).where({ [entry.column]: id }).del();
  }
}

/**
 * Durably records a provider-purge failure so it can be retried later, even
 * though the `users` row that caused it is about to be deleted.
 *
 * TODO(outbox): this is the minimal honest fix — a flat retry table with no
 * worker/lease/backoff. If provider-purge failure volume warrants it, a
 * later wave should promote this into a real job-runner outbox.
 */
async function recordDeletionFailure(
  knex,
  { userId, firebaseUid, provider, payload, error },
) {
  if (!(await knex.schema.hasTable("account_deletion_failures"))) {
    // Table not migrated yet (e.g. an older schema). Do not silently
    // pretend this is fine — surface loudly so it gets fixed, but do not
    // block deletion on it.
    console.error(
      `[AccountDeletion] account_deletion_failures table missing; ${provider} purge failure for user ${userId} was NOT durably recorded`,
    );
    return null;
  }

  const id = crypto.randomUUID();
  await knex("account_deletion_failures").insert({
    id,
    user_id: userId,
    firebase_uid: firebaseUid || null,
    provider,
    status: "pending",
    payload: JSON.stringify(payload ?? null),
    last_error: error ? String(error).slice(0, 2000) : null,
    attempts: 1,
    created_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  });
  return id;
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
      fullyErased: false,
      pendingFailureIds: [],
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
  let firebaseError = null;
  if (user.firebase_uid) {
    try {
      await deleteUser(user.firebase_uid);
      firebaseDeleted = true;
    } catch (error) {
      firebaseError = error?.message || String(error);
      console.warn(
        `[AccountDeletion] Firebase delete failed for ${userId}: ${firebaseError}`,
      );
    }
  }

  // Verify completion before declaring success: a provider purge that threw
  // or left objects undeleted means erasure is NOT complete, no matter what
  // happens to the DB row below.
  const r2Failed = r2Result.failed > 0;
  const firebaseFailed = !!user.firebase_uid && !firebaseDeleted;
  const fullyErased = !r2Failed && !firebaseFailed;

  const pendingFailureIds = [];
  if (r2Failed) {
    const id = await recordDeletionFailure(knex, {
      userId,
      firebaseUid: user.firebase_uid || null,
      provider: "r2",
      payload: { failedKeys: r2Result.failedKeys },
      error: `${r2Result.failed}/${r2Result.attempted} object deletes failed`,
    });
    if (id) pendingFailureIds.push(id);
  }
  if (firebaseFailed) {
    const id = await recordDeletionFailure(knex, {
      userId,
      firebaseUid: user.firebase_uid,
      provider: "firebase",
      payload: null,
      error: firebaseError,
    });
    if (id) pendingFailureIds.push(id);
  }

  // DB deletion still proceeds: removing the account from Pholio's own
  // systems is the app's own obligation and should not be held hostage by a
  // downstream provider outage. What changes is that we no longer claim the
  // erasure was complete when a provider purge failed — the caller is
  // expected to surface `fullyErased`/`pendingFailureIds` truthfully rather
  // than a bare "deleted".
  await cleanupTablesWithoutCascade(knex, { userId, profileId: profile?.id || null });
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
    fullyErased,
    pendingFailureIds,
  };
}

function parsePayload(value) {
  if (value == null) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/**
 * Processes and retries pending failures in the `account_deletion_failures` table.
 *
 * @param {import('knex').Knex} knex
 * @returns {Promise<{ processed: number, resolved: number, failed: number }>}
 */
async function processPendingDeletions(knex) {
  if (!(await knex.schema.hasTable("account_deletion_failures"))) {
    return { processed: 0, resolved: 0, failed: 0 };
  }

  const pending = await knex("account_deletion_failures")
    .where({ status: "pending" })
    .select();

  let processed = 0;
  let resolved = 0;
  let failed = 0;

  for (const failure of pending) {
    processed++;
    let wasResolved = false;
    let newPayload = failure.payload;
    let lastError = null;

    if (failure.provider === "r2") {
      const payload = parsePayload(failure.payload);
      const failedKeys = payload?.failedKeys || [];
      if (failedKeys.length > 0) {
        try {
          const r2Result = await deleteR2Objects(new Set(failedKeys));
          if (r2Result.failed === 0) {
            wasResolved = true;
            newPayload = null;
          } else {
            newPayload = JSON.stringify({ failedKeys: r2Result.failedKeys });
            lastError = `${r2Result.failed}/${r2Result.attempted} object deletes failed`;
          }
        } catch (err) {
          lastError = err?.message || String(err);
        }
      } else {
        wasResolved = true;
        newPayload = null;
      }
    } else if (failure.provider === "firebase") {
      if (failure.firebase_uid) {
        try {
          await deleteUser(failure.firebase_uid);
          wasResolved = true;
        } catch (err) {
          const errMsg = err?.message || String(err);
          // If the user doesn't exist anymore, treat as resolved (verified completion)
          if (
            errMsg.includes("user-not-found") ||
            errMsg.includes("auth/user-not-found") ||
            err?.code === "auth/user-not-found"
          ) {
            wasResolved = true;
          } else {
            lastError = errMsg;
          }
        }
      } else {
        wasResolved = true;
      }
    }

    if (wasResolved) {
      resolved++;
      await knex("account_deletion_failures")
        .where({ id: failure.id })
        .update({
          status: "resolved",
          attempts: failure.attempts + 1,
          payload: null,
          last_error: null,
          resolved_at: knex.fn.now(),
          updated_at: knex.fn.now(),
        });
    } else {
      failed++;
      await knex("account_deletion_failures")
        .where({ id: failure.id })
        .update({
          attempts: failure.attempts + 1,
          payload: newPayload,
          last_error: lastError ? lastError.slice(0, 2000) : null,
          updated_at: knex.fn.now(),
        });
    }
  }

  return { processed, resolved, failed };
}

module.exports = {
  deleteUserAccount,
  processPendingDeletions,
};
