"use strict";

/**
 * Open-call intake vocabulary — the single place these strings are spelled.
 *
 * Per `docs/open-call-applicant-flow-design-2026-08.md` §3.1, an open-call
 * link declares an ordered "intake spec": a list of field keys drawn from a
 * **closed platform vocabulary**, each carrying a `requirement`
 * (required | optional | hidden) and a `stage` (apply | shortlist). The
 * vocabulary is closed on purpose — every key maps to exactly one canonical
 * profile or application column, so "your application becomes your profile"
 * stays a projection instead of a migration. An organizer who wants
 * something outside the vocabulary gets a custom question instead (free
 * text, stored on the application, never promoted to a profile) — see
 * `CUSTOM_QUESTION_LIMITS` below. A typo or an ad-hoc key here is a field
 * that silently never reaches a profile, not a cosmetic bug.
 */

const { isEventCastingCallKind } = require("./event-casting");

/** Where in the funnel a field is collected — design §2.2 / §2.3. */
const INTAKE_STAGES = Object.freeze({
  APPLY: "apply",
  SHORTLIST: "shortlist",
});
const INTAKE_STAGE_VALUES = Object.freeze(Object.values(INTAKE_STAGES));

/** Whether a spec entry blocks submission, is a nice-to-have, or is off. */
const INTAKE_REQUIREMENTS = Object.freeze({
  REQUIRED: "required",
  OPTIONAL: "optional",
  HIDDEN: "hidden",
});
const INTAKE_REQUIREMENT_VALUES = Object.freeze(Object.values(INTAKE_REQUIREMENTS));

/**
 * The identity ladder's entry policy for a call — design §3.2. Most calls
 * never require an account to submit (state 2, "submitted, unclaimed"); a
 * call can still choose to require one, or to never offer the claim step.
 */
const IDENTITY_POLICIES = Object.freeze({
  ACCOUNT_REQUIRED: "account_required",
  ACCOUNT_OPTIONAL: "account_optional",
  ACCOUNT_NEVER: "account_never",
});
const IDENTITY_POLICY_VALUES = Object.freeze(Object.values(IDENTITY_POLICIES));
const DEFAULT_IDENTITY_POLICY = IDENTITY_POLICIES.ACCOUNT_REQUIRED;

/**
 * The closed field vocabulary (design §3.1). Every key maps to exactly one
 * canonical profile or application column — `kind` is the input shape a
 * rendering surface needs, not a database type.
 */
const INTAKE_FIELDS = Object.freeze({
  legal_name: Object.freeze({ key: "legal_name", kind: "text", label: "Legal name" }),
  email: Object.freeze({ key: "email", kind: "email", label: "Email" }),
  phone: Object.freeze({ key: "phone", kind: "phone", label: "Phone" }),
  date_of_birth: Object.freeze({ key: "date_of_birth", kind: "date", label: "Date of birth" }),
  adult_attestation: Object.freeze({
    key: "adult_attestation",
    kind: "attestation",
    label: "I am 18 years of age or older",
  }),
  gender: Object.freeze({ key: "gender", kind: "enum", label: "Gender" }),
  city: Object.freeze({ key: "city", kind: "text", label: "City" }),
  height: Object.freeze({ key: "height", kind: "number", label: "Height (cm)" }),
  core_measurements: Object.freeze({
    key: "core_measurements",
    kind: "text",
    label: "Measurements",
  }),
  instagram: Object.freeze({ key: "instagram", kind: "text", label: "Instagram" }),
  portfolio_url: Object.freeze({ key: "portfolio_url", kind: "url", label: "Portfolio link" }),
  digital_headshot: Object.freeze({
    key: "digital_headshot",
    kind: "media",
    label: "Headshot",
  }),
  digital_full_length: Object.freeze({
    key: "digital_full_length",
    kind: "media",
    label: "Full length",
  }),
  digital_profile: Object.freeze({ key: "digital_profile", kind: "media", label: "Profile" }),
  walk_video_url: Object.freeze({ key: "walk_video_url", kind: "url", label: "Walk video" }),
  availability_window: Object.freeze({
    key: "availability_window",
    kind: "date_range",
    label: "Availability",
  }),
});
const INTAKE_FIELD_KEYS = Object.freeze(Object.keys(INTAKE_FIELDS));

/** Fields whose `kind` is `media` — the camera-roll picks (design §2.2). */
const MEDIA_FIELD_KEYS = Object.freeze(
  INTAKE_FIELD_KEYS.filter((key) => INTAKE_FIELDS[key].kind === "media"),
);

function specEntry(key, requirement, stage) {
  return Object.freeze({ key, requirement, stage });
}

/**
 * Platform default apply-stage spec for an event-casting call (design §2.2's
 * table, §3.1's FWBK example): name/email/phone/18+/gender/city/height plus
 * the two digitals at apply, Instagram optional at apply, and the heavy
 * asks — walk video, availability, measurement confirmation — deferred to
 * shortlist (design §2.3, "the heavy asks follow selection, not precede
 * it"). An organizer may move any key earlier; this is the recommendation,
 * not the mechanism.
 */
const DEFAULT_EVENT_INTAKE_SPEC = Object.freeze([
  specEntry("legal_name", INTAKE_REQUIREMENTS.REQUIRED, INTAKE_STAGES.APPLY),
  specEntry("email", INTAKE_REQUIREMENTS.REQUIRED, INTAKE_STAGES.APPLY),
  specEntry("phone", INTAKE_REQUIREMENTS.REQUIRED, INTAKE_STAGES.APPLY),
  specEntry("adult_attestation", INTAKE_REQUIREMENTS.REQUIRED, INTAKE_STAGES.APPLY),
  specEntry("gender", INTAKE_REQUIREMENTS.REQUIRED, INTAKE_STAGES.APPLY),
  specEntry("city", INTAKE_REQUIREMENTS.REQUIRED, INTAKE_STAGES.APPLY),
  specEntry("height", INTAKE_REQUIREMENTS.REQUIRED, INTAKE_STAGES.APPLY),
  specEntry("digital_headshot", INTAKE_REQUIREMENTS.REQUIRED, INTAKE_STAGES.APPLY),
  specEntry("digital_full_length", INTAKE_REQUIREMENTS.REQUIRED, INTAKE_STAGES.APPLY),
  specEntry("instagram", INTAKE_REQUIREMENTS.OPTIONAL, INTAKE_STAGES.APPLY),
  specEntry("walk_video_url", INTAKE_REQUIREMENTS.REQUIRED, INTAKE_STAGES.SHORTLIST),
  specEntry("availability_window", INTAKE_REQUIREMENTS.REQUIRED, INTAKE_STAGES.SHORTLIST),
  specEntry("core_measurements", INTAKE_REQUIREMENTS.REQUIRED, INTAKE_STAGES.SHORTLIST),
]);

/**
 * Documentary spec for a representation call — design §3.1: "Send-readiness
 * stops being a universal gate for open-call submissions and becomes the
 * *default spec* for a representation call." This spec is not yet wired
 * into the representation pipeline; `evaluate/validateSubmissionPackage`
 * keeps its own current behaviour (the existing send-readiness bar) for
 * representation calls so existing agencies see no change, and
 * representation calls keep `identity_policy: account_required`. This
 * array exists so the shape of "today's bar, as a spec" is spelled once,
 * ready for a future lane to wire in without re-deriving it.
 */
const DEFAULT_REPRESENTATION_INTAKE_SPEC = Object.freeze([
  specEntry("legal_name", INTAKE_REQUIREMENTS.REQUIRED, INTAKE_STAGES.APPLY),
  specEntry("email", INTAKE_REQUIREMENTS.REQUIRED, INTAKE_STAGES.APPLY),
  specEntry("phone", INTAKE_REQUIREMENTS.REQUIRED, INTAKE_STAGES.APPLY),
  specEntry("date_of_birth", INTAKE_REQUIREMENTS.REQUIRED, INTAKE_STAGES.APPLY),
  specEntry("gender", INTAKE_REQUIREMENTS.REQUIRED, INTAKE_STAGES.APPLY),
  specEntry("city", INTAKE_REQUIREMENTS.REQUIRED, INTAKE_STAGES.APPLY),
  specEntry("height", INTAKE_REQUIREMENTS.REQUIRED, INTAKE_STAGES.APPLY),
  specEntry("core_measurements", INTAKE_REQUIREMENTS.REQUIRED, INTAKE_STAGES.APPLY),
  specEntry("digital_headshot", INTAKE_REQUIREMENTS.REQUIRED, INTAKE_STAGES.APPLY),
  specEntry("digital_full_length", INTAKE_REQUIREMENTS.REQUIRED, INTAKE_STAGES.APPLY),
  specEntry("instagram", INTAKE_REQUIREMENTS.OPTIONAL, INTAKE_STAGES.APPLY),
  specEntry("portfolio_url", INTAKE_REQUIREMENTS.OPTIONAL, INTAKE_STAGES.APPLY),
  specEntry("digital_profile", INTAKE_REQUIREMENTS.OPTIONAL, INTAKE_STAGES.APPLY),
]);

/** Platform default spec for a call, keyed off its `call_kind`. */
function defaultIntakeSpecForCallKind(callKind) {
  return isEventCastingCallKind(callKind)
    ? DEFAULT_EVENT_INTAKE_SPEC
    : DEFAULT_REPRESENTATION_INTAKE_SPEC;
}

/**
 * Custom questions (design §3.1) are free text stored as an answer on the
 * application — shown in the organizer's inbox and CSV, never promoted to a
 * profile. Bounds keep the apply stage inside its ~4-minute budget (§2.2)
 * and keep an organizer from re-inventing the closed vocabulary in prose.
 */
const CUSTOM_QUESTION_LIMITS = Object.freeze({
  maxQuestions: 5,
  maxLabelLength: 160,
  maxAnswerLength: 500,
});

function invalidSpecError(message) {
  const error = new Error(message);
  error.code = "INVALID_INTAKE_SPEC";
  return error;
}

/**
 * Validate a raw intake spec (e.g. from a request body) against the closed
 * vocabulary and return a frozen, ordered copy, or throw a coded error.
 *
 * `rawSpec` of `null`/`undefined` is not an error — it means "use the
 * platform default for this call kind" (design §3.1: the spec is per-call
 * configuration, *defaulted* by the platform).
 *
 * Deliberately narrow: this enforces the load-bearing rules only —
 * well-formed entries, closed vocabulary, no duplicate keys, and the two
 * platform-policy invariants (email always required at apply because
 * identity depends on it; `adult_attestation` required at apply for event
 * calls because the 18+ gate is platform policy, not organizer
 * configuration — design's C6/R8). It does not second-guess an organizer's
 * stage choice for every other field; the spec is the mechanism, not a
 * rules engine.
 */
function normalizeIntakeSpec(rawSpec, callKind) {
  if (rawSpec === null || rawSpec === undefined) {
    return defaultIntakeSpecForCallKind(callKind);
  }

  if (!Array.isArray(rawSpec)) {
    throw invalidSpecError("intake_spec must be an array of entries");
  }

  const seenKeys = new Set();
  const normalized = rawSpec.map((rawEntry) => {
    if (!rawEntry || typeof rawEntry !== "object" || Array.isArray(rawEntry)) {
      throw invalidSpecError("each intake_spec entry must be an object");
    }

    const { key, requirement, stage } = rawEntry;

    if (typeof key !== "string" || !INTAKE_FIELDS[key]) {
      throw invalidSpecError(`unknown intake field key: ${String(key)}`);
    }
    if (seenKeys.has(key)) {
      throw invalidSpecError(`duplicate intake field key: ${key}`);
    }
    seenKeys.add(key);

    if (!INTAKE_REQUIREMENT_VALUES.includes(requirement)) {
      throw invalidSpecError(`invalid requirement for ${key}: ${String(requirement)}`);
    }
    if (!INTAKE_STAGE_VALUES.includes(stage)) {
      throw invalidSpecError(`invalid stage for ${key}: ${String(stage)}`);
    }

    return specEntry(key, requirement, stage);
  });

  const emailEntry = normalized.find((entry) => entry.key === "email");
  if (
    !emailEntry ||
    emailEntry.requirement !== INTAKE_REQUIREMENTS.REQUIRED ||
    emailEntry.stage !== INTAKE_STAGES.APPLY
  ) {
    throw invalidSpecError("email must be required at the apply stage — identity depends on it");
  }

  if (isEventCastingCallKind(callKind)) {
    const attestationEntry = normalized.find((entry) => entry.key === "adult_attestation");
    if (
      !attestationEntry ||
      attestationEntry.requirement !== INTAKE_REQUIREMENTS.REQUIRED ||
      attestationEntry.stage !== INTAKE_STAGES.APPLY
    ) {
      throw invalidSpecError(
        "adult_attestation must be required at the apply stage for event-casting calls",
      );
    }
  }

  return Object.freeze(normalized);
}

/** Entries a call actually asks for at a given stage — HIDDEN drops out. */
function fieldsForStage(spec, stage) {
  return (spec || []).filter(
    (entry) => entry.stage === stage && entry.requirement !== INTAKE_REQUIREMENTS.HIDDEN,
  );
}

function applyStageFields(spec) {
  return fieldsForStage(spec, INTAKE_STAGES.APPLY);
}

function shortlistStageFields(spec) {
  return fieldsForStage(spec, INTAKE_STAGES.SHORTLIST);
}

module.exports = {
  CUSTOM_QUESTION_LIMITS,
  DEFAULT_EVENT_INTAKE_SPEC,
  DEFAULT_IDENTITY_POLICY,
  DEFAULT_REPRESENTATION_INTAKE_SPEC,
  IDENTITY_POLICIES,
  IDENTITY_POLICY_VALUES,
  INTAKE_FIELD_KEYS,
  INTAKE_FIELDS,
  INTAKE_REQUIREMENTS,
  INTAKE_REQUIREMENT_VALUES,
  INTAKE_STAGES,
  INTAKE_STAGE_VALUES,
  MEDIA_FIELD_KEYS,
  applyStageFields,
  defaultIntakeSpecForCallKind,
  normalizeIntakeSpec,
  shortlistStageFields,
};
