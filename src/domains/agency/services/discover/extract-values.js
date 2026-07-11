"use strict";

/**
 * Discover parse v2 — deterministic value extraction (WS4.3 / spec §3 step 2).
 *
 * The LLM proposes each constraint's SOURCE SPAN and semantics; NO LLM-produced
 * number or date is ever trusted as a filter value. This module re-parses the
 * span with purpose-built unit/date/size parsers and produces the value that
 * actually filters. When the deterministic re-parse disagrees with the LLM's
 * number (or the span is unparseable), the constraint is flagged
 * `needs_confirmation` and MUST NOT be applied silently (LB-4).
 *
 * Pure + dependency-light: heights/lengths/sizes are hand-rolled; dates use
 * `chrono-node`. Every date entry takes a reference-date parameter for
 * deterministic tests.
 */

const chrono = require("chrono-node");
const { SIZE_REGIONS, SHOE_REGIONS } = require("./field-whitelist");

// ── word numbers (for "five nine", "five foot nine") ─────────────────────────

const WORD_NUM = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};

const CM_PER_IN = 2.54;
const CM_PER_FT = 30.48;

function round(n) {
  return Math.round(n);
}

function feetInchesToCm(feet, inches) {
  return round(feet * CM_PER_FT + (inches || 0) * CM_PER_IN);
}

// ── heights ──────────────────────────────────────────────────────────────────

/**
 * Extract EVERY height mentioned in a span, in cm. Handles:
 *   5'9"  ·  5' 9  ·  5’9  ·  5 ft 9  ·  5 feet 9 in  ·  5 foot 9
 *   175cm ·  175 cm  ·  1.75m  ·  1,75 m
 *   five nine  ·  five-nine  ·  five foot nine
 * Returns [] when nothing parses. Order-preserving.
 */
function extractHeightsCm(span) {
  if (!span) return [];
  const text = String(span).toLowerCase();
  const out = [];
  const seenAt = new Set();

  const push = (cm) => {
    if (cm != null && Number.isFinite(cm)) out.push(cm);
  };

  // 1. cm — 175cm / 175 cm / 180 centimeters
  let m;
  const cmRe = /(\d{2,3})\s*(?:cm|centimet(?:er|re)s?)\b/g;
  while ((m = cmRe.exec(text))) {
    push(parseInt(m[1], 10));
    seenAt.add(m.index);
  }

  // 2. metric decimal meters — 1.75m / 1,75 m / 1.8 metres
  const mRe = /(\d)[.,](\d{1,2})\s*(?:m\b|met(?:er|re)s?\b)/g;
  while ((m = mRe.exec(text))) {
    const meters = parseFloat(`${m[1]}.${m[2]}`);
    push(round(meters * 100));
  }

  // 3. feet + inches — numeric. 5'9" · 5' 9 · 5 ft 9 in · 5 foot 9 · 5'
  const ftRe =
    /(\d)\s*(?:'|’|′|ft\.?|feet|foot)\s*(\d{1,2})?\s*(?:"|”|″|''|in\.?|inch(?:es)?)?/g;
  while ((m = ftRe.exec(text))) {
    const feet = parseInt(m[1], 10);
    if (feet < 3 || feet > 7) continue; // implausible human height in feet
    const inches = m[2] != null ? parseInt(m[2], 10) : 0;
    if (inches > 11) continue;
    push(feetInchesToCm(feet, inches));
  }

  // 4. word form — "five nine", "five-nine", "five foot nine"
  const wordRe =
    /\b(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\b(?:\s*(?:foot|feet|ft)?[\s-]+)(zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven)\b/g;
  while ((m = wordRe.exec(text))) {
    const feet = WORD_NUM[m[1]];
    const inches = WORD_NUM[m[2]];
    if (feet >= 3 && feet <= 7 && inches <= 11) {
      push(feetInchesToCm(feet, inches));
    }
  }

  return out;
}

/** Convenience: the first height in a span (or null). */
function heightToCm(span) {
  const all = extractHeightsCm(span);
  return all.length ? all[0] : null;
}

// ── lengths / measurements (waist, hips, inseam …) ───────────────────────────

/**
 * Extract every body length in a span, in cm. Handles:
 *   24"  ·  24 in  ·  24 inch  ·  24 inches  ·  61cm  ·  61 cm
 * Returns [] when nothing parses.
 */
function extractLengthsCm(span) {
  if (!span) return [];
  const text = String(span).toLowerCase();
  const out = [];
  let m;

  const cmRe = /(\d{2,3})\s*(?:cm|centimet(?:er|re)s?)\b/g;
  while ((m = cmRe.exec(text))) out.push(parseInt(m[1], 10));

  const inRe = /(\d{1,2}(?:\.\d)?)\s*(?:"|”|″|in\.?\b|inch(?:es)?\b)/g;
  while ((m = inRe.exec(text))) out.push(round(parseFloat(m[1]) * CM_PER_IN));

  return out;
}

function lengthToCm(span) {
  const all = extractLengthsCm(span);
  return all.length ? all[0] : null;
}

// ── plain ages ───────────────────────────────────────────────────────────────

/** Extract candidate playing-age integers (5..80) from a span, in order. */
function extractAges(span) {
  if (!span) return [];
  const text = String(span).toLowerCase();
  const out = [];
  let m;
  const re = /\b(\d{1,2})\b/g;
  while ((m = re.exec(text))) {
    const n = parseInt(m[1], 10);
    if (n >= 5 && n <= 80) out.push(n);
  }
  // Decade phrasings: "20s", "thirties"
  const DECADES = { twenties: 20, thirties: 30, forties: 40, fifties: 50 };
  for (const [word, base] of Object.entries(DECADES)) {
    if (text.includes(word)) out.push(base, base + 9);
  }
  const decRe = /\b(\d0)s\b/g;
  while ((m = decRe.exec(text))) {
    const base = parseInt(m[1], 10);
    out.push(base, base + 9);
  }
  return out;
}

// ── sizes (region-tagged) ────────────────────────────────────────────────────

const REGION_TOKENS = {
  US: /\b(us|usa|american)\b/,
  UK: /\b(uk|british)\b/,
  EU: /\b(eu|euro(?:pean)?)\b/,
  IT: /\b(it|ital(?:y|ian))\b/,
  FR: /\b(fr|french|france)\b/,
};

/**
 * Parse a size + region from a span. Handles "US 6", "size 6", "UK 8",
 * "EU 38", "6". Region falls back to `defaultRegion` (context flag) when the
 * span carries no explicit region token.
 * @returns {{value: string, region: string}|null}
 */
function parseSize(span, { defaultRegion = "US", regions = SIZE_REGIONS } = {}) {
  if (!span) return null;
  const text = String(span).toLowerCase();

  let region = null;
  for (const [code, re] of Object.entries(REGION_TOKENS)) {
    if (regions.includes(code) && re.test(text)) {
      region = code;
      break;
    }
  }

  const m = text.match(/\b(?:size\s*)?(\d{1,2}(?:\.\d)?)\b/);
  if (!m) return null;

  return {
    value: m[1],
    region: region || defaultRegion,
  };
}

function parseShoe(span, opts = {}) {
  const size = parseSize(span, {
    defaultRegion: opts.defaultRegion || "US",
    regions: SHOE_REGIONS,
  });
  if (!size) return null;
  return { size: parseFloat(size.value), region: size.region };
}

// ── dates (chrono-node) ──────────────────────────────────────────────────────

function toISODate(date) {
  if (!date) return null;
  // chrono anchors bare dates at 12:00 UTC → slice is timezone-stable.
  return date.toISOString().slice(0, 10);
}

/**
 * Parse a date or date range from a span relative to a reference date.
 * Handles "next week", "July 9-14", "through June 26", "July 9", relative
 * ranges. Returns { from, to } ISO date strings; `to` is null for a single
 * date. Null when nothing parses.
 * @param {string} span
 * @param {Date} [referenceDate]
 */
function parseDateRange(span, referenceDate = new Date()) {
  if (!span) return null;
  const results = chrono.parse(String(span), referenceDate, {
    forwardDate: true,
  });
  if (!results.length) return null;

  const first = results[0];
  const from = toISODate(first.start ? first.start.date() : null);
  let to = first.end ? toISODate(first.end.date()) : null;

  // "fittings through June 26" style: a second standalone result becomes `to`.
  if (!to && results.length > 1) {
    to = toISODate(results[1].start ? results[1].start.date() : null);
  }

  if (!from) return null;
  return { from, to };
}

// ── reconciliation (the LB-4 gate) ───────────────────────────────────────────

const TOLERANCE = { height: 1, length: 1, age: 0 };

function extractByKind(span, kind, opts) {
  switch (kind) {
    case "height":
      return extractHeightsCm(span);
    case "length":
      return extractLengthsCm(span);
    case "age":
      return extractAges(span);
    default:
      return [];
  }
}

function numbersAgree(parsed, expected, tol) {
  // Every expected value must be matched (within tol) by some parsed value.
  return expected.every((e) =>
    parsed.some((p) => Math.abs(p - e) <= tol),
  );
}

/**
 * Re-parse a constraint's span deterministically and compare it to the value
 * the LLM proposed. The heart of the wrong-but-schema-valid defense (LB-4).
 *
 * @param {object} constraint — an LLM constraint object carrying `.span`
 * @param {object} [opts]
 * @param {'height'|'length'|'age'|'date'|'size'|'shoe'} [opts.kind]
 * @param {Date}   [opts.now] — reference date for relative date spans
 * @param {string} [opts.defaultRegion] — size region when the span omits one
 * @returns {{ value: any, agrees: boolean, needs_confirmation: boolean }}
 *   `needs_confirmation` is true when the parse disagrees OR the span is
 *   unparseable — in either case the constraint must NOT be applied as a filter.
 */
function reconcile(constraint, opts = {}) {
  const kind = opts.kind || "number";
  const span = constraint ? constraint.span : null;

  const unparseable = { value: null, agrees: false, needs_confirmation: true };
  if (!span || !String(span).trim()) return unparseable;

  if (kind === "date") {
    const parsed = parseDateRange(span, opts.now || new Date());
    if (!parsed) return unparseable;
    const expFrom = constraint.from || null;
    const expTo = constraint.to || null;
    const fromAgrees = expFrom == null || expFrom === parsed.from;
    const toAgrees = expTo == null || expTo === parsed.to;
    const agrees = fromAgrees && toAgrees;
    return { value: parsed, agrees, needs_confirmation: !agrees };
  }

  if (kind === "size" || kind === "shoe") {
    const parsed =
      kind === "shoe"
        ? parseShoe(span, opts)
        : parseSize(span, { defaultRegion: opts.defaultRegion || "US" });
    if (!parsed) return unparseable;
    const expValue =
      constraint.value != null
        ? String(constraint.value)
        : constraint.size != null
          ? String(constraint.size)
          : null;
    const parsedValue = String(parsed.value != null ? parsed.value : parsed.size);
    const valueAgrees = expValue == null || expValue === parsedValue;
    const expRegion = constraint.region || null;
    const regionAgrees = expRegion == null || expRegion === parsed.region;
    const agrees = valueAgrees && regionAgrees;
    return { value: parsed, agrees, needs_confirmation: !agrees };
  }

  // numeric kinds (height / length / age)
  const parsed = extractByKind(span, kind, opts);
  if (!parsed.length) return unparseable;

  const expected = [constraint.a, constraint.b]
    .filter((v) => v != null)
    .map(Number)
    .filter((v) => Number.isFinite(v));

  // No LLM number to check against → trust the deterministic parse but still
  // surface it as the value; agreement is vacuously true only if we parsed one.
  if (!expected.length) {
    return { value: parsed[0], agrees: true, needs_confirmation: false };
  }

  const tol = TOLERANCE[kind] != null ? TOLERANCE[kind] : 1;
  const agrees = numbersAgree(parsed, expected, tol);
  const value = expected.length > 1 ? { a: parsed[0], b: parsed[1] ?? null } : parsed[0];
  return { value, agrees, needs_confirmation: !agrees };
}

module.exports = {
  // heights
  extractHeightsCm,
  heightToCm,
  // lengths
  extractLengthsCm,
  lengthToCm,
  // ages
  extractAges,
  // sizes
  parseSize,
  parseShoe,
  // dates
  parseDateRange,
  toISODate,
  // the gate
  reconcile,
  // constants (test surface)
  WORD_NUM,
};
