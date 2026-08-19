"use strict";

/*
 * Turn the text of a comp card into candidate profile fields.
 *
 * Everything here operates on strings and their positions on the page. Nothing in
 * this module sees a pixel, and nothing in it reasons about the person on the card
 * — only about the words the card prints. See
 * `docs/comp-card-import-architecture.md`.
 *
 * The output is deliberately not "the profile". It is a set of *candidates*, each
 * carrying where it came from and how sure the parse is, for the talent to confirm
 * or correct. A field this module cannot read confidently is reported as not found
 * rather than filled with a guess.
 */

const {
  detectCardSystem,
  interpretMeasurement,
} = require("./units");
const { titlePersonName } = require("./vocabulary");

/**
 * Printed labels, mapped to profile fields.
 *
 * English-language cards, plus the handful of non-English labels that appear
 * unambiguously. Deliberately excluded: French/German `TAILLE`, which means waist
 * in a stat block and height elsewhere. A label that can mean two measurements
 * cannot be resolved from the label alone, and guessing writes a wrong number into
 * a real column.
 */
const LABELS = Object.freeze([
  { field: "height", kind: "height", patterns: ["height", "hgt", "ht", "stature", "grosse", "größe"] },
  // Bust and chest are separate columns in the profile, and cards use the two
  // words for different measurements — women's cards print BUST, men's CHEST.
  // Folding them together would write a men's chest into a bust field.
  { field: "bust", kind: "circumference", patterns: ["bust", "büste", "buste"] },
  { field: "chest", kind: "circumference", patterns: ["chest", "petto"] },
  { field: "waist", kind: "circumference", patterns: ["waist", "vita"] },
  { field: "hips", kind: "circumference", patterns: ["hips", "hip", "hanches", "fianchi", "hüfte", "hufte"] },
  { field: "inseam", kind: "inseam", patterns: ["inseam", "inside leg", "leg"] },
  { field: "weight", kind: "weight", patterns: ["weight", "peso", "gewicht"] },
  { field: "shoe", kind: "shoe", patterns: ["shoe size", "shoes", "shoe", "pointure", "schuhe", "foot"] },
  { field: "dress", kind: null, patterns: ["dress size", "dress", "confection"] },
  { field: "suit", kind: null, patterns: ["suit", "jacket"] },
  { field: "collar", kind: null, patterns: ["collar", "neck"] },
  { field: "cup", kind: null, patterns: ["cup"] },
  { field: "hair", kind: null, patterns: ["hair colour", "hair color", "hair", "capelli", "haare"] },
  { field: "eyes", kind: null, patterns: ["eye colour", "eye color", "eyes", "eye", "occhi", "augen"] },
]);

/** Tokens that mark a line as an agency's own name rather than the talent's. */
const AGENCY_TOKENS = Object.freeze([
  "management",
  "mgmt",
  "models",
  "model",
  "agency",
  "agence",
  "talent",
  "artists",
  "casting",
  "productions",
]);

/** Printed panel captions, mapped to the platform's shot-type vocabulary. */
const SHOT_TYPE_CAPTIONS = Object.freeze({
  headshot: "headshot",
  "head shot": "headshot",
  portrait: "headshot",
  "close up": "close_up",
  closeup: "close_up",
  beauty: "beauty",
  "waist up": "waist_up",
  "half body": "half_body",
  "three quarter": "three_quarter",
  "3/4": "three_quarter",
  "full length": "full_length",
  "full body": "full_length",
  "full figure": "full_length",
  profile: "profile",
  "side profile": "profile",
  back: "back",
  detail: "detail",
});

const HAIR_COLOURS = Object.freeze([
  "black", "brown", "dark brown", "light brown", "chestnut", "auburn", "red", "ginger",
  "blonde", "blond", "dark blonde", "light blonde", "platinum", "strawberry blonde",
  "grey", "gray", "silver", "white", "bald", "shaved",
]);

const EYE_COLOURS = Object.freeze([
  "brown", "dark brown", "light brown", "hazel", "green", "blue", "light blue",
  "dark blue", "grey", "gray", "amber", "black", "heterochromia",
]);

function normalise(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[·•|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Every label occurrence on a line, with the span its value occupies.
 *
 * Stat blocks routinely print several pairs per line — `HEIGHT 5'11"  BUST 34"` —
 * so a value runs from the end of its own label to the start of the next one.
 */
function findLabelSpans(line) {
  const haystack = normalise(line);
  const hits = [];

  for (const entry of LABELS) {
    for (const pattern of entry.patterns) {
      // Label must sit on a word boundary, and may be followed by a separator.
      const regex = new RegExp(`(?:^|[^a-z])(${pattern})\\s*[:.\\-–—]?\\s*`, "g");
      let match;
      while ((match = regex.exec(haystack)) !== null) {
        const start = match.index + match[0].indexOf(match[1]);
        hits.push({
          field: entry.field,
          kind: entry.kind,
          label: match[1],
          start,
          valueStart: match.index + match[0].length,
        });
      }
      // Longest pattern wins per field; stop at the first pattern that matched.
      if (hits.some((hit) => hit.field === entry.field)) break;
    }
  }

  hits.sort((a, b) => a.start - b.start);

  return hits.map((hit, index) => {
    const next = hits[index + 1];
    return {
      ...hit,
      value: haystack.slice(hit.valueStart, next ? next.start : haystack.length).trim(),
    };
  });
}

function matchColour(value, palette) {
  const text = normalise(value);
  if (!text) return null;
  // Longest match first, so "dark brown" beats "brown".
  const sorted = [...palette].sort((a, b) => b.length - a.length);
  return sorted.find((colour) => text.includes(colour)) || null;
}

/**
 * Does this line look like a person's name?
 *
 * A name is one to four words of letters. Digits, quotes and stat labels rule a
 * line out — those belong to the measurement block, not the masthead.
 */
function looksLikeName(text) {
  const trimmed = String(text || "").trim();
  if (!trimmed || trimmed.length < 3 || trimmed.length > 48) return false;
  if (/\d/.test(trimmed)) return false;
  if (findLabelSpans(trimmed).length > 0) return false;
  if (AGENCY_TOKENS.some((token) => normalise(trimmed).includes(token))) return false;
  const words = trimmed.split(/\s+/);
  if (words.length < 1 || words.length > 4) return false;
  return words.every((word) => /^[\p{L}][\p{L}'’.\-]*$/u.test(word));
}

/**
 * Cards set names in caps for the layout, not because that is the person's name.
 * Recase an all-caps candidate; anything already mixed-case is left alone.
 */
function titleCaseName(text) {
  return titlePersonName(text);
}

/**
 * The talent's name.
 *
 * On every comp card layout in use, the name is the largest text on the card —
 * that is what the format is for. So the candidate is the largest-font line that
 * reads as a name, and the font height it was found at is reported so the caller
 * can tell a confident pick from a marginal one.
 */
function findName(lines) {
  const candidates = lines
    .filter((line) => looksLikeName(line.text))
    .sort((a, b) => b.fontHeight - a.fontHeight);

  if (!candidates.length) return null;

  const best = candidates[0];
  const maxFont = Math.max(...lines.map((line) => line.fontHeight || 0), 0);
  // Confident when the name really is the masthead rather than just another line
  // that happens to parse as words.
  const isDominant = maxFont > 0 && best.fontHeight >= maxFont * 0.9;
  const text = titleCaseName(best.text.trim());
  const words = text.split(/\s+/);

  // A single long token is usually a tracked name that arrived as one text run,
  // where the word gap is unrecoverable (see `collapseLetterSpacing`). It is
  // offered, because it is what the card says, but never as a confident read —
  // "Maraokonkwo" pre-filled as a fact is worse than one flagged for checking.
  const isUnsplitTracking = words.length === 1 && text.length >= 10;

  return {
    text,
    firstName: words[0] || null,
    lastName: words.length > 1 ? words.slice(1).join(" ") : null,
    fontHeight: best.fontHeight,
    confidence: isDominant && !isUnsplitTracking ? "high" : "low",
  };
}

/**
 * The agency named on the card.
 *
 * Two independent signals. A line matching a vetted agency already in the registry
 * is a strong match and can be linked to that record. Otherwise a line carrying an
 * agency-shaped token ("management", "models") is offered as free text for the
 * talent to confirm — never linked to a record on a token match alone.
 */
function findAgency(lines, knownAgencies = []) {
  const known = knownAgencies
    .filter((agency) => agency && agency.name)
    .map((agency) => ({ ...agency, normalised: normalise(agency.name) }))
    .filter((agency) => agency.normalised.length >= 3);

  for (const line of lines) {
    const text = normalise(line.text);
    if (!text) continue;
    const hit = known.find(
      (agency) => text === agency.normalised || text.includes(agency.normalised),
    );
    if (hit) {
      return {
        text: hit.name,
        agencyId: hit.id ?? null,
        confidence: "high",
        matchedRegistry: true,
      };
    }
  }

  for (const line of lines) {
    const text = normalise(line.text);
    if (!text || text.length > 60) continue;
    if (!AGENCY_TOKENS.some((token) => new RegExp(`(?:^|\\s)${token}(?:$|\\s)`).test(text))) {
      continue;
    }
    // Cards print the agency and its city on one line, separated by a bullet or
    // pipe ("ELITE MODEL MANAGEMENT · MILANO"). Offer the agency, not the line.
    const segment =
      line.text
        .split(/\s*[·•|/]\s*|\s+[–—]\s+/)
        .map((part) => part.trim())
        .find((part) =>
          AGENCY_TOKENS.some((token) =>
            new RegExp(`(?:^|\\s)${token}(?:$|\\s)`).test(normalise(part)),
          ),
        ) || line.text.trim();

    return {
      text: segment,
      agencyId: null,
      confidence: "low",
      matchedRegistry: false,
    };
  }

  return null;
}

/** Shot types the card *prints as captions*. Panel imagery is never inspected. */
function findShotTypes(lines) {
  const found = new Set();
  for (const line of lines) {
    const text = normalise(line.text);
    if (!text || text.length > 40) continue;
    for (const [caption, shotType] of Object.entries(SHOT_TYPE_CAPTIONS)) {
      if (new RegExp(`(?:^|\\s)${caption.replace(/[/]/g, "\\/")}(?:$|\\s)`).test(text)) {
        found.add(shotType);
      }
    }
  }
  return [...found];
}

/**
 * Parse a comp card's text into candidate fields.
 *
 * @param {Array<{ text: string, fontHeight?: number, x?: number, y?: number }>} lines
 * @param {{ knownAgencies?: Array<{ id: string, name: string }> }} [options]
 */
function parseCard(lines, { knownAgencies = [] } = {}) {
  const safeLines = (lines || [])
    .filter((line) => line && typeof line.text === "string" && line.text.trim())
    .map((line) => ({ ...line, fontHeight: Number(line.fontHeight) || 0 }));

  // --- Measurements, in two passes. ---
  // The first pass reads every labelled value on its own. The second re-reads the
  // ones that came back ambiguous, now that the card's unit system is known from
  // the values that identified themselves. A card is an inches card or a
  // centimetres card; it is never both.
  const rawFields = new Map();
  const textFields = new Map();

  for (const line of safeLines) {
    for (const span of findLabelSpans(line.text)) {
      if (!span.value) continue;
      if (span.kind) {
        if (!rawFields.has(span.field)) {
          rawFields.set(span.field, {
            kind: span.kind,
            raw: span.value,
            reading: interpretMeasurement(span.value, span.kind, null),
            sourceLine: line.text,
          });
        }
      } else if (!textFields.has(span.field)) {
        textFields.set(span.field, { raw: span.value, sourceLine: line.text });
      }
    }
  }

  const system = detectCardSystem([...rawFields.values()].map((entry) => entry.reading));

  const measurements = {};
  for (const [field, entry] of rawFields) {
    const reading =
      entry.reading.status === "ambiguous" && system
        ? interpretMeasurement(entry.raw, entry.kind, system)
        : entry.reading;
    measurements[field] = { ...reading, kind: entry.kind, sourceLine: entry.sourceLine };
  }

  // --- Text-valued fields. ---
  const appearance = {};
  const hairRaw = textFields.get("hair");
  if (hairRaw) {
    appearance.hair = {
      value: matchColour(hairRaw.raw, HAIR_COLOURS),
      raw: hairRaw.raw,
      sourceLine: hairRaw.sourceLine,
    };
  }
  const eyesRaw = textFields.get("eyes");
  if (eyesRaw) {
    appearance.eyes = {
      value: matchColour(eyesRaw.raw, EYE_COLOURS),
      raw: eyesRaw.raw,
      sourceLine: eyesRaw.sourceLine,
    };
  }
  for (const field of ["dress", "suit", "collar", "cup"]) {
    const entry = textFields.get(field);
    if (entry) {
      appearance[field] = {
        value: entry.raw ? entry.raw.slice(0, 24).trim() : null,
        raw: entry.raw,
        sourceLine: entry.sourceLine,
      };
    }
  }

  return {
    name: findName(safeLines),
    agency: findAgency(safeLines, knownAgencies),
    measurements,
    appearance,
    shotTypes: findShotTypes(safeLines),
    cardSystem: system,
    lineCount: safeLines.length,
  };
}

module.exports = {
  AGENCY_TOKENS,
  EYE_COLOURS,
  HAIR_COLOURS,
  LABELS,
  SHOT_TYPE_CAPTIONS,
  findAgency,
  findLabelSpans,
  findName,
  findShotTypes,
  looksLikeName,
  titleCaseName,
  parseCard,
};
