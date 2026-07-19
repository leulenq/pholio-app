/**
 * Board identity — deterministic art direction for signing boards.
 *
 * Every board resolves to a compact identity: an ink (the client's voice),
 * a paper tint, and a letterform register used to set the client's name as a
 * typographic wordmark. Known houses carry a curated identity so a Dior board
 * reads recognizably different from a Calvin Klein board; unknown clients get
 * a stable identity from a curated pool, keyed by name, so a board never
 * changes its face between visits.
 *
 * We only ever set the client's NAME in type — never a trademarked logo or
 * lockup. The board ink is the client's voice on this surface; Pholio gold
 * stays the platform voice (actions, selection) and is never derived from it.
 *
 * Letterform registers (styled in CastingPage.css via [data-letterform]):
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

/* Curated house identities. Keys are normalized; prefix matching lets
   "Chanel Beauty" or "Dior Homme" resolve to the house identity. */
const HOUSES = {
  dior: { ink: '#1C1B19', paper: '#F0EDE7', letterform: 'serif', tracking: '0.45em' },
  chanel: { ink: '#101010', paper: '#F4F3F1', letterform: 'sans', tracking: '0.38em' },
  condenast: { ink: '#131009', paper: '#F3EDDF', letterform: 'didone', tracking: '0.06em' },
  vogue: { ink: '#131009', paper: '#F3EDDF', letterform: 'didone', tracking: '0.06em' },
  calvinklein: { ink: '#2A2D31', paper: '#EFF0EF', letterform: 'sans-light', tracking: '0.32em' },
  img: { ink: '#23364B', paper: '#EEF1F3', letterform: 'sans', tracking: '0.2em' },
  zara: { ink: '#191919', paper: '#F2F0EC', letterform: 'didone', tracking: '0.02em' },
  inditex: { ink: '#191919', paper: '#F2F0EC', letterform: 'didone', tracking: '0.02em' },
  hermes: { ink: '#B4501C', paper: '#F7EFE6', letterform: 'serif', tracking: '0.22em' },
  netaporter: { ink: '#101010', paper: '#F2F1EF', letterform: 'sans-light', tracking: '0.28em' },
  prada: { ink: '#14161A', paper: '#EFF0F1', letterform: 'sans', tracking: '0.3em' },
  gucci: { ink: '#1E4636', paper: '#EFF2EE', letterform: 'serif', tracking: '0.3em' },
  saintlaurent: { ink: '#101010', paper: '#F2F1EF', letterform: 'sans', tracking: '0.26em' },
  ysl: { ink: '#101010', paper: '#F2F1EF', letterform: 'sans', tracking: '0.26em' },
  valentino: { ink: '#A31621', paper: '#F6EEEC', letterform: 'serif', tracking: '0.3em' },
  versace: { ink: '#161513', paper: '#F3EFDF', letterform: 'serif', tracking: '0.34em' },
  balenciaga: { ink: '#111111', paper: '#F1F0EE', letterform: 'sans', tracking: '0.1em' },
  burberry: { ink: '#262115', paper: '#F0E9DC', letterform: 'sans', tracking: '0.3em' },
  armani: { ink: '#23211E', paper: '#F1F0ED', letterform: 'sans-light', tracking: '0.3em' },
  giorgioarmani: { ink: '#23211E', paper: '#F1F0ED', letterform: 'sans-light', tracking: '0.3em' },
  ralphlauren: { ink: '#20304C', paper: '#EFF0F3', letterform: 'serif', tracking: '0.24em' },
  tomford: { ink: '#111111', paper: '#F1F0EE', letterform: 'sans-light', tracking: '0.34em' },
  celine: { ink: '#111111', paper: '#F2F1EF', letterform: 'sans', tracking: '0.3em' },
  loewe: { ink: '#1F1D1A', paper: '#F2F0EB', letterform: 'serif', tracking: '0.2em' },
  bottegaveneta: { ink: '#2E4B33', paper: '#EFF2EE', letterform: 'sans', tracking: '0.22em' },
  givenchy: { ink: '#111111', paper: '#F1F0EE', letterform: 'sans', tracking: '0.3em' },
  fendi: { ink: '#24211C', paper: '#F6F0DC', letterform: 'sans', tracking: '0.26em' },
  tiffany: { ink: '#22766D', paper: '#EAF3F1', letterform: 'sans', tracking: '0.3em' },
  cartier: { ink: '#9E1B32', paper: '#F6EEEF', letterform: 'serif', tracking: '0.2em' },
  nike: { ink: '#111111', paper: '#F1F0EE', letterform: 'sans', tracking: '0.12em' },
  adidas: { ink: '#111111', paper: '#F1F0EE', letterform: 'sans', tracking: '0.1em' },
  levis: { ink: '#B02E2E', paper: '#F5EEEC', letterform: 'sans', tracking: '0.14em' },
};

const HOUSE_KEYS = Object.keys(HOUSES).sort((a, b) => b.length - a.length);

/* Curated fallback pool — house-grade inks, never neon, never platform gold.
   Indexed by a stable hash of the client name. */
const FALLBACK_POOL = [
  { ink: '#5C2E36', paper: '#F4EDEA', letterform: 'serif', tracking: '0.3em' }, // bordeaux
  { ink: '#2E4A3C', paper: '#EDF1EC', letterform: 'sans', tracking: '0.26em' }, // forest
  { ink: '#2C3A52', paper: '#EDEFF3', letterform: 'sans-light', tracking: '0.3em' }, // navy
  { ink: '#7A4A18', paper: '#F5EEE2', letterform: 'serif', tracking: '0.24em' }, // ochre
  { ink: '#463157', paper: '#F1EDF3', letterform: 'didone', tracking: '0.08em' }, // aubergine
  { ink: '#79331F', paper: '#F5EDE7', letterform: 'serif', tracking: '0.28em' }, // sienna
  { ink: '#2F5057', paper: '#EBF1F1', letterform: 'sans', tracking: '0.28em' }, // slate teal
  { ink: '#33302B', paper: '#F1EFEA', letterform: 'sans-light', tracking: '0.32em' }, // graphite
];

function stableHash(value) {
  let hash = 0;
  const str = String(value || '');
  for (let i = 0; i < str.length; i += 1) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash;
}

/**
 * Resolve a board (or `{ client, name }` shape) to its identity.
 * Returns `{ label, ink, paper, letterform, tracking }` — `label` is the
 * client name to set as the wordmark (board name when no client is set).
 */
export function resolveBoardIdentity(board) {
  const client = board?.client || board?.client_name || null;
  const label = client || board?.name || 'Board';
  const key = normalizeKey(client || board?.name);

  const houseKey = HOUSE_KEYS.find((k) => key === k || key.startsWith(k));
  const identity = houseKey
    ? HOUSES[houseKey]
    : FALLBACK_POOL[stableHash(key) % FALLBACK_POOL.length];

  return { label, ...identity };
}

/** CSS custom properties carrying an identity onto a subtree. */
export function boardIdentityStyle(identity) {
  return {
    '--bd-ink': identity.ink,
    '--bd-paper': identity.paper,
    '--bd-track': identity.tracking,
  };
}
