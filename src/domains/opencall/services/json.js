"use strict";

/**
 * One reader for the JSON-ish columns this domain stores.
 *
 * `answers`, `custom_answers` and `payload` are `jsonb` on PostgreSQL (already
 * parsed by the driver) and `text` on SQLite (a string that still needs
 * parsing), so every read site needs the same three-branch tolerance. It lived
 * in three places on this branch — `services/submissions.js`, `services/claim.js`
 * and `routes/claim.js` — with the two claim copies subtly more permissive than
 * the submit one. One helper, one explicit option for that difference.
 *
 * It lives in its own module rather than in `services/submissions.js` because
 * the import direction already runs submissions → claim (for
 * `MEDIA_FIELD_SHOT_TYPES`, `publicUrlForStorageKey` and `splitLegalName`), so a
 * claim → submissions import for this helper would close a require cycle.
 *
 * ARRAYS ARE THE OPTION, and the default is to refuse them. `submissions.js`
 * reads `answers` as a keyed bag and `routes/materials.js` depends on that
 * refusal by name — its `parseKeys` exists precisely because `requested_keys`
 * IS an array and must not be flattened by this function. The claim paths read
 * the same columns only to look a key up on the result, where an array is
 * harmless, and they accepted one before this consolidation; `allowArrays`
 * preserves that byte for byte rather than quietly tightening it.
 *
 * ONE DELIBERATE NORMALIZATION: the submit copy refused arrays only on the text
 * (SQLite) branch and passed them through on the already-parsed (PostgreSQL)
 * one, so the same column answered differently per dialect. The rule now applies
 * to both branches. No call site reaches it — `answers`, `custom_answers` and
 * `payload` are objects at every one of them — and a dialect-dependent refusal
 * is not a behaviour worth carrying into a shared helper.
 *
 * @param {unknown} value
 * @param {{allowArrays?: boolean}} [options]
 * @returns {object|Array} the parsed value, or `{}` for anything unusable.
 */
function parseJsonColumn(value, { allowArrays = false } = {}) {
  if (!value) return {};
  if (typeof value === "object") {
    return !allowArrays && Array.isArray(value) ? {} : value;
  }
  try {
    const parsed = JSON.parse(value);
    if (!parsed || typeof parsed !== "object") return {};
    return !allowArrays && Array.isArray(parsed) ? {} : parsed;
  } catch {
    return {};
  }
}

module.exports = { parseJsonColumn };
