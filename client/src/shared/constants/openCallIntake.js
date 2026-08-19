/**
 * Browser mirror of `src/shared/constants/open-call-intake.js`.
 *
 * Only the vocabulary and defaults the SPA actually renders/branches on live
 * here — the validating `normalizeIntakeSpec` stays server-only. Keep the
 * values byte-identical to the server module — they cross the wire in both
 * directions, and a divergence here is a field the applicant sees that the
 * server does not expect (or vice versa), not a cosmetic bug.
 */

/** Where in the funnel a field is collected — design §2.2 / §2.3. */
export const INTAKE_STAGES = Object.freeze({
  APPLY: 'apply',
  SHORTLIST: 'shortlist',
});
export const INTAKE_STAGE_VALUES = Object.freeze(Object.values(INTAKE_STAGES));

/** Whether a spec entry blocks submission, is a nice-to-have, or is off. */
export const INTAKE_REQUIREMENTS = Object.freeze({
  REQUIRED: 'required',
  OPTIONAL: 'optional',
  HIDDEN: 'hidden',
});
export const INTAKE_REQUIREMENT_VALUES = Object.freeze(Object.values(INTAKE_REQUIREMENTS));

/** The identity ladder's entry policy for a call — design §3.2. */
export const IDENTITY_POLICIES = Object.freeze({
  ACCOUNT_REQUIRED: 'account_required',
  ACCOUNT_OPTIONAL: 'account_optional',
  ACCOUNT_NEVER: 'account_never',
});
export const IDENTITY_POLICY_VALUES = Object.freeze(Object.values(IDENTITY_POLICIES));
export const DEFAULT_IDENTITY_POLICY = IDENTITY_POLICIES.ACCOUNT_REQUIRED;

/**
 * The closed field vocabulary (design §3.1). Every key maps to exactly one
 * canonical profile or application column — `kind` is the input shape a
 * rendering surface needs, not a database type.
 */
export const INTAKE_FIELDS = Object.freeze({
  legal_name: Object.freeze({ key: 'legal_name', kind: 'text', label: 'Legal name' }),
  email: Object.freeze({ key: 'email', kind: 'email', label: 'Email' }),
  phone: Object.freeze({ key: 'phone', kind: 'phone', label: 'Phone' }),
  date_of_birth: Object.freeze({ key: 'date_of_birth', kind: 'date', label: 'Date of birth' }),
  adult_attestation: Object.freeze({
    key: 'adult_attestation',
    kind: 'attestation',
    label: 'I am 18 years of age or older',
  }),
  gender: Object.freeze({ key: 'gender', kind: 'enum', label: 'Gender' }),
  city: Object.freeze({ key: 'city', kind: 'text', label: 'City' }),
  height: Object.freeze({ key: 'height', kind: 'number', label: 'Height (cm)' }),
  core_measurements: Object.freeze({
    key: 'core_measurements',
    kind: 'text',
    label: 'Measurements',
  }),
  instagram: Object.freeze({ key: 'instagram', kind: 'text', label: 'Instagram' }),
  portfolio_url: Object.freeze({ key: 'portfolio_url', kind: 'url', label: 'Portfolio link' }),
  digital_headshot: Object.freeze({
    key: 'digital_headshot',
    kind: 'media',
    label: 'Headshot',
  }),
  digital_full_length: Object.freeze({
    key: 'digital_full_length',
    kind: 'media',
    label: 'Full length',
  }),
  digital_profile: Object.freeze({ key: 'digital_profile', kind: 'media', label: 'Profile' }),
  walk_video_url: Object.freeze({ key: 'walk_video_url', kind: 'url', label: 'Walk video' }),
  availability_window: Object.freeze({
    key: 'availability_window',
    kind: 'date_range',
    label: 'Availability',
  }),
});
export const INTAKE_FIELD_KEYS = Object.freeze(Object.keys(INTAKE_FIELDS));

/** Fields whose `kind` is `media` — the camera-roll picks (design §2.2). */
export const MEDIA_FIELD_KEYS = Object.freeze(
  INTAKE_FIELD_KEYS.filter((key) => INTAKE_FIELDS[key].kind === 'media'),
);

function specEntry(key, requirement, stage) {
  return Object.freeze({ key, requirement, stage });
}

/**
 * Platform default apply-stage spec for an event-casting call (design §2.2's
 * table, §3.1's FWBK example).
 */
export const DEFAULT_EVENT_INTAKE_SPEC = Object.freeze([
  specEntry('legal_name', INTAKE_REQUIREMENTS.REQUIRED, INTAKE_STAGES.APPLY),
  specEntry('email', INTAKE_REQUIREMENTS.REQUIRED, INTAKE_STAGES.APPLY),
  specEntry('phone', INTAKE_REQUIREMENTS.REQUIRED, INTAKE_STAGES.APPLY),
  specEntry('adult_attestation', INTAKE_REQUIREMENTS.REQUIRED, INTAKE_STAGES.APPLY),
  specEntry('gender', INTAKE_REQUIREMENTS.REQUIRED, INTAKE_STAGES.APPLY),
  specEntry('city', INTAKE_REQUIREMENTS.REQUIRED, INTAKE_STAGES.APPLY),
  specEntry('height', INTAKE_REQUIREMENTS.REQUIRED, INTAKE_STAGES.APPLY),
  specEntry('digital_headshot', INTAKE_REQUIREMENTS.REQUIRED, INTAKE_STAGES.APPLY),
  specEntry('digital_full_length', INTAKE_REQUIREMENTS.REQUIRED, INTAKE_STAGES.APPLY),
  specEntry('instagram', INTAKE_REQUIREMENTS.OPTIONAL, INTAKE_STAGES.APPLY),
  specEntry('walk_video_url', INTAKE_REQUIREMENTS.REQUIRED, INTAKE_STAGES.SHORTLIST),
  specEntry('availability_window', INTAKE_REQUIREMENTS.REQUIRED, INTAKE_STAGES.SHORTLIST),
  specEntry('core_measurements', INTAKE_REQUIREMENTS.REQUIRED, INTAKE_STAGES.SHORTLIST),
]);

/**
 * Documentary spec for a representation call — design §3.1: today's
 * send-readiness bar, expressed as a spec. Representation calls keep
 * `identity_policy: account_required` and the existing send-readiness
 * pipeline; this mirror is documentary, not yet wired into rendering.
 */
export const DEFAULT_REPRESENTATION_INTAKE_SPEC = Object.freeze([
  specEntry('legal_name', INTAKE_REQUIREMENTS.REQUIRED, INTAKE_STAGES.APPLY),
  specEntry('email', INTAKE_REQUIREMENTS.REQUIRED, INTAKE_STAGES.APPLY),
  specEntry('phone', INTAKE_REQUIREMENTS.REQUIRED, INTAKE_STAGES.APPLY),
  specEntry('date_of_birth', INTAKE_REQUIREMENTS.REQUIRED, INTAKE_STAGES.APPLY),
  specEntry('gender', INTAKE_REQUIREMENTS.REQUIRED, INTAKE_STAGES.APPLY),
  specEntry('city', INTAKE_REQUIREMENTS.REQUIRED, INTAKE_STAGES.APPLY),
  specEntry('height', INTAKE_REQUIREMENTS.REQUIRED, INTAKE_STAGES.APPLY),
  specEntry('core_measurements', INTAKE_REQUIREMENTS.REQUIRED, INTAKE_STAGES.APPLY),
  specEntry('digital_headshot', INTAKE_REQUIREMENTS.REQUIRED, INTAKE_STAGES.APPLY),
  specEntry('digital_full_length', INTAKE_REQUIREMENTS.REQUIRED, INTAKE_STAGES.APPLY),
  specEntry('instagram', INTAKE_REQUIREMENTS.OPTIONAL, INTAKE_STAGES.APPLY),
  specEntry('portfolio_url', INTAKE_REQUIREMENTS.OPTIONAL, INTAKE_STAGES.APPLY),
  specEntry('digital_profile', INTAKE_REQUIREMENTS.OPTIONAL, INTAKE_STAGES.APPLY),
]);

/**
 * Custom questions (design §3.1) are free text stored as an answer on the
 * application — never promoted to a profile. Bounds keep the apply stage
 * inside its ~4-minute budget (design §2.2).
 */
export const CUSTOM_QUESTION_LIMITS = Object.freeze({
  maxQuestions: 5,
  maxLabelLength: 160,
  maxAnswerLength: 500,
});

/** Entries a call actually asks for at a given stage — HIDDEN drops out. */
function fieldsForStage(spec, stage) {
  return (spec || []).filter(
    (entry) => entry.stage === stage && entry.requirement !== INTAKE_REQUIREMENTS.HIDDEN,
  );
}

export const applyStageFields = (spec) => fieldsForStage(spec, INTAKE_STAGES.APPLY);

export const shortlistStageFields = (spec) => fieldsForStage(spec, INTAKE_STAGES.SHORTLIST);
