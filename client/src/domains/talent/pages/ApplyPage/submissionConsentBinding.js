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

export function canonicalSubmissionPackage({
  agencyId,
  boards = [],
  mediaSetId = null,
  digitalSlotPicks = {},
  compCardPresetId = null,
  imageIds = [],
  note = '',
} = {}) {
  return {
    agencyId: normalizeString(agencyId) || null,
    boards: normalizeStringList(boards),
    mediaSetId: normalizeString(mediaSetId) || null,
    digitalSlotPicks: normalizeDigitalSlotPicks(digitalSlotPicks),
    compCardPresetId: normalizeString(compCardPresetId) || null,
    imageIds: normalizeStringList(imageIds),
    note: normalizeString(note).slice(0, 1200),
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
