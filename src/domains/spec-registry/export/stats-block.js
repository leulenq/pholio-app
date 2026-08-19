"use strict";

/**
 * The talent's stats, as a booker expects to read them.
 *
 * A conforming set of images is only half of what an agency asks for. Every
 * intake in the researched set — form or email — also wants the digits: height,
 * the three measurements, shoe, colouring, where the talent is based. So the
 * archive carries a plain-text block the talent can paste into whatever field
 * or message the agency actually presents, without retyping numbers they have
 * already given Pholio and without a PDF in the way.
 *
 * Two rules make this trustworthy rather than merely convenient:
 *
 *   1. Absent fields are omitted, never placeholdered. A line reading
 *      "Hips —" invites an agency to read a dash as a measurement, and invites
 *      the talent to send an incomplete card believing it complete. A field the
 *      talent has not given simply is not a line.
 *   2. The numbers come from `stats-formatter.js`, the one module in the
 *      codebase that turns a profile into display-ready measurements. The
 *      comp-card PDF, the profile screen and this block therefore cannot
 *      disagree about whether this talent's chest is a chest or a bust, or about
 *      what 178cm is in feet.
 */

const { buildCanonicalStats } = require("../../../shared/lib/stats-formatter");

/**
 * The matcher-input talent snapshot, in the `profiles`-row shape the canonical
 * formatter reads.
 *
 * The snapshot carries no `stats_track`, so the formatter seeds the track from
 * gender — which is exactly its documented fallback, and what produces "Chest"
 * for a man and "Bust" for a woman without this module deciding anything about
 * bodies itself.
 */
function profileShape(talent) {
  const source = talent || {};
  return {
    gender: source.gender ?? null,
    height_cm: source.heightCm ?? null,
    bust_cm: source.bustCm ?? null,
    chest_cm: source.chestCm ?? null,
    waist_cm: source.waistCm ?? null,
    hips_cm: source.hipsCm ?? null,
    shoe_size: source.shoeSize ?? null,
    dress_size: source.dressSize ?? null,
    suit_size: source.suitSize ?? null,
    hair_color: source.hairColor ?? null,
    eye_color: source.eyeColor ?? null,
  };
}

function cleanString(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

/**
 * An Instagram handle, from a handle or from a profile URL.
 *
 * Returns null rather than guessing when the stored value is neither — a
 * mangled handle in front of an agency is worse than no handle at all.
 */
function instagramHandle(value) {
  const raw = cleanString(value);
  if (!raw) return null;
  const fromUrl = raw.match(/instagram\.com\/([A-Za-z0-9._]+)/i);
  const handle = (fromUrl ? fromUrl[1] : raw).replace(/^@+/, "").replace(/\/+$/, "");
  return /^[A-Za-z0-9._]{1,30}$/.test(handle) ? `@${handle}` : null;
}

function fullName(talent) {
  return (
    [cleanString(talent?.firstName), cleanString(talent?.lastName)].filter(Boolean).join(" ") || null
  );
}

/** Left-align the values into a column so the block reads as a card, not prose. */
function renderRows(rows) {
  if (!rows.length) return [];
  const width = Math.max(...rows.map((row) => row.label.length)) + 2;
  return rows.map((row) => `${row.label.padEnd(width, " ")}${row.value}`);
}

/**
 * @param {object} talent The `talent` half of a `buildMatcherInput` result.
 * @returns {{
 *   name: string|null,
 *   rows: Array<{ key: string, label: string, value: string }>,
 *   lines: string[],
 *   text: string,
 *   isEmpty: boolean,
 * }}
 */
function buildStatsBlock(talent) {
  const stats = buildCanonicalStats(profileShape(talent));
  const rows = stats.fields.map((field) => ({
    key: field.key,
    label: field.label,
    value: field.value,
  }));

  const city = cleanString(talent?.city);
  if (city) rows.push({ key: "city", label: "Based in", value: city });

  const instagram = instagramHandle(talent?.social?.instagram);
  if (instagram) rows.push({ key: "instagram", label: "Instagram", value: instagram });

  const name = fullName(talent);
  const lines = [];
  if (name) lines.push(name, "");
  lines.push(...renderRows(rows));

  return {
    name,
    rows,
    lines,
    text: lines.join("\n").trim(),
    isEmpty: rows.length === 0 && !name,
  };
}

module.exports = {
  buildStatsBlock,
  instagramHandle,
};
