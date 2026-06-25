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

    await knex("images").where({ id: imageId }).update(updatePayload);
    scheduleDiscoverReindex(knex, imageRow.profile_id);
  } catch (err) {
    console.warn("[PITS] runImageClassification failed:", imageId, err.message);
  }
}

module.exports = { runImageClassification };
