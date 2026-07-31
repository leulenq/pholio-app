"use strict";

/**
 * Canonical `profiles.gender` vocabulary.
 *
 * ONE place that decides how a gender string is spelled in the database, so the
 * onboarding writer, the profile validator, and the agency discover filters can
 * never drift apart again.
 *
 * Background: onboarding wrote the tile value verbatim (`"Non-Binary"`, capital
 * B) while the profile update schema only accepted `"Non-binary"`. Every talent
 * who picked that tile then got a 400 on their first dashboard save, because the
 * profile form echoes the stored gender back on every write. Most agency
 * comparisons are `LOWER(...)`-based and tolerated the drift, but
 * `agency/routes/inbox.js` and `agency/services/match-scoring.js` compare
 * exactly — so a mis-cased row silently dropped out of those filters.
 *
 * Canonicalization is case- and separator-insensitive on input and always emits
 * one of CANONICAL_GENDERS. Unrecognised values are returned trimmed but
 * otherwise untouched: this module normalizes spelling, it does not police
 * identity, and the zod enum remains the gate for what may be stored.
 */

const CANONICAL_GENDERS = [
  "Male",
  "Female",
  "Non-binary",
  "Other",
  "Prefer not to say",
];

/**
 * Lookup key: lowercased, every run of non-alphanumerics collapsed away, so
 * "Non-Binary", "non binary", "non_binary" and "nonbinary" all agree.
 * @param {string} value
 * @returns {string}
 */
function lookupKey(value) {
  return String(value).toLowerCase().replace(/[^a-z0-9]+/g, "");
}

const CANONICAL_BY_KEY = new Map();
for (const label of CANONICAL_GENDERS) {
  CANONICAL_BY_KEY.set(lookupKey(label), label);
}

// Accepted aliases beyond the canonical spellings themselves.
const ALIASES = {
  m: "Male",
  man: "Male",
  men: "Male",
  f: "Female",
  woman: "Female",
  women: "Female",
  nb: "Non-binary",
  enby: "Non-binary",
  genderqueer: "Non-binary",
  undisclosed: "Prefer not to say",
  preferNotToSay: "Prefer not to say",
  unspecified: "Prefer not to say",
  declined: "Prefer not to say",
};
for (const [alias, label] of Object.entries(ALIASES)) {
  CANONICAL_BY_KEY.set(lookupKey(alias), label);
}

/**
 * Canonicalize a gender string to its stored spelling.
 *
 * Empty/nullish input passes through unchanged (`""` and `null` are meaningful
 * "not answered" states that the callers' own schemas handle). An unrecognised
 * non-empty value is returned trimmed so the caller's enum can reject it with
 * the user's actual input in the error.
 *
 * @param {*} value
 * @returns {*} canonical label, or the original value when not recognised
 */
function canonicalizeGender(value) {
  if (value === null || value === undefined) return value;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  if (trimmed === "") return trimmed;
  return CANONICAL_BY_KEY.get(lookupKey(trimmed)) || trimmed;
}

module.exports = {
  CANONICAL_GENDERS,
  canonicalizeGender,
};
