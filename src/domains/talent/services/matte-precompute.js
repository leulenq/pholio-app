"use strict";

/**
 * Subject-matte precompute at upload (comp-card editions, phase 1.3).
 *
 * Precomputes the comp-card subject matte right after an image upload
 * finishes its existing post-processing (PITS classification), for frames
 * whose backdrop is studio-classified — so matte-gated comp-card looks are
 * actually available at generation time instead of being computed lazily
 * inside the PDF request's strict time budget (or never, when the budget
 * expires first).
 *
 * Storage — the EXISTING cache, unchanged:
 *   images.metadata.matte  (jsonb column, 20260205000000_add_metadata_to_images)
 *     { maskGrid, width, height, version, source }   → usable matte
 *     { unavailable: true, version }                 → known-unmattable marker
 * This is exactly the shape loadCompCardMattes() in
 * src/domains/pdf/routes/pdf.js reads first (before its lazy compute path),
 * so the PDF route consumes precomputed entries with zero route changes.
 *
 * Eligibility (studio-classified frames first, per the plan):
 *   1. the PITS classification background signal
 *      (metadata.ai.signals.background or metadata.ai.classification.signals
 *      .background) is "plain" or "studio";
 *   2. when no background signal exists (e.g. Groq vision unavailable), the
 *      upload-time image forensics fall back in: both vertical edge bands
 *      quiet (score ≥ 0.7) reads as a clean/plain backdrop. computeStudioMatte
 *      itself re-verifies the backdrop per-row and refuses busy frames, so
 *      this pre-filter only needs to be roughly right.
 *   Frames with an explicit "environmental" signal, videos, and frames that
 *   already carry a matte (or an unavailable marker) are skipped.
 *
 * Engineering:
 *   - Never blocks or slows the upload response: callers chain this behind
 *     the existing fire-and-forget PITS classification job.
 *   - One global in-process queue with concurrency 1, so a 12-image bulk
 *     upload never stampedes the (potentially heavy) matting path.
 *   - @imgly/background-removal-node stays optional: computeBestMatte falls
 *     back to the sharp-only studio matte, then to null. All failures are
 *     logged and swallowed; enqueueMattePrecompute() never rejects.
 */

const { fetchImageBuffer } = require("../../../shared/lib/fetch-image-buffer");

const MATTE_PRECOMPUTE_CONCURRENCY = 1;
const STUDIO_BACKGROUNDS = new Set(["plain", "studio"]);
const FORENSICS_EDGE_QUIET_MIN = 0.7;

function parseMetadata(raw) {
  if (!raw) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed;
      }
    } catch {
      /* ignore */
    }
  }
  return {};
}

/** PITS background signal ("plain" | "studio" | "environmental" | ""). */
function backgroundSignalFromMetadata(metadata) {
  const m = metadata && typeof metadata === "object" ? metadata : {};
  const ai = m.ai && typeof m.ai === "object" ? m.ai : {};
  const signals =
    (ai.signals && typeof ai.signals === "object" && ai.signals) ||
    (ai.classification &&
      typeof ai.classification === "object" &&
      typeof ai.classification.signals === "object" &&
      ai.classification.signals) ||
    null;
  const raw = signals ? signals.background : null;
  return raw ? String(raw).toLowerCase() : "";
}

/**
 * Forensics fallback: both vertical edge bands quiet reads as a clean
 * backdrop (studio seamless varies vertically, not horizontally — the same
 * physical assumption computeStudioMatte verifies exactly).
 */
function forensicsLooksStudio(forensics) {
  const left = Number(forensics?.quiet?.left?.score);
  const right = Number(forensics?.quiet?.right?.score);
  return (
    Number.isFinite(left) &&
    Number.isFinite(right) &&
    left >= FORENSICS_EDGE_QUIET_MIN &&
    right >= FORENSICS_EDGE_QUIET_MIN
  );
}

/**
 * Is this images-table row worth precomputing a matte for?
 * @param {object|null} imageRow
 * @returns {{ eligible: boolean, reason: string }}
 */
function isMatteEligible(imageRow) {
  if (!imageRow || imageRow.id == null) {
    return { eligible: false, reason: "no-image" };
  }
  if ((imageRow.asset_kind || "image") !== "image") {
    return { eligible: false, reason: "not-an-image" };
  }
  if (
    !imageRow.absolute_path &&
    !imageRow.storage_key &&
    !imageRow.public_url &&
    !imageRow.path
  ) {
    return { eligible: false, reason: "no-source" };
  }
  const metadata = parseMetadata(imageRow.metadata);
  const cached = metadata.matte;
  if (
    cached === false ||
    (cached &&
      typeof cached === "object" &&
      (Array.isArray(cached.maskGrid) || cached.unavailable))
  ) {
    return { eligible: false, reason: "cached" };
  }
  const background = backgroundSignalFromMetadata(metadata);
  if (background) {
    return STUDIO_BACKGROUNDS.has(background)
      ? { eligible: true, reason: `background-${background}` }
      : { eligible: false, reason: `background-${background}` };
  }
  if (forensicsLooksStudio(metadata.forensics)) {
    return { eligible: true, reason: "forensics-quiet-edges" };
  }
  return { eligible: false, reason: "no-studio-signal" };
}

/** Lazy, fail-soft access to the existing matte pipeline. */
function getMatteModule() {
  try {
    // eslint-disable-next-line global-require
    return require("../../pdf/composition/perception/matte");
  } catch {
    return null;
  }
}

function sharpAvailable() {
  try {
    require.resolve("sharp");
    return true;
  } catch {
    return false;
  }
}

/**
 * Compute + persist the matte for one image row (the queue's job body).
 * Reuses computeBestMatte (real alpha matte when @imgly is installed, else
 * the sharp-only studio matte) and writes into the existing
 * images.metadata.matte cache slot. Distinguishes transient misses (no bytes
 * readable → no marker, retryable later) from genuine refusals (bytes read,
 * matte unverifiable → unavailable marker, same semantics as the PDF route).
 *
 * @param {import('knex').Knex} knex
 * @param {string} imageId
 * @returns {Promise<{ status: string, reason?: string, source?: string }>}
 */
async function precomputeMatteForImage(knex, imageId) {
  const imageRow = await knex("images").where({ id: imageId }).first();
  const { eligible, reason } = isMatteEligible(imageRow);
  if (!eligible) return { status: "skipped", reason };

  const matteModule = getMatteModule();
  if (!matteModule || !sharpAvailable()) {
    return { status: "skipped", reason: "deps-unavailable" };
  }

  const buffer = await fetchImageBuffer(imageRow);
  if (!buffer || !buffer.length) {
    // Transient (storage lag, missing local file): no marker, so the PDF
    // route's lazy path — or a later precompute — can still try.
    return { status: "skipped", reason: "no-bytes" };
  }

  const matte = await matteModule.computeBestMatte(buffer);

  // Re-read metadata just before writing: the classification job (or a user
  // metadata PATCH) may have written since our eligibility read.
  const fresh = await knex("images")
    .where({ id: imageId })
    .select("metadata")
    .first();
  if (!fresh) return { status: "skipped", reason: "row-deleted" };
  const metadata = {
    ...parseMetadata(fresh.metadata),
    matte: matte || { unavailable: true, version: matteModule.MATTE_VERSION },
  };
  await knex("images")
    .where({ id: imageId })
    .update({ metadata: JSON.stringify(metadata) });

  return matte
    ? { status: "computed", source: matte.source || "alpha" }
    : { status: "unavailable" };
}

// ── Global in-process queue (concurrency 1; bulk uploads never stampede) ──
const pendingJobs = [];
const inFlightByImage = new Map();
let activeCount = 0;

function drainMatteQueue() {
  while (
    activeCount < MATTE_PRECOMPUTE_CONCURRENCY &&
    pendingJobs.length > 0
  ) {
    const { run, resolve } = pendingJobs.shift();
    activeCount += 1;
    run().then((result) => {
      activeCount -= 1;
      resolve(result);
      drainMatteQueue();
    });
  }
}

/**
 * Queue a matte precompute for an image. Fire-and-forget safe: the returned
 * promise NEVER rejects (it resolves with a { status, reason? } result).
 * Duplicate enqueues for an image already queued/running return the same
 * promise. In the test environment this is a no-op unless options.force is
 * set (mirrors the NODE_ENV === "test" guard in loadCompCardMattes).
 *
 * @param {import('knex').Knex} knex
 * @param {string} imageId
 * @param {{ force?: boolean }} [options]
 * @returns {Promise<{ status: string, reason?: string, source?: string }>}
 */
function enqueueMattePrecompute(knex, imageId, options = {}) {
  if (!imageId) {
    return Promise.resolve({ status: "skipped", reason: "no-image" });
  }
  if (process.env.NODE_ENV === "test" && !options.force) {
    return Promise.resolve({ status: "skipped", reason: "test-env" });
  }
  const key = String(imageId);
  const existing = inFlightByImage.get(key);
  if (existing) return existing;

  const promise = new Promise((resolve) => {
    pendingJobs.push({
      run: async () => {
        try {
          const result = await precomputeMatteForImage(knex, imageId);
          if (result.status === "computed") {
            console.info(
              `[matte-precompute] ${imageId}: cached matte (source=${result.source})`,
            );
          }
          return result;
        } catch (err) {
          // Upload UX is never affected: log and swallow.
          console.warn(
            "[matte-precompute] failed:",
            imageId,
            err?.message || String(err),
          );
          return { status: "failed", reason: err?.message || "error" };
        }
      },
      resolve,
    });
    drainMatteQueue();
  }).finally(() => {
    inFlightByImage.delete(key);
  });
  inFlightByImage.set(key, promise);
  return promise;
}

module.exports = {
  enqueueMattePrecompute,
  precomputeMatteForImage,
  isMatteEligible,
  backgroundSignalFromMetadata,
  forensicsLooksStudio,
  MATTE_PRECOMPUTE_CONCURRENCY,
  FORENSICS_EDGE_QUIET_MIN,
};
