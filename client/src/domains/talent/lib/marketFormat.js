/**
 * Everything the Market says out loud, said properly.
 *
 * The data behind this surface arrives in four different voices: registry
 * taxonomy (`official_web_form`, `selected_market`, `ny_dol`), agency-authored
 * free text ("editorial", "los angeles, ca"), ISO country codes, and Pholio's
 * own enums. None of them are product copy, and a market that prints them raw
 * reads like somebody left the database door open.
 *
 * Nothing here invents a fact. Where a value has no known rendering the raw
 * token is title-cased rather than dropped, so a new vocabulary member degrades
 * to something readable instead of vanishing or shouting.
 */

const SMALL_WORDS = new Set(['a', 'an', 'and', 'de', 'of', 'the', 'van', 'von']);

/** Title Case that leaves acronyms and already-cased names alone. */
export function titleCase(value) {
  const text = String(value ?? '').trim();
  if (!text) return '';
  return text
    .split(/\s+/)
    .map((word, index) => {
      // IMG, DNA, LA — anything already all-caps stays that way.
      if (/^[A-Z0-9&.'-]+$/.test(word) && word.length <= 4) return word;
      const lower = word.toLowerCase();
      if (index > 0 && SMALL_WORDS.has(lower)) return lower;
      return lower.replace(/^[a-z]/, (c) => c.toUpperCase());
    })
    .join(' ');
}

/** `official_web_form` → `Official Web Form` — the last resort, never the plan. */
export function humanizeToken(value) {
  return titleCase(String(value ?? '').replace(/[._-]+/g, ' '));
}

const COUNTRIES = Object.freeze({
  US: 'United States',
  GB: 'United Kingdom',
  FR: 'France',
  ES: 'Spain',
  IT: 'Italy',
  JP: 'Japan',
  CA: 'Canada',
  DE: 'Germany',
  AU: 'Australia',
  BR: 'Brazil',
  NL: 'Netherlands',
  BE: 'Belgium',
  DK: 'Denmark',
  SE: 'Sweden',
  KR: 'South Korea',
  CN: 'China',
  MX: 'Mexico',
  ZA: 'South Africa',
});

export function countryName(code) {
  const key = String(code ?? '').trim().toUpperCase();
  return COUNTRIES[key] || key;
}

/**
 * A city, written as a city.
 *
 * Agencies write locations every way there is — "Los Angeles, CA",
 * "paris, france", "NEW YORK, NY". The city is the part before the first
 * comma; what follows is an address detail, not a market.
 */
export function cityName(location) {
  const head = String(location ?? '').split(',')[0].trim();
  return head ? titleCase(head) : '';
}

/** Boards as the industry writes them: "editorial" → "Editorial". */
export function boardName(board) {
  return titleCase(board);
}

export function boardList(boards, limit = 4) {
  const named = (boards || []).map(boardName).filter(Boolean);
  if (named.length <= limit) return named;
  return [...named.slice(0, limit), `+${named.length - limit}`];
}

/** How a house takes applications, in a sentence fragment a person would say. */
const CHANNELS = Object.freeze({
  official_web_form: 'Their own site',
  official_email: 'By email',
  official_walk_in: 'In person',
  agency_branded_third_party_form: 'Their application form',
  pholio_open_call: 'Through Pholio',
});

export function channelName(channelType) {
  const key = String(channelType ?? '').toLowerCase();
  return CHANNELS[key] || (key ? humanizeToken(key) : 'Their own channel');
}

/** The registry a verification came from, named the way it names itself. */
const REGISTRIES = Object.freeze({
  ny_dol: 'New York State DOL',
});

export function registryName(registry) {
  const key = String(registry ?? '').toLowerCase();
  return REGISTRIES[key] || humanizeToken(key);
}

/**
 * A market scope, written for a reader.
 *
 * `selected_market` is the interesting one: the registry publishes no label
 * because no single name exists — Ford covers the US, France and Spain on one
 * route. Naming the countries is the only honest rendering, and at three or
 * more it says how many rather than running on.
 */
export function reachName(reach) {
  if (!reach) return '';
  if (reach.kind === 'global') return 'Global';
  if (reach.kind === 'selected' || reach.kind === 'selected_market') {
    const codes = reach.codes || [];
    if (codes.length === 0) return 'Selected markets';
    if (codes.length <= 2) return codes.map(countryName).join(' and ');
    return `${codes.length} markets`;
  }
  if (reach.kind === 'country') return countryName(reach.codes?.[0] || reach.label);
  return titleCase(reach.label);
}

/** The long form, for the dossier, where there is room to be exact. */
export function reachDetail(reach) {
  if (!reach) return '';
  if (reach.kind === 'selected' || reach.kind === 'selected_market') {
    return (reach.codes || []).map(countryName).join(' · ');
  }
  return reachName(reach);
}

/**
 * How current Pholio's reading of a house is.
 *
 * Never a bare enum, and never a false reassurance: `current` says nothing at
 * all, because "we checked recently" is not a fact a talent needs. Only the
 * states that should change behaviour speak.
 */
export function freshnessNote(freshness) {
  const state = freshness?.state;
  if (state === 'review_due') return 'Due for review — confirm on their site';
  if (state === 'expired') return 'Recorded period has ended — confirm on their site';
  if (state === 'unknown') return 'Freshness not recorded';
  return '';
}

/** `2026-08-18` → `18 August 2026`, and never `Invalid Date`. */
export function longDate(value) {
  if (!value) return '';
  const raw = String(value);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00Z`) : new Date(raw);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** "6 shots" / "1 shot" — counts that read, with the noun agreeing. */
export function countOf(value, singular, plural = `${singular}s`) {
  const n = Number(value) || 0;
  return `${n} ${n === 1 ? singular : plural}`;
}
