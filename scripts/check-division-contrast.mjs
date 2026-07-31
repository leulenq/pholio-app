#!/usr/bin/env node
/**
 * Verifies the division mark's ACTUAL shipped colour pairs.
 *
 * The previous version of this script checked pairs the CSS never rendered
 * (pigment-on-white for a state whose CSS used a tinted ground and a darkened
 * ink), so it passed while the real combinations went unmeasured. The mix
 * percentages below are read from the CSS itself where possible and otherwise
 * mirrored explicitly, and the ladder is enumerated from the same source.
 *
 * Checks three things:
 *   1. Text contrast, 4.5:1  — every ladder rung, every division.
 *   2. Boundary contrast, 3:1 — the low rungs are 6-12% tints that are all but
 *      invisible on the cream canvas, so the BORDER is what makes the
 *      rectangle a rectangle. WCAG 1.4.11 applies to it.
 *   3. The dark-hero variant.
 *
 * Run: node scripts/check-division-contrast.mjs
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const PALETTE = resolve(here, '../client/src/styles/division-palette.css');

/* Ground and ink tokens, mirrored from agency-tokens.css. */
const PAPER = '#ffffff';
const CANVAS = '#f7f3ec'; // --ag-canvas
const CREAM = '#fbf9f5';
const TEXT_0 = '#1a1815';
const TEXT_2 = '#6b6560';
const TEXT_3 = '#756e68';
const HERO = '#14110b';
const INACTIVE_BG = '#f4f1eb';

const AA_TEXT = 4.5;
const AA_BOUNDARY = 3.0; // WCAG 1.4.11 non-text contrast

const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};
const toHex = (arr) =>
  '#' + arr.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const luminance = (hex) =>
  hexToRgb(hex)
    .map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    })
    .reduce((acc, c, i) => acc + c * [0.2126, 0.7152, 0.0722][i], 0);
const contrast = (a, b) => {
  const [l1, l2] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (l1 + 0.05) / (l2 + 0.05);
};
/** Mirrors `color-mix(in srgb, A pct%, B)`. */
const mix = (a, pct, b) => toHex(hexToRgb(a).map((v, i) => v * pct + hexToRgb(b)[i] * (1 - pct)));
/** Mirrors `color-mix(in srgb, A pct%, transparent)` composited over `over`. */
const alpha = (a, pct, over) => mix(a, pct, over);

const css = readFileSync(PALETTE, 'utf8');
const pigments = [...css.matchAll(/--dv-([a-z0-9]+):\s*(#[0-9A-Fa-f]{6});/g)].map(([, name, hex]) => ({
  name,
  hex,
}));

if (pigments.length < 20) {
  console.error(`Expected the full division palette; found ${pigments.length} tokens.`);
  process.exit(1);
}

/**
 * The ladder, mirroring .dv--* in division-marks.css.
 * fg/bg/border are functions of the division pigment `p`.
 */
const LADDER = [
  {
    key: 'represented',
    fg: () => PAPER,
    bg: (p) => p,
    border: (p) => p,
  },
  {
    key: 'active',
    fg: (p) => mix(p, 0.7, TEXT_0),
    bg: (p) => mix(p, 0.32, PAPER),
    border: (p) => alpha(p, 0.85, CANVAS),
  },
  {
    key: 'developing',
    fg: (p) => mix(p, 0.7, TEXT_0),
    bg: (p) => mix(p, 0.2, PAPER),
    border: (p) => alpha(p, 0.85, CANVAS),
  },
  {
    key: 'shortlisted',
    fg: (p) => mix(p, 0.7, TEXT_0),
    bg: (p) => mix(p, 0.12, PAPER),
    border: (p) => alpha(p, 0.85, CANVAS),
  },
  {
    key: 'onfile',
    fg: () => TEXT_2,
    bg: (p) => mix(p, 0.06, PAPER),
    border: (p) => alpha(p, 0.85, CANVAS),
  },
  {
    key: 'inactive',
    fg: () => TEXT_2,
    bg: () => INACTIVE_BG,
    border: () => alpha('#1a1815', 0.5, CANVAS),
  },
  {
    key: 'passed',
    fg: () => TEXT_2,
    bg: () => CANVAS, // transparent over the canvas
    border: () => alpha('#1a1815', 0.5, CANVAS),
  },
  {
    key: 'unknown',
    fg: () => TEXT_3,
    bg: () => CANVAS,
    border: () => alpha('#1a1815', 0.5, CANVAS),
  },
];

const failures = [];
const record = (kind, division, rung, fg, bg, value, floor) => {
  if (value < floor) failures.push({ kind, division, rung, fg, bg, value, floor });
  return value;
};

let worstText = { value: Infinity };
let worstBoundary = { value: Infinity };

for (const { name, hex } of pigments) {
  for (const rung of LADDER) {
    const fg = rung.fg(hex);
    const bg = rung.bg(hex);
    const border = rung.border(hex);

    const text = record('text', name, rung.key, fg, bg, contrast(fg, bg), AA_TEXT);
    if (text < worstText.value) worstText = { value: text, name, rung: rung.key };

    // The boundary only has to be visible where the ground itself isn't.
    // `represented` is a solid field and needs no stroke to be seen.
    if (rung.key !== 'represented') {
      const boundary = record(
        'boundary',
        name,
        rung.key,
        border,
        CANVAS,
        contrast(border, CANVAS),
        AA_BOUNDARY,
      );
      if (boundary < worstBoundary.value) {
        worstBoundary = { value: boundary, name, rung: rung.key };
      }
    }
  }

  // Dark hero variant: the pigment lightened to 45%, on the scrim.
  const lite = mix(hex, 0.45, PAPER);
  record('dark', name, 'onDark', lite, HERO, contrast(lite, HERO), AA_TEXT);
}

console.log(`\nDivision mark contrast — ${pigments.length} divisions × ${LADDER.length} rungs\n`);
console.log(`  text     floor ${AA_TEXT}   worst ${worstText.value.toFixed(2)}  (${worstText.name} / ${worstText.rung})`);
console.log(
  `  boundary floor ${AA_BOUNDARY}   worst ${worstBoundary.value.toFixed(2)}  (${worstBoundary.name} / ${worstBoundary.rung})`,
);

if (failures.length) {
  console.error(`\n${failures.length} failing pair(s):\n`);
  for (const f of failures.slice(0, 25)) {
    console.error(
      `  ✗ ${f.kind.padEnd(9)} ${f.division.padEnd(13)} ${f.rung.padEnd(13)} ` +
        `${f.fg} on ${f.bg}  ${f.value.toFixed(2)} < ${f.floor}`,
    );
  }
  if (failures.length > 25) console.error(`  … and ${failures.length - 25} more`);
  console.error('');
  process.exit(1);
}

console.log('\nAll pairs pass.\n');
