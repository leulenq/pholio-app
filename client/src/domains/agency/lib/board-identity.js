/**
 * Board identity — deterministic art direction for signing boards.
 *
 * Every board resolves to a compact identity: an ink (the client's voice), a
 * paper tint, a letterform register for setting the client's name as a
 * typographic wordmark, and a plate treatment. Known houses carry a curated
 * identity so a Dior board reads recognizably different from a Calvin Klein
 * board; unknown clients get a stable identity from a curated pool, keyed by
 * name, so a board never changes its face between visits.
 *
 * Plate treatments (styled in CastingPage.css via [data-treatment]):
 *   ink    — the plate is drenched in the house color, type reversed out
 *   paper  — tinted stock plate, ink type
 *   cover  — image-led plate: cover photo under a house-color scrim
 *
 * Stored board fields override the curated defaults:
 *   brand_color (#RRGGBB) → ink (a companion paper tint is derived)
 *   plate_style            → treatment ('cover' needs a cover image)
 *   logo_path              → logoUrl (rendered instead of the wordmark)
 *   cover_image_path       → coverUrl
 *
 * We only ever set the client's NAME in type unless the agency uploads a
 * client logo themselves. The board ink is the client's voice on this
 * surface; Pholio gold stays the platform voice (actions, selection) and is
 * never derived from it.
 *
 * Letterform registers:
 *   serif      — Playfair 600, wide-tracked caps (couture houses)
 *   didone     — Playfair 700, tight caps (editorial mastheads)
 *   sans       — Inter 700, tracked caps (modern houses, sport)
 *   sans-light — Inter 400, widest-tracked caps (minimalist houses)
 */

const normalizeKey = (value) =>
  String(value || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '') // fold diacritics: Condé → Conde, Hermès → Hermes
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');

export const PLATE_STYLES = ['ink', 'paper', 'cover'];

/* Curated house identities. Keys are normalized; prefix matching lets
   "Chanel Beauty" or "Dior Homme" resolve to the house identity. Treatments
   are deliberately mixed so a wall of boards reads like a shelf of different
   houses, not one template. */
const HOUSES = {
  dior: { ink: '#1C1B19', paper: '#EAE5DB', letterform: 'serif', tracking: '0.45em', treatment: 'ink' },
  chanel: { ink: '#101010', paper: '#EEECE8', letterform: 'sans', tracking: '0.38em', treatment: 'ink' },
  condenast: { ink: '#131009', paper: '#F2E7CE', letterform: 'didone', tracking: '0.06em', treatment: 'paper' },
  vogue: { ink: '#131009', paper: '#F2E7CE', letterform: 'didone', tracking: '0.06em', treatment: 'paper' },
  calvinklein: { ink: '#2A2D31', paper: '#E9EBE9', letterform: 'sans-light', tracking: '0.32em', treatment: 'paper' },
  img: { ink: '#23364B', paper: '#E3EAF0', letterform: 'sans', tracking: '0.2em', treatment: 'ink' },
  zara: { ink: '#191919', paper: '#EBE7DE', letterform: 'didone', tracking: '0.02em', treatment: 'paper' },
  inditex: { ink: '#191919', paper: '#EBE7DE', letterform: 'didone', tracking: '0.02em', treatment: 'paper' },
  hermes: { ink: '#B4501C', paper: '#F6E7D4', letterform: 'serif', tracking: '0.22em', treatment: 'ink' },
  netaporter: { ink: '#101010', paper: '#EAE8E4', letterform: 'sans-light', tracking: '0.28em', treatment: 'paper' },
  prada: { ink: '#14161A', paper: '#E7E9EC', letterform: 'sans', tracking: '0.3em', treatment: 'paper' },
  gucci: { ink: '#1E4636', paper: '#E3EBE2', letterform: 'serif', tracking: '0.3em', treatment: 'ink' },
  saintlaurent: { ink: '#101010', paper: '#EAE8E4', letterform: 'sans', tracking: '0.26em', treatment: 'paper' },
  ysl: { ink: '#101010', paper: '#EAE8E4', letterform: 'sans', tracking: '0.26em', treatment: 'paper' },
  valentino: { ink: '#A31621', paper: '#F3E2DE', letterform: 'serif', tracking: '0.3em', treatment: 'ink' },
  versace: { ink: '#161513', paper: '#EFE6C9', letterform: 'serif', tracking: '0.34em', treatment: 'paper' },
  balenciaga: { ink: '#111111', paper: '#E9E8E5', letterform: 'sans', tracking: '0.1em', treatment: 'paper' },
  burberry: { ink: '#262115', paper: '#EAE0C9', letterform: 'sans', tracking: '0.3em', treatment: 'paper' },
  armani: { ink: '#23211E', paper: '#E9E7E1', letterform: 'sans-light', tracking: '0.3em', treatment: 'paper' },
  giorgioarmani: { ink: '#23211E', paper: '#E9E7E1', letterform: 'sans-light', tracking: '0.3em', treatment: 'paper' },
  ralphlauren: { ink: '#20304C', paper: '#E4E7EF', letterform: 'serif', tracking: '0.24em', treatment: 'ink' },
  tomford: { ink: '#111111', paper: '#E9E8E4', letterform: 'sans-light', tracking: '0.34em', treatment: 'paper' },
  celine: { ink: '#111111', paper: '#EAE9E6', letterform: 'sans', tracking: '0.3em', treatment: 'paper' },
  loewe: { ink: '#1F1D1A', paper: '#EAE6DC', letterform: 'serif', tracking: '0.2em', treatment: 'paper' },
  bottegaveneta: { ink: '#2E4B33', paper: '#E2EBE3', letterform: 'sans', tracking: '0.22em', treatment: 'ink' },
  givenchy: { ink: '#111111', paper: '#E9E8E5', letterform: 'sans', tracking: '0.3em', treatment: 'paper' },
  fendi: { ink: '#24211C', paper: '#F2E8C8', letterform: 'sans', tracking: '0.26em', treatment: 'paper' },
  tiffany: { ink: '#22766D', paper: '#D8ECE8', letterform: 'sans', tracking: '0.3em', treatment: 'ink' },
  cartier: { ink: '#9E1B32', paper: '#F2E2E4', letterform: 'serif', tracking: '0.2em', treatment: 'ink' },
  nike: { ink: '#111111', paper: '#E9E8E5', letterform: 'sans', tracking: '0.12em', treatment: 'ink' },
  adidas: { ink: '#111111', paper: '#E9E8E5', letterform: 'sans', tracking: '0.1em', treatment: 'ink' },
  levis: { ink: '#B02E2E', paper: '#F1E2DE', letterform: 'sans', tracking: '0.14em', treatment: 'ink' },
};

const HOUSE_KEYS = Object.keys(HOUSES).sort((a, b) => b.length - a.length);

/* Curated fallback pool — house-grade inks, never neon, never platform gold.
   Indexed by a stable hash of the client name; treatments alternate so the
   fallback wall has the same variety as the curated one. */
const FALLBACK_POOL = [
  { ink: '#5C2E36', paper: '#F0E0DB', letterform: 'serif', tracking: '0.3em', treatment: 'ink' }, // bordeaux
  { ink: '#2E4A3C', paper: '#E1EADF', letterform: 'sans', tracking: '0.26em', treatment: 'paper' }, // forest
  { ink: '#2C3A52', paper: '#E0E5EF', letterform: 'sans-light', tracking: '0.3em', treatment: 'ink' }, // navy
  { ink: '#7A4A18', paper: '#F0E3CB', letterform: 'serif', tracking: '0.24em', treatment: 'paper' }, // ochre
  { ink: '#463157', paper: '#E8E1EE', letterform: 'didone', tracking: '0.08em', treatment: 'ink' }, // aubergine
  { ink: '#79331F', paper: '#F0E0D3', letterform: 'serif', tracking: '0.28em', treatment: 'paper' }, // sienna
  { ink: '#2F5057', paper: '#DCE9E9', letterform: 'sans', tracking: '0.28em', treatment: 'ink' }, // slate teal
  { ink: '#33302B', paper: '#E8E5DE', letterform: 'sans-light', tracking: '0.32em', treatment: 'paper' }, // graphite
];

function stableHash(value) {
  let hash = 0;
  const str = String(value || '');
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

const HEX_RE = /^#[0-9A-Fa-f]{6}$/;

/* Mix a hex color toward white — used to derive a companion paper tint when
   an agency sets a custom brand color without a stored paper. */
function derivePaper(hex, ratio = 0.88) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (v) => Math.round(v + (255 - v) * ratio);
  const r = mix((n >> 16) & 0xff);
  const g = mix((n >> 8) & 0xff);
  const b = mix(n & 0xff);
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0').toUpperCase()}`;
}

/* Resolve a stored upload path to a servable URL (mirrors
   resolveAgencyLogoUrl in lib/agency-branding.js). */
function resolvePathUrl(raw) {
  if (!raw) return null;
  if (/^https?:\/\//i.test(raw)) return raw;
  return raw.startsWith('/') ? raw : `/${raw}`;
}

/**
 * Resolve a board (or `{ client, name }` shape) to its identity.
 * Returns `{ label, ink, paper, letterform, tracking, treatment, logoUrl,
 * coverUrl }` — `label` is the client name to set as the wordmark (board
 * name when no client is set).
 */
export function resolveBoardIdentity(board) {
  const client = board?.client || board?.client_name || null;
  const label = client || board?.name || 'Board';
  const key = normalizeKey(client || board?.name);

  const houseKey = HOUSE_KEYS.find((k) => key === k || key.startsWith(k));
  const base = houseKey
    ? HOUSES[houseKey]
    : FALLBACK_POOL[stableHash(key) % FALLBACK_POOL.length];

  const brandColor = HEX_RE.test(board?.brand_color || '') ? board.brand_color.toUpperCase() : null;
  const ink = brandColor || base.ink;
  const paper = brandColor ? derivePaper(brandColor) : base.paper;

  const logoUrl = resolvePathUrl(board?.logo_path);
  const coverUrl = resolvePathUrl(board?.cover_image_path);

  const requested = PLATE_STYLES.includes(board?.plate_style) ? board.plate_style : null;
  let treatment = requested || base.treatment || 'paper';
  if (treatment === 'cover' && !coverUrl) {
    treatment = base.treatment === 'cover' ? 'paper' : base.treatment || 'paper';
  }

  return {
    label,
    ink,
    paper,
    letterform: base.letterform,
    tracking: base.tracking,
    treatment,
    logoUrl,
    coverUrl,
  };
}

/** CSS custom properties carrying an identity onto a subtree. */
export function boardIdentityStyle(identity) {
  return {
    '--bd-ink': identity.ink,
    '--bd-paper': identity.paper,
    '--bd-track': identity.tracking,
    ...(identity.coverUrl ? { '--bd-cover': `url(${identity.coverUrl})` } : {}),
  };
}

/**
 * A board is either a division intake board (applications get
 * SIGNED) or a client package (talent get CONFIRMED for a client's brief).
 * The stored board_type wins; otherwise a client name or slot target marks
 * it as a package.
 */
export function resolveBoardType(board) {
  if (board?.board_type === 'division' || board?.board_type === 'package') {
    return board.board_type;
  }
  return board?.client_name || board?.client || board?.target_slots ? 'package' : 'division';
}

/** Vocabulary per board type — signing language vs packaging language. */
export const BOARD_VOCAB = {
  division: {
    decided: 'Signed',
    decidedLower: 'signed',
    column: 'Signed',
    action: 'Sign',
    toast: 'Signed to the board',
  },
  package: {
    decided: 'Confirmed',
    decidedLower: 'confirmed',
    column: 'Confirmed',
    action: 'Confirm',
    toast: 'Confirmed for the package',
  },
};
