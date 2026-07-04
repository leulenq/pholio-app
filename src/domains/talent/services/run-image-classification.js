"use strict";

const { classifyShotHeuristic } = require("../../ai/heuristic-shot-classifier");
const { classifyPortfolioImage } = require("../../ai/classify-portfolio-image");
const { reindexDiscoverProfile } = require("../../ai/embeddings");
const { fetchImageBuffer } = require("../../../shared/lib/fetch-image-buffer");
const {
  applyClassificationPolicy,
} = require("./image-classification-policy");

const DISCOVER_REINDEX_DEBOUNCE_MS = 5000;
const discoverReindexTimers = new Map();

function parseMetadata(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

async function readImageBuffer(imageRow) {
  return fetchImageBuffer(imageRow);
}

async function detectFacesOptional(buffer) {
  if (!buffer) return [];
  try {
    const { detectFaces } = require("../../pdf/composition/perception/faces");
    return await detectFaces(buffer);
  } catch {
    return [];
  }
}

function extractImageIntel(metadata) {
  const m = parseMetadata(metadata);
  if (m.width && m.height) return m;
  return {
    width: m.width ?? null,
    height: m.height ?? null,
    forensics: m.forensics ?? null,
  };
}

function scheduleDiscoverReindex(knex, profileId) {
  if (!profileId) return;

  const existingTimer = discoverReindexTimers.get(profileId);
  if (existingTimer) {
    clearTimeout(existingTimer);
  }

  const timer = setTimeout(() => {
    discoverReindexTimers.delete(profileId);
    reindexDiscoverProfile(knex, profileId).catch((err) => {
      console.warn(
        "[PITS] discover reindex failed:",
        profileId,
        err?.message || String(err),
      );
    });
  }, DISCOVER_REINDEX_DEBOUNCE_MS);

  if (typeof timer.unref === "function") {
    timer.unref();
  }

  discoverReindexTimers.set(profileId, timer);
}

/**
 * Full PITS pipeline for one image row.
 * @param {import('knex').Knex} knex
 * @param {string} imageId
 */
async function runImageClassification(knex, imageId) {
  try {
    const imageRow = await knex("images").where({ id: imageId }).first();
    if (!imageRow) return;

    // Age/consent authority for the minor-image safety lock (audit P0-8). The
    // policy re-evaluates exclusion from this and forces it if needed.
    const profile = imageRow.profile_id
      ? await knex("profiles")
          .where({ id: imageRow.profile_id })
          .select("id", "date_of_birth", "guardian_consent_at")
          .first()
      : null;

    const metadata = parseMetadata(imageRow.metadata);
    const imageIntel = extractImageIntel(metadata);
    const buffer = await readImageBuffer(imageRow);
    const faces = await detectFacesOptional(buffer);

    const heuristicDraft = classifyShotHeuristic({
      width: imageIntel.width,
      height: imageIntel.height,
      faces,
    });

    const classification = await classifyPortfolioImage({
      imageBuffer: buffer,
      heuristicDraft,
      imageIntel,
      imageRow,
    });

    if (!classification) return;

    const { band, columnUpdates, metadataPatch } = applyClassificationPolicy({
      imageRow,
      classification,
      profile,
    });

    const mergedMetadata = {
      ...metadata,
      ...metadataPatch,
      ...(metadataPatch.ai
        ? {
            ai: {
              ...(metadata.ai || {}),
              ...metadataPatch.ai,
            },
          }
        : {}),
    };

    const updatePayload = {
      metadata: JSON.stringify(mergedMetadata),
      ...columnUpdates,
    };

    // Atomic write: the classification tags AND any forced minor/sensitive
    // exclusion land in the SAME UPDATE, wrapped in a transaction, so there is
    // never a window where the image is tagged sensitive yet still exposed.
    await knex.transaction(async (trx) => {
      await trx("images").where({ id: imageId }).update(updatePayload);
    });
    scheduleDiscoverReindex(knex, imageRow.profile_id);
  } catch (err) {
    console.warn("[PITS] runImageClassification failed:", imageId, err.message);
  }
}

module.exports = { runImageClassification };
