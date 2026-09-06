/**
 * Measurement Conversion Utilities
 * Handles conversions between metric and imperial units
 */

export const cmToFeetInches = (cm) => {
  if (!cm) return { ft: '', in: '' };
  // Round total inches before splitting so the remainder can never round up
  // to 12 (182 cm must be 6'0", not 5'12").
  const totalInches = Math.round(cm / 2.54);
  const feet = Math.floor(totalInches / 12);
  const inches = totalInches % 12;
  return { ft: feet.toString(), in: inches.toString() };
};

export const feetInchesToCm = (ft, inch) => {
  const f = parseFloat(ft) || 0;
  const i = parseFloat(inch) || 0;
  if (f === 0 && i === 0) return '';
  return Math.round((f * 12 + i) * 2.54);
};

export const kgToLbs = (kg) => kg ? Math.round(kg * 2.20462) : '';

export const lbsToKg = (lbs) => lbs ? Math.round(lbs / 2.20462) : '';

export const cmToInches = (cm) => cm ? (cm / 2.54).toFixed(1) : '';

export const inchesToCm = (inches) => inches ? Math.round(parseFloat(inches) * 2.54) : '';

/**
 * EU ≈ US + offset, by presentation track. Mirrors the server's
 * `SHOE_EU_OFFSET` (src/domains/pdf/composition/stats-formatter.js:47) —
 * `EU = US + offset` with `women: 31, men: 33`. That server function
 * (`renderShoe`) falls back to the women's offset for an unresolved
 * category (`SHOE_EU_OFFSET[category] ?? SHOE_EU_OFFSET.women`); this does
 * the same for an unspecified/unknown track.
 */
const SHOE_EU_OFFSET = { women: 31, men: 33 };

/**
 * UK ≈ US − offset, by presentation track (women's and men's US↔UK shoe
 * scales differ by a size). `renderShoe` never renders a UK value itself —
 * it only reads a UK *input* via a flat +1 — so this is the conversion
 * table used to actually present UK sizes, not a port of a server literal.
 * Same women-default fallback as the EU offset above.
 */
const SHOE_UK_OFFSET = { women: 2, men: 1 };

/** Accepts either the server's category vocabulary ('women'/'men') or the
 *  client's stats-track vocabulary ('womenswear'/'menswear'/'ungendered').
 *  Anything else — including no track at all — defaults to women's sizing. */
const TRACK_TO_SHOE_CATEGORY = {
  women: 'women',
  men: 'men',
  womenswear: 'women',
  menswear: 'men',
};

const fmtShoeNum = (n) => {
  const rounded = Math.round(n * 2) / 2; // shoe sizes step by whole or half sizes
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};

/**
 * Convert a shoe size from its declared region to the other two regions.
 * @param {number|string} size - the size as declared, in `region`'s system
 * @param {'US'|'UK'|'EU'} region - the system `size` is expressed in
 * @param {string} [track] - presentation track ('women'/'men'/'womenswear'/
 *   'menswear'); anything else defaults to women's sizing (matches the
 *   server's fallback).
 * @returns {string} e.g. `≈ UK 7, EU 40`
 */
export const getShoeConversions = (size, region, track) => {
  if (!size) return '';
  const s = parseFloat(size);
  if (!Number.isFinite(s)) return '';

  const category = TRACK_TO_SHOE_CATEGORY[track] || 'women';
  const euOffset = SHOE_EU_OFFSET[category];
  const ukOffset = SHOE_UK_OFFSET[category];

  let us;
  if (region === 'UK') us = s + ukOffset;
  else if (region === 'EU') us = s - euOffset;
  else us = s; // 'US' (default)

  const values = { US: us, UK: us - ukOffset, EU: us + euOffset };
  delete values[region];

  return `≈ ${Object.entries(values).map(([r, val]) => `${r} ${fmtShoeNum(val)}`).join(', ')}`;
};

export const tryJsonJoin = (val) => {
  try {
    const p = JSON.parse(val);
    return Array.isArray(p) ? p.join(', ') : val;
  } catch {
    return val;
  }
};
