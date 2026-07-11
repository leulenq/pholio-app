/**
 * Shared ctx builders for the front-program legacy-exactness regression.
 *
 * The baseline JSON (front-program-legacy-baseline.json) holds outputs of
 * the PRE-EDITIONS front-program engine for these exact inputs, captured
 * before the editions path and the 2.5 print-rule fixes landed. The
 * regression test replays the inputs WITHOUT ctx.edition and asserts
 * deep-equality — proving the edition machinery is strictly opt-in.
 *
 * Seeds were chosen from the verified-identical set: the mandated
 * print-rule fixes (reversed contact ≥10pt on palette-pulled color
 * blocks) intentionally changed a small set of other seeds; those are
 * asserted separately in front-program-print-rules.test.js.
 *
 * DO NOT EDIT the builders without regenerating the baseline from a
 * known-legacy revision.
 */

"use strict";

function studioForensics({ focal = { x: 0.5, y: 0.55 } } = {}) {
  const grid = Array.from({ length: 9 }, () => Array.from({ length: 6 }, () => 0.16));
  const detail = Array.from({ length: 9 }, (_, r) =>
    Array.from({ length: 6 }, (_, c) => (r >= 3 && r <= 8 && c >= 2 && c <= 3 ? 0.85 : 0.04)),
  );
  return {
    width: 2000, height: 3000, aspect: 0.667,
    luma: { rows: 9, cols: 6, grid, mean: 0.2, isDark: true },
    detail: { grid: detail },
    quiet: {
      top: { score: 0.95, bandRows: 3 },
      bottom: { score: 0.55, bandRows: 2 },
      left: { score: 0.4, bandCols: 2 },
      right: { score: 0.4, bandCols: 2 },
    },
    palette: [{ hex: "#6E4A30", population: 0.4, sat: 0.4, luma: 0.3 }],
    warmth: 0.2, saturation: 0.3, contrast: 0.6,
    focal, version: 2,
  };
}

function locationForensics() {
  const rows = 9;
  const cols = 6;
  const luma = [];
  const detail = [];
  for (let r = 0; r < rows; r++) {
    const busy = r >= 4;
    luma.push(new Array(cols).fill(busy ? 0.15 : 0.82));
    detail.push(new Array(cols).fill(busy ? 0.7 : 0.03));
  }
  return {
    aspect: 2 / 3,
    luma: { rows, cols, grid: luma, mean: 0.5, isDark: false },
    detail: { grid: detail },
    quiet: {
      top: { score: 0.9, bandRows: 3 },
      bottom: { score: 0.2, bandRows: 2 },
      left: { score: 0.5, bandCols: 2 },
      right: { score: 0.5, bandCols: 2 },
    },
    focal: { x: 0.5, y: 0.22 },
    palette: [{ hex: "#8A6A52", population: 0.4, sat: 0.3, luma: 0.45 }],
    warmth: 0.2, saturation: 0.25, contrast: 0.5,
  };
}

function matteGrid() {
  const rows = 18;
  const cols = 12;
  return Array.from({ length: rows }, (_, r) =>
    Array.from({ length: cols }, (_, c) => (c >= 4 && c <= 7 && r >= 4 ? 0.9 : 0.0)),
  );
}

function baseCtx() {
  return {
    heroAspect: 0.667,
    heroForensics: studioForensics(),
    palette: { background: "#FAF8F5", text: "#1A1815", muted: "#6B6560", accent: "#B8956A" },
    typography: { display: "Playfair Display" },
    nameText: "Ana Petrova",
    nameMetrics: { advanceEm: 0.6, trackingEm: 0.12 },
    contactLine: "Paris · @anapetrova",
    language: { toneVector: { formality: 0.6, energy: 0.5, warmth: 0.45, density: 0.45 }, pacing: 1 },
    brief: null,
  };
}

function variants() {
  const base = baseCtx();
  return {
    studio: base,
    location: {
      ...base,
      heroForensics: locationForensics(),
      heroAspect: 2 / 3,
      heroCrop: { objectPosition: "50% 20%" },
    },
    matte: { ...base, matteGrid: matteGrid(), brief: { risk: 0.8 } },
    split_metrics: {
      ...base,
      heroForensics: locationForensics(),
      nameMetrics: {
        advanceEm: 0.6, advanceLongestEm: 0.62, trackingEm: 0.12,
        first: { advanceEm: 0.64, weight: 700 },
        last: { advanceEm: 0.6, weight: 500 },
        lastBody: { advanceEm: 0.55, weight: 600 },
      },
      language: { toneVector: { formality: 0.3, energy: 0.9, warmth: 0.5, density: 0.5 } },
    },
  };
}

// (variant, seed) pairs frozen in the baseline — verified identical
// between the pre-editions engine and the current engine.
const BASELINE_CASES = [
  ["studio", ["legacy-0", "legacy-1", "legacy-2", "legacy-7", "legacy-12", "legacy-20"]],
  ["location", ["legacy-0", "legacy-3", "legacy-8", "legacy-14", "legacy-25"]],
  ["matte", ["legacy-0", "legacy-2", "legacy-9", "legacy-16"]],
  ["split_metrics", ["legacy-1", "legacy-3", "legacy-7", "legacy-12", "legacy-30"]],
];

module.exports = {
  studioForensics,
  locationForensics,
  matteGrid,
  baseCtx,
  variants,
  BASELINE_CASES,
};
