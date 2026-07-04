export function looksLikeUrl(input) {
  return (
    /:\/\//.test(input) ||
    /^www\./i.test(input) ||
    /^[a-z0-9.-]+\.[a-z]{2,}(\/.*)?$/i.test(input)
  );
}

export function normalizeUrl(input) {
  const trimmed = String(input ?? '').trim();
  if (!trimmed) return trimmed;
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed.replace(/^\/+/, '')}`;
}

/** Field configs mirror SocialInput / SocialSection platform definitions. */
export const PROFILE_SOCIAL_FIELD_CONFIG = {
  instagram_handle: { base: 'https://instagram.com/', prefix: '@' },
  tiktok_handle: { base: 'https://tiktok.com/@', prefix: '@' },
  twitter_handle: { base: 'https://x.com/', prefix: '@' },
  youtube_handle: { base: 'https://youtube.com/', prefix: '' },
  portfolio_url: { base: '', prefix: '' },
  onlyfans_url: { base: 'https://onlyfans.com/', prefix: '' },
  video_reel_url: { base: '', prefix: '' },
};

export const AGENCY_SOCIAL_FIELD_CONFIG = {
  agency_instagram_handle: { base: 'https://instagram.com/', prefix: '@' },
  agency_tiktok_handle: { base: 'https://tiktok.com/@', prefix: '@' },
  agency_twitter_handle: { base: 'https://x.com/', prefix: '@' },
  agency_youtube_handle: { base: 'https://youtube.com/', prefix: '' },
};

/**
 * Normalize a social / portfolio field value (same rules as SocialInput blur handler).
 * @param {string|null|undefined} rawValue
 * @param {{ base?: string, prefix?: string }} config
 * @returns {string}
 */
export function normalizeSocialFieldValue(rawValue, { base = '', prefix = '' } = {}) {
  const val = String(rawValue ?? '').trim();
  if (!val) return val;

  if (looksLikeUrl(val)) {
    return normalizeUrl(val);
  }

  if (base) {
    let slug = val;
    if (prefix && slug.startsWith(prefix)) {
      slug = slug.substring(prefix.length);
    }
    return `${base}${slug}`.replace(/([^:]\/)\/+/g, '$1');
  }

  return val;
}

/**
 * Apply blur-time normalization for all profile social fields.
 * @returns {boolean} true if any field was updated
 */
export function normalizeProfileSocialFields(values, setValue) {
  let changed = false;

  for (const [field, config] of Object.entries(PROFILE_SOCIAL_FIELD_CONFIG)) {
    const current = values[field];
    if (current == null || String(current).trim() === '') continue;

    const normalized = normalizeSocialFieldValue(current, config);
    if (normalized !== current) {
      setValue(field, normalized || null, { shouldDirty: true, shouldValidate: true });
      changed = true;
    }
  }

  return changed;
}

/**
 * Apply blur-time normalization for agency social fields.
 * @returns {Record<string, string|null>} normalized values (empty strings → null)
 */
export function normalizeAgencySocialFields(values) {
  const out = { ...values };

  for (const [field, config] of Object.entries(AGENCY_SOCIAL_FIELD_CONFIG)) {
    const current = out[field];
    if (current == null || String(current).trim() === '') {
      out[field] = null;
      continue;
    }
    out[field] = normalizeSocialFieldValue(current, config) || null;
  }

  return out;
}
