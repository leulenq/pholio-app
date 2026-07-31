#!/usr/bin/env node
/**
 * Verifies every division pigment in agency-tokens.css against WCAG 2.1 AA.
 *
 * Two directions have to hold, because the division mark uses each pigment
 * both ways:
 *   1. white text on the solid pigment code cell  (`solid` / `stamp` standing)
 *   2. pigment text on paper and on canvas        (`ruled` / `dashed` standing)
 *
 * Code text is 11–12px, so the 4.5:1 small-text threshold applies to both.
 *
 * Run: node scripts/check-division-contrast.mjs
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const TOKENS = resolve(here, '../client/src/styles/agency-tokens.css');

const PAPER = '#FFFFFF';   // --ag-surface-1, the mark's field
const CANVAS = '#F7F3EC';  // --ag-canvas, the command-center ground
const DARK = '#14110B';    // roster drawer hero scrim, for the onDark variant
const INK = '#1A1815';     // --ag-text-0, sits on the lightened pigment onDark
const AA_SMALL = 4.5;

const hexToRgb = (hex) => {
  const h = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
};

// WCAG relative luminance.
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

const css = readFileSync(TOKENS, 'utf8');
const pigments = [...css.matchAll(/--ss-p-([a-z]+):\s*(#[0-9A-Fa-f]{6});/g)].map(
  ([, name, hex]) => ({ name, hex }),
);

if (pigments.length === 0) {
  console.error('No --ss-p-* pigments found in agency-tokens.css');
  process.exit(1);
}

/** Mirrors `color-mix(in srgb, var(--p) 45%, #ffffff)` — the onDark lightening. */
const lighten = (hex, pct = 0.45) =>
  '#' +
  hexToRgb(hex)
    .map((c) => Math.round(c * pct + 255 * (1 - pct)))
    .map((c) => c.toString(16).padStart(2, '0'))
    .join('');

let failures = 0;
const rows = pigments.map(({ name, hex }) => {
  const light = lighten(hex);
  const checks = {
    onPigment: contrast(PAPER, hex),    // white code text on the solid cell
    onPaper: contrast(hex, PAPER),      // pigment code text, ruled cell
    onCanvas: contrast(hex, CANVAS),    // pigment code text over canvas
    darkCell: contrast(light, DARK),    // lightened cell against the dark scrim
    darkText: contrast(INK, light),     // ink code text on the lightened cell
  };
  const worst = Math.min(...Object.values(checks));
  const pass = worst >= AA_SMALL;
  if (!pass) failures += 1;
  return { name, hex, ...checks, pass };
});

const fmt = (n) => n.toFixed(2).padStart(5);
console.log('\nDivision pigment contrast — WCAG AA small text (4.5:1)\n');
console.log('  pigment          hex       white/pig  pig/paper  pig/canvas  lite/dark  ink/lite');
console.log('  ' + '─'.repeat(84));
for (const r of rows) {
  console.log(
    `  ${r.pass ? '✓' : '✗'} ${r.name.padEnd(13)} ${r.hex}   ` +
      `${fmt(r.onPigment)}      ${fmt(r.onPaper)}      ${fmt(r.onCanvas)}      ` +
      `${fmt(r.darkCell)}      ${fmt(r.darkText)}`,
  );
}

console.log('');
if (failures > 0) {
  console.error(`${failures} pigment(s) below 4.5:1. Darken or lighten to fix.\n`);
  process.exit(1);
}
console.log(`All ${rows.length} pigments clear 4.5:1 in both directions.\n`);
