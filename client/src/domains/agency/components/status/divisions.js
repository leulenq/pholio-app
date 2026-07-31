/**
 * Division system — the boards an agency runs, and a talent's standing on each.
 *
 * Two axes, kept strictly separate:
 *
 *   PIGMENT  answers "which board is this?"   — identity, never quality.
 *   INK      answers "what is their standing?" — solid stamp → ruled → dashed
 *            → ghosted → struck.
 *
 * Colour therefore never encodes good/bad, which is what makes this legal
 * under the global ban on green/yellow/red status badges (DESIGN.md #3) and
 * what keeps it readable for colour-blind bookers: standing survives in
 * greyscale because it is carried by fill and stroke, not hue.
 *
 * THE CODE IS THE IDENTIFIER, THE PIGMENT IS A RECALL AID. An agency may run
 * twenty boards; twenty hues cannot stay mutually distinct. The two-letter
 * booker shorthand (WM, NF, ED, BT…) is what a booker actually reads. Pigment
 * groups boards into families so the eye can pre-sort a dense roster.
 *
 * Board names are agency-authored free text (`boards.name`, 80 chars, set in
 * agency setup), so `resolveDivision` must never return null — unknown names
 * derive a code and a stable pigment instead of rendering nothing.
 *
 * Taxonomy sourced from working agency practice — see
 * `.claude/skills/industry/reference/standards.md` §2 (divisions/boards) and
 * §5 (roster operations), plus public division listings from Wilhelmina, IMG,
 * Ford and Elite.
 */

/** Lowercase + strip non-alphanumerics: 'New Faces', 'new_faces', 'newfaces'
 *  and 'New-Faces' all collapse to the same lookup key. */
export const norm = (v) => String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '');

/* ============================================================
   Board kinds

   Agencies blur these in their own navigation, but the distinction is real
   and load-bearing for the product: a talent has ONE roster home per agency
   and works MANY market categories.
   ============================================================ */
export const BOARD_KIND = {
  /** A home. Who the agency represents this talent as. One per agency. */
  ROSTER: 'roster',
  /** A market. What the talent gets booked for. Many per talent. */
  MARKET: 'market',
  /** A stage. Where the talent sits on the development ladder. */
  LADDER: 'ladder',
  /** A specialism. Narrow, stat-driven boards. */
  SPECIALIST: 'specialist',
};

/* ============================================================
   The division library
   ============================================================ */
export const DIVISIONS = {
  /* ---- Roster boards — a home ---- */
  women:       { label: 'Women',        code: 'WM', kind: BOARD_KIND.ROSTER, pigment: 'women' },
  men:         { label: 'Men',          code: 'MN', kind: BOARD_KIND.ROSTER, pigment: 'men' },
  curve:       { label: 'Curve',        code: 'CV', kind: BOARD_KIND.ROSTER, pigment: 'curve' },
  petite:      { label: 'Petite',       code: 'PT', kind: BOARD_KIND.ROSTER, pigment: 'petite' },
  kids:        { label: 'Kids & Teens', code: 'KT', kind: BOARD_KIND.ROSTER, pigment: 'kids', minors: true },
  classic:     { label: 'Classic',      code: 'CL', kind: BOARD_KIND.ROSTER, pigment: 'classic' },
  talent:      { label: 'Talent',       code: 'TL', kind: BOARD_KIND.ROSTER, pigment: 'talent' },

  /* ---- Ladder — development standing ---- */
  newfaces:    { label: 'New Faces',    code: 'NF', kind: BOARD_KIND.LADDER, pigment: 'newfaces' },
  development: { label: 'Development',  code: 'DV', kind: BOARD_KIND.LADDER, pigment: 'development' },
  mainboard:   { label: 'Main Board',   code: 'MB', kind: BOARD_KIND.LADDER, pigment: 'main' },

  /* ---- Market boards — what they're booked for ---- */
  editorial:   { label: 'Editorial',    code: 'ED', kind: BOARD_KIND.MARKET, pigment: 'editorial' },
  commercial:  { label: 'Commercial',   code: 'CM', kind: BOARD_KIND.MARKET, pigment: 'commercial' },
  runway:      { label: 'Runway',       code: 'RW', kind: BOARD_KIND.MARKET, pigment: 'runway' },
  beauty:      { label: 'Beauty',       code: 'BT', kind: BOARD_KIND.MARKET, pigment: 'beauty' },
  digital:     { label: 'Digital',      code: 'DG', kind: BOARD_KIND.MARKET, pigment: 'digital' },
  lifestyle:   { label: 'Lifestyle',    code: 'LS', kind: BOARD_KIND.MARKET, pigment: 'lifestyle' },
  fitness:     { label: 'Fitness',      code: 'FS', kind: BOARD_KIND.MARKET, pigment: 'fitness' },
  swim:        { label: 'Swim',         code: 'SW', kind: BOARD_KIND.MARKET, pigment: 'swim' },

  /* ---- Specialist boards ---- */
  fit:         { label: 'Fit',          code: 'FT', kind: BOARD_KIND.SPECIALIST, pigment: 'fit' },
  parts:       { label: 'Parts',        code: 'PR', kind: BOARD_KIND.SPECIALIST, pigment: 'parts' },
  artists:     { label: 'Artists',      code: 'AR', kind: BOARD_KIND.SPECIALIST, pigment: 'artists' },
};

/**
 * Aliases — how agencies actually write these names in setup, plus the
 * inconsistent keys already flowing through the backend.
 *
 * Order matters in `resolveDivision`: longer/more specific aliases are tested
 * before shorter ones so "plus size women" resolves to Curve, not Women.
 */
const ALIASES = {
  /* roster */
  women: 'women', womens: 'women', woman: 'women', female: 'women', femme: 'women',
  men: 'men', mens: 'men', man: 'men', male: 'men',
  curve: 'curve', curves: 'curve', plus: 'curve', plussize: 'curve', plussizewomen: 'curve', extended: 'curve',
  petite: 'petite', petites: 'petite',
  kids: 'kids', kidsteens: 'kids', children: 'kids', child: 'kids', teens: 'kids', teen: 'kids', youth: 'kids', minors: 'kids',
  classic: 'classic', mature: 'classic', silver: 'classic', seniors: 'classic', ageless: 'classic',
  talent: 'talent', actors: 'talent', actor: 'talent', performance: 'talent', dancers: 'talent',
  hosts: 'talent', presenters: 'talent', musicians: 'talent', talentperformance: 'talent',

  /* ladder */
  newfaces: 'newfaces', newface: 'newfaces', new: 'newfaces', discovery: 'newfaces', scouted: 'newfaces',
  development: 'development', developing: 'development', dev: 'development', incubator: 'development',
  mainboard: 'mainboard', main: 'mainboard', established: 'mainboard', flagship: 'mainboard',

  /* market */
  editorial: 'editorial', fashion: 'editorial', fashioneditorial: 'editorial', highfashion: 'editorial', couture: 'editorial',
  commercial: 'commercial', commerciallifestyle: 'commercial', catalog: 'commercial', catalogue: 'commercial',
  ecommerce: 'commercial', ecomm: 'commercial', print: 'commercial', advertising: 'commercial',
  runway: 'runway', show: 'runway', shows: 'runway', catwalk: 'runway', showpackage: 'runway',
  beauty: 'beauty', hair: 'beauty', skin: 'beauty', cosmetics: 'beauty', grooming: 'beauty',
  digital: 'digital', influencer: 'digital', influencers: 'digital', social: 'digital', creators: 'digital',
  creator: 'digital', content: 'digital', ugc: 'digital',
  lifestyle: 'lifestyle', realpeople: 'lifestyle', family: 'lifestyle',
  fitness: 'fitness', sport: 'fitness', sports: 'fitness', athletic: 'fitness', athletes: 'fitness', wellness: 'fitness',
  swim: 'swim', swimwear: 'swim', resort: 'swim', lingerie: 'swim',

  /* specialist */
  fit: 'fit', fitmodel: 'fit', showroom: 'fit', fitshowroom: 'fit', sampling: 'fit',
  parts: 'parts', partsmodel: 'parts', hands: 'parts', feet: 'parts', legs: 'parts',
  artists: 'artists', artist: 'artists', hmu: 'artists', hairmakeup: 'artists',
  stylists: 'artists', creatives: 'artists', glam: 'artists',
};

/* Alias keys sorted longest-first so specific phrases win over their substrings. */
const ALIAS_KEYS = Object.keys(ALIASES).sort((a, b) => b.length - a.length);

/** Deterministic fallback pigments for boards we don't recognise. */
const FALLBACK_PIGMENTS = ['editorial', 'commercial', 'runway', 'fitness', 'curve', 'men', 'newfaces', 'beauty', 'digital', 'parts'];

/** Stable string hash so an unrecognised board keeps the same colour forever. */
function hash(str) {
  let h = 0;
  for (let i = 0; i < str.length; i += 1) {
    h = (h * 31 + str.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

/** Derive a booker-style shorthand from an arbitrary board name.
 *  "Women Milano" → WM · "Curve" → CV · "S" → S */
function deriveCode(name) {
  const words = String(name || '').trim().split(/[\s&/_-]+/).filter(Boolean);
  if (words.length === 0) return '—';
  if (words.length === 1) {
    const w = words[0].replace(/[^a-zA-Z0-9]/g, '');
    if (w.length <= 2) return w.toUpperCase();
    // First letter + first following consonant reads more like agency shorthand
    // than the first two letters ("Curve" → CV, not CU).
    const consonant = w.slice(1).match(/[bcdfghjklmnpqrstvwxz]/i);
    return (w[0] + (consonant ? consonant[0] : w[1])).toUpperCase();
  }
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * Resolve any board key or agency-authored board name to a renderable division.
 * Never returns null — an unknown name yields a derived code and a stable pigment.
 *
 * @param {string} key - board key or free-text board name
 * @returns {{key:string,label:string,code:string,kind:string,pigment:string,minors:boolean,known:boolean}}
 */
export function resolveDivision(key) {
  const raw = String(key || '').trim();
  const n = norm(raw);

  if (!n) {
    return { key: 'unassigned', label: 'Unassigned', code: '—', kind: BOARD_KIND.ROSTER, pigment: 'unassigned', minors: false, known: false };
  }

  // 1. Direct hit on the library.
  if (DIVISIONS[n]) return { key: n, ...DIVISIONS[n], minors: !!DIVISIONS[n].minors, known: true };

  // 2. Exact alias.
  if (ALIASES[n]) {
    const k = ALIASES[n];
    return { key: k, ...DIVISIONS[k], minors: !!DIVISIONS[k].minors, known: true };
  }

  // 3. Alias contained in the name — "Women's Main Board NY" → mainboard.
  //    Longest alias first, so "plussize" beats "women" inside "Plus Size Women".
  const hit = ALIAS_KEYS.find((alias) => alias.length >= 3 && n.includes(alias));
  if (hit) {
    const k = ALIASES[hit];
    // Keep the agency's own wording as the label — it's their board, their name.
    return { key: k, ...DIVISIONS[k], label: titleCase(raw), minors: !!DIVISIONS[k].minors, known: true };
  }

  // 4. Unknown board — derive a code, assign a stable pigment.
  return {
    key: n,
    label: titleCase(raw),
    code: deriveCode(raw),
    kind: BOARD_KIND.ROSTER,
    pigment: FALLBACK_PIGMENTS[hash(n) % FALLBACK_PIGMENTS.length],
    minors: false,
    known: false,
  };
}

/* ============================================================
   Standing — a talent's relationship to a board

   These are the real states from the representation and inbound lifecycles
   (`.claude/skills/industry/reference/lifecycle.md` §1–2), not an
   active/inactive boolean. `onfile` in particular is the single most common
   real outcome of a submission and most software cannot express it.

   `ink` drives the visual treatment. `weight` orders a talent's boards so the
   strongest standing leads.
   ============================================================ */
export const STANDINGS = {
  represented: { label: 'Represented', ink: 'solid',  weight: 6, note: 'Signed to this board' },
  active:      { label: 'Active',      ink: 'stamp',  weight: 5, note: 'Working this board' },
  developing:  { label: 'Developing',  ink: 'dashed', weight: 4, note: 'Being built for this board' },
  shortlisted: { label: 'Shortlisted', ink: 'ruled',  weight: 3, note: 'Under consideration for this board' },
  onfile:      { label: 'On File',     ink: 'ghost',  weight: 2, note: 'Kept on file for this board' },
  inactive:    { label: 'Inactive',    ink: 'muted',  weight: 1, note: 'Not currently on this board' },
  passed:      { label: 'Passed',      ink: 'struck', weight: 0, note: 'Declined for this board' },
};

/** Backend status strings → standing key. */
const STANDING_ALIASES = {
  represented: 'represented', signed: 'represented', contracted: 'represented',
  exclusive: 'represented', nonexclusive: 'represented', accepted: 'represented',
  active: 'active', bookable: 'active', main: 'active', booked: 'active', onbooking: 'active',
  developing: 'developing', development: 'developing', newface: 'developing',
  newfaces: 'developing', scouted: 'developing',
  shortlisted: 'shortlisted', shortlist: 'shortlisted', considering: 'shortlisted',
  reviewing: 'shortlisted', underreview: 'shortlisted', pending: 'shortlisted', submitted: 'shortlisted',
  onfile: 'onfile', kept: 'onfile', keptonfile: 'onfile', filed: 'onfile', watchlist: 'onfile',
  inactive: 'inactive', paused: 'inactive', onhold: 'inactive', dormant: 'inactive', archived: 'inactive',
  passed: 'passed', declined: 'passed', rejected: 'passed', dropped: 'passed', released: 'passed', ended: 'passed',
};

/** Resolve any status string to a standing. Defaults to `active`. */
export function resolveStanding(status) {
  const key = STANDING_ALIASES[norm(status)] || 'active';
  return { key, ...STANDINGS[key] };
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
  const s = String(v || '').trim();
  if (!s) return '';
  // Preserve names the agency already capitalised deliberately (e.g. "NY Women").
  if (s !== s.toLowerCase()) return s;
  return s.replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

/** Every division, grouped by kind — for pickers, filters, and the spec sheet. */
export function divisionsByKind() {
  return Object.entries(DIVISIONS).reduce((acc, [key, d]) => {
    (acc[d.kind] = acc[d.kind] || []).push({ key, ...d });
    return acc;
  }, {});
}
