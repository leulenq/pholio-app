"use strict";

const {
  isMinorProfile,
  hasGuardianConsent,
  hasRecordedDateOfBirth,
} = require("../../../shared/lib/talent-age");

// Body-revealing framing / registers. Kept in sync with the SENSITIVE_* sets in
// media.js. Used to decide whether a classification result is "sensitive".
const SENSITIVE_SHOT_TYPES = new Set([
  "full_length",
  "full_body",
  "three_quarter",
  "half_body",
]);
const SENSITIVE_STYLE_TYPES = new Set(["swimwear", "fitness"]);
const SENSITIVE_BODY_VISIBILITY = new Set(["three_quarter", "full_length"]);

const THRESHOLDS = {
  shot_type: { auto: 0.88, suggest: 0.65 },
  style_type: { auto: 0.8, suggest: 0.55 },
  image_type: { auto: 0.8, suggest: 0.55 },
};

const VISION_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";

/** Stable ~5% audit sample for auto-applied tags (deterministic per image id). */
const AUDIT_SAMPLE_PERCENT = 5;

function stableAuditSample(imageId) {
  if (!imageId) return false;
  let h = 0;
  const s = String(imageId);
  for (let i = 0; i < s.length; i += 1) {
    h = (Math.imul(31, h) + s.charCodeAt(i)) >>> 0;
  }
  return h % 100 < AUDIT_SAMPLE_PERCENT;
}

function parseMetadata(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function bandForField(confidence, field) {
  const t = THRESHOLDS[field] || THRESHOLDS.shot_type;
  const c = Number(confidence) || 0;
  if (c >= t.auto) return "auto";
  if (c >= t.suggest) return "suggest";
  return "ask";
}

function worstBand(bands) {
  if (bands.includes("ask")) return "ask";
  if (bands.includes("suggest")) return "suggest";
  return "auto";
}

/** Top-2 shot candidates within 0.15 confidence → ambiguous framing (spec §5.3). */
function hasCloseShotAlternates(classification) {
  const primary = Number(classification?.confidence?.shot_type) || 0;
  const alts = Array.isArray(classification?.shot_type_alternates)
    ? classification.shot_type_alternates
    : [];
  if (!alts.length) return false;
  const ranked = [primary, ...alts.map((a) => Number(a?.confidence) || 0)].sort(
    (a, b) => b - a,
  );
  return ranked.length >= 2 && ranked[0] - ranked[1] < 0.15;
}

function shouldDowngradeBand(classification) {
  const uncertainty = Array.isArray(classification?.uncertainty_factors)
    ? classification.uncertainty_factors
    : [];
  if (uncertainty.length >= 2) return true;
  return hasCloseShotAlternates(classification);
}

function buildFieldProvenance(value, confidence) {
  return {
    value: value ?? null,
    confidence: Number(confidence) || 0,
  };
}

function lc(value) {
  return value ? String(value).toLowerCase() : "";
}

/**
 * Is the resolved image (classification result + persisted columns) a sensitive
 * body frame by any signal — framing tag, style register, or the PITS
 * body_visibility signal? The AUTHORITATIVE read: classification wins over the
 * client-declared columns, never the other way around.
 */
function isSensitiveClassification(classification, imageRow) {
  const c = classification || {};
  const row = imageRow || {};
  const shot = lc(c.shot_type) || lc(row.shot_type);
  if (shot && SENSITIVE_SHOT_TYPES.has(shot)) return true;
  const style = lc(c.style_type) || lc(row.style_type);
  if (style && SENSITIVE_STYLE_TYPES.has(style)) return true;
  const bv = lc(c.signals && c.signals.body_visibility);
  if (bv && SENSITIVE_BODY_VISIBILITY.has(bv)) return true;
  return false;
}

/**
 * Audit P0-8 — the async classification pass must RE-EVALUATE minor-image policy
 * and force full exclusion, so a sensitive/minor image is never left exposed
 * (before OR after classification). Authoritative over client metadata.
 *
 * Force fully private (exclude_from_public + exclude_from_agency) when:
 *   - the profile is a minor WITHOUT guardian authorization (every image), or
 *   - the age cannot be verified (no DOB on file) AND the classification
 *     reveals a sensitive body frame (fail closed).
 *
 * Adults with a recorded DOB are never force-excluded here — they keep control
 * of their own visibility (adult happy path preserved).
 */
function shouldForceExclusion({ profile, classification, imageRow }) {
  if (isMinorProfile(profile) && !hasGuardianConsent(profile)) {
    return { forced: true, reason: "minor_without_guardian_consent" };
  }
  if (
    !hasRecordedDateOfBirth(profile) &&
    isSensitiveClassification(classification, imageRow)
  ) {
    return { forced: true, reason: "unverified_age_sensitive_image" };
  }
  return { forced: false, reason: null };
}

/**
 * @param {object} input
 * @param {object} input.imageRow
 * @param {object} input.classification
 * @param {object} [input.profile] - age/consent fields (date_of_birth,
 *   guardian_consent_at) used to force exclusion for minors / unverified age.
 * @returns {{ band: string, columnUpdates: object, metadataPatch: object }}
 */
function applyClassificationPolicy({ imageRow, classification, profile = null }) {
  const metadata = parseMetadata(imageRow?.metadata);
  const existingAi = metadata.ai?.classification || {};
  const userLocked = existingAi.source === "user";

  const confidence = classification.confidence || {};
  const uncertainty = Array.isArray(classification.uncertainty_factors)
    ? classification.uncertainty_factors
    : [];
  const downgrade = shouldDowngradeBand(classification);

  const fields = ["shot_type", "style_type", "image_type"];
  const bands = fields
    .map((field) => {
      if (!classification[field]) return null;
      let band = bandForField(confidence[field], field);
      if (downgrade) {
        band = band === "auto" ? "suggest" : "ask";
      }
      return band;
    })
    .filter(Boolean);

  const band = bands.length ? worstBand(bands) : "ask";
  const columnUpdates = {};
  let auditSampled = false;
  const provenance = {
    model: classification.model || VISION_MODEL,
    classified_at: new Date().toISOString(),
    source: band === "auto" ? "auto" : "suggested",
    confirmed: false,
    band,
    shot_type: buildFieldProvenance(
      classification.shot_type,
      confidence.shot_type,
    ),
    style_type: buildFieldProvenance(
      classification.style_type,
      confidence.style_type,
    ),
    image_type: buildFieldProvenance(
      classification.image_type,
      confidence.image_type,
    ),
    signals: classification.signals || {},
    reasoning: classification.reasoning || "",
    heuristic_reasons: classification.heuristic_reasons || [],
    uncertainty_factors: uncertainty,
    shot_type_alternates: classification.shot_type_alternates || [],
  };

  if (!userLocked) {
    for (const field of fields) {
      const value = classification[field];
      if (!value) continue;
      let fieldBand = bandForField(confidence[field], field);
      if (downgrade) {
        fieldBand = fieldBand === "auto" ? "suggest" : "ask";
      }
      const columnEmpty =
        imageRow[field] == null || String(imageRow[field]).trim() === "";
      if (fieldBand === "auto" && columnEmpty) {
        if (stableAuditSample(imageRow?.id)) {
          auditSampled = true;
          fieldBand = "suggest";
        } else {
          columnUpdates[field] = value;
          provenance.source = "auto";
          provenance.confirmed = field !== "shot_type";
        }
      }
    }
  }

  if (auditSampled) {
    provenance.source = "suggested";
    provenance.band = "suggest";
    provenance.audit_sample = true;
  }

  if (userLocked) {
    provenance.source = "user";
  }

  // Audit P0-8: minor-image safety lock. Re-evaluate policy and force full
  // exclusion authoritatively — this is written in the SAME column update as
  // the classification tags (see run-image-classification.js), so a
  // sensitive/minor image is never left exposed between tag and exclusion.
  // The safety lock overrides even a user-locked classification.
  const exclusion = shouldForceExclusion({ profile, classification, imageRow });
  if (exclusion.forced) {
    columnUpdates.exclude_from_public = true;
    columnUpdates.exclude_from_agency = true;
    provenance.safety_lock = {
      forced: true,
      reason: exclusion.reason,
      applied_at: new Date().toISOString(),
    };
  }

  return {
    band: auditSampled ? "suggest" : band,
    columnUpdates,
    metadataPatch: {
      ai: {
        ...(metadata.ai || {}),
        classification: provenance,
      },
    },
  };
}

/**
 * Log a correction when user overrides AI prediction.
 */
async function logClassificationFeedback(knex, {
  imageId,
  profileId,
  beforeMeta,
  afterRow,
  model,
}) {
  const before = beforeMeta?.ai?.classification;
  if (!before || before.source === "user") return;

  const predicted = {
    shot: before.shot_type?.value ?? null,
    style: before.style_type?.value ?? null,
    image: before.image_type?.value ?? null,
  };
  const corrected = {
    shot: afterRow.shot_type ?? null,
    style: afterRow.style_type ?? null,
    image: afterRow.image_type ?? null,
  };

  const changed =
    predicted.shot !== corrected.shot ||
    predicted.style !== corrected.style ||
    predicted.image !== corrected.image;

  if (!changed) return;

  const hasTable = await knex.schema.hasTable("image_classification_feedback");
  if (!hasTable) return;

  const { v4: uuidv4 } = require("uuid");
  const isPg =
    knex.client.config.client === "pg" ||
    knex.client.config.client === "postgresql";

  const row = {
    id: uuidv4(),
    image_id: imageId,
    profile_id: profileId,
    predicted_shot_type: predicted.shot,
    predicted_style_type: predicted.style,
    predicted_image_type: predicted.image,
    corrected_shot_type: corrected.shot,
    corrected_style_type: corrected.style,
    corrected_image_type: corrected.image,
    model: model || before.model || VISION_MODEL,
    created_at: knex.fn.now(),
  };

  if (isPg) {
    row.confidence_json = JSON.stringify(before);
  } else {
    row.confidence_json = JSON.stringify(before);
  }

  await knex("image_classification_feedback").insert(row);
}

module.exports = {
  applyClassificationPolicy,
  logClassificationFeedback,
  bandForField,
  stableAuditSample,
  hasCloseShotAlternates,
  shouldDowngradeBand,
  isSensitiveClassification,
  shouldForceExclusion,
  THRESHOLDS,
  VISION_MODEL,
  AUDIT_SAMPLE_PERCENT,
};
