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
 * Each slot uses the best role-matched image not already selected, then falls
 * back to the next unselected image in sort order.
 */

/**
 * Parse image metadata safely (handles both JSONB objects and JSON strings).
 * @param {*} metadata
 * @returns {{ role: string|null, [key: string]: any }}
 */
function parseMetadata(metadata) {
  if (!metadata) return {};
  if (typeof metadata === 'object') return metadata;
  try {
    return JSON.parse(metadata);
  } catch {
    return {};
  }
}

/**
 * Select the best images for a comp card.
 *
 * @param {Array<{ id: string, path: string, sort: number, metadata?: object|string }>} images
 * @returns {{ heroImage: object|null, gridImages: Array<object|null> }}
 *   gridImages always has exactly 4 entries; null means "empty slot".
 */
function selectCompCardImages(images) {
  if (!images || images.length === 0) {
    return { heroImage: null, gridImages: [null, null, null, null] };
  }

  // Enrich each image with its parsed role
  const enriched = images.map(img => ({
    ...img,
    _role: parseMetadata(img.metadata).role || null
  }));

  const selected = new Set();

  /** Pick the first image matching `role` that hasn't been selected yet */
  function pickByRole(role) {
    return enriched.find(img => img._role === role && !selected.has(img.id)) || null;
  }

  /** Pick the first unselected image (sort-order fallback) */
  function pickNext() {
    return enriched.find(img => !selected.has(img.id)) || null;
  }

  /** Select an image: prefer `role`, fall back to next available */
  function pick(role) {
    const img = (role ? pickByRole(role) : null) || pickNext();
    if (img) selected.add(img.id);
    return img || null;
  }

  const heroImage = pick('headshot');

  const gridImages = [
    pick('full_body'),
    pick('editorial'),
    pick('lifestyle'),
    pick(null)   // best remaining
  ];

  return { heroImage, gridImages };
}

module.exports = { selectCompCardImages };
