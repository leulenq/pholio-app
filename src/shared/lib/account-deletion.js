const crypto = require("crypto");
const { deleteUser } = require("../../domains/auth/services/firebase-admin");
const {
  collectExternalCardArtifacts,
  collectImageArtifacts,
  deleteLocalFiles,
  deleteR2Objects,
} = require("./media-artifact-deletion");
const {
  TABLES_REQUIRING_EXPLICIT_CLEANUP,
} = require("./talent-data-inventory");

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
 * The retry consumer below claims these rows with expiring leases and applies
 * bounded exponential backoff.
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
          "absolute_path",
          "original_absolute_path",
        )
    : [];
  const externalCards =
    profile && (await knex.schema.hasTable("external_comp_cards"))
      ? await knex("external_comp_cards")
          .where({ profile_id: profile.id })
          .select("storage_key", "public_url")
      : [];

  const allKeys = new Set();
  const allLocalPaths = new Set();
  for (const image of images) {
    const artifacts = collectImageArtifacts(image);
    for (const key of artifacts.r2Keys) allKeys.add(key);
    for (const filePath of artifacts.localPaths) allLocalPaths.add(filePath);
  }
  for (const card of externalCards) {
    const artifacts = collectExternalCardArtifacts(card);
    for (const key of artifacts.r2Keys) allKeys.add(key);
    for (const filePath of artifacts.localPaths) allLocalPaths.add(filePath);
  }

  const [r2Result, localResult] = await Promise.all([
    deleteR2Objects(allKeys),
    deleteLocalFiles(allLocalPaths),
  ]);

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
  const localFailed = localResult.failed > 0;
  const firebaseFailed = !!user.firebase_uid && !firebaseDeleted;
  const fullyErased = !r2Failed && !localFailed && !firebaseFailed;

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
  if (localFailed) {
    const id = await recordDeletionFailure(knex, {
      userId,
      firebaseUid: user.firebase_uid || null,
      provider: "local_media",
      payload: { failedPaths: localResult.failedPaths },
      error: `${localResult.failed}/${localResult.attempted} local artifact deletes failed`,
    });
    if (id) pendingFailureIds.push(id);
  }

  const failedProviderGroups =
    Number(r2Failed) + Number(firebaseFailed) + Number(localFailed);
  const failuresDurablyQueued =
    failedProviderGroups === 0 || pendingFailureIds.length === failedProviderGroups;

  // Never discard the only inventory of objects that still need erasure. If
  // the retry table is absent (or could not record every failed provider), the
  // account row remains and the caller receives a retryable failure.
  if (!failuresDurablyQueued) {
    return {
      deleted: false,
      userFound: true,
      inventoryRetained: true,
      imagesScanned: images.length,
      externalCardsScanned: externalCards.length,
      r2KeysAttempted: r2Result.attempted,
      deletedR2Objects: r2Result.deleted,
      failedR2Objects: r2Result.failed,
      localFilesAttempted: localResult.attempted,
      failedLocalFiles: localResult.failed,
      firebaseAttempted: !!user.firebase_uid,
      firebaseDeleted,
      fullyErased: false,
      pendingFailureIds,
    };
  }

  await cleanupTablesWithoutCascade(knex, { userId, profileId: profile?.id || null });
  const deletedRows = await knex("users").where({ id: userId }).del();

  return {
    deleted: deletedRows > 0,
    userFound: true,
    imagesScanned: images.length,
    externalCardsScanned: externalCards.length,
    r2KeysAttempted: r2Result.attempted,
    deletedR2Objects: r2Result.deleted,
    failedR2Objects: r2Result.failed,
    localFilesAttempted: localResult.attempted,
    failedLocalFiles: localResult.failed,
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

const DEFAULT_RETRY_LIMIT = 25;
const MAX_RETRY_LIMIT = 100;
const DEFAULT_LEASE_MS = 5 * 60 * 1000;
const BASE_BACKOFF_MS = 60 * 1000;
const MAX_BACKOFF_MS = 24 * 60 * 60 * 1000;

function retryDelayMs(attempts) {
  const exponent = Math.max(0, Math.min(10, Number(attempts || 1) - 1));
  return Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** exponent);
}

function isDueForRetry(row, nowMs) {
  const nextAttempt = row.next_attempt_at
    ? new Date(row.next_attempt_at).getTime()
    : 0;
  const leaseExpiry = row.lease_expires_at
    ? new Date(row.lease_expires_at).getTime()
    : 0;
  return (
    (!Number.isFinite(nextAttempt) || nextAttempt <= nowMs) &&
    (!Number.isFinite(leaseExpiry) || leaseExpiry <= nowMs)
  );
}

/**
 * Process one bounded retry batch. Conditional lease claims prevent two
 * overlapping schedulers from acting on the same provider target, while an
 * expiry allows recovery after a crashed worker.
 *
 * @param {import('knex').Knex} knex
 * @param {{limit?: number, leaseMs?: number, now?: Date}} [options]
 */
async function processPendingDeletions(knex, options = {}) {
  if (!(await knex.schema.hasTable("account_deletion_failures"))) {
    return { processed: 0, resolved: 0, failed: 0 };
  }

  const requiredColumns = ["next_attempt_at", "lease_token", "lease_expires_at"];
  if (typeof knex.schema.hasColumn === "function") {
    for (const column of requiredColumns) {
      if (!(await knex.schema.hasColumn("account_deletion_failures", column))) {
        return {
          processed: 0,
          resolved: 0,
          failed: 0,
          unavailableReason: "retry_migration_required",
        };
      }
    }
  }

  const parsedLimit = Number(options.limit ?? DEFAULT_RETRY_LIMIT);
  const limit = Number.isFinite(parsedLimit)
    ? Math.max(1, Math.min(MAX_RETRY_LIMIT, Math.floor(parsedLimit)))
    : DEFAULT_RETRY_LIMIT;
  const parsedLeaseMs = Number(options.leaseMs ?? DEFAULT_LEASE_MS);
  const leaseMs = Number.isFinite(parsedLeaseMs)
    ? Math.max(30_000, parsedLeaseMs)
    : DEFAULT_LEASE_MS;
  const now = options.now instanceof Date ? options.now : new Date();
  const nowMs = now.getTime();

  const candidates = await knex("account_deletion_failures")
    .where({ status: "pending" })
    .orderBy("created_at", "asc")
    .limit(Math.min(limit * 4, MAX_RETRY_LIMIT * 4))
    .select();
  const pending = [];
  for (const candidate of candidates) {
    if (pending.length >= limit || !isDueForRetry(candidate, nowMs)) continue;
    const leaseToken = crypto.randomUUID();
    const claimed = await knex("account_deletion_failures")
      .where({
        id: candidate.id,
        status: "pending",
        lease_token: candidate.lease_token ?? null,
        lease_expires_at: candidate.lease_expires_at ?? null,
      })
      .update({
        lease_token: leaseToken,
        lease_expires_at: new Date(nowMs + leaseMs),
        last_attempt_at: now,
        updated_at: knex.fn.now(),
      });
    if (claimed === 1) pending.push({ ...candidate, leaseToken });
  }

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
            newPayload = JSON.stringify({
              ...payload,
              failedKeys: r2Result.failedKeys,
            });
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
    } else if (failure.provider === "local_media") {
      const payload = parsePayload(failure.payload);
      const failedPaths = payload?.failedPaths || [];
      if (failedPaths.length > 0) {
        try {
          const localResult = await deleteLocalFiles(new Set(failedPaths));
          if (localResult.failed === 0) {
            wasResolved = true;
            newPayload = null;
          } else {
            newPayload = JSON.stringify({
              ...payload,
              failedPaths: localResult.failedPaths,
            });
            lastError = `${localResult.failed}/${localResult.attempted} local artifact deletes failed`;
          }
        } catch (err) {
          lastError = err?.message || String(err);
        }
      } else {
        wasResolved = true;
        newPayload = null;
      }
    } else {
      lastError = `Unsupported deletion provider: ${failure.provider || "missing"}`;
    }

    if (wasResolved) {
      resolved++;
      await knex("account_deletion_failures")
        .where({ id: failure.id, lease_token: failure.leaseToken })
        .update({
          status: "resolved",
          attempts: Number(failure.attempts || 0) + 1,
          payload: null,
          last_error: null,
          resolved_at: knex.fn.now(),
          next_attempt_at: null,
          lease_token: null,
          lease_expires_at: null,
          updated_at: knex.fn.now(),
        });
    } else {
      failed++;
      await knex("account_deletion_failures")
        .where({ id: failure.id, lease_token: failure.leaseToken })
        .update({
          attempts: Number(failure.attempts || 0) + 1,
          payload: newPayload,
          last_error: lastError ? lastError.slice(0, 2000) : null,
          next_attempt_at: new Date(
            nowMs + retryDelayMs(Number(failure.attempts || 0) + 1),
          ),
          lease_token: null,
          lease_expires_at: null,
          updated_at: knex.fn.now(),
        });
    }
  }

  return { processed, resolved, failed };
}

function buildAccountDeletionResponse(result = {}) {
  if (result.deleted !== true) {
    return {
      status: 503,
      payload: {
        deleted: false,
        fullyErased: false,
        erasureStatus: "retry_required",
        redirect: null,
      },
    };
  }
  const fullyErased = result.fullyErased === true;
  return {
    status: fullyErased ? 200 : 202,
    payload: {
      deleted: result.deleted === true,
      fullyErased,
      erasureStatus: fullyErased ? "complete" : "pending_provider_purge",
      redirect: fullyErased ? "/login" : "/login?erasure=pending",
    },
  };
}

module.exports = {
  buildAccountDeletionResponse,
  deleteUserAccount,
  processPendingDeletions,
};
