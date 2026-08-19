"use strict";

/*
 * Unit interpretation for numbers read off a comp card.
 *
 * A comp card prints `34` and expects you to know whether that is inches or
 * centimetres. Guessing wrong writes a number that looks right and is not, which
 * is worse than leaving the field empty — an agency cannot tell a bad import from
 * a real measurement. So this module does three things, in order:
 *
 *   1. An explicit unit on the value always wins. `34"` is inches. Full stop.
 *   2. Otherwise the value is interpreted against the plausible human range for
 *      that measurement in each unit. Where the ranges do not overlap, the number
 *      identifies its own unit.
 *   3. Where they *do* overlap, the value is `ambiguous` — never resolved by
 *      preference. The caller either resolves it from the card's overall unit
 *      system (cards do not mix systems) or shows it to the talent unresolved.
 *
 * The ranges below are stated as ranges, not thresholds, and each is annotated
 * with why it ends where it does. `tasks/lessons.md` 2026-07-29: measure before
 * tuning a threshold, and never let a single scalar stand in for a decision it
 * cannot make.
 */

const CM_PER_INCH = 2.54;

/**
 * Plausible ranges per measurement kind, in each unit.
 *
 * `imperial` and `metric` are the ranges a human adult can actually occupy. Where
 * the two do not intersect, a bare number is self-identifying.
 */
const RANGES = Object.freeze({
  // 4'0"–7'0". Below 122cm is a small child; above 213cm is beyond the tallest
  // working models. The two ranges are 84in (213cm) and 122cm — no intersection.
  height: { imperial: [48, 84], metric: [122, 213], imperialUnit: "in", metricUnit: "cm" },
  // Bust/chest/waist/hips as printed on working cards. 20in is a very small waist,
  // 55in a large chest; 50cm/140cm bound the same bodies. 50–55 intersects, and
  // any value there comes back ambiguous.
  circumference: { imperial: [20, 55], metric: [50, 140], imperialUnit: "in", metricUnit: "cm" },
  // Inseam. 24in–40in against 60cm–102cm; 60–40in(101cm) intersects at 60–102.
  inseam: { imperial: [24, 40], metric: [60, 102], imperialUnit: "in", metricUnit: "cm" },
  // Shoe: US 3–17, EU 33–50. No intersection.
  shoe: { imperial: [3, 17], metric: [33, 50], imperialUnit: "us", metricUnit: "eu" },
  // Weight: 80–400lb against 36–180kg. Heavy intersection (80–180) — bare weights
  // on a card are almost always ambiguous, which is the honest answer.
  weight: { imperial: [80, 400], metric: [36, 180], imperialUnit: "lb", metricUnit: "kg" },
});

function inRange(value, [min, max]) {
  return value >= min && value <= max;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

/**
 * Pull a number out of a printed value.
 *
 * Handles `34`, `34.5`, `34,5` (European decimal comma) and `34 1/2`. Returns null
 * rather than a partial read — `NaN` propagating into a measurement column is the
 * failure mode this guards.
 */
function parseNumeric(raw) {
  if (raw == null) return null;
  const text = String(raw).trim();
  if (!text) return null;

  // "34 1/2" and "34-1/2"
  const mixed = text.match(/^(\d{1,3})\s*[-\s]\s*(\d)\s*\/\s*(\d)/);
  if (mixed) {
    const denominator = Number(mixed[3]);
    if (denominator > 0) {
      return Number(mixed[1]) + Number(mixed[2]) / denominator;
    }
  }

  // "1.80m" / "1,80 m" — metres, promoted to cm by the caller via the unit token.
  const numeric = text.match(/^(\d{1,3})(?:[.,](\d{1,2}))?/);
  if (!numeric) return null;
  const value = Number(`${numeric[1]}.${numeric[2] || 0}`);
  return Number.isFinite(value) ? value : null;
}

/**
 * The unit a value states about itself, if any.
 *
 * @returns {"in"|"cm"|"m"|"ft_in"|"kg"|"lb"|"us"|"eu"|null}
 */
function explicitUnit(raw) {
  const text = String(raw || "").toLowerCase();

  // 5'11" / 5' 11 / 5ft 11in — feet and inches, which is unmistakable.
  if (/\d\s*(?:'|’|ft\b|feet\b)/.test(text)) return "ft_in";
  if (/\d\s*(?:"|”|''|in\b|ins\b|inch(?:es)?\b)/.test(text)) return "in";
  if (/\d\s*(?:cms?\b|centimet)/.test(text)) return "cm";
  if (/\d\s*m\b/.test(text) && /^\s*[12][.,]\d/.test(text)) return "m";
  if (/\d\s*(?:kgs?\b|kilo)/.test(text)) return "kg";
  if (/\d\s*(?:lbs?\b|pounds?\b)/.test(text)) return "lb";
  if (/\b(?:eu|eur|euro)\b/.test(text)) return "eu";
  if (/\b(?:us|usa)\b/.test(text)) return "us";
  return null;
}

/**
 * Feet-and-inches, in any of the forms a card prints it.
 * `5'11"`, `5' 11`, `5ft11in`, `5 ft 11`.
 */
function parseFeetInches(raw) {
  const text = String(raw || "");
  const match = text.match(/(\d)\s*(?:'|’|ft\b|feet\b)\s*(\d{1,2})?/i);
  if (!match) return null;
  const feet = Number(match[1]);
  const inches = match[2] == null ? 0 : Number(match[2]);
  if (!Number.isFinite(feet) || inches >= 12) return null;
  return feet * 12 + inches;
}

/**
 * Interpret one printed measurement.
 *
 * @param {string} raw            the value exactly as printed
 * @param {keyof RANGES} kind
 * @param {"imperial"|"metric"|null} [systemHint]  the card's own system, when known
 * @returns {{
 *   value: number|null, unit: string|null, cm: number|null,
 *   status: "resolved"|"ambiguous"|"implausible"|"unreadable",
 *   raw: string, candidates?: Array<{ unit: string, value: number, cm: number|null }>,
 *   resolvedBy?: "explicit"|"range"|"card_system"
 * }}
 */
function interpretMeasurement(raw, kind, systemHint = null) {
  const range = RANGES[kind];
  if (!range) throw new Error(`Unknown measurement kind: ${kind}`);

  const text = String(raw ?? "").trim();
  const unit = explicitUnit(text);

  // --- 1. An explicit unit is definitive. ---
  if (unit === "ft_in") {
    const inches = parseFeetInches(text);
    if (inches == null) return unreadable(text);
    return resolved(inches, "in", toCm(inches, "in", kind), "explicit", text);
  }

  const numeric = parseNumeric(text);
  if (numeric == null) return unreadable(text);

  if (unit === "m") {
    const cm = round1(numeric * 100);
    return resolved(cm, "cm", cm, "explicit", text);
  }
  if (unit) {
    return resolved(numeric, unit, toCm(numeric, unit, kind), "explicit", text);
  }

  // --- 2. Self-identifying by range. ---
  const fitsImperial = inRange(numeric, range.imperial);
  const fitsMetric = inRange(numeric, range.metric);

  if (fitsImperial && !fitsMetric) {
    return resolved(
      numeric,
      range.imperialUnit,
      toCm(numeric, range.imperialUnit, kind),
      "range",
      text,
    );
  }
  if (fitsMetric && !fitsImperial) {
    return resolved(numeric, range.metricUnit, toCm(numeric, range.metricUnit, kind), "range", text);
  }
  if (!fitsMetric && !fitsImperial) {
    // Not a body. A stray year, phone fragment or panel number.
    return { value: null, unit: null, cm: null, status: "implausible", raw: text };
  }

  // --- 3. Both fit. The card's own system decides, or nobody does. ---
  const candidates = [
    {
      unit: range.imperialUnit,
      value: numeric,
      cm: toCm(numeric, range.imperialUnit, kind),
    },
    { unit: range.metricUnit, value: numeric, cm: toCm(numeric, range.metricUnit, kind) },
  ];

  if (systemHint === "imperial" || systemHint === "metric") {
    const chosen = systemHint === "imperial" ? candidates[0] : candidates[1];
    return {
      ...resolved(chosen.value, chosen.unit, chosen.cm, "card_system", text),
      candidates,
    };
  }

  return { value: null, unit: null, cm: null, status: "ambiguous", raw: text, candidates };
}

function resolved(value, unit, cm, resolvedBy, raw) {
  return { value: round1(value), unit, cm, status: "resolved", resolvedBy, raw };
}

function unreadable(raw) {
  return { value: null, unit: null, cm: null, status: "unreadable", raw };
}

/** Canonical centimetres, where the kind has a centimetre meaning at all. */
function toCm(value, unit, kind) {
  if (kind === "shoe" || kind === "weight") return null;
  if (unit === "in") return round1(value * CM_PER_INCH);
  if (unit === "cm") return round1(value);
  return null;
}

/**
 * Which system a card is printed in, from the values that identify themselves.
 *
 * Comp cards do not mix systems — a card is either an inches card or a centimetres
 * card. So the unambiguous values on the card resolve the ambiguous ones. When the
 * evidence is split or absent, this returns null and the ambiguous values stay
 * ambiguous rather than being resolved by a coin flip.
 */
function detectCardSystem(readings) {
  let imperial = 0;
  let metric = 0;

  for (const reading of readings || []) {
    if (!reading || reading.status !== "resolved") continue;
    if (reading.resolvedBy === "card_system") continue;
    if (reading.unit === "in" || reading.unit === "lb") imperial += 1;
    if (reading.unit === "cm" || reading.unit === "kg") metric += 1;
  }

  if (imperial > metric) return "imperial";
  if (metric > imperial) return "metric";
  return null;
}

module.exports = {
  CM_PER_INCH,
  RANGES,
  detectCardSystem,
  explicitUnit,
  interpretMeasurement,
  parseFeetInches,
  parseNumeric,
};
