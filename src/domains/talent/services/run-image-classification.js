"use strict";

const { classifyShotHeuristic } = require("../../ai/heuristic-shot-classifier");
const {
  classifyPortfolioImage,
  persistImageSignals,
} = require("../../ai/classify-portfolio-image");
const { fetchImageBuffer } = require("../../../shared/lib/fetch-image-buffer");
const {
  hasRecordedDateOfBirth,
  isMinorProfile,
} = require("../../../shared/lib/talent-age");
const {
  applyClassificationPolicy,
} = require("./image-classification-policy");


function imageAiProcessingAllowed(profile, env = process.env) {
  return (
    env.PHOLIO_ENABLE_IMAGE_ANALYSIS === "true" &&
    (profile?.ai_processing_consent === true ||
      profile?.ai_processing_consent === 1) &&
    hasRecordedDateOfBirth(profile) &&
    !isMinorProfile(profile)
  );
}

async function loadAuthoritativeProfile(
  knex,
  profileId,
  { forUpdate = false } = {},
) {
  if (!profileId) return null;
  const columns = ["id", "date_of_birth", "guardian_consent_at"];
  if (await knex.schema.hasColumn("profiles", "ai_processing_consent")) {
    columns.push("ai_processing_consent");
  }
  let query = knex("profiles").where({ id: profileId }).select(columns);
  if (
    forUpdate &&
    ["pg", "postgres", "postgresql"].includes(knex.client?.config?.client)
  ) {
    query = query.forUpdate();
  }
  return query.first();
}

function disabledClassificationMetadata(rawMetadata) {
  const metadata = parseMetadata(rawMetadata);
  const existing = metadata.ai?.classification || {};
  if (existing.band !== "pending") return null;
  return {
    ...metadata,
    ai: {
      ...(metadata.ai || {}),
      classification: {
        ...existing,
        band: "disabled",
        source: "disabled",
        confirmed: false,
        reason: "image_processing_disabled",
      },
    },
  };
}

async function markClassificationDisabled(knex, imageId) {
  await knex.transaction(async (trx) => {
    const image = await trx("images").where({ id: imageId }).first();
    const metadata = disabledClassificationMetadata(image?.metadata);
    if (!metadata) return;
    await trx("images")
      .where({ id: imageId })
      .update({ metadata: JSON.stringify(metadata) });
  });
}

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

    // Jobs can wait in the queue while the talent changes consent or DOB.
    // Read the authoritative profile only after local preparation, immediately
    // before the provider boundary. The classifier repeats this callback beside
    // the actual Groq invocation.
    const currentProfile = await loadAuthoritativeProfile(
      knex,
      imageRow.profile_id,
    );
    if (!imageAiProcessingAllowed(currentProfile)) {
      await markClassificationDisabled(knex, imageId);
      return;
    }

    const classification = await classifyPortfolioImage({
      imageBuffer: buffer,
      heuristicDraft,
      imageIntel,
      imageRow,
      db: knex,
      persistResult: false,
      beforeProviderCall: async () => {
        const providerProfile = await loadAuthoritativeProfile(
          knex,
          imageRow.profile_id,
        );
        return imageAiProcessingAllowed(providerProfile);
      },
    });

    if (!classification) return;

    await knex.transaction(async (trx) => {
      // Locking the profile on PostgreSQL serializes this write with consent
      // withdrawal. If withdrawal won the race, the provider result is dropped;
      // if this lock won, withdrawal follows and performs its cleanup after us.
      const profile = await loadAuthoritativeProfile(trx, imageRow.profile_id, {
        forUpdate: true,
      });
      const freshImage = await trx("images").where({ id: imageId }).first();
      if (!freshImage) return;
      if (!imageAiProcessingAllowed(profile)) {
        const disabledMetadata = disabledClassificationMetadata(
          freshImage.metadata,
        );
        if (disabledMetadata) {
          await trx("images")
            .where({ id: imageId })
            .update({ metadata: JSON.stringify(disabledMetadata) });
        }
        return;
      }

      const freshMetadata = parseMetadata(freshImage.metadata);
      const { columnUpdates, metadataPatch } = applyClassificationPolicy({
        imageRow: freshImage,
        classification,
        profile,
      });
      const mergedMetadata = {
        ...freshMetadata,
        ...metadataPatch,
        ...(metadataPatch.ai
          ? {
              ai: {
                ...(freshMetadata.ai || {}),
                ...metadataPatch.ai,
              },
            }
          : {}),
      };

      // Classification tags, the minor/sensitive safety lock, and structured
      // signals commit together only while current consent remains valid.
      await trx("images")
        .where({ id: imageId })
        .update({
          metadata: JSON.stringify(mergedMetadata),
          ...columnUpdates,
        });
      await persistImageSignals(trx, imageId, classification);
    });
  } catch (err) {
    console.warn("[PITS] runImageClassification failed:", imageId, err.message);
  }
}

module.exports = {
  runImageClassification,
  imageAiProcessingAllowed,
  loadAuthoritativeProfile,
  disabledClassificationMetadata,
};
