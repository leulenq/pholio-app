"use strict";

/*
 * Profile vocabulary.
 *
 * A card prints whatever the agency typeset. The profile stores a *closed set* of
 * values, because most of these fields are selects. Writing "dark brown" into a
 * control whose options are Black / Brown / Blonde / Red / Gray / White / Other
 * does not show "dark brown" — it shows **nothing**, because no option matches. To
 * the talent the import silently did not work, which is worse than it plainly not
 * finding the field.
 *
 * So every value import proposes for one of these fields is snapped to the
 * profile's own vocabulary, and anything that cannot be snapped is reported as not
 * found *with what the card actually said*, rather than forced into "Other" — which
 * would throw away the information and pre-fill something meaningless.
 *
 * ---------------------------------------------------------------------------
 * These lists mirror the controls in
 * `client/src/domains/talent/pages/ProfilePage/MeasurementsSection.jsx`.
 * They are duplicated rather than shared because the client list is inline JSX
 * with no server-visible export; if the options there change, change them here.
 * `__tests__/comp-card-import.test.js` pins the pairing.
 * ---------------------------------------------------------------------------
 */

/** Hair colour select options, exactly as the profile offers them. */
const HAIR_COLORS = Object.freeze(["Black", "Brown", "Blonde", "Red", "Gray", "White", "Other"]);

/** Eye colour select options, exactly as the profile offers them. */
const EYE_COLORS = Object.freeze([
  "Brown",
  "Blue",
  "Green",
  "Hazel",
  "Gray",
  "Amber",
  "Other",
]);

/** Dress size select options. */
const DRESS_SIZES = Object.freeze([
  "0", "2", "4", "6", "8", "10", "12", "14", "16", "XS", "S", "M", "L", "XL",
]);

/** Shoe region toggle values. The parser works in lowercase; the profile does not. */
const SHOE_REGIONS = Object.freeze({ us: "US", eu: "EU", uk: "UK" });

/**
 * What a card might print, mapped to the option the profile actually has.
 *
 * Shades collapse to their parent colour because the profile has no shade axis —
 * "light brown" is a brown. Values with no honest home (bald, heterochromia) are
 * deliberately absent, so they fall through to "not found" rather than "Other".
 */
const HAIR_SYNONYMS = Object.freeze({
  black: "Black",
  brown: "Brown",
  "dark brown": "Brown",
  "light brown": "Brown",
  chestnut: "Brown",
  brunette: "Brown",
  blonde: "Blonde",
  blond: "Blonde",
  "dark blonde": "Blonde",
  "light blonde": "Blonde",
  platinum: "Blonde",
  "strawberry blonde": "Blonde",
  red: "Red",
  ginger: "Red",
  auburn: "Red",
  grey: "Gray",
  gray: "Gray",
  silver: "Gray",
  white: "White",
});

const EYE_SYNONYMS = Object.freeze({
  brown: "Brown",
  "dark brown": "Brown",
  "light brown": "Brown",
  blue: "Blue",
  "light blue": "Blue",
  "dark blue": "Blue",
  green: "Green",
  hazel: "Hazel",
  grey: "Gray",
  gray: "Gray",
  amber: "Amber",
});

/**
 * Initialisms in agency names that must keep their capitals.
 *
 * There is no structural test that works here. "IMG", "DNA" and "WME" all contain
 * vowels, so a no-vowel rule misses them; "NEXT" and "FORD" are four letters, so a
 * length rule catches them wrongly. Agency names are proper nouns with
 * idiosyncratic styling, so this is an explicit list, deliberately short, plus a
 * no-vowel rule that picks up contractions like MGMT.
 *
 * Getting one wrong is a cosmetic miss on a field the talent reviews and can edit,
 * not a bad value — but extend the list rather than inventing a cleverer rule.
 */
const AGENCY_INITIALISMS = Object.freeze(
  new Set(["img", "dna", "wme", "caa", "uta", "msa", "one", "aka", "mp", "vny", "d1", "ny", "la", "uk", "us"]),
);

function isAcronym(token) {
  const letters = token.replace(/[^\p{L}\p{N}]/gu, "");
  if (!letters) return false;
  if (AGENCY_INITIALISMS.has(letters.toLowerCase())) return true;
  // MGMT, LTD — a short token with no vowel at all is not a word.
  return letters.length >= 2 && letters.length <= 5 && !/[aeiouy]/i.test(letters);
}

function caseToken(token) {
  const cased = token
    .toLowerCase()
    .replace(/(^|[\s'’\-])(\p{L})/gu, (_, boundary, letter) => boundary + letter.toUpperCase());
  // "MCKENNA" is McKenna, not Mckenna. Only Mc, and only where real letters
  // follow it, so a short token like "MCA" is left alone.
  return cased.replace(/^Mc(\p{L})(?=\p{L})/u, (__, next) => `Mc${next.toUpperCase()}`);
}

/**
 * Title-case text a card printed in caps.
 *
 * Mixed case is left alone — that casing was somebody's choice ("McKenna",
 * "van der Berg"), and second-guessing it does more harm than good.
 */
function titleCaseWith(text, { preserveAcronyms }) {
  if (!text) return text;
  const trimmed = String(text).trim();
  if (trimmed !== trimmed.toUpperCase()) return trimmed;
  return trimmed
    .split(/\s+/)
    .map((token) => (preserveAcronyms && isAcronym(token) ? token : caseToken(token)))
    .join(" ");
}

/**
 * For organisation names, which are full of acronyms.
 * "SILENT MODELS" → "Silent Models"; "IMG" stays "IMG".
 */
function titleCase(text) {
  return titleCaseWith(text, { preserveAcronyms: true });
}

/**
 * For people's names, where the acronym rule would do damage: "NG" is the
 * surname Ng, not an initialism, and no vowels is a normal thing for a name.
 */
function titlePersonName(text) {
  return titleCaseWith(text, { preserveAcronyms: false });
}

/** Snap a parsed hair colour to the profile's options. Null when it has no home. */
function canonicalHairColor(raw) {
  if (!raw) return null;
  return HAIR_SYNONYMS[String(raw).toLowerCase().trim()] || null;
}

/** Snap a parsed eye colour to the profile's options. Null when it has no home. */
function canonicalEyeColor(raw) {
  if (!raw) return null;
  return EYE_SYNONYMS[String(raw).toLowerCase().trim()] || null;
}

/**
 * A dress size the profile can actually store.
 *
 * No conversion is attempted. A card printing "36" is almost certainly an EU size,
 * but EU 36 lands between US 4 and US 6 depending on the house, and guessing writes
 * a wrong size that looks right. Unmatched sizes come back null and are reported
 * with what the card said.
 */
function canonicalDressSize(raw) {
  if (raw == null) return null;
  const text = String(raw).trim().toUpperCase();
  return DRESS_SIZES.find((size) => size.toUpperCase() === text) || null;
}

/** `us` → `US`. The parser's lowercase unit is not the profile's toggle value. */
function canonicalShoeRegion(unit) {
  if (!unit) return null;
  return SHOE_REGIONS[String(unit).toLowerCase()] || null;
}

module.exports = {
  DRESS_SIZES,
  EYE_COLORS,
  EYE_SYNONYMS,
  HAIR_COLORS,
  HAIR_SYNONYMS,
  SHOE_REGIONS,
  canonicalDressSize,
  canonicalEyeColor,
  canonicalHairColor,
  canonicalShoeRegion,
  isAcronym,
  titleCase,
  titlePersonName,
};
