"use strict";

/*
 * What an agency may assert about applicants.
 *
 * The ten researched routes record what third parties publish. That is
 * description. A Spec Builder is different in kind: it makes Pholio the tool an
 * agency uses to author a filter, and Pholio is answerable for what that tool
 * can express. A1 invariant 5 forbids inferring protected traits; shipping a
 * control that lets an agency require them is the same harm one step earlier.
 *
 * The line drawn here is between two kinds of rule:
 *
 *   presentation — a statement about the photograph. "Hair pulled back", "no
 *                  makeup", "plain background", "no filters". The applicant can
 *                  comply by taking a different picture.
 *   eligibility  — a statement about the person. Height, age, measurements,
 *                  work authorization, where they live, whether they are
 *                  already represented. The applicant cannot retake these.
 *
 * Eligibility is therefore allowlisted, not denylisted: a field is unavailable
 * until someone decides it belongs. Personal-characteristic fields are refused
 * in both groups.
 */

/**
 * Fields no agency-authored rule may constrain, in any rule group.
 *
 * These describe the applicant's body rather than their photograph, and each is
 * either a protected trait or a close proxy for one. They exist in the taxonomy
 * because third parties publish them and the registry records sources
 * faithfully — that is not a reason to hand agencies a control for them.
 */
const REFUSED_FIELDS = Object.freeze({
  "applicant.nationality":
    "Nationality is a protected characteristic. Use work authorization if you need to state a right-to-work requirement.",
  "appearance.hair_color": "Hair colour is a personal characteristic, not a property of the photograph.",
  "appearance.natural_hair_color": "Natural hair colour is a personal characteristic, not a property of the photograph.",
  "appearance.eye_color": "Eye colour is a personal characteristic, not a property of the photograph.",
  "appearance.natural_eye_color": "Eye colour is a personal characteristic, not a property of the photograph.",
});

/** Taxonomy categories an agency may constrain, per rule group. */
const CATEGORIES_BY_GROUP = Object.freeze({
  shots: Object.freeze(["shot"]),
  presentation: Object.freeze([
    "appearance",
    "expression",
    "clothing",
    "capture",
    "alteration",
  ]),
  files: Object.freeze(["file"]),
});

/**
 * Eligibility constraints, allowlisted individually.
 *
 * Every entry is a fact the applicant declares on their own profile, is
 * standard published practice in the industry, and is checkable without
 * inspecting an image.
 */
const ELIGIBILITY_FIELDS = Object.freeze([
  "applicant.age_years",
  "applicant.height_cm",
  "applicant.current_representation",
  "application.work_authorization",
  "application.destination_market",
  "measurements.height",
  "measurements.bust",
  "measurements.chest",
  "measurements.waist",
  "measurements.hips",
  "measurements.shoe_size",
  "measurements.clothing_size",
  "contact.city",
  "contact.country",
  "contact.state_region",
  "contact.location",
]);

/**
 * Fields that may scope a rule with `appliesWhen` but may not themselves be the
 * constraint.
 *
 * This is what lets an agency say "the women's board requires 175cm" — the real
 * shape of a published height floor — without letting it say "we require women".
 * The Society's own published spec has exactly this shape: an age range scoped
 * to a declared gender.
 */
const SCOPE_ONLY_FIELDS = Object.freeze([
  "applicant.gender",
  "applicant.track",
  "application.division_interest",
]);

const ELIGIBILITY_FIELD_SET = new Set(ELIGIBILITY_FIELDS);
const SCOPE_ONLY_FIELD_SET = new Set(SCOPE_ONLY_FIELDS);

function categoryOf(fieldId) {
  return String(fieldId || "").split(".")[0];
}

/**
 * Why a field cannot be constrained in this rule group, or null if it can.
 *
 * @param {string} group  one of shots | presentation | files | eligibility
 * @param {string} fieldId  taxonomy field id
 * @returns {string|null} a reason to show the author, or null when allowed
 */
function refusalReason(group, fieldId) {
  if (Object.hasOwn(REFUSED_FIELDS, fieldId)) return REFUSED_FIELDS[fieldId];

  if (group === "eligibility") {
    if (ELIGIBILITY_FIELD_SET.has(fieldId)) return null;
    if (SCOPE_ONLY_FIELD_SET.has(fieldId)) {
      return `${fieldId} can scope who a requirement applies to, but cannot be a requirement on its own.`;
    }
    return `${fieldId} is not available as an eligibility requirement.`;
  }

  const categories = CATEGORIES_BY_GROUP[group];
  if (!categories) return `${group} is not a rule group an agency can author.`;
  if (!categories.includes(categoryOf(fieldId))) {
    return `${fieldId} cannot be used in ${group} rules.`;
  }
  return null;
}

/** Whether `fieldId` may scope a rule via `appliesWhen`. */
function canScopeBy(fieldId) {
  if (Object.hasOwn(REFUSED_FIELDS, fieldId)) return false;
  return SCOPE_ONLY_FIELD_SET.has(fieldId) || ELIGIBILITY_FIELD_SET.has(fieldId);
}

/**
 * The authorable slice of a taxonomy, shaped for the builder UI.
 *
 * Driven by the active taxonomy rather than a hardcoded list, so a taxonomy
 * change reaches the builder without a second edit. Refused fields are returned
 * with their reason instead of being hidden — an agency that goes looking for
 * "hair colour" deserves to be told why it is absent.
 *
 * @param {{fields: Array<object>}} taxonomy
 */
function authorableTaxonomy(taxonomy) {
  const fields = Array.isArray(taxonomy?.fields) ? taxonomy.fields : [];
  const groups = {};

  for (const group of ["shots", "presentation", "files", "eligibility"]) {
    groups[group] = fields
      .filter((field) => refusalReason(group, field.id) === null)
      .map((field) => ({
        id: field.id,
        label: field.label,
        description: field.description,
        valueType: field.valueType,
        unit: field.unit,
        matchabilityDefault: field.matchabilityDefault,
        allowedValues: (field.allowedValues || []).map((value) => ({
          id: value.id,
          label: value.label,
          description: value.description,
        })),
      }));
  }

  return {
    groups,
    scopeFields: fields
      .filter((field) => canScopeBy(field.id))
      .map((field) => ({
        id: field.id,
        label: field.label,
        valueType: field.valueType,
        unit: field.unit,
        allowedValues: (field.allowedValues || []).map((value) => ({
          id: value.id,
          label: value.label,
        })),
      })),
    refused: Object.entries(REFUSED_FIELDS).map(([id, reason]) => ({ id, reason })),
  };
}

module.exports = {
  CATEGORIES_BY_GROUP,
  ELIGIBILITY_FIELDS,
  REFUSED_FIELDS,
  SCOPE_ONLY_FIELDS,
  authorableTaxonomy,
  canScopeBy,
  refusalReason,
};
