/**
 * Canonical stats-track vocabulary — the client mirror of the server's
 * `resolveStatsTrack` / `resolveCoreCircumference` in
 * `src/shared/lib/stats-formatter.js`.
 *
 * The stored values are LOWERCASE (`womenswear` | `menswear` | `ungendered`),
 * set by migration 20260701100000 and enforced by the zod enum in
 * `src/shared/lib/validation.js`. Every client comparison must go through
 * `resolveStatsTrack()` rather than testing the raw string, so a title-cased
 * option value can never silently fall through to the wrong branch again.
 *
 * Track is DECOUPLED from gender: `stats_track` always wins when present, and
 * gender is only a seed for profiles that have never set one.
 */

export const STATS_TRACKS = ['womenswear', 'menswear', 'ungendered'];

export const STATS_TRACK_LABELS = {
  womenswear: 'Womenswear',
  menswear: 'Menswear',
  ungendered: 'Ungendered',
};

export const STATS_TRACK_OPTIONS = STATS_TRACKS.map((value) => ({
  value,
  label: STATS_TRACK_LABELS[value],
}));

const VALID_TRACKS = new Set(STATS_TRACKS);

/** gender → default track seed. Mirrors GENDER_TO_TRACK on the server. */
const GENDER_TO_TRACK = {
  female: 'womenswear',
  woman: 'womenswear',
  women: 'womenswear',
  f: 'womenswear',
  male: 'menswear',
  man: 'menswear',
  men: 'menswear',
  m: 'menswear',
};

/**
 * Resolve the effective stats track.
 * Precedence: explicit `stats_track` → seeded from `gender` → `ungendered`.
 *
 * @param {{ stats_track?: string, gender?: string }} [profile]
 * @returns {'womenswear'|'menswear'|'ungendered'}
 */
export function resolveStatsTrack(profile) {
  const raw = String(profile?.stats_track ?? '').trim().toLowerCase();
  if (VALID_TRACKS.has(raw)) return raw;
  const gender = String(profile?.gender ?? '').trim().toLowerCase();
  return GENDER_TO_TRACK[gender] || 'ungendered';
}

/**
 * Which circumference this track records, and where it is stored.
 * womenswear → bust_cm; menswear + ungendered → chest_cm. Same physical
 * measurement, different industry label (mirrors resolveCoreCircumference).
 *
 * @param {string} track — an already-resolved track
 * @returns {{ key: 'bust'|'chest', field: 'bust_cm'|'chest_cm', label: string }}
 */
export function coreCircumferenceFor(track) {
  if (track === 'womenswear') {
    return { key: 'bust', field: 'bust_cm', label: 'Bust' };
  }
  return { key: 'chest', field: 'chest_cm', label: 'Chest' };
}

/**
 * Which sizing systems this track collects. `ungendered` collects BOTH, matching
 * `buildCanonicalStats` — an ungendered profile may legitimately carry a dress
 * size and a suit size, and we never force one on them.
 *
 * @param {string} track — an already-resolved track
 * @returns {{ dress: boolean, suit: boolean }}
 */
export function sizingFieldsFor(track) {
  if (track === 'womenswear') return { dress: true, suit: false };
  if (track === 'menswear') return { dress: false, suit: true };
  return { dress: true, suit: true };
}
