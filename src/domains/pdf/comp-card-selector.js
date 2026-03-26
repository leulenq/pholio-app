/**
 * Comp Card Image Selector
 *
 * Selects the best images for a 2-page comp card from a talent's image list.
 *
 * Priority:
 *   hero slot  → role:'headshot' → sort order fallback
 *   grid[0]    → role:'full_body' → sort order fallback
 *   grid[1]    → role:'editorial' → sort order fallback
 *   grid[2]    → role:'lifestyle' → sort order fallback
 *   grid[3]    → best remaining (sort order)
 *
 * Each slot uses role-matched images not already selected, then falls back to
 * the next unselected image in input order. With `options.seed`, tie-breaking
 * uses a deterministic PRNG so the same seed reproduces the same composition.
 */

const DEFAULT_PREFER_ROLES = {
  hero: "headshot",
  grid: ["full_body", "editorial", "lifestyle", null],
};

/** Status values treated as ineligible when enforceActive is true */
const INACTIVE_STATUSES = new Set(["archived", "retired"]);

/**
 * FNV-1a 32-bit hash for string seeds; numbers are used as uint32 state.
 * @param {string|number|undefined|null} seed
 * @returns {number}
 */
function seedToUint32(seed) {
  if (seed == null || seed === "") {
    return 0;
  }
  if (typeof seed === "number" && Number.isFinite(seed)) {
    return seed >>> 0;
  }
  const s = String(seed);
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0 || 1;
}

/**
 * Deterministic PRNG (mulberry32). Returns values in [0, 1).
 * @param {number} a — initial state (use seedToUint32)
 * @returns {() => number}
 */
function createMulberry32(a) {
  let state = a >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), state | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Parse image metadata safely (handles both JSONB objects and JSON strings).
 * @param {*} metadata
 * @returns {{ role: string|null, [key: string]: any }}
 */
function parseMetadata(metadata) {
  if (!metadata) return {};
  if (typeof metadata === "object") return metadata;
  try {
    return JSON.parse(metadata);
  } catch {
    return {};
  }
}

function deriveCompCardRole(img) {
  if (!img) return null;
  const hasShotType =
    img.shot_type != null && String(img.shot_type).trim() !== "";
  const hasStyleType =
    img.style_type != null && String(img.style_type).trim() !== "";
  const legacyRole = parseMetadata(img.metadata).role || null;

  if (img.shot_type === "headshot") return "headshot";
  if (img.shot_type === "full_length" || img.shot_type === "three_quarter") {
    return "full_body";
  }
  if (img.style_type === "editorial") return "editorial";
  if (img.style_type === "lifestyle") return "lifestyle";

  if (
    !hasShotType &&
    (legacyRole === "headshot" || legacyRole === "full_body")
  ) {
    return legacyRole;
  }
  if (
    !hasStyleType &&
    (legacyRole === "editorial" || legacyRole === "lifestyle")
  ) {
    return legacyRole;
  }

  return null;
}

function normalizeStatus(status) {
  if (status == null || String(status).trim() === "") return "active";
  return String(status).toLowerCase();
}

/**
 * Prefer active images; drop archived/retired. If nothing remains, use original list.
 * @param {Array<object>} images
 * @param {boolean} enforceActive
 * @returns {Array<object>}
 */
function filterEligibleByStatus(images, enforceActive) {
  if (!enforceActive || !images || images.length === 0) {
    return images || [];
  }
  const eligible = images.filter((img) => {
    const s = normalizeStatus(img.status);
    return !INACTIVE_STATUSES.has(s);
  });
  return eligible.length > 0 ? eligible : [...images];
}

function normalizePreferRoles(preferRoles) {
  if (!preferRoles || typeof preferRoles !== "object") {
    return { ...DEFAULT_PREFER_ROLES, grid: [...DEFAULT_PREFER_ROLES.grid] };
  }
  const grid = Array.isArray(preferRoles.grid)
    ? [...preferRoles.grid]
    : [...DEFAULT_PREFER_ROLES.grid];
  while (grid.length < 4) grid.push(null);
  return {
    hero: preferRoles.hero ?? DEFAULT_PREFER_ROLES.hero,
    grid: grid.slice(0, 4),
  };
}

/**
 * Order candidates by first appearance in `enriched` (input order).
 * @param {Array<object>} candidates
 * @param {Array<object>} enriched
 */
function orderByInputOrder(candidates, enriched) {
  const index = new Map(enriched.map((img, i) => [img.id, i]));
  return [...candidates].sort(
    (a, b) => (index.get(a.id) ?? 0) - (index.get(b.id) ?? 0),
  );
}

/**
 * Weighted pick: earlier in ordered list is more likely; same seed => same pick.
 * Without rng, first candidate wins (legacy behavior).
 * @param {Array<object>} orderedCandidates
 * @param {(() => number) | null} rng
 */
function pickWeightedByOrder(orderedCandidates, rng) {
  if (!orderedCandidates.length) return null;
  if (!rng) return orderedCandidates[0];

  let total = 0;
  const weights = orderedCandidates.map((_, i) => {
    const w = 1 / (i + 1);
    total += w;
    return w;
  });
  let r = rng() * total;
  for (let i = 0; i < orderedCandidates.length; i++) {
    r -= weights[i];
    if (r <= 0) return orderedCandidates[i];
  }
  return orderedCandidates[orderedCandidates.length - 1];
}

/**
 * @param {object} options
 * @param {string|number|undefined} [options.seed]
 * @param {boolean} [options.enforceActive=true]
 * @param {{ hero?: string, grid?: Array<string|null> }} [options.preferRoles]
 */
function normalizeOptions(options) {
  if (options == null || typeof options !== "object") {
    return {
      seed: undefined,
      enforceActive: true,
      preferRoles: normalizePreferRoles(null),
      rng: null,
    };
  }
  const enforceActive = options.enforceActive !== false;
  const rawSeed = options.seed;
  const seed =
    rawSeed == null || rawSeed === ""
      ? undefined
      : Array.isArray(rawSeed)
        ? rawSeed[0]
        : rawSeed;
  const hasSeed = !(seed == null || seed === "");
  const rng = hasSeed ? createMulberry32(seedToUint32(seed)) : null;

  return {
    seed,
    enforceActive,
    preferRoles: normalizePreferRoles(options.preferRoles),
    rng,
  };
}

/**
 * Select the best images for a comp card.
 *
 * @param {Array<{ id: string, path: string, sort: number, metadata?: object|string, status?: string, shot_type?: string, style_type?: string }>} images
 * @param {{ seed?: string|number, enforceActive?: boolean, preferRoles?: { hero?: string, grid?: Array<string|null> } }} [options]
 * @returns {{ heroImage: object|null, gridImages: Array<object|null> }}
 *   gridImages always has exactly 4 entries; null means "empty slot".
 */
function selectCompCardImages(images, options) {
  if (!images || images.length === 0) {
    return { heroImage: null, gridImages: [null, null, null, null] };
  }

  const { enforceActive, preferRoles, rng } = normalizeOptions(options);
  const pool = filterEligibleByStatus(images, enforceActive);

  const enriched = pool.map((img) => ({
    ...img,
    _role: deriveCompCardRole(img),
  }));

  const selected = new Set();

  function candidatesForSlot(role) {
    const notSel = enriched.filter((img) => !selected.has(img.id));
    if (role == null) {
      return orderByInputOrder(notSel, enriched);
    }
    const roleMatch = notSel.filter((img) => img._role === role);
    if (roleMatch.length > 0) {
      return orderByInputOrder(roleMatch, enriched);
    }
    return orderByInputOrder(notSel, enriched);
  }

  function pickSlot(role) {
    const ordered = candidatesForSlot(role);
    const img = pickWeightedByOrder(ordered, rng);
    if (img) selected.add(img.id);
    return img || null;
  }

  const heroImage = pickSlot(preferRoles.hero);

  const gridImages = preferRoles.grid.map((role) => pickSlot(role));

  return { heroImage, gridImages };
}

module.exports = { selectCompCardImages };
