/**
 * Division system — the boards an agency runs, and a talent's standing on each.
 *
 * THREE LAYERS, IN ORDER OF WHO CARRIES WHAT
 *
 *   TYPESETTING  identifies the board. Each division has an authored setting:
 *                Editorial is a tracked serif because that is the masthead
 *                voice; Commercial is plain Inter because commercial work is
 *                plain; Fit is mono caps because fit is booked on measurement,
 *                not on look. This is the accessible identifier — it survives
 *                colour blindness, greyscale, and print.
 *
 *   COLOUR       is a family-level recall aid, so a booker can find "the green
 *                ones" while scanning. It is deliberately NOT the identifier:
 *                22 mutually CVD-distinct colours do not exist in sRGB (the
 *                practical ceiling is ~10-12), so any system that leans on hue
 *                to name a board fails for ~6% of male users. See
 *                scripts/build-division-palette.mjs.
 *
 *   GROUND       carries the standing — how committed the relationship is.
 *
 * Board names are agency-authored free text (`boards.name`, 80 chars, set in
 * agency setup), so `resolveDivision` must never return null, must never
 * rename an agency's own board, and must not mangle non-Latin names.
 *
 * Taxonomy sourced from working agency practice — see
 * `.claude/skills/industry/reference/standards.md` §2 (divisions/boards) and
 * `reference/lifecycle.md` §1 (representation lifecycle).
 */

/* ============================================================
   Text normalisation

   Tokenised, not concatenated. The previous version lowercased and stripped
   the whole string to `[a-z0-9]`, then asked whether that blob CONTAINED an
   alias. That produced, verifiably:

     "Développement"  -> Men       ("developpement" contains "men")
     "Chair Board"    -> Beauty    ("chairboard" contains "hair")
     "Renewal Board"  -> New Faces ("renewalboard" contains "new")
     "Женщины"        -> erased entirely, empty code

   Matching now happens on whole tokens and on adjacent token pairs, so an
   alias has to BE a word rather than merely appear inside one.
   ============================================================ */

/** Strip diacritics so "Développement" and "Developpement" tokenise alike. */
const deaccent = (v) =>
  String(v ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** Lowercase words, punctuation removed. Non-Latin scripts yield []. */
export const tokenize = (v) =>
  deaccent(v)
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(Boolean);

/** Legacy shape: the tokens joined. Used only for exact key/alias lookup. */
export const norm = (v) => tokenize(v).join('');

/* ============================================================
   Board kinds
   ============================================================ */
export const BOARD_KIND = {
  /** A home. Who the agency represents this talent as. */
  ROSTER: 'roster',
  /** A market. What the talent gets booked for. Many per talent. */
  MARKET: 'market',
  /** A stage on the development ladder. */
  LADDER: 'ladder',
  /** A narrow, stat-driven specialism. */
  SPECIALIST: 'specialist',
};

/* ============================================================
   The division library

   `set` selects the typeset treatment (see division-marks.css `.dvt--*`).
   `pigment` is always the division's own key, so a token rename cannot
   silently desynchronise the two — see the palette-parity test.
   ============================================================ */
const D = (label, code, kind, set, extra = {}) => ({ label, code, kind, set, ...extra });

export const DIVISIONS = {
  /* Roster boards — a home */
  women:       D('Women',        'WM', BOARD_KIND.ROSTER, 'house'),
  men:         D('Men',          'MN', BOARD_KIND.ROSTER, 'house'),
  curve:       D('Curve',        'CV', BOARD_KIND.ROSTER, 'stated'),
  petite:      D('Petite',       'PT', BOARD_KIND.ROSTER, 'quiet'),
  kids:        D('Kids & Teens', 'KT', BOARD_KIND.ROSTER, 'plain', { minors: true }),
  classic:     D('Classic',      'CL', BOARD_KIND.ROSTER, 'quiet'),
  talent:      D('Talent',       'TL', BOARD_KIND.ROSTER, 'billing'),

  /* Ladder — development standing */
  newfaces:    D('New Faces',    'NF', BOARD_KIND.LADDER, 'airy'),
  development: D('Development',  'DV', BOARD_KIND.LADDER, 'billing'),
  mainboard:   D('Main Board',   'MB', BOARD_KIND.LADDER, 'house'),

  /* Market boards — what they're booked for */
  editorial:   D('Editorial',    'ED', BOARD_KIND.MARKET, 'masthead'),
  commercial:  D('Commercial',   'CM', BOARD_KIND.MARKET, 'plain'),
  runway:      D('Runway',       'RW', BOARD_KIND.MARKET, 'invitation'),
  beauty:      D('Beauty',       'BT', BOARD_KIND.MARKET, 'cosmetic'),
  digital:     D('Digital',      'DG', BOARD_KIND.MARKET, 'screen'),
  lifestyle:   D('Lifestyle',    'LS', BOARD_KIND.MARKET, 'plain'),
  fitness:     D('Fitness',      'FS', BOARD_KIND.MARKET, 'billing'),
  swim:        D('Swim',         'SW', BOARD_KIND.MARKET, 'quiet'),

  /* Specialist boards */
  fit:         D('Fit',          'FT', BOARD_KIND.SPECIALIST, 'technical'),
  parts:       D('Parts',        'PR', BOARD_KIND.SPECIALIST, 'technical'),
  artists:     D('Artists',      'AR', BOARD_KIND.SPECIALIST, 'plain'),
};

/**
 * Typeset treatments. The board name IS the identifier, so each setting has
 * to be a real distinction, not a flourish.
 *
 * Serif is used at the identity tier here. That reverses the agency system's
 * usual "no serif in dense controls" rule, which the product owner has
 * explicitly authorised for this component — the serif is doing semantic
 * work, not decoration. It is capped at `md`/`lg`; `sm` degrades every
 * treatment to weight/tracking/case within Inter and the mono, because
 * Playfair's hairlines fall under one device pixel below ~12px.
 */
export const TYPESETS = {
  masthead:   'High-contrast serif, tracked caps — the editorial masthead voice.',
  plain:      'Plain Inter, no tracking. Commercial work is plain, and minors get no flourish.',
  invitation: 'Thin, widely tracked caps — a show invitation.',
  cosmetic:   'Serif italic — cosmetics advertising has always been italic.',
  screen:     'Mono, lowercase — screen-native.',
  house:      'Heavy tracked sans caps — the institutional house boards.',
  stated:     'Full-bodied serif, tight and weighted. Confident, not apologetic.',
  airy:       'Small and widely spaced — not yet arrived.',
  technical:  'Mono caps — booked on measurement, not on look.',
  quiet:      'Serif at reading size, lightly tracked.',
  billing:    'Sans, semibold, lightly tracked — a billing credit.',
};

/** Fallback typeset for agency-authored boards outside the taxonomy. */
export const FALLBACK_SET = 'plain';

/* ============================================================
   Aliases — how agencies actually name these boards.
   Matched against whole tokens, never as substrings.
   ============================================================ */
const ALIASES = {
  /* roster */
  women: 'women', womens: 'women', woman: 'women', female: 'women', femme: 'women', donna: 'women',
  men: 'men', mens: 'men', man: 'men', male: 'men', uomo: 'men',
  curve: 'curve', curves: 'curve', curvy: 'curve', plus: 'curve', plussize: 'curve', extended: 'curve',
  petite: 'petite', petites: 'petite',
  kids: 'kids', kidsteens: 'kids', children: 'kids', child: 'kids', teens: 'kids',
  teen: 'kids', youth: 'kids', minors: 'kids', junior: 'kids', juniors: 'kids',
  classic: 'classic', mature: 'classic', silver: 'classic', seniors: 'classic', ageless: 'classic',
  talent: 'talent', actors: 'talent', actor: 'talent', performance: 'talent', dancers: 'talent',
  hosts: 'talent', presenters: 'talent', musicians: 'talent', talentperformance: 'talent',

  /* ladder */
  newfaces: 'newfaces', newface: 'newfaces', discovery: 'newfaces', scouting: 'newfaces',
  development: 'development', developpement: 'development', desarrollo: 'development',
  developing: 'development', incubator: 'development',
  mainboard: 'mainboard', main: 'mainboard', established: 'mainboard', flagship: 'mainboard',

  /* market */
  editorial: 'editorial', fashion: 'editorial', fashioneditorial: 'editorial',
  highfashion: 'editorial', couture: 'editorial',
  commercial: 'commercial', commerciallifestyle: 'commercial', catalog: 'commercial',
  catalogue: 'commercial', ecommerce: 'commercial', ecomm: 'commercial', ecom: 'commercial',
  print: 'commercial', advertising: 'commercial',
  runway: 'runway', show: 'runway', shows: 'runway', catwalk: 'runway', showpackage: 'runway',
  beauty: 'beauty', hair: 'beauty', cosmetics: 'beauty', grooming: 'beauty', skincare: 'beauty',
  digital: 'digital', influencer: 'digital', influencers: 'digital', social: 'digital',
  creators: 'digital', creator: 'digital', content: 'digital', ugc: 'digital',
  lifestyle: 'lifestyle', realpeople: 'lifestyle', family: 'lifestyle',
  fitness: 'fitness', sport: 'fitness', sports: 'fitness', athletic: 'fitness',
  athletes: 'fitness', wellness: 'fitness',
  swim: 'swim', swimwear: 'swim', resort: 'swim', lingerie: 'swim',

  /* specialist */
  fit: 'fit', fitmodel: 'fit', showroom: 'fit', fitshowroom: 'fit', sampling: 'fit',
  parts: 'parts', partsmodel: 'parts', hands: 'parts', feet: 'parts', legs: 'parts',
  artists: 'artists', artist: 'artists', hmu: 'artists', hairmakeup: 'artists',
  stylists: 'artists', creatives: 'artists', glam: 'artists',
};

/** Deterministic fallback pigments for boards outside the taxonomy. */
const FALLBACK_PIGMENTS = [
  'editorial', 'commercial', 'runway', 'fitness', 'curve',
  'men', 'newfaces', 'beauty', 'digital', 'parts',
];

/** Stable hash over the raw string, so an unknown board keeps its colour. */
function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) h = (h * 31 + str.codePointAt(i)) | 0;
  return Math.abs(h);
}

/** Split a string into user-perceived characters, so CJK and emoji survive. */
function graphemes(str) {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    return [...new Intl.Segmenter().segment(str)].map((s) => s.segment);
  }
  return [...str];
}

/**
 * Derive a booker-style shorthand from an arbitrary board name.
 * Latin: "Women Milano" -> WM, "Curve" -> CV.
 * Non-Latin: falls back to the first one or two graphemes rather than "—",
 * so a Cyrillic or CJK board still gets a legible mark.
 */
export function deriveCode(name) {
  const raw = String(name ?? '').trim();
  if (!raw) return '—';

  const words = tokenize(raw);
  if (words.length === 0) {
    // No Latin content at all — use the name's own script.
    const g = graphemes(raw).filter((c) => c.trim());
    return g.slice(0, 2).join('') || '—';
  }
  if (words.length === 1) {
    const w = words[0];
    if (w.length <= 2) return w.toUpperCase();
    // First letter + first following consonant reads more like agency
    // shorthand than the first two letters ("Milano" -> ML, not MI).
    // Canonical divisions carry hand-authored codes, so this only ever runs
    // on agency-invented board names.
    const consonant = w.slice(1).match(/[bcdfghjklmnpqrstvwxz]/);
    return (w[0] + (consonant ? consonant[0] : w[1])).toUpperCase();
  }
  return (words[0][0] + words[1][0]).toUpperCase();
}

/** Build the resolved shape for a known division, preserving the agency's label. */
function known(key, rawLabel) {
  const d = DIVISIONS[key];
  return {
    key,
    label: rawLabel ?? d.label,
    code: d.code,
    kind: d.kind,
    set: d.set,
    pigment: key,
    minors: !!d.minors,
    known: true,
  };
}

const resolveCache = new Map();

/**
 * Resolve any board key or agency-authored board name to a renderable division.
 * Never returns null.
 *
 * @param {string} key board key or free-text board name
 */
export function resolveDivision(key) {
  const raw = typeof key === 'string' ? key.trim() : '';
  if (resolveCache.has(raw)) return resolveCache.get(raw);

  const result = resolveUncached(raw);
  resolveCache.set(raw, result);
  return result;
}

function resolveUncached(raw) {
  if (!raw) {
    return {
      key: 'unassigned', label: 'Unassigned', code: '—',
      kind: BOARD_KIND.ROSTER, set: FALLBACK_SET,
      pigment: 'unassigned', minors: false, known: false,
    };
  }

  const words = tokenize(raw);
  const joined = words.join('');

  // 1. Canonical key passed programmatically — use the canonical label.
  if (DIVISIONS[joined] && joined === raw.toLowerCase()) return known(joined);

  // From here on the agency typed it, so their wording is preserved.
  const label = titleCase(raw);

  // 2. Whole-name match against a key or alias ("Kids/Teens" -> kidsteens).
  if (DIVISIONS[joined]) return known(joined, label);
  if (ALIASES[joined]) return known(ALIASES[joined], label);

  // 3. Adjacent token pairs, longest first ("Plus Size Women" -> plussize,
  //    which must beat the bare token "women").
  for (let i = 0; i < words.length - 1; i += 1) {
    const pair = words[i] + words[i + 1];
    if (DIVISIONS[pair]) return known(pair, label);
    if (ALIASES[pair]) return known(ALIASES[pair], label);
  }

  // 4. Whole tokens. Exact equality only — an alias must be a word.
  for (const w of words) {
    if (DIVISIONS[w]) return known(w, label);
    if (ALIASES[w]) return known(ALIASES[w], label);
  }

  // 5. Outside the taxonomy. Still renders: derived code, stable pigment,
  //    neutral typeset.
  return {
    key: joined || raw,
    label,
    code: deriveCode(raw),
    kind: BOARD_KIND.ROSTER,
    set: FALLBACK_SET,
    pigment: FALLBACK_PIGMENTS[hash(raw) % FALLBACK_PIGMENTS.length],
    minors: false,
    known: false,
  };
}

/* ============================================================
   Standing — a talent's relationship to one board

   Modelled on the representation and inbound lifecycles
   (`reference/lifecycle.md` §1-2), not an active/inactive boolean.
   `onfile` is the commonest real outcome of a submission and most
   software cannot express it.

   `ink` drives the visual treatment. `weight` orders a talent's boards.
   ============================================================ */
export const STANDINGS = {
  represented: { label: 'Represented', ink: 'represented', weight: 7, note: 'Signed to this board' },
  active:      { label: 'Active',      ink: 'active',      weight: 6, note: 'Working this board' },
  developing:  { label: 'Developing',  ink: 'developing',  weight: 5, note: 'Being built for this board' },
  shortlisted: { label: 'Shortlisted', ink: 'shortlisted', weight: 4, note: 'Under consideration for this board' },
  onfile:      { label: 'On File',     ink: 'onfile',      weight: 3, note: 'Kept on file for this board' },
  inactive:    { label: 'Inactive',    ink: 'inactive',    weight: 2, note: 'Not currently on this board' },
  // Distinct from `passed`. A contract that ended is not a rejection, and
  // showing a model struck through as "Declined" because their term ran out
  // is a domain error on a screen agencies show each other.
  ended:       { label: 'Ended',       ink: 'inactive',    weight: 1, note: 'Representation on this board has ended' },
  passed:      { label: 'Passed',      ink: 'passed',      weight: 0, note: 'Declined for this board' },
  // Missing or unrecognised data. NEVER infer a positive standing from
  // absence — that would assert a representation claim about a real person
  // that nobody entered.
  unknown:     { label: 'Standing unknown', ink: 'unknown', weight: -1, note: 'No standing recorded for this board' },
};

/**
 * Backend status strings -> standing key.
 *
 * AVAILABILITY IS NOT STANDING. Options, holds, bookouts and bookings are
 * calendar states on the booking lifecycle (`reference/lifecycle.md` §3);
 * standing is the representation relationship to a board (§1). They are
 * orthogonal — a talent on a first option is still represented on their
 * board, and a talent between jobs is not less represented.
 *
 * So availability values are deliberately absent here. Passing 'on_booking'
 * as a standing resolves to `unknown`, which is the honest answer: that
 * string says nothing about which boards they sit on. Mapping them to
 * `active` (as this table originally did) silently answered a question the
 * caller had not asked. Availability has its own component —
 * `AvailabilityCell`.
 */
const STANDING_ALIASES = {
  represented: 'represented', signed: 'represented', contracted: 'represented',
  exclusive: 'represented', nonexclusive: 'represented',
  active: 'active', bookable: 'active', main: 'active', mainboard: 'active',
  developing: 'developing', development: 'developing', newface: 'developing',
  newfaces: 'developing', scouted: 'developing',
  shortlisted: 'shortlisted', shortlist: 'shortlisted', considering: 'shortlisted',
  reviewing: 'shortlisted', underreview: 'shortlisted', review: 'shortlisted',
  // An accepted application is a meeting or an offer, not a signature.
  accepted: 'shortlisted', pending: 'shortlisted', submitted: 'shortlisted', new: 'shortlisted',
  onfile: 'onfile', kept: 'onfile', keptonfile: 'onfile', filed: 'onfile', watchlist: 'onfile',
  inactive: 'inactive', paused: 'inactive', dormant: 'inactive', archived: 'inactive',
  ended: 'ended', left: 'ended', contractended: 'ended', expired: 'ended', completed: 'ended',
  passed: 'passed', declined: 'passed', rejected: 'passed', dropped: 'passed', released: 'passed',
  unknown: 'unknown',
};

const standingCache = new Map();

/**
 * Resolve any status string to a standing.
 *
 * Defaults to `unknown`, not `active`. The previous default meant that null,
 * '', 'left', 'contract_ended' and any unmapped value all rendered as a
 * confident "Active — working this board" claim, complete with a solid
 * pigment field, about a real person's representation. A booker would have
 * acted on it.
 */
export function resolveStanding(status) {
  const raw = status == null ? '' : String(status);
  if (standingCache.has(raw)) return standingCache.get(raw);

  const key = STANDING_ALIASES[norm(raw)] || 'unknown';
  const result = { key, ...STANDINGS[key] };
  standingCache.set(raw, result);
  return result;
}

/** Sort a talent's boards strongest-standing first, then alphabetically. */
export function byStanding(a, b) {
  const wa = resolveStanding(a?.standing).weight;
  const wb = resolveStanding(b?.standing).weight;
  if (wa !== wb) return wb - wa;
  return String(a?.label || a?.division || '').localeCompare(String(b?.label || b?.division || ''));
}

/* ---------- helpers ---------- */
export function titleCase(v) {
  const s = String(v ?? '').trim();
  if (!s) return '';
  // Preserve deliberate capitalisation ("NY Women", "E-comm", "UGC").
  if (s !== s.toLowerCase()) return s;
  return s.replace(/(^|[\s\-/&])([a-z])/g, (_, sep, c) => sep + c.toUpperCase());
}

/** Every division, grouped by kind — for pickers, filters, and the spec sheet. */
export function divisionsByKind() {
  return Object.entries(DIVISIONS).reduce((acc, [key, d]) => {
    (acc[d.kind] = acc[d.kind] || []).push({ key, ...d });
    return acc;
  }, {});
}

/** All pigment keys the resolver can emit — used by the palette-parity test. */
export function allPigmentKeys() {
  return [...new Set([...Object.keys(DIVISIONS), ...FALLBACK_PIGMENTS, 'unassigned'])];
}
