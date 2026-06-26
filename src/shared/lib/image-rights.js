"use strict";

const RIGHTS_CLEARED_STATUSES = new Set([
  "cleared",
  "licensed",
  "owned",
  "approved",
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
  return map;
}

function imageHasDistributionRights(imageRow, rightsRow) {
  const metadata = parseMetadata(imageRow?.metadata);
  const status = normalizeToken(
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
  const licenseType = firstNonEmpty(
    rightsRow?.license_type,
    imageRow?.license_type,
    metadata.license_type,
  );

  if (RIGHTS_CLEARED_STATUSES.has(status)) return true;
  if (licenseType && !RIGHTS_DENIED_STATUSES.has(status)) return true;
  return false;
}

function validateImagesForDistribution(images, rightsMap) {
  const list = Array.isArray(images) ? images : [];
  const byId = rightsMap instanceof Map ? rightsMap : new Map();
  const errors = [];

  list.forEach((image, index) => {
    const imageId = image?.id ? String(image.id) : null;
    const rightsRow = imageId ? byId.get(imageId) : null;
    if (!imageHasDistributionRights(image, rightsRow)) {
      errors.push({
        imageId,
        index,
        code: "distribution_rights_missing",
        message:
          "Image is missing distribution rights. Add a license type and rights status before distribution.",
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
  loadImageRightsMap,
  imageHasDistributionRights,
  validateImagesForDistribution,
};
