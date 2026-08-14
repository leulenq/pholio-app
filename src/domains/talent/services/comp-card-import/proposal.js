"use strict";

/*
 * The proposal.
 *
 * The rule this module exists to enforce: **extraction is a proposal, never a
 * silent write.** Reading a card produces a list of candidate fields, each with
 * what was found, where on the card it came from, and how confident the parse is.
 * Nothing reaches `profiles` until the talent confirms it field by field.
 *
 * Three outcomes per field, and the middle one is the point:
 *
 *   found      a value was read and is offered, pre-checked, with its evidence
 *   ambiguous  something was read but cannot be resolved (usually a unit the card
 *              did not state). Offered as a choice, never pre-checked, never
 *              silently resolved to whichever reading is more common
 *   not_found  the card does not carry this field. Said plainly, so the talent
 *              knows to type it rather than assuming import handled it
 *
 * On measurement provenance: an imported number is **declared on import, never
 * measured**. The card could be three years old — the plan is explicit about this
 * — so applying it records `measurements_source = 'comp_card_import'`. Without
 * that, `measurements_updated_at` would tell an agency these numbers were taken
 * today, which is how an import launders a stale measurement into a profile that
 * reads as current.
 *
 * Note what is absent: no `captured_at`, no image rows, no digitals. An uploaded
 * card cannot date a photograph, so this path never feeds
 * `services/digitals-freshness.js` anything at all.
 */

const MEASUREMENT_SOURCE_IMPORT = "comp_card_import";

/**
 * Every field import can propose, in the order the review screen shows them.
 *
 * `column` is the profile column the value lands in. `from` names the parser
 * output it is built from. A field with no column is informational only — it is
 * shown to the talent and never written.
 */
const FIELD_SPECS = Object.freeze([
  { key: "first_name", label: "First name", column: "first_name", type: "text", group: "identity" },
  { key: "last_name", label: "Last name", column: "last_name", type: "text", group: "identity" },
  { key: "current_agency", label: "Agency on the card", column: "current_agency", type: "text", group: "identity" },

  { key: "height_cm", label: "Height", column: "height_cm", type: "length", measurement: "height", group: "measurements" },
  { key: "bust_cm", label: "Bust", column: "bust_cm", type: "length", measurement: "bust", group: "measurements" },
  { key: "chest_cm", label: "Chest", column: "chest_cm", type: "length", measurement: "chest", group: "measurements" },
  { key: "waist_cm", label: "Waist", column: "waist_cm", type: "length", measurement: "waist", group: "measurements" },
  { key: "hips_cm", label: "Hips", column: "hips_cm", type: "length", measurement: "hips", group: "measurements" },
  { key: "inseam_cm", label: "Inseam", column: "inseam_cm", type: "length", measurement: "inseam", group: "measurements" },
  { key: "weight_kg", label: "Weight", column: "weight_kg", type: "weight", measurement: "weight", group: "measurements" },
  { key: "shoe_size", label: "Shoe size", column: "shoe_size", type: "shoe", measurement: "shoe", group: "measurements" },

  { key: "hair_color", label: "Hair colour", column: "hair_color", type: "text", group: "appearance" },
  { key: "eye_color", label: "Eye colour", column: "eye_color", type: "text", group: "appearance" },
  { key: "dress_size", label: "Dress size", column: "dress_size", type: "text", group: "appearance" },
  { key: "suit_size", label: "Suit size", column: "suit_size", type: "text", group: "appearance" },
]);

const FIELD_SPEC_BY_KEY = new Map(FIELD_SPECS.map((spec) => [spec.key, spec]));
/** Columns import is allowed to write. Anything else is rejected at apply time. */
const WRITABLE_COLUMNS = new Set(
  FIELD_SPECS.filter((spec) => spec.column).map((spec) => spec.column),
);

function notFound(spec) {
  return {
    key: spec.key,
    label: spec.label,
    group: spec.group,
    status: "not_found",
    value: null,
    display: null,
    evidence: null,
    confidence: null,
  };
}

function lengthDisplay(reading) {
  if (reading.unit === "in") {
    return `${reading.value}″ (${reading.cm} cm)`;
  }
  return `${reading.cm} cm`;
}

/** Build the field entry for a measurement the parser read. */
function measurementField(spec, reading, extra = {}) {
  if (!reading || reading.status === "unreadable" || reading.status === "implausible") {
    return {
      ...notFound(spec),
      // Say why, when there was something there and it did not survive.
      note:
        reading?.status === "implausible"
          ? `"${reading.raw}" is not a plausible ${spec.label.toLowerCase()}, so it was not used.`
          : undefined,
    };
  }

  if (reading.status === "ambiguous") {
    return {
      key: spec.key,
      label: spec.label,
      group: spec.group,
      status: "ambiguous",
      value: null,
      display: null,
      evidence: reading.sourceLine || reading.raw,
      confidence: null,
      note: `The card prints "${reading.raw}" without a unit, and it is a plausible ${spec.label.toLowerCase()} either way. Pick one.`,
      options: (reading.candidates || []).map((candidate) => ({
        label:
          candidate.cm != null
            ? `${candidate.value} ${candidate.unit}${candidate.unit === "in" ? ` (${candidate.cm} cm)` : ""}`
            : `${candidate.value} ${candidate.unit.toUpperCase()}`,
        value: candidate.cm != null ? candidate.cm : candidate.value,
        unit: candidate.unit,
      })),
      ...extra,
    };
  }

  const value =
    spec.type === "length"
      ? reading.cm
      : spec.type === "weight"
        ? reading.unit === "lb"
          ? Math.round(reading.value * 0.4535924 * 10) / 10
          : reading.value
        : reading.value;

  if (value == null) return notFound(spec);

  return {
    key: spec.key,
    label: spec.label,
    group: spec.group,
    status: "found",
    value,
    display:
      spec.type === "length"
        ? lengthDisplay(reading)
        : spec.type === "weight"
          ? `${value} kg`
          : `${reading.value} (${String(reading.unit).toUpperCase()})`,
    evidence: reading.sourceLine || reading.raw,
    // A value the card stated a unit for is stronger than one resolved from the
    // card's overall system, which is stronger than one inferred from range.
    confidence: reading.resolvedBy === "explicit" ? "high" : "medium",
    ...extra,
  };
}

function textField(spec, value, evidence, confidence = "high") {
  if (value == null || value === "") return notFound(spec);
  return {
    key: spec.key,
    label: spec.label,
    group: spec.group,
    status: "found",
    value,
    display: String(value),
    evidence: evidence || null,
    confidence,
  };
}

/**
 * Turn parser output into the reviewable proposal.
 *
 * @param {object} parsed  output of `parse-card.js`
 * @param {object} source  how the text was obtained, for the audit record
 */
function buildProposal(parsed, source = {}) {
  const fields = [];
  const card = parsed || {};
  const measurements = card.measurements || {};
  const appearance = card.appearance || {};

  for (const spec of FIELD_SPECS) {
    if (spec.measurement) {
      const reading = measurements[spec.measurement];
      fields.push(
        reading
          ? measurementField(spec, reading, {
              extras:
                spec.key === "shoe_size" && reading.unit
                  ? { shoe_region: reading.unit }
                  : undefined,
            })
          : notFound(spec),
      );
      continue;
    }

    switch (spec.key) {
      case "first_name":
        fields.push(
          card.name?.firstName
            ? textField(spec, card.name.firstName, card.name.text, card.name.confidence)
            : notFound(spec),
        );
        break;
      case "last_name":
        fields.push(
          card.name?.lastName
            ? textField(spec, card.name.lastName, card.name.text, card.name.confidence)
            : notFound(spec),
        );
        break;
      case "current_agency":
        fields.push(
          card.agency?.text
            ? {
                ...textField(spec, card.agency.text, card.agency.text, card.agency.confidence),
                note: card.agency.matchedRegistry
                  ? "Matches an agency already on Pholio."
                  : "Read from the card. Check the spelling before you confirm.",
              }
            : notFound(spec),
        );
        break;
      case "hair_color":
        fields.push(
          appearance.hair?.value
            ? textField(spec, appearance.hair.value, appearance.hair.sourceLine)
            : notFound(spec),
        );
        break;
      case "eye_color":
        fields.push(
          appearance.eyes?.value
            ? textField(spec, appearance.eyes.value, appearance.eyes.sourceLine)
            : notFound(spec),
        );
        break;
      case "dress_size":
        fields.push(
          appearance.dress?.value
            ? textField(spec, appearance.dress.value, appearance.dress.sourceLine)
            : notFound(spec),
        );
        break;
      case "suit_size":
        fields.push(
          appearance.suit?.value
            ? textField(spec, appearance.suit.value, appearance.suit.sourceLine)
            : notFound(spec),
        );
        break;
      default:
        fields.push(notFound(spec));
    }
  }

  const found = fields.filter((field) => field.status === "found");
  const ambiguous = fields.filter((field) => field.status === "ambiguous");

  return {
    source: {
      method: source.method || "none",
      filename: source.filename || null,
      mimeType: source.mimeType || null,
      pageCount: source.pageCount ?? null,
      lineCount: card.lineCount ?? 0,
      reason: source.reason || null,
    },
    fields,
    // Panel captions are informational: import does not create image records, so
    // there is nothing to attach a shot type to. Shown as "your card shows these
    // shots" guidance rather than written anywhere.
    shotTypes: card.shotTypes || [],
    cardSystem: card.cardSystem || null,
    summary: {
      found: found.length,
      ambiguous: ambiguous.length,
      notFound: fields.length - found.length - ambiguous.length,
      total: fields.length,
    },
  };
}

/**
 * Validate what the talent confirmed, and turn it into a profile update.
 *
 * Only keys in `FIELD_SPECS` are honoured, only values the proposal actually
 * offered for that key are accepted, and an ambiguous field is only applied if the
 * talent picked one of the options presented. A client that posts an arbitrary
 * column name or a value the card never contained gets it dropped here.
 *
 * @param {object} proposal    the stored proposal
 * @param {object} acceptances `{ [fieldKey]: value }` — only keys present are applied
 * @returns {{ update: object, applied: string[], rejected: string[] }}
 */
function buildProfileUpdate(proposal, acceptances = {}) {
  const update = {};
  const applied = [];
  const rejected = [];
  const byKey = new Map((proposal?.fields || []).map((field) => [field.key, field]));
  let touchedMeasurement = false;

  for (const [key, rawValue] of Object.entries(acceptances || {})) {
    const spec = FIELD_SPEC_BY_KEY.get(key);
    const field = byKey.get(key);
    if (!spec || !field || !spec.column || !WRITABLE_COLUMNS.has(spec.column)) {
      rejected.push(key);
      continue;
    }
    if (rawValue === null || rawValue === undefined || rawValue === "") {
      rejected.push(key);
      continue;
    }

    let value = rawValue;

    if (field.status === "ambiguous") {
      // Must be one of the readings actually offered. This is what stops an
      // ambiguous unit from being resolved by anything other than the talent.
      const option = (field.options || []).find(
        (candidate) => String(candidate.value) === String(rawValue),
      );
      if (!option) {
        rejected.push(key);
        continue;
      }
      value = option.value;
      if (spec.key === "shoe_size" && option.unit) update.shoe_region = option.unit;
    } else if (field.status === "found") {
      // The talent may correct a value, but a numeric field must stay numeric.
      if (spec.type !== "text") {
        const numeric = Number(rawValue);
        if (!Number.isFinite(numeric) || numeric <= 0) {
          rejected.push(key);
          continue;
        }
        value = numeric;
      } else {
        value = String(rawValue).slice(0, 120).trim();
        if (!value) {
          rejected.push(key);
          continue;
        }
      }
      if (field.extras?.shoe_region) update.shoe_region = field.extras.shoe_region;
    } else {
      // not_found — the card did not carry it, so import has nothing to apply.
      rejected.push(key);
      continue;
    }

    update[spec.column] = value;
    applied.push(key);
    if (spec.group === "measurements") touchedMeasurement = true;
  }

  if (touchedMeasurement) {
    // Declared on import, not measured. See the module header.
    update.measurements_source = MEASUREMENT_SOURCE_IMPORT;
    update.measurements_updated_at = new Date().toISOString();
  }

  return { update, applied, rejected };
}

module.exports = {
  FIELD_SPECS,
  FIELD_SPEC_BY_KEY,
  MEASUREMENT_SOURCE_IMPORT,
  WRITABLE_COLUMNS,
  buildProfileUpdate,
  buildProposal,
};
