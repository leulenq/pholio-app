"use strict";

const RIGHTS_CLEARED_STATUSES = new Set([
  "cleared",
  "licensed",
  "owned",
  "approved",
]);

const RIGHTS_LICENSE_BASES = new Set([
  "owned",
  "licensed",
  "model_release",
  "agency_permission",
  "editorial_release",
]);

const RIGHTS_DENIED_STATUSES = new Set([
  "denied",
  "blocked",
  "forbidden",
  "unlicensed",
  "restricted",
]);

function normalizeToken(value) {
  if (value == null) return "";
  return String(value).trim().toLowerCase();
}

function parseMetadata(metadata) {
  if (!metadata) return {};
  if (typeof metadata === "object" && !Array.isArray(metadata)) return metadata;
  if (typeof metadata !== "string") return {};
  try {
    const parsed = JSON.parse(metadata);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed;
    }
  } catch {
    // ignore malformed metadata
  }
  return {};
}

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value == null) continue;
    const text = String(value).trim();
    if (text) return text;
  }
  return "";
}

/**
 * @param {import("knex").Knex} knex
 * @param {Array<string>} imageIds
 * @returns {Promise<Map<string, Record<string, unknown>>>}
 */
async function loadImageRightsMap(knex, imageIds) {
  const ids = Array.from(
    new Set((Array.isArray(imageIds) ? imageIds : []).filter(Boolean)),
  );
  if (!ids.length) return new Map();

  const rows = await knex("image_rights")
    .whereIn("image_id", ids)
    .select(
      "image_id",
      "rights_status",
      "license_type",
      "copyright_owner",
      "photographer_name",
      "model_release_ref",
      "usage_scope",
      "territory",
      "start_at",
      "expires_at",
      "exclusive",
      "notes",
    );

  const map = new Map();
  for (const row of rows) {
    if (!row?.image_id) continue;
    map.set(String(row.image_id), row);
  }

  const hasReleasesTable = await knex.schema
    .hasTable("image_model_releases")
    .catch(() => false);
  if (hasReleasesTable) {
    const releaseRows = await knex("image_model_releases")
      .whereIn("image_id", ids)
      .select(
        "image_id",
        "release_ref",
        "release_url",
        "signer_name",
        "signer_role",
        "signed_at",
      );
    for (const release of releaseRows) {
      if (!release?.image_id) continue;
      const imageId = String(release.image_id);
      map.set(imageId, {
        ...(map.get(imageId) || { image_id: imageId }),
        release_ref: release.release_ref,
        release_url: release.release_url,
        release_signer_name: release.signer_name,
        release_signer_role: release.signer_role,
        release_signed_at: release.signed_at,
      });
    }
  }
  return map;
}

function hasCompleteModelRelease(rightsRow) {
  const artifact = firstNonEmpty(
    rightsRow?.release_ref,
    rightsRow?.release_url,
    rightsRow?.model_release_ref,
  );
  return Boolean(
    artifact &&
      firstNonEmpty(rightsRow?.release_signer_name) &&
      firstNonEmpty(rightsRow?.release_signed_at),
  );
}

/**
 * Distribution check — denial only.
 *
 * An image is distributable unless someone has actively marked it as denied
 * (for example after a dispute or a DMCA hold). Missing licensing metadata
 * is the default state of every upload and is not a signal of anything.
 *
 * `options` is retained for call-site compatibility and is unused.
 */
/**
 * Single source of truth for resolving an image's rights-status token across
 * every place it can live: a separate `image_rights` row, a column joined
 * directly onto the image row, or a legacy key inside `image.metadata` JSON.
 * Uses `firstNonEmpty` (not `??`) deliberately — an empty-string value in a
 * higher-priority field must not mask a real status (e.g. "denied") sitting
 * in a lower-priority one. Exported so every caller resolves the token the
 * same way; a second, hand-duplicated copy of this chain is how the
 * comp-card guardrail and the submission-time check drifted apart before.
 */
function resolveRightsStatusToken(imageRow, rightsRow) {
  const metadata = parseMetadata(imageRow?.metadata);
  return normalizeToken(
    firstNonEmpty(
      rightsRow?.rights_status,
      imageRow?.rights_status,
      imageRow?.usage_rights,
      imageRow?.license_status,
      metadata.rights_status,
      metadata.usage_rights,
      metadata.license_status,
    ),
  );
}

function imageHasDistributionRights(imageRow, rightsRow, options = {}) { // eslint-disable-line no-unused-vars
  const status = resolveRightsStatusToken(imageRow, rightsRow);
  return !RIGHTS_DENIED_STATUSES.has(status);
}

function validateImagesForDistribution(images, rightsMap, options = {}) {
  const list = Array.isArray(images) ? images : [];
  const byId = rightsMap instanceof Map ? rightsMap : new Map();
  const errors = [];

  list.forEach((image, index) => {
    const imageId = image?.id ? String(image.id) : null;
    const rightsRow = imageId ? byId.get(imageId) : null;
    if (!imageHasDistributionRights(image, rightsRow, options)) {
      errors.push({
        imageId,
        index,
        code: "distribution_rights_denied",
        message: "This image is marked as not available for distribution.",
      });
    }
  });

  return {
    ok: errors.length === 0,
    errors,
  };
}

module.exports = {
  RIGHTS_CLEARED_STATUSES,
  RIGHTS_DENIED_STATUSES,
  RIGHTS_LICENSE_BASES,
  loadImageRightsMap,
  hasCompleteModelRelease,
  resolveRightsStatusToken,
  imageHasDistributionRights,
  validateImagesForDistribution,
};
