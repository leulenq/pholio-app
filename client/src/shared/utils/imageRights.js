const RIGHTS_CLEARED_STATUSES = new Set([
  'cleared',
  'licensed',
  'owned',
  'approved',
]);

const RIGHTS_LICENSE_BASES = new Set([
  'owned',
  'licensed',
  'model_release',
  'agency_permission',
  'editorial_release',
]);

const RIGHTS_DENIED_STATUSES = new Set([
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

function hasCompleteModelRelease(rightsRow) {
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
  const licenseType = normalizeToken(firstNonEmpty(
    rightsRow?.license_type,
    imageRow?.license_type,
    metadata.license_type,
  ));
  const copyrightOwner = firstNonEmpty(
    rightsRow?.copyright_owner,
    imageRow?.copyright_owner,
    metadata.copyright_owner,
  );
  const photographerName = firstNonEmpty(
    rightsRow?.photographer_name,
    imageRow?.photographer_name,
    metadata.photographer_name,
  );
  const startAt = rightsRow?.start_at || imageRow?.start_at || metadata.start_at;
  const expiresAt = rightsRow?.expires_at || imageRow?.expires_at || metadata.expires_at;
  const now = options.now instanceof Date ? options.now : new Date();

  if (!RIGHTS_CLEARED_STATUSES.has(status)) return false;
  if (!RIGHTS_LICENSE_BASES.has(licenseType)) return false;
  if (!copyrightOwner && !photographerName) return false;
  if (startAt && new Date(startAt).getTime() > now.getTime()) return false;
  if (expiresAt && new Date(expiresAt).getTime() < now.getTime()) return false;

  const effectiveRights = { ...(imageRow || {}), ...(rightsRow || {}) };
  const releaseComplete = hasCompleteModelRelease(effectiveRights);
  if (licenseType === 'model_release' && !releaseComplete) return false;
  if (options.requireGuardianRelease === true) {
    return releaseComplete && normalizeToken(effectiveRights.release_signer_role) === 'guardian';
  }
  return true;
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
        code: 'distribution_rights_missing',
        message:
          options.requireGuardianRelease === true
            ? "Image requires a complete model release signed by the minor's guardian."
            : 'Image requires a valid rights basis, cleared status, ownership credit, and active license dates.',
      });
    }
  });

  return {
    ok: errors.length === 0,
    errors,
  };
}
