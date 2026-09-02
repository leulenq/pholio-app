"use strict";

/**
 * Contract harness for the audience-DTO layer (audit findings P0-2 / P0-3).
 *
 * Pure unit tests — no DB, no network. They call the pure DTO functions on
 * fully-populated fixtures and assert that forbidden properties never leak to
 * public / agency-discovery audiences, while the owner legitimately keeps the
 * owner-only fields.
 *
 * `FORBIDDEN_KEYS` is exported so Wave 4 integration tests can reuse the exact
 * same denial set against real HTTP responses.
 */

const {
  PUBLIC_CARD_FIELDS,
  PUBLIC_IMAGE_FIELDS,
  AGENCY_DISCOVERY_FIELDS,
  CONFIRMED_JOB_FIELDS,
  OWNER_FIELDS,
  PROFILE_AI_COLUMNS,
  buildPublicCardDTO,
  buildAgencyDiscoveryDTO,
  buildAgencySubmissionDTO,
  buildOwnerDTO,
  buildConfirmedJobDTO,
} = require("../../src/shared/lib/audience-dto");

// ---------------------------------------------------------------------------
// Forbidden-key set (exported for Wave 4 reuse)
// ---------------------------------------------------------------------------

// Explicit PII / internal / inferred columns that must NEVER reach a public or
// agency-discovery audience. Grounded in the verified `profiles` schema.
const EXPLICIT_FORBIDDEN = [
  // Owner / account identity.
  "email",
  "owner_email",
  "user_email",
  "firebase_uid",
  "stripe_customer_id",
  // Direct PII.
  "date_of_birth",
  "dob",
  "age", // stored age column — age is only ever DERIVED.
  "age_range",
  "phone",
  "place_of_birth",
  "drivers_license",
  // Guardian / minor compliance.
  "guardian_name",
  "guardian_email",
  "guardian_consent_at",
  // Emergency contact (confirmed-job only).
  "emergency_contact_name",
  "emergency_contact_phone",
  "emergency_contact_relationship",
  // Reference contact.
  "reference_name",
  "reference_email",
  "reference_phone",
  // Work authorization.
  "work_eligibility",
  "work_status",
  "work_permit_on_file",
  "passport_ready",
  // IP / geolocation intel.
  "ip_address",
  "ip_city",
  "ip_country",
  "ip_region",
  "ip_timezone",
  "verified_location_intel",
  // Google OAuth scrape.
  "google_addresses",
  "google_birthday",
  "google_gender",
  "google_organization",
  "google_phone",
  // Source / partner agency state.
  "source_agency_id",
  "partner_agency_id",
  // AI predictions.
  "predicted_bust",
  "predicted_eye_color",
  "predicted_hair_color",
  "predicted_height_cm",
  "predicted_hips",
  "predicted_skin_tone",
  "predicted_waist",
  "predicted_weight_lbs",
  // Embeddings / search internals.
  "photo_embedding",
  "vector_summary_text",
  "search_document",
  "visual_intel",
  "librarian_synthesis",
  "phyllo_user_id",
  "photo_key_primary",
  // Onboarding / workflow internals.
  "onboarding_predictions",
  "onboarding_state_json",
  "onboarding_stage",
  "onboarding_completed_at",
  "profile_status",
  "profile_completeness",
  "services_locked",
  // Metrics.
  "social_reach",
];

const FORBIDDEN_KEYS = new Set([...PROFILE_AI_COLUMNS, ...EXPLICIT_FORBIDDEN]);

// ---------------------------------------------------------------------------
// Fixtures: every sensitive/internal column set to a recognizable sentinel.
// ---------------------------------------------------------------------------

function makeFullProfile(overrides = {}) {
  return {
    // Identity / display (legitimately public).
    id: "profile-123",
    user_id: "user-123",
    slug: "jane-doe",
    first_name: "Jane",
    last_name: "Doe",
    pronouns: "she/her",
    gender: "female",
    nationality: "US",
    city: "New York",
    city_secondary: "Los Angeles",
    // Bio.
    bio_curated: "Curated bio.",
    bio_raw: "Raw private bio.",
    // Stats.
    height_cm: 178,
    bust_cm: 84,
    waist_cm: 60,
    hips_cm: 88,
    inseam_cm: 84,
    shoe_size: "9",
    dress_size: "4",
    weight_kg: 58,
    weight_lbs: 128,
    weight_unit: "kg",
    measurements_updated_at: "2026-01-01T00:00:00.000Z",
    hair_color: "brown",
    hair_length: "long",
    hair_type: "straight",
    eye_color: "green",
    skin_tone: "fair",
    ethnicity: "SENTINEL_ethnicity",
    tattoos: "none",
    piercings: "ears",
    body_type: "slim",
    // Professional.
    experience_level: "professional",
    experience_details: "10 campaigns",
    specialties: "editorial",
    specializations: "runway",
    languages: "English,French",
    training: "Acting 101",
    achievements: "Vogue cover",
    availability_travel: true,
    availability_schedule: "weekdays",
    comfort_levels: "swimwear",
    seeking_representation: true,
    union_membership: "SAG",
    playing_age_min: 18,
    playing_age_max: 25,
    current_agency: "Elite",
    previous_representations: "IMG",
    agency_affiliation: "mother-agency",
    video_reel_url: "https://example.com/reel",
    visibility_mode: "public",
    // Visibility toggles.
    is_public: true,
    is_discoverable: true,

    // ----- Sentinels that must never leak to public/agency-discovery -----
    date_of_birth: "1998-05-15",
    age: 27,
    age_range: "25-30",
    phone: "SENTINEL_phone",
    place_of_birth: "SENTINEL_pob",
    drivers_license: "SENTINEL_dl",
    guardian_name: "SENTINEL_guardian_name",
    guardian_email: "SENTINEL_guardian@example.com",
    guardian_consent_at: "2026-01-01T00:00:00.000Z",
    emergency_contact_name: "SENTINEL_ec_name",
    emergency_contact_phone: "SENTINEL_ec_phone",
    emergency_contact_relationship: "mother",
    reference_name: "SENTINEL_ref_name",
    reference_email: "SENTINEL_ref@example.com",
    reference_phone: "SENTINEL_ref_phone",
    work_eligibility: "SENTINEL_we",
    work_status: "SENTINEL_ws",
    work_permit_on_file: true,
    passport_ready: true,
    ip_address: "203.0.113.7",
    ip_city: "SENTINEL_ipcity",
    ip_country: "US",
    ip_region: "NY",
    ip_timezone: "America/New_York",
    verified_location_intel: "SENTINEL_intel",
    google_addresses: "SENTINEL_gaddr",
    google_birthday: "1998-05-15",
    google_gender: "female",
    google_organization: "SENTINEL_gorg",
    google_phone: "SENTINEL_gphone",
    source_agency_id: "agency-source-1",
    partner_agency_id: "agency-partner-1",
    predicted_bust: 84,
    predicted_eye_color: "green",
    predicted_hair_color: "brown",
    predicted_height_cm: 178,
    predicted_hips: 88,
    predicted_skin_tone: "fair",
    predicted_waist: 60,
    predicted_weight_lbs: 128,
    photo_embedding: "[0.1,0.2,0.3]",
    vector_summary: "SENTINEL_vec",
    vector_summary_text: "SENTINEL_vectext",
    search_document: "SENTINEL_search",
    visual_intel: "SENTINEL_visual",
    librarian_synthesis: "SENTINEL_lib",
    phyllo_user_id: "phyllo-1",
    photo_key_primary: "SENTINEL_photokey",
    onboarding_predictions: "SENTINEL_op",
    onboarding_state_json: "{}",
    onboarding_stage: "complete",
    onboarding_completed_at: "2026-01-01T00:00:00.000Z",
    profile_status: "active",
    profile_completeness: 90,
    services_locked: false,
    social_reach: 50000,
    // AI columns (PROFILE_AI_COLUMNS).
    vibe_score: 0.9,
    is_unicorn: true,
    archetype: "SENTINEL_archetype",
    analysis_status: "done",
    analysis_error: null,
    fit_score_runway: 0.8,
    fit_score_editorial: 0.7,
    fit_score_commercial: 0.6,
    fit_score_lifestyle: 0.5,
    fit_score_swim_fitness: 0.4,
    fit_score_overall: 0.7,
    fit_scores_calculated_at: "2026-01-01T00:00:00.000Z",
    market_fit_rankings: "{}",
    modeling_categories: "SENTINEL_mc",
    ...overrides,
  };
}

function makeImage(overrides = {}) {
  return {
    id: "img-1",
    public_url: "https://cdn.example.com/img-1.jpg",
    path: "/uploads/img-1.jpg",
    is_primary: true,
    sort: 0,
    shot_type: "headshot",
    image_type: "digital",
    // Sentinels that must not leak.
    storage_key: "SENTINEL_storage_key",
    absolute_path: "/var/secret/img-1.jpg",
    original_storage_key: "SENTINEL_original_key",
    moderation_status: "approved",
    moderation_reason: "SENTINEL_mod_reason",
    exclude_from_public: false,
    exclude_from_agency: false,
    ...overrides,
  };
}

const SENTINEL_VALUES = [
  "SENTINEL_phone",
  "SENTINEL_guardian@example.com",
  "SENTINEL_ec_phone",
  "SENTINEL_storage_key",
  "agency-source-1",
  "agency-partner-1",
  "[0.1,0.2,0.3]",
  "SENTINEL_search",
];

// ---------------------------------------------------------------------------
// Recursive key/value walkers
// ---------------------------------------------------------------------------

function collectKeys(node, acc = new Set()) {
  if (Array.isArray(node)) {
    node.forEach((item) => collectKeys(item, acc));
  } else if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      acc.add(key);
      collectKeys(value, acc);
    }
  }
  return acc;
}

function collectStringValues(node, acc = []) {
  if (Array.isArray(node)) {
    node.forEach((item) => collectStringValues(item, acc));
  } else if (node && typeof node === "object") {
    Object.values(node).forEach((value) => collectStringValues(value, acc));
  } else if (typeof node === "string") {
    acc.push(node);
  }
  return acc;
}

function assertNoForbiddenKeys(dto, label) {
  const keys = collectKeys(dto);
  const leaked = [...keys].filter((k) => FORBIDDEN_KEYS.has(k));
  expect({ label, leaked }).toEqual({ label, leaked: [] });
}

function assertNoSentinelValues(dto, label) {
  const values = collectStringValues(dto);
  const leaked = values.filter((v) => SENTINEL_VALUES.includes(v));
  expect({ label, leaked }).toEqual({ label, leaked: [] });
}

// Allowed top-level keys = allowlist ∪ derived-safe keys the builder adds.
const PUBLIC_ALLOWED = new Set([
  ...PUBLIC_CARD_FIELDS,
  "display_name",
  "age_band",
  "image",
]);
const DISCOVERY_ALLOWED = new Set([
  ...AGENCY_DISCOVERY_FIELDS,
  "display_name",
  "age_band",
  "is_minor",
  "social",
  "images",
  // Derived representation status (WS6.1 / LB-5) — not raw profile columns.
  "representation_status",
  "represented_by",
  // Self-declared heritage, mapped from `ethnicity` to the talent's own picker
  // labels, and their declared booking lanes as labels (audit §3.1 / §4).
  "heritage",
  "lanes",
]);
const IMAGE_ALLOWED = new Set([...PUBLIC_IMAGE_FIELDS, "url"]);
const CONFIRMED_JOB_ALLOWED = new Set([...CONFIRMED_JOB_FIELDS, "display_name"]);
const OWNER_ALLOWED = new Set([...OWNER_FIELDS, "display_name", "age", "age_band", "is_minor", "social", "images"]);
const SUBMISSION_ALLOWED = new Set([
  "id", "slug", "first_name", "last_name", "city", "gender", "archetype", "stats_track",
  "height_cm", "bust_cm", "chest_cm", "waist_cm", "hips_cm", "inseam_cm", "shoe_size",
  "dress_size", "suit_size", "hair_color", "eye_color", "measurements_updated_at", "nationality",
  "age", "age_band", "languages", "bio_curated", "bio_raw", "is_minor", "stats", "social", "images"
]);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("audience-dto forbidden-key contract", () => {
  const profile = makeFullProfile();
  const images = [makeImage(), makeImage({ id: "img-2", is_primary: false })];

  describe("buildPublicCardDTO (unauthenticated)", () => {
    const dto = buildPublicCardDTO(profile, { image: images[0] });

    test("top-level keys are a subset of the allowlist + derived-safe keys", () => {
      const extra = Object.keys(dto).filter((k) => !PUBLIC_ALLOWED.has(k));
      expect(extra).toEqual([]);
    });

    test("image keys are a subset of the public image allowlist", () => {
      const extra = Object.keys(dto.image).filter((k) => !IMAGE_ALLOWED.has(k));
      expect(extra).toEqual([]);
    });

    test("no forbidden keys appear anywhere", () => {
      assertNoForbiddenKeys(dto, "public-card");
    });

    test("no sentinel values appear anywhere", () => {
      assertNoSentinelValues(dto, "public-card");
    });

    test("exposes only a coarse age band, never an exact age", () => {
      expect(dto.age_band).toBe("18_or_older");
      expect(dto.age).toBeUndefined();
    });
  });

  describe("buildAgencyDiscoveryDTO", () => {
    const dto = buildAgencyDiscoveryDTO(profile, { images });

    test("top-level keys are a subset of the allowlist + derived-safe keys", () => {
      const extra = Object.keys(dto).filter((k) => !DISCOVERY_ALLOWED.has(k));
      expect(extra).toEqual([]);
    });

    test("no forbidden keys appear anywhere", () => {
      assertNoForbiddenKeys(dto, "agency-discovery");
    });

    test("no sentinel values appear anywhere", () => {
      assertNoSentinelValues(dto, "agency-discovery");
    });

    test("no owner email and only a coarse age band", () => {
      expect(dto.owner_email).toBeUndefined();
      expect(dto.age).toBeUndefined();
      expect(dto.age_band).toBe("18_or_older");
    });

    test("each image is a subset of the public image allowlist", () => {
      dto.images.forEach((img) => {
        const extra = Object.keys(img).filter((k) => !IMAGE_ALLOWED.has(k));
        expect(extra).toEqual([]);
      });
    });

    test("merges only the shaped social subset from opts.social", () => {
      const withSocial = buildAgencyDiscoveryDTO(profile, {
        images,
        social: [
          {
            platform: "instagram",
            handle: "@jane",
            url: "https://instagram.com/jane",
            verified: true,
            oauth_token_encrypted: "SENTINEL_token",
            follower_count: 99999,
          },
        ],
      });
      expect(withSocial.social).toEqual([
        {
          platform: "instagram",
          handle: "@jane",
          url: "https://instagram.com/jane",
          verified: true,
        },
      ]);
    });
  });

  describe("minor profile", () => {
    const minor = makeFullProfile({ date_of_birth: "2012-05-15", age: 14 });

    test("public card leaks nothing and bands as under_18", () => {
      const dto = buildPublicCardDTO(minor, { image: makeImage() });
      assertNoForbiddenKeys(dto, "minor-public");
      assertNoSentinelValues(dto, "minor-public");
      expect(dto.age_band).toBe("under_18");
      expect(dto.age).toBeUndefined();
    });

    test("discovery DTO suppresses social and leaks nothing for a minor", () => {
      const dto = buildAgencyDiscoveryDTO(minor, {
        images: [makeImage()],
        social: [{ platform: "instagram", handle: "@kid", url: "x" }],
      });
      assertNoForbiddenKeys(dto, "minor-discovery");
      assertNoSentinelValues(dto, "minor-discovery");
      expect(dto.is_minor).toBe(true);
      expect(dto.social).toEqual([]);
    });
  });

  describe("buildAgencySubmissionDTO (application exists)", () => {
    const dto = buildAgencySubmissionDTO(profile, { images });

    // The richer snapshot is owned by submission-profile.js; it is minor-safe
    // but, because an application exists, intentionally carries more than
    // discovery. We still assert the truly-never set leaks nothing.
    const NEVER = [
      "phone",
      "guardian_email",
      "emergency_contact_phone",
      "source_agency_id",
      "partner_agency_id",
      "photo_embedding",
      "fit_score_overall",
      "ip_address",
      "predicted_bust",
      "email",
      "owner_email",
    ];

    test("top-level keys are a subset of the allowlist + derived-safe keys", () => {
      const extra = Object.keys(dto).filter((k) => !SUBMISSION_ALLOWED.has(k));
      expect(extra).toEqual([]);
    });

    test("omits the truly-never-shared columns", () => {
      const keys = collectKeys(dto);
      const leaked = NEVER.filter((k) => keys.has(k));
      expect(leaked).toEqual([]);
    });

    test("does not leak phone / guardian / source-agency sentinels", () => {
      const values = collectStringValues(dto);
      expect(values).not.toContain("SENTINEL_phone");
      expect(values).not.toContain("SENTINEL_guardian@example.com");
      expect(values).not.toContain("agency-source-1");
    });

    // Wave 2D (audit P1-4 / P1-5): social_accounts is a real join now, not a
    // dead profile column. The submission snapshot must carry adult social
    // links through — but only the shaped subset, never raw OAuth tokens,
    // follower/engagement metrics, or a fabricated `verified`.
    test("carries adult social links from social_accounts, allowlisted only", () => {
      const withSocial = buildAgencySubmissionDTO(profile, {
        images,
        social: [
          {
            platform: "instagram",
            handle: "jane",
            url: "https://instagram.com/jane",
            verified: true,
            oauth_token_encrypted: "SENTINEL_token",
            follower_count: 123456,
            engagement_rate: 9.9,
          },
        ],
      });
      expect(withSocial.social).toEqual([
        {
          platform: "instagram",
          handle: "jane",
          url: "https://instagram.com/jane",
          verified: true,
        },
      ]);
      const values = collectStringValues(withSocial);
      expect(values).not.toContain("SENTINEL_token");
    });

    test("never surfaces social for a minor, even if social rows are passed", () => {
      const minorProfile = makeFullProfile({
        date_of_birth: "2012-05-15",
        age: 14,
      });
      const withSocial = buildAgencySubmissionDTO(minorProfile, {
        images,
        social: [
          { platform: "instagram", handle: "kid", url: "x", verified: true },
        ],
      });
      expect(withSocial.social).toEqual([]);
    });
  });

  describe("buildConfirmedJobDTO (purpose-limited safety context)", () => {
    const dto = buildConfirmedJobDTO(profile);

    test("top-level keys are a subset of the allowlist + derived-safe keys", () => {
      const extra = Object.keys(dto).filter((k) => !CONFIRMED_JOB_ALLOWED.has(k));
      expect(extra).toEqual([]);
    });

    test("includes the emergency contact (its whole purpose)", () => {
      expect(dto.emergency_contact_phone).toBe("SENTINEL_ec_phone");
    });

    test("does not leak AI / embedding / source-agency / owner data", () => {
      const NEVER = [
        "photo_embedding",
        "vibe_score",
        "fit_score_overall",
        "archetype",
        "source_agency_id",
        "partner_agency_id",
        "email",
        "owner_email",
        "ip_address",
        "predicted_bust",
        "search_document",
      ];
      const keys = collectKeys(dto);
      expect(NEVER.filter((k) => keys.has(k))).toEqual([]);
    });
  });

  describe("buildOwnerDTO (broadest, still allowlisted)", () => {
    const dto = buildOwnerDTO(profile, { images });

    test("top-level keys are a subset of the allowlist + derived-safe keys", () => {
      const extra = Object.keys(dto).filter((k) => !OWNER_ALLOWED.has(k));
      expect(extra).toEqual([]);
    });

    test("includes owner-only identity fields", () => {
      expect(dto.date_of_birth).toBe("1998-05-15");
      expect(dto.phone).toBe("SENTINEL_phone");
      expect(dto.guardian_email).toBe("SENTINEL_guardian@example.com");
    });

    test("owner sees their own exact derived age (never the stored column)", () => {
      expect(typeof dto.age).toBe("number");
      expect(dto.age_band).toBe("18_or_older");
    });

    test("still excludes raw AI / embedding / infra / account columns", () => {
      const NEVER = [
        ...PROFILE_AI_COLUMNS,
        "photo_embedding",
        "vector_summary",
        "vector_summary_text",
        "search_document",
        "visual_intel",
        "librarian_synthesis",
        "source_agency_id",
        "partner_agency_id",
        "ip_address",
        "predicted_bust",
        "email",
        "owner_email",
        "firebase_uid",
        "stripe_customer_id",
        "age_range", // stored band column — owner age is derived, not stored.
        "profile_completeness",
      ];
      const keys = collectKeys(dto);
      const leaked = NEVER.filter((k) => keys.has(k));
      expect(leaked).toEqual([]);
    });
  });

  describe("robustness", () => {
    test("never throws on null / sparse input", () => {
      expect(() => buildPublicCardDTO(null, {})).not.toThrow();
      expect(() => buildAgencyDiscoveryDTO(undefined, {})).not.toThrow();
      expect(() => buildOwnerDTO({}, {})).not.toThrow();
      expect(() => buildConfirmedJobDTO(null)).not.toThrow();
      expect(() => buildAgencySubmissionDTO(null, {})).not.toThrow();
    });
  });
});

module.exports = { FORBIDDEN_KEYS, makeFullProfile, makeImage };
