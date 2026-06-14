/**
 * Comp Card back-page grid catalog (composed engine).
 *
 * Defines the 3–5 photo grids the composition director can choose from for
 * the back page of a 5.5in × 8.5in comp card. Every cell aspect is HONEST:
 * it is computed from real grid geometry, not a nominal value.
 *
 * Geometry assumption (documented per spec):
 * - Page: 5.5in × 8.5in portrait, 0.25in safe margins → 5.0in usable width.
 * - The back-page photo region is assumed to be ≈ 5.0in wide × 6.2in tall.
 *   (8.5in minus top/bottom safe margins, the repeated — smaller — name line,
 *   the stats strip and the contact line ≈ 2.3in of non-photo chrome.)
 * - Internal gutter between cells: 0.1in.
 *
 * Cell aspects below are derived from fr-weight track sizing over that region
 * exactly the way CSS grid would resolve them, so the template can consume
 * `gridTemplate.{columns,rows,areas}` verbatim and the rendered cells will
 * match the advertised aspect ratios.
 *
 * Shape per grid:
 *   { id, label, count,
 *     cells: [{ area, aspect, widthIn, heightIn, areaSqIn, tall }],
 *     gridTemplate: { columns, rows, areas } }   // ready-to-use CSS strings
 */

const PHOTO_REGION = Object.freeze({
  widthIn: 5.0,
  heightIn: 6.2,
  gapIn: 0.1,
});

/**
 * Cells with w/h aspect at or below this are considered "tall" — suitable to
 * carry a full-body shot without cutting the figure.
 */
const TALL_CELL_ASPECT_MAX = 0.55;

/**
 * Raw grid definitions. `cols`/`rows` are fr weights; `areas` is the named
 * area matrix (rows of column letters), exactly mirroring CSS grid semantics.
 */
const RAW_GRIDS = {
  'trio-feature': {
    label: 'Trio Feature',
    description: 'Tall full-height feature column + two stacked supports.',
    cols: [3, 2],
    rows: [1, 1],
    areas: [
      ['a', 'b'],
      ['a', 'c'],
    ],
  },
  'quad-grid': {
    label: 'Quad Grid',
    description: 'Classic symmetric 2×2.',
    cols: [1, 1],
    rows: [1, 1],
    areas: [
      ['a', 'b'],
      ['c', 'd'],
    ],
  },
  'quad-feature': {
    label: 'Quad Feature',
    description: 'Tall full-height feature column + three stacked supports.',
    cols: [3, 2],
    rows: [1, 1, 1],
    areas: [
      ['a', 'b'],
      ['a', 'c'],
      ['a', 'd'],
    ],
  },
  'quint-mosaic': {
    label: 'Quint Mosaic',
    description:
      'Wide editorial opener + tall full-body column, three supports below.',
    cols: [1, 1, 1],
    rows: [3, 2],
    areas: [
      ['a', 'a', 'b'],
      ['c', 'd', 'e'],
    ],
  },
};

function round3(value) {
  return Math.round(value * 1000) / 1000;
}

/**
 * Resolve fr-weighted track sizes within `total` inches with `gap` gutters,
 * the same way CSS grid distributes fr units.
 */
function computeTracks(weights, total, gap) {
  const available = total - gap * (weights.length - 1);
  const sum = weights.reduce((a, b) => a + b, 0);
  return weights.map((w) => (available * w) / sum);
}

function buildGrid(id, raw) {
  const colSizes = computeTracks(raw.cols, PHOTO_REGION.widthIn, PHOTO_REGION.gapIn);
  const rowSizes = computeTracks(raw.rows, PHOTO_REGION.heightIn, PHOTO_REGION.gapIn);
  const letters = [...new Set(raw.areas.flat())].sort();

  const cells = letters.map((letter) => {
    let minCol = Infinity;
    let maxCol = -1;
    let minRow = Infinity;
    let maxRow = -1;
    raw.areas.forEach((row, r) => {
      row.forEach((cell, c) => {
        if (cell !== letter) return;
        if (c < minCol) minCol = c;
        if (c > maxCol) maxCol = c;
        if (r < minRow) minRow = r;
        if (r > maxRow) maxRow = r;
      });
    });

    const widthIn =
      colSizes.slice(minCol, maxCol + 1).reduce((a, b) => a + b, 0) +
      PHOTO_REGION.gapIn * (maxCol - minCol);
    const heightIn =
      rowSizes.slice(minRow, maxRow + 1).reduce((a, b) => a + b, 0) +
      PHOTO_REGION.gapIn * (maxRow - minRow);
    const aspect = widthIn / heightIn;

    return {
      area: letter,
      aspect: round3(aspect),
      widthIn: round3(widthIn),
      heightIn: round3(heightIn),
      areaSqIn: round3(widthIn * heightIn),
      tall: aspect <= TALL_CELL_ASPECT_MAX,
    };
  });

  return {
    id,
    label: raw.label,
    description: raw.description,
    count: letters.length,
    cells,
    gridTemplate: {
      columns: raw.cols.map((w) => `${w}fr`).join(' '),
      rows: raw.rows.map((w) => `${w}fr`).join(' '),
      areas: raw.areas.map((row) => `"${row.join(' ')}"`).join(' '),
    },
  };
}

const GRIDS = Object.freeze(
  Object.fromEntries(
    Object.entries(RAW_GRIDS).map(([id, raw]) => [id, buildGrid(id, raw)]),
  ),
);

function listGridIds() {
  return Object.keys(GRIDS);
}

function getGrid(id) {
  return GRIDS[id] || null;
}

module.exports = {
  PHOTO_REGION,
  TALL_CELL_ASPECT_MAX,
  GRIDS,
  listGridIds,
  getGrid,
};
