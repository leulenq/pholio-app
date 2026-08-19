function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function normalizeString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStringList(values) {
  return Array.from(
    new Set(
      (Array.isArray(values) ? values : [])
        .map((value) => normalizeString(value))
        .filter(Boolean),
    ),
  ).sort();
}

function normalizeDigitalSlotPicks(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value)
      .map(([slot, imageId]) => [normalizeString(slot), normalizeString(imageId)])
      .filter(([slot, imageId]) => slot && imageId)
      .sort(([left], [right]) => left.localeCompare(right, 'en-US')),
  );
}

// `YYYY-MM-DD` or ''. Mirrors normalizeDateOnly on the server.
function normalizeDateOnly(value) {
  const text = normalizeString(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : '';
}

function normalizeAvailabilityRange(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const from = normalizeDateOnly(value.from);
  const to = normalizeDateOnly(value.to);
  if (!from && !to) return null;
  return { from: from || null, to: to || null };
}

/**
 * BROWSER MIRROR of `canonicalSubmissionPackage` in
 * `src/domains/talent/services/submission-disclosure-consent.js`. The server
 * rejects a submission whose consent fingerprint does not match the package it
 * recomputes, so any divergence here is not a cosmetic bug — it is a submit
 * button that never works.
 *
 * The event keys are spread CONDITIONALLY on `openCallLinkId` for the reason
 * spelled out on the server: unconditional keys would rewrite the hash of every
 * representation package and invalidate live drafts.
 */
export function canonicalSubmissionPackage({
  agencyId,
  boards = [],
  mediaSetId = null,
  digitalSlotPicks = {},
  compCardPresetId = null,
  imageIds = [],
  note = '',
  openCallLinkId = null,
  availability = null,
  walkVideoUrl = null,
} = {}) {
  const linkId = normalizeString(openCallLinkId);
  return {
    agencyId: normalizeString(agencyId) || null,
    boards: normalizeStringList(boards),
    mediaSetId: normalizeString(mediaSetId) || null,
    digitalSlotPicks: normalizeDigitalSlotPicks(digitalSlotPicks),
    compCardPresetId: normalizeString(compCardPresetId) || null,
    imageIds: normalizeStringList(imageIds),
    note: normalizeString(note).slice(0, 1200),
    ...(linkId
      ? {
          openCallLinkId: linkId,
          availability: normalizeAvailabilityRange(availability),
          walkVideoUrl: normalizeString(walkVideoUrl) || null,
        }
      : {}),
  };
}

export function submissionConsentPackageKey(input) {
  return canonicalJson(canonicalSubmissionPackage(input));
}

export async function buildSubmissionConsentFingerprint(input) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) {
    throw new Error('Secure consent binding is not supported by this browser.');
  }
  const encoded = new TextEncoder().encode(submissionConsentPackageKey(input));
  const digest = await subtle.digest('SHA-256', encoded);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

export function consentBindingMatches(binding, packageKey) {
  return Boolean(
    binding?.packageKey === packageKey &&
      /^[a-f0-9]{64}$/i.test(binding?.fingerprint || ''),
  );
}
