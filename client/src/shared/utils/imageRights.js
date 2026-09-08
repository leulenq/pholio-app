export const RIGHTS_CLEARED_STATUSES = new Set([
  'cleared',
  'licensed',
  'owned',
  'approved',
]);

export const RIGHTS_LICENSE_BASES = new Set([
  'owned',
  'licensed',
  'model_release',
  'agency_permission',
  'editorial_release',
]);

export const RIGHTS_DENIED_STATUSES = new Set([
  'denied',
  'blocked',
  'forbidden',
  'unlicensed',
  'restricted',
]);

function normalizeToken(value) {
  if (value == null) return '';
  return String(value).trim().toLowerCase();
}

function parseMetadata(metadata) {
  if (!metadata) return {};
  if (typeof metadata === 'object' && !Array.isArray(metadata)) return metadata;
  if (typeof metadata !== 'string') return {};
  try {
    const parsed = JSON.parse(metadata);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
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
  return '';
}

export function buildImageRightsMapFromImages(images) {
  const map = new Map();
  const list = Array.isArray(images) ? images : [];
  for (const image of list) {
    const imageId = image?.id ? String(image.id) : null;
    if (!imageId) continue;
    if (image.rights && typeof image.rights === 'object') {
      map.set(imageId, { ...image.rights, image_id: imageId });
    }
  }
  return map;
}

export function hasCompleteModelRelease(rightsRow) {
  const artifact = firstNonEmpty(
    rightsRow?.release_ref,
    rightsRow?.release_url,
    rightsRow?.model_release_ref,
  );
  return Boolean(
    artifact
      && firstNonEmpty(rightsRow?.release_signer_name)
      && firstNonEmpty(rightsRow?.release_signed_at),
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
// eslint-disable-next-line no-unused-vars
export function imageHasDistributionRights(imageRow, rightsRow, options = {}) {
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

  return !RIGHTS_DENIED_STATUSES.has(status);
}

export function validateImagesForDistribution(images, rightsMap, options = {}) {
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
        code: 'distribution_rights_denied',
        message: 'This image is marked as not available for distribution.',
      });
    }
  });

  return {
    ok: errors.length === 0,
    errors,
  };
}
