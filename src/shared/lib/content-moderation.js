/**
 * Content moderation infrastructure (legal audit Phase 1).
 *
 * This module provides a *pluggable* moderation layer that runs at upload time.
 * The default provider ("heuristic") performs conservative, dependency-free
 * image analysis with sharp: it rejects obviously broken/undecodable files and
 * flags images that exhibit signals correlated with explicit content (very high
 * skin-tone pixel ratio, or extreme aspect ratios) for human review.
 *
 * Design principle: FAIL TOWARD REVIEW. The heuristic must never auto-approve
 * something it is unsure about, and any analysis failure escalates to `review`
 * rather than silently approving.
 *
 * WS10 launch posture (manual review queue): a `review` verdict is never a
 * silent state — it always pairs with a pending `moderation_queue` row (the
 * upload routes and applyModerationResult both enqueue via
 * enqueueImageForReview), actioned either through the moderator API
 * (`/api/moderation/queue`) or the ops CLI (`scripts/moderation-queue.js`).
 *
 * Providers (MODERATION_PROVIDER / config.moderation.provider):
 *   - `heuristic` (default): the sharp-based analysis described above.
 *   - `hive` (+ HIVE_API_KEY): Hive visual moderation (./moderation/hive.js)
 *     runs as an ESCALATION-ONLY second pass after the heuristic approves — it
 *     can flag to `review`, never auto-reject, and it never loosens a heuristic
 *     flag. Heuristic-flagged images keep their exact heuristic reason string,
 *     so the CSAM escalation heuristics keyed on those reasons
 *     (csam-moderation.js, tasks/csam-escalation-runbook.md) fire exactly as
 *     before. Any Hive failure (missing key, timeout, API error) logs and
 *     falls back to the heuristic result — an upload never fails because the
 *     vendor is down.
 */
const crypto = require("crypto");
const { getSharp } = require("./lazy-sharp");
const { analyzeBufferWithHive } = require("./moderation/hive");

const MODERATION_STATUS = Object.freeze({
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
  REVIEW: "review",
});

const MODERATION_QUEUE_STATUS = Object.freeze({
  PENDING: "pending",
  APPROVED: "approved",
  REJECTED: "rejected",
});

// Statuses that must NOT be shown to agencies or the public.
const HIDDEN_FROM_VIEWERS = Object.freeze([
  MODERATION_STATUS.REJECTED,
  MODERATION_STATUS.REVIEW,
]);

// ---------------------------------------------------------------------------
// Column-existence cache for deploy-before-migrate safety
// ---------------------------------------------------------------------------
// applyViewerVisibilityFilter emits a WHERE clause against `moderation_status`.
// If the migration that adds that column hasn't run yet (deploy-before-migrate
// window), the clause causes a 500. This module-level flag caches whether the
// column exists so the filter can be a safe no-op when it doesn't.
//
// null  = not yet checked (first request will trigger the check via ensureModerationColumnChecked)
// true  = column confirmed present — filter is active
// false = column confirmed absent — filter is a no-op
let _hasModerationColumn = null;

/**
 * Warm the column-existence cache. Await this once per route handler (or once
 * at startup) before any query that calls applyViewerVisibilityFilter. Safe to
 * call many times — all calls after the first are synchronous no-ops.
 *
 * @param {import('knex').Knex} knex
 * @returns {Promise<boolean>}
 */
async function ensureModerationColumnChecked(knex) {
  if (_hasModerationColumn === null) {
    _hasModerationColumn = await knex.schema.hasColumn(
      "images",
      "moderation_status",
    );
  }
  return _hasModerationColumn;
}

// --- Heuristic tuning -------------------------------------------------------
// Conservative thresholds; tuned to err toward `review`, not auto-approve.
const SKIN_SAMPLE_SIZE = 64; // downsample to NxN before pixel sampling
const SKIN_RATIO_REVIEW_THRESHOLD = 0.6; // >60% skin-tone pixels → review
const EXTREME_ASPECT_RATIO = 3.0; // very tall/wide framing → review

/**
 * Resolve the configured moderation provider. Pluggable via env so a real
 * vendor can be wired in without touching call sites.
 * @returns {string}
 */
function getModerationProvider() {
  const provider = String(process.env.MODERATION_PROVIDER || "heuristic")
    .toLowerCase()
    .trim();
  return provider || "heuristic";
}

/**
 * Simple RGB skin-tone classifier (Kovac et al. style rule). Intentionally
 * crude — it only feeds an aggregate ratio used to escalate to human review.
 */
function isSkinTonePixel(r, g, b) {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  return (
    r > 95 &&
    g > 40 &&
    b > 20 &&
    max - min > 15 &&
    Math.abs(r - g) > 15 &&
    r > g &&
    r > b
  );
}

/**
 * Compute the fraction of sampled pixels classified as skin-tone.
 * @param {Buffer} buffer
 * @returns {Promise<number>} ratio in [0, 1]
 */
async function computeSkinToneRatio(buffer) {
  const sharp = getSharp();
  if (!sharp) return 0;

  const { data, info } = await sharp(buffer)
    .resize(SKIN_SAMPLE_SIZE, SKIN_SAMPLE_SIZE, {
      fit: "fill",
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const channels = info.channels || 3;
  if (channels < 3) {
    // Grayscale or single-channel — skin-tone heuristic is not meaningful.
    return 0;
  }

  let skin = 0;
  let total = 0;
  for (let i = 0; i + 2 < data.length; i += channels) {
    total += 1;
    if (isSkinTonePixel(data[i], data[i + 1], data[i + 2])) {
      skin += 1;
    }
  }
  return total > 0 ? skin / total : 0;
}

/**
 * Analyze a processed image buffer and return a conservative moderation result.
 *
 * @param {Buffer} buffer - processed image bytes (e.g. webp from processImage)
 * @returns {Promise<{status: string, reason: string|null, flags: object, provider: string}>}
 */
async function analyzeImageBuffer(buffer) {
  const configuredProvider = getModerationProvider();
  const provider = configuredProvider;
  const flags = { provider };

  // Provider dispatch: `hive` layers on top of the heuristic below (see module
  // header). Anything we don't recognize falls back to the heuristic so we
  // never accidentally bypass moderation entirely.

  if (!buffer || !Buffer.isBuffer(buffer) || buffer.length === 0) {
    return {
      status: MODERATION_STATUS.REVIEW,
      reason: "missing_buffer",
      flags: { ...flags, missingBuffer: true },
      provider,
    };
  }

  let meta;
  try {
    const sharp = getSharp();
    if (!sharp) {
      return {
        status: MODERATION_STATUS.REVIEW,
        reason: "sharp_unavailable",
        flags: { ...flags, sharpUnavailable: true },
        provider,
      };
    }
    meta = await sharp(buffer).metadata();
  } catch (err) {
    // Undecodable / corrupt image is an obvious failure → reject.
    return {
      status: MODERATION_STATUS.REJECTED,
      reason: "undecodable_image",
      flags: { ...flags, undecodable: true },
      provider,
    };
  }

  const width = Number(meta.width) || 0;
  const height = Number(meta.height) || 0;
  if (!width || !height) {
    return {
      status: MODERATION_STATUS.REJECTED,
      reason: "invalid_dimensions",
      flags: { ...flags, invalidDimensions: true, width, height },
      provider,
    };
  }

  flags.width = width;
  flags.height = height;

  const aspect = Math.max(width / height, height / width);
  flags.aspectRatio = Number(aspect.toFixed(3));

  let skinRatio;
  try {
    skinRatio = await computeSkinToneRatio(buffer);
    flags.skinRatio = Number(skinRatio.toFixed(4));
  } catch (err) {
    // If we cannot sample pixels we cannot vouch for the image → review.
    return {
      status: MODERATION_STATUS.REVIEW,
      reason: "sampling_failed",
      flags: { ...flags, samplingFailed: true },
      provider,
    };
  }

  const highSkin = skinRatio >= SKIN_RATIO_REVIEW_THRESHOLD;
  const extremeAspect = aspect >= EXTREME_ASPECT_RATIO;

  if (highSkin || extremeAspect) {
    const reasons = [];
    if (highSkin) reasons.push("high_skin_ratio");
    if (extremeAspect) reasons.push("extreme_aspect_ratio");
    // Heuristic flags win outright — Hive is escalation-only and must never
    // loosen this verdict, and the reason string stays byte-identical so
    // csam-moderation.js's reason matching is unaffected by provider choice.
    return {
      status: MODERATION_STATUS.REVIEW,
      reason: reasons.join(","),
      flags: { ...flags, highSkin, extremeAspect },
      provider: "heuristic",
    };
  }

  // Heuristic approved. When Hive is configured, give the vendor a chance to
  // escalate to the manual review queue (never to reject). On any Hive
  // failure the heuristic approval stands — the upload must not fail and must
  // not silently vanish.
  if (configuredProvider === "hive") {
    const hive = await analyzeBufferWithHive(buffer);
    if (hive) {
      return {
        status:
          hive.status === MODERATION_STATUS.REVIEW
            ? MODERATION_STATUS.REVIEW
            : MODERATION_STATUS.APPROVED,
        reason: hive.reason || null,
        flags: { ...flags, ...hive.flags, provider: "hive" },
        provider: "hive",
      };
    }
    console.warn(
      "[moderation] hive provider unavailable — using heuristic verdict for this upload",
    );
    flags.hiveFallback = true;
  }

  return {
    status: MODERATION_STATUS.APPROVED,
    reason: null,
    flags: { ...flags, provider: "heuristic" },
    provider: "heuristic",
  };
}

/**
 * Ensure a pending `moderation_queue` row exists for a flagged image, so a
 * `review` verdict is always visible and actionable (WS10) rather than a
 * silent DB state. Idempotent: an existing pending row for the image is
 * reused, not duplicated. Safe no-op when the queue table hasn't been
 * migrated yet.
 *
 * @param {import('knex').Knex|import('knex').Knex.Transaction} db
 * @param {{imageId: string, profileId?: string|null, flags?: object|null}} params
 * @returns {Promise<string|null>} the queue row id, or null when unavailable
 */
async function enqueueImageForReview(db, { imageId, profileId = null, flags = null } = {}) {
  if (!imageId) return null;
  const hasQueue = await db.schema.hasTable("moderation_queue");
  if (!hasQueue) return null;

  const existing = await db("moderation_queue")
    .where({ image_id: imageId, status: MODERATION_QUEUE_STATUS.PENDING })
    .first();
  if (existing) return existing.id;

  const id = crypto.randomUUID();
  await db("moderation_queue").insert({
    id,
    image_id: imageId,
    profile_id: profileId,
    status: MODERATION_QUEUE_STATUS.PENDING,
    flags: JSON.stringify(flags && typeof flags === "object" ? flags : {}),
    created_at: db.fn.now(),
  });
  return id;
}

/**
 * Persist a moderation result onto the images row. A `review` status also
 * guarantees a pending moderation_queue row (visible manual review queue) so
 * no caller can leave a flagged image in silent limbo.
 *
 * @param {import('knex').Knex} knex
 * @param {string} imageId
 * @param {{status: string, reason?: string|null, flags?: object}} result
 * @param {{profileId?: string|null}} [opts]
 * @returns {Promise<string>} the applied status
 */
async function applyModerationResult(knex, imageId, result, opts = {}) {
  const status = result?.status || MODERATION_STATUS.REVIEW;
  await knex("images")
    .where({ id: imageId })
    .update({
      moderation_status: status,
      moderation_reason: result?.reason || null,
      moderated_at: knex.fn.now(),
    });

  if (status === MODERATION_STATUS.REVIEW) {
    let profileId = opts.profileId ?? null;
    if (!profileId) {
      const row = await knex("images")
        .where({ id: imageId })
        .select("profile_id")
        .first();
      profileId = row?.profile_id || null;
    }
    await enqueueImageForReview(knex, {
      imageId,
      profileId,
      flags: result?.flags || null,
    });
  }

  return status;
}

/**
 * Whether an image row may be shown to agencies / the public.
 *
 * Conservative but legacy-safe: rows that are `rejected` or `review` are hidden;
 * `null`/`pending`/`approved` are visible. `pending` stays visible because the
 * column default backfills every pre-existing image to `pending`, and the
 * upload heuristic promotes new uploads to `approved`/`review`/reject — so
 * `pending` effectively means "legacy / not-yet-analyzed", not "suspected".
 *
 * @param {{moderation_status?: string|null}} image
 * @returns {boolean}
 */
function isImageVisibleToViewer(image) {
  if (!image) return false;
  const status = image.moderation_status;
  if (status == null) return true;
  return !HIDDEN_FROM_VIEWERS.includes(status);
}

/**
 * Apply the viewer-visibility moderation filter to a knex query builder.
 * Hides `rejected`/`review`; allows `null`/`pending`/`approved`.
 *
 * Deploy-before-migrate safety: if ensureModerationColumnChecked() has been
 * awaited and determined the column is absent, this function is a no-op
 * (returns qb unchanged) instead of emitting a WHERE that would 500.
 * Once the column exists the behaviour is identical to the original.
 *
 * @param {import('knex').Knex.QueryBuilder} qb
 * @param {string} [column="moderation_status"] - qualified or bare column name
 * @returns {import('knex').Knex.QueryBuilder}
 */
function applyViewerVisibilityFilter(qb, column = "moderation_status") {
  // If the column has been confirmed absent, skip the filter entirely.
  if (_hasModerationColumn === false) {
    return qb;
  }
  return qb.where(function moderationVisible() {
    this.whereNull(column).orWhereNotIn(column, HIDDEN_FROM_VIEWERS);
  });
}

module.exports = {
  MODERATION_STATUS,
  MODERATION_QUEUE_STATUS,
  HIDDEN_FROM_VIEWERS,
  getModerationProvider,
  analyzeImageBuffer,
  applyModerationResult,
  enqueueImageForReview,
  isImageVisibleToViewer,
  applyViewerVisibilityFilter,
  ensureModerationColumnChecked,
  isSkinTonePixel,
  computeSkinToneRatio,
};
