const { z } = require("zod");

/**
 * Core field schemas
 */

const emailSchema = z
  .string({ required_error: "Email is required" })
  .trim()
  .email("Enter a valid email")
  .max(255, "Email too long")
  .transform((value) => value.toLowerCase());

const passwordSchema = z
  .string({ required_error: "Password is required" })
  .min(8, "Password must be at least 8 characters")
  .max(128, "Password must be 128 characters or less");

const nameSchema = z
  .string({ required_error: "Required" })
  .trim()
  .min(1, "Required")
  .max(60, "Too long");

const roleSchema = z.enum(["TALENT", "AGENCY"]);

/**
 * Auth schemas
 */

const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string({ required_error: "Password is required" })
    .min(1, "Password is required"),
});

const signupSchema = z.object({
  first_name: nameSchema,
  last_name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  role: roleSchema,
});

const agencySignupSchema = z.object({
  agency_name: z
    .string({ required_error: "Agency name is required" })
    .trim()
    .min(1, "Agency name is required")
    .max(100, "Agency name is too long"),
  company_website: z
    .string()
    .trim()
    .max(255, "Website URL is too long")
    .optional()
    .transform((val) => {
      if (!val || val.trim() === "") return undefined;
      return val.trim();
    })
    .refine(
      (val) => {
        if (!val) return true;
        // Basic URL validation - must start with http:// or https://
        return /^https?:\/\/.+/i.test(val);
      },
      {
        message: "Enter a valid URL starting with http:// or https://",
      },
    ),
  contact_name: nameSchema,
  contact_role: z.enum(["Booker", "Director", "Scout", "Other"], {
    required_error: "Please select your role",
  }),
  email: emailSchema,
  password: passwordSchema,
});

/**
 * Profile + Apply
 */

const heightSchema = z
  .preprocess(
    (val) => {
      if (typeof val === "string") {
        const trimmed = val.trim();
        // Try to parse feet and inches format (e.g., "5' 11"", "5'11"", "5ft 11in")
        const feetInchesMatch = trimmed.match(/(\d+)\s*['ft]+\s*(\d+)?/i);
        if (feetInchesMatch) {
          const feet = parseInt(feetInchesMatch[1], 10);
          const inches = parseInt(feetInchesMatch[2] || "0", 10);
          const cm = Math.round(feet * 30.48 + inches * 2.54);
          return cm;
        }
        // Try to parse "180 cm" format
        const cmMatch = trimmed.match(/(\d+)\s*cm/i);
        if (cmMatch) {
          return parseInt(cmMatch[1], 10);
        }
        // Try to parse just a number
        const numMatch = trimmed.match(/(\d+)/);
        if (numMatch) {
          return parseInt(numMatch[1], 10);
        }
      }
      return val;
    },
    z.union([z.string(), z.number(), z.null()]).optional(),
  )
  .transform((val) => {
    if (typeof val === "number") return val;
    return parseInt(val, 10);
  });

const bioSchema = z
  .string()
  .trim()
  .max(2000, "Bio must be less than 2000 characters") // Frontend limit
  .optional()
  .or(z.literal(""));

const phoneSchema = z
  .string()
  .trim()
  .max(20, "Phone number too long")
  .optional()
  .or(z.literal(""))
  .or(z.null());

const bustSchema = z
  .preprocess(
    (val) => (typeof val === "string" ? val.trim() : val),
    z.union([
      z
        .string()
        .min(1)
        .transform((val) => parseFloat(val)), // Changed to parseFloat for decimal support
      z.number(),
      z.null(),
    ]),
  )
  .optional();

const waistSchema = z
  .preprocess(
    (val) => (typeof val === "string" ? val.trim() : val),
    z.union([
      z
        .string()
        .min(1)
        .transform((val) => parseFloat(val)), // Changed to parseFloat for decimal support
      z.number(),
      z.null(),
    ]),
  )
  .optional();

const hipsSchema = z
  .preprocess(
    (val) => (typeof val === "string" ? val.trim() : val),
    z.union([
      z
        .string()
        .min(1)
        .transform((val) => parseFloat(val)), // Changed to parseFloat for decimal support
      z.number(),
      z.null(),
    ]),
  )
  .optional();

// New comprehensive profile field schemas
const genderSchema = z
  .union([
    z.enum(["Male", "Female", "Non-binary", "Other", "Prefer not to say"]),
    z.literal(""),
    z.null(),
  ])
  .optional();

const dateOfBirthSchema = z
  .union([
    z
      .string()
      .trim()
      .refine(
        (val) => {
          if (!val || val.trim() === "") return true; // Optional field
          const date = new Date(val);
          if (isNaN(date.getTime())) return false;

          // Check if date is not in the future
          const today = new Date();
          today.setHours(23, 59, 59, 999); // End of today
          return date <= today;
        },
        {
          message: "Date of birth cannot be in the future",
        },
      ),
    z.null(),
    z.literal(""),
  ])
  .optional();

const weightSchema = z
  .preprocess(
    (val) => {
      if (typeof val === "string") {
        const trimmed = val.trim();
        if (!trimmed) return null;
        const num = parseFloat(trimmed);
        return isNaN(num) ? null : num;
      }
      return val;
    },
    z.union([
      z.number().refine((val) => !val || (val >= 30 && val <= 200), {
        message: "Weight must be between 30 and 200 kg",
      }),
      z.null(),
    ]),
  )
  .optional();

const weightLbsSchema = z
  .preprocess(
    (val) => {
      if (typeof val === "string") {
        const trimmed = val.trim();
        if (!trimmed) return null;
        const num = parseFloat(trimmed);
        return isNaN(num) ? null : num;
      }
      return val;
    },
    z.union([
      z.number().refine((val) => !val || (val >= 66 && val <= 440), {
        message: "Weight must be between 66 and 440 lbs",
      }),
      z.null(),
    ]),
  )
  .optional();

const dressSizeSchema = z
  .string()
  .trim()
  .max(10)
  .optional()
  .or(z.literal(""))
  .or(z.null());

const hairLengthSchema = z.string().nullable().optional().or(z.literal(""));

const skinToneSchema = z
  .string()
  .trim()
  .max(50)
  .optional()
  .or(z.literal(""))
  .or(z.null());

const languagesSchema = z
  .union([
    z.array(z.string().trim().max(100)).max(100),
    z
      .string()
      .transform((val) => {
        if (!val || val.trim() === "") return [];
        try {
          const parsed = JSON.parse(val);
          return Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          return val
            .split(",")
            .map((l) => l.trim())
            .filter((l) => l);
        }
      })
      .pipe(z.array(z.string().trim().max(100)).max(100)),
    z.null(),
  ])
  .optional();

const specialtiesSchema = z
  .union([
    z.array(z.string().trim().max(100)).max(100),
    z
      .string()
      .transform((val) => {
        if (!val || val.trim() === "") return [];
        try {
          const parsed = JSON.parse(val);
          return Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          return val
            .split(",")
            .map((l) => l.trim())
            .filter((l) => l);
        }
      })
      .pipe(z.array(z.string().trim().max(100)).max(100)),
    z.null(),
  ])
  .optional();

const availabilityTravelSchema = z
  .union([
    z.boolean(),
    z
      .string()
      .transform((val) => val === "true" || val === "on" || val === "1"),
    z.null(),
  ])
  .optional();

const availabilityScheduleSchema = z
  .string()
  .nullable()
  .optional()
  .or(z.literal(""));

// Relaxed check - allow any string for experience level as frontend uses various terms
const experienceLevelSchema = z
  .string()
  .nullable()
  .optional()
  .or(z.literal(""));

const trainingSchema = z
  .string()
  .trim()
  .max(1000)
  .optional()
  .or(z.literal(""))
  .or(z.null());

/** Slightly higher ceiling for talent dashboard saves (maps to same `training` column as `training`) */
const talentProfileTrainingFieldSchema = z
  .string()
  .trim()
  .max(2000)
  .optional()
  .or(z.literal(""))
  .or(z.null());

/** City / location — aligned with nationality length, prevents oversized payloads */
const cityFieldSchema = z
  .string()
  .trim()
  .max(120)
  .optional()
  .or(z.literal(""))
  .or(z.null());

const citySecondaryFieldSchema = z
  .string()
  .trim()
  .max(120)
  .optional()
  .or(z.literal(""))
  .or(z.null());

/** Optional HTTP(S) URL; empty string and null clear the field */
const optionalHttpUrlSchema = z.preprocess(
  (v) => {
    if (v === undefined) return undefined;
    if (v === null || v === "") return null;
    if (typeof v === "string") {
      const t = v.trim();
      return t === "" ? null : t;
    }
    return v;
  },
  z
    .union([
      z.null(),
      z
        .string()
        .url("Must be a valid URL")
        .max(500)
        .refine(
          (v) => /^https?:\/\//i.test(v),
          "URL must start with http:// or https://",
        ),
    ])
    .optional(),
);

const experienceDetailsUpdateSchema = z
  .union([
    z
      .string()
      .max(25000)
      .transform((val) => {
        if (!val || val.trim() === "") return null;
        try {
          return JSON.parse(val);
        } catch {
          return null;
        }
      }),
    z
      .array(
        z.union([
          z.string().max(2000),
          z
            .record(
              z.string(),
              z.union([z.string(), z.number(), z.boolean(), z.null()]),
            )
            .refine((o) => Object.keys(o).length <= 40, "Too many keys"),
        ]),
      )
      .max(200),
    z
      .record(
        z.string(),
        z.union([z.string(), z.number(), z.boolean(), z.null()]),
      )
      .refine((o) => Object.keys(o).length <= 60, "Too many keys"),
    z.null(),
  ])
  .optional();

const previousRepresentationsUpdateSchema = z
  .union([
    z
      .string()
      .max(25000)
      .transform((val) => {
        if (!val || val.trim() === "") return null;
        try {
          return JSON.parse(val);
        } catch {
          return null;
        }
      }),
    z
      .array(
        z.union([
          z.string().max(2000),
          z.object({
            has_manager: z.boolean().optional(),
            has_agency: z.boolean().optional(),
            manager_name: z.string().max(200).optional(),
            manager_contact: z.string().max(200).optional(),
            agency_name: z.string().max(200).optional(),
            agent_name: z.string().max(200).optional(),
            agency_contact: z.string().max(200).optional(),
            reason_leaving: z.string().max(2000).optional(),
          }),
        ]),
      )
      .max(100),
    z.null(),
  ])
  .optional();

const seekingRepresentationSchema = z
  .union([
    z.boolean(),
    z
      .string()
      .transform((val) => val === "true" || val === "on" || val === "1"),
    z.literal(""),
    z.null(),
  ])
  .optional();

const portfolioUrlSchema = z
  .string()
  .trim()
  .max(255)
  .refine(
    (val) => {
      if (!val || typeof val !== "string" || val.trim() === "") return true;
      return /^https?:\/\/.+/i.test(val);
    },
    {
      message: "Enter a valid URL starting with http:// or https://",
    },
  )
  .nullable()
  .optional();

const socialMediaHandleSchema = z
  .string()
  .trim()
  .max(100)
  .optional()
  .or(z.literal(""))
  .or(z.null());

const socialMediaUrlSchema = z
  .string()
  .trim()
  .max(255)
  .refine(
    (val) => {
      if (!val || typeof val !== "string" || val.trim() === "") return true;
      return /^https?:\/\/.+/i.test(val);
    },
    {
      message: "Enter a valid URL",
    },
  )
  .nullable()
  .optional();

const referenceNameSchema = z
  .string()
  .trim()
  .max(100)
  .optional()
  .or(z.literal(""))
  .or(z.null());
const referenceEmailSchema = z
  .string()
  .trim()
  .email("Enter a valid email")
  .max(255)
  .optional()
  .or(z.literal(""))
  .or(z.null());
const referencePhoneSchema = z
  .string()
  .trim()
  .max(20)
  .optional()
  .or(z.literal(""))
  .or(z.null());
const referenceRelationshipSchema = z
  .string()
  .trim()
  .max(50)
  .optional()
  .or(z.literal(""))
  .or(z.null());

const emergencyContactNameSchema = z
  .string()
  .trim()
  .max(100)
  .optional()
  .or(z.literal(""))
  .or(z.null());
const emergencyContactPhoneSchema = z
  .string()
  .trim()
  .max(20)
  .optional()
  .or(z.literal(""))
  .or(z.null());
const emergencyContactRelationshipSchema = z
  .string()
  .trim()
  .max(50)
  .optional()
  .or(z.literal(""))
  .or(z.null());

const nationalitySchema = z
  .string()
  .trim()
  .max(100)
  .optional()
  .or(z.literal(""))
  .or(z.null());

const multiSelectSchema = z
  .union([
    z.array(z.string()),
    z.string().transform((val) => {
      if (!val || val.trim() === "") return [];
      try {
        const parsed = JSON.parse(val);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return val
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s);
      }
    }),
    z.null(),
  ])
  .optional();

const unionMembershipSchema = multiSelectSchema;
const ethnicitySchema = multiSelectSchema;

const tattoosSchema = z
  .union([
    z.boolean(),
    z
      .string()
      .transform((val) => val === "true" || val === "on" || val === "1"),
    z.null(),
    z.literal(""),
  ])
  .optional();

const piercingsSchema = z
  .union([
    z.boolean(),
    z
      .string()
      .transform((val) => val === "true" || val === "on" || val === "1"),
    z.null(),
    z.literal(""),
  ])
  .optional();

const applyProfileSchema = z
  .object({
    first_name: nameSchema,
    last_name: nameSchema,
    city: nameSchema,
    city_secondary: nameSchema.optional(),
    phone: phoneSchema,
    height_cm: heightSchema,
    bust: bustSchema,
    waist: waistSchema,
    hips: hipsSchema,
    shoe_size: z.string().trim().max(10).optional(),
    eye_color: z.string().trim().max(30).optional(),
    hair_color: z.string().trim().max(30).optional(),
    bio: bioSchema,
    specialties: z.array(z.string()).optional(),
    experience_details: z
      .union([
        z.string().transform((val) => {
          if (!val || val.trim() === "") return null;
          try {
            return JSON.parse(val);
          } catch {
            return null;
          }
        }),
        z.record(z.string(), z.string()).optional(),
        z.null(),
      ])
      .optional(),
    partner_agency_email: z
      .string()
      .trim()
      .email("Enter a valid email")
      .max(255, "Email too long")
      .transform((val) => val.toLowerCase())
      .optional(),
    // New comprehensive fields
    gender: genderSchema,
    date_of_birth: dateOfBirthSchema,
    weight: z.preprocess((val) => {
      if (val === "" || val === null || val === undefined) return undefined;
      const num = typeof val === "string" ? parseFloat(val) : val;
      return isNaN(num) ? undefined : num;
    }, z.number().min(30).max(440).optional()),
    weight_unit: z.enum(["kg", "lbs"]).optional(),
    weight_kg: weightSchema,
    weight_lbs: weightLbsSchema,
    dress_size: dressSizeSchema,
    hair_length: hairLengthSchema,
    skin_tone: skinToneSchema,
    languages: languagesSchema,
    availability_travel: availabilityTravelSchema,
    availability_schedule: availabilityScheduleSchema,
    experience_level: experienceLevelSchema,
    training: trainingSchema,
    portfolio_url: portfolioUrlSchema,
    instagram_handle: socialMediaHandleSchema,
    instagram_url: socialMediaUrlSchema,
    twitter_handle: socialMediaHandleSchema,
    twitter_url: socialMediaUrlSchema,
    tiktok_handle: socialMediaHandleSchema,
    tiktok_url: socialMediaUrlSchema,
    reference_name: referenceNameSchema,
    reference_email: referenceEmailSchema,
    reference_phone: referencePhoneSchema,
    emergency_contact_name: emergencyContactNameSchema,
    emergency_contact_phone: emergencyContactPhoneSchema,
    emergency_contact_relationship: emergencyContactRelationshipSchema,
    work_eligibility: z.enum(["Yes", "No"]).optional(),
    work_status: z.string().trim().max(50).optional(),
    union_membership: unionMembershipSchema,
    ethnicity: ethnicitySchema,
    tattoos: tattoosSchema,
    piercings: piercingsSchema,
    comfort_levels: z.array(z.string()).optional(),
    previous_representations: z
      .union([
        z.string().transform((val) => {
          if (!val || val.trim() === "") return null;
          try {
            return JSON.parse(val);
          } catch {
            return null;
          }
        }),
        z
          .array(
            z.object({
              has_manager: z.boolean().optional(),
              has_agency: z.boolean().optional(),
              manager_name: z.string().optional(),
              manager_contact: z.string().optional(),
              agency_name: z.string().optional(),
              agent_name: z.string().optional(),
              agency_contact: z.string().optional(),
              reason_leaving: z.string().optional(),
            }),
          )
          .optional(),
        z.null(),
      ])
      .optional(),
  })
  .strict();

/**
 * Merge camelCase / legacy aliases into canonical snake_case keys before parsing.
 * Canonical values win when both alias and canonical are present and differ.
 */
function normalizeTalentProfileUpdateBody(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return input;
  const o = { ...input };

  const mergeScalar = (canonical, aliasKey) => {
    const aliasVal = input[aliasKey];
    delete o[aliasKey];
    if (aliasVal === undefined) return;
    const canonVal = o[canonical];
    const aliasStr = String(aliasVal).trim();
    const canonStr =
      canonVal === undefined || canonVal === null
        ? ""
        : String(canonVal).trim();
    if (canonStr !== "" && aliasStr !== canonStr) return;
    if (canonStr === "") o[canonical] = aliasVal;
  };

  mergeScalar("first_name", "firstName");
  mergeScalar("last_name", "lastName");
  mergeScalar("city", "location");

  const dobCanon = input.date_of_birth;
  const dobAlt1 = input.dateOfBirth;
  const dobAlt2 = input.dob;
  delete o.dateOfBirth;
  delete o.dob;

  const dobCanonEmpty =
    dobCanon === undefined || dobCanon === null || dobCanon === "";
  if (!dobCanonEmpty) {
    o.date_of_birth = dobCanon;
  } else if (dobAlt1 !== undefined && dobAlt1 !== null && dobAlt1 !== "") {
    o.date_of_birth = dobAlt1;
  } else if (dobAlt2 !== undefined && dobAlt2 !== null && dobAlt2 !== "") {
    o.date_of_birth = dobAlt2;
  }

  return o;
}

const talentProfileUpdateInnerSchema = z.object({
  first_name: nameSchema.optional(), // Keep required if provided, but optional in the partial update object
  last_name: nameSchema.optional(),
  email: z.string().email().optional().or(z.literal("")).or(z.null()),
  city: cityFieldSchema,
  city_secondary: citySecondaryFieldSchema,
  height_cm: heightSchema.optional(),
  bio: bioSchema.optional(),
  phone: phoneSchema.optional(),
  bust: bustSchema.optional(),
  waist: waistSchema.optional(),
  hips: hipsSchema.optional(),
  shoe_size: z.preprocess(
    (v) => {
      if (v === "" || v === null || v === undefined) return v;
      if (typeof v === "number" && Number.isFinite(v)) return String(v);
      return v;
    },
    z.string().trim().max(20).optional().or(z.literal("")).or(z.null()),
  ),
  eye_color: z
    .string()
    .trim()
    .max(50)
    .optional()
    .or(z.literal(""))
    .or(z.null()),
  hair_color: z
    .string()
    .trim()
    .max(50)
    .optional()
    .or(z.literal(""))
    .or(z.null()),
  specialties: specialtiesSchema.optional(),
  experience_details: experienceDetailsUpdateSchema,
  gender: genderSchema.optional(),
  date_of_birth: dateOfBirthSchema.optional(),
  playing_age_min: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.number().int().min(0).max(120).optional(),
  ),
  playing_age_max: z.preprocess(
    (v) => (v === "" || v === null || v === undefined ? undefined : v),
    z.number().int().min(0).max(120).optional(),
  ),
  weight: z.preprocess(
    (val) => {
      if (val === "" || val === null || val === undefined) return undefined;
      const num = typeof val === "string" ? parseFloat(val) : val;
      return isNaN(num) ? undefined : num;
    },
    z.union([z.number(), z.literal(""), z.null()]).optional(),
  ),
  weight_unit: z.enum(["kg", "lbs"]).optional().or(z.literal("")).or(z.null()),
  weight_kg: weightSchema.optional(),
  weight_lbs: weightLbsSchema.optional(),
  dress_size: dressSizeSchema.optional(),
  hair_length: hairLengthSchema.optional(),
  skin_tone: skinToneSchema.optional(),
  languages: languagesSchema.optional(),
  availability_travel: availabilityTravelSchema.optional(),
  availability_schedule: availabilityScheduleSchema.optional(),
  experience_level: experienceLevelSchema.optional(),
  training: talentProfileTrainingFieldSchema,
  portfolio_url: portfolioUrlSchema,
  instagram_handle: socialMediaHandleSchema,
  instagram_url: socialMediaUrlSchema,
  twitter_handle: socialMediaHandleSchema,
  twitter_url: socialMediaUrlSchema,
  tiktok_handle: socialMediaHandleSchema,
  tiktok_url: socialMediaUrlSchema,
  youtube_handle: socialMediaHandleSchema,
  youtube_url: socialMediaUrlSchema,
  training_summary: talentProfileTrainingFieldSchema,
  reference_name: referenceNameSchema,
  reference_email: referenceEmailSchema,
  reference_phone: referencePhoneSchema,
  emergency_contact_name: emergencyContactNameSchema,
  emergency_contact_phone: emergencyContactPhoneSchema,
  emergency_contact_relationship: emergencyContactRelationshipSchema,
  work_eligibility: z
    .union([z.enum(["Yes", "No"]), z.boolean(), z.literal(""), z.null()])
    .optional(),
  work_status: z
    .string()
    .trim()
    .max(50)
    .optional()
    .or(z.literal(""))
    .or(z.null()),
  union_membership: unionMembershipSchema,
  ethnicity: ethnicitySchema,
  tattoos: tattoosSchema,
  piercings: piercingsSchema,
  seeking_representation: seekingRepresentationSchema,
  current_agency: z
    .string()
    .trim()
    .max(255)
    .optional()
    .or(z.literal(""))
    .or(z.null()),
  comfort_levels: languagesSchema,
  previous_representations: previousRepresentationsUpdateSchema,
  primary_photo_id: z.string().uuid().optional().or(z.literal("")).or(z.null()),
  inseam_cm: z
    .number()
    .min(40)
    .max(120)
    .optional()
    .or(z.literal(""))
    .or(z.null()),
  video_reel_url: optionalHttpUrlSchema,
  place_of_birth: z
    .string()
    .trim()
    .max(100)
    .optional()
    .or(z.literal(""))
    .or(z.null()),
  timezone: z
    .string()
    .trim()
    .max(100)
    .optional()
    .or(z.literal(""))
    .or(z.null()),
  nationality: z
    .string()
    .trim()
    .max(100)
    .optional()
    .or(z.literal(""))
    .or(z.null()),
  hair_type: z
    .string()
    .trim()
    .max(50)
    .optional()
    .or(z.literal(""))
    .or(z.null()),
  pronouns: z.string().trim().max(50).optional().or(z.literal("")).or(z.null()),
  body_type: z
    .string()
    .trim()
    .max(50)
    .optional()
    .or(z.literal(""))
    .or(z.null()),
  drivers_license: z.union([z.boolean(), z.literal(""), z.null()]).optional(),
  passport_ready: z.union([z.boolean(), z.literal(""), z.null()]).optional(),
  modeling_categories: z
    .array(z.string().trim().max(80))
    .max(50)
    .optional()
    .or(z.null()),
});

const talentProfileUpdateSchema = z.preprocess(
  normalizeTalentProfileUpdateBody,
  talentProfileUpdateInnerSchema,
);

/**
 * Partner claim
 */

const partnerClaimSchema = z.object({
  slug: z.string().trim().min(1, "Profile required"),
});

/**
 * Onboarding schemas
 */

// Permissive draft schema - all fields optional for partial saves
const onboardingDraftSchema = z
  .object({
    first_name: nameSchema.optional(),
    last_name: nameSchema.optional(),
    city: nameSchema.optional(),
    city_secondary: nameSchema.optional(),
    phone: phoneSchema.optional(),
    height_cm: heightSchema.optional(),
    bust: bustSchema.optional(),
    waist: waistSchema.optional(),
    hips: hipsSchema.optional(),
    shoe_size: z.string().trim().max(10).optional(),
    eye_color: z.string().trim().max(30).optional(),
    hair_color: z.string().trim().max(30).optional(),
    bio: bioSchema.optional(),
    specialties: z.array(z.string()).optional(),
    experience_details: z
      .union([
        z.string().transform((val) => {
          if (!val || val.trim() === "") return null;
          try {
            return JSON.parse(val);
          } catch {
            return null;
          }
        }),
        z.record(z.string(), z.string()).optional(),
        z.null(),
      ])
      .optional(),
    gender: genderSchema,
    date_of_birth: dateOfBirthSchema,
    weight: z.preprocess((val) => {
      if (val === "" || val === null || val === undefined) return undefined;
      const num = typeof val === "string" ? parseFloat(val) : val;
      return isNaN(num) ? undefined : num;
    }, z.number().min(30).max(440).optional()),
    weight_unit: z.enum(["kg", "lbs"]).optional(),
    weight_kg: weightSchema,
    weight_lbs: weightLbsSchema,
    dress_size: dressSizeSchema,
    hair_length: hairLengthSchema,
    skin_tone: skinToneSchema,
    languages: languagesSchema,
    availability_travel: availabilityTravelSchema,
    availability_schedule: availabilityScheduleSchema,
    experience_level: experienceLevelSchema,
    training: trainingSchema,
    portfolio_url: portfolioUrlSchema,
    instagram_handle: socialMediaHandleSchema,
    twitter_handle: socialMediaHandleSchema,
    tiktok_handle: socialMediaHandleSchema,
    reference_name: referenceNameSchema,
    reference_email: referenceEmailSchema,
    reference_phone: referencePhoneSchema,
    emergency_contact_name: emergencyContactNameSchema,
    emergency_contact_phone: emergencyContactPhoneSchema,
    emergency_contact_relationship: emergencyContactRelationshipSchema,
    work_eligibility: z
      .union([z.enum(["Yes", "No"]), z.boolean(), z.null()])
      .optional(), // Allow boolean for draft
    work_status: z.string().trim().max(50).optional(),
    union_membership: unionMembershipSchema,
    ethnicity: ethnicitySchema,
    tattoos: tattoosSchema,
    piercings: piercingsSchema,
    comfort_levels: z.array(z.string()).optional(),
    previous_representations: z
      .union([
        z.string().transform((val) => {
          if (!val || val.trim() === "") return null;
          try {
            return JSON.parse(val);
          } catch {
            return null;
          }
        }),
        z
          .array(
            z.object({
              has_manager: z.boolean().optional(),
              has_agency: z.boolean().optional(),
              manager_name: z.string().optional(),
              manager_contact: z.string().optional(),
              agency_name: z.string().optional(),
              agent_name: z.string().optional(),
              agency_contact: z.string().optional(),
              reason_leaving: z.string().optional(),
            }),
          )
          .optional(),
        z.null(),
      ])
      .optional(),
  })
  .passthrough(); // Allow extra fields for flexibility

// Strict submit schema - required fields for profile submission
const onboardingSubmitSchema = z
  .object({
    first_name: nameSchema,
    last_name: nameSchema,
    city: nameSchema,
    phone: phoneSchema,
    height_cm: heightSchema,
    bust: bustSchema, // Required for submission
    waist: waistSchema, // Required for submission
    hips: hipsSchema, // Required for submission
    bio: bioSchema,
    // All other fields optional
    city_secondary: nameSchema.optional(),
    shoe_size: z.string().trim().max(10).optional(),
    eye_color: z.string().trim().max(30).optional(),
    hair_color: z.string().trim().max(30).optional(),
    specialties: z.array(z.string()).optional(),
    experience_details: z
      .union([
        z.string().transform((val) => {
          if (!val || val.trim() === "") return null;
          try {
            return JSON.parse(val);
          } catch {
            return null;
          }
        }),
        z.record(z.string(), z.string()).optional(),
        z.null(),
      ])
      .optional(),
    gender: genderSchema,
    pronouns: z.string().nullable().optional(),
    date_of_birth: dateOfBirthSchema,
    weight: z.preprocess((val) => {
      if (val === "" || val === null || val === undefined) return undefined;
      const num = typeof val === "string" ? parseFloat(val) : val;
      return isNaN(num) ? undefined : num;
    }, z.number().min(30).max(440).optional()),
    weight_unit: z.enum(["kg", "lbs"]).optional(),
    weight_kg: weightSchema,
    weight_lbs: weightLbsSchema,
    dress_size: dressSizeSchema,
    hair_length: hairLengthSchema,
    skin_tone: skinToneSchema,
    languages: languagesSchema,
    availability_travel: availabilityTravelSchema,
    drivers_license: z.boolean().optional(),
    passport_ready: z.boolean().optional(),
    availability_schedule: availabilityScheduleSchema,
    experience_level: experienceLevelSchema,
    training: trainingSchema,
    portfolio_url: portfolioUrlSchema,
    instagram_handle: socialMediaHandleSchema,
    twitter_handle: socialMediaHandleSchema,
    tiktok_handle: socialMediaHandleSchema,
    reference_name: referenceNameSchema,
    reference_email: referenceEmailSchema,
    reference_phone: referencePhoneSchema,
    emergency_contact_name: emergencyContactNameSchema,
    emergency_contact_phone: emergencyContactPhoneSchema,
    emergency_contact_relationship: emergencyContactRelationshipSchema,
    work_eligibility: z.enum(["Yes", "No"]).optional(),
    work_status: z.string().trim().max(50).optional(),
    union_membership: unionMembershipSchema,
    ethnicity: ethnicitySchema,
    tattoos: tattoosSchema,
    piercings: piercingsSchema,
    comfort_levels: z.array(z.string()).optional(),
    previous_representations: z
      .union([
        z.string().transform((val) => {
          if (!val || val.trim() === "") return null;
          try {
            return JSON.parse(val);
          } catch {
            return null;
          }
        }),
        z
          .array(
            z.object({
              has_manager: z.boolean().optional(),
              has_agency: z.boolean().optional(),
              manager_name: z.string().optional(),
              manager_contact: z.string().optional(),
              agency_name: z.string().optional(),
              agent_name: z.string().optional(),
              agency_contact: z.string().optional(),
              reason_leaving: z.string().optional(),
            }),
          )
          .optional(),
        z.null(),
      ])
      .optional(),
  })
  .strict();

// Essentials wizard schemas (Phase A)
// Permissive draft schema for wizard step saves
const essentialsDraftSchema = z
  .object({
    first_name: nameSchema.optional(),
    last_name: nameSchema.optional(),
    city: nameSchema.optional(),
    gender: genderSchema,
    height_cm: heightSchema.optional(),
    bust: bustSchema.optional(),
    waist: waistSchema.optional(),
    hips: hipsSchema.optional(),
    shoe_size: z.string().trim().max(10).optional(),
    date_of_birth: dateOfBirthSchema,
  })
  .passthrough(); // Allow extra fields for flexibility

// Strict essentials submit schema - minimal required fields for wizard completion
const essentialsSubmitSchema = z
  .object({
    first_name: nameSchema,
    last_name: nameSchema,
    city: nameSchema,
    gender: genderSchema, // Optional for essentials
    height_cm: heightSchema,
    bust: bustSchema, // Required for essentials
    waist: waistSchema, // Required for essentials
    hips: hipsSchema, // Required for essentials
    shoe_size: z.string().trim().max(10).optional(),
    date_of_birth: dateOfBirthSchema, // Optional for essentials
  })
  .strict();

// Onboarding identity schema (Step 1)
const onboardingIdentitySchema = z
  .object({
    first_name: nameSchema,
    last_name: nameSchema,
    city: nameSchema,
    gender: genderSchema, // Optional
  })
  .strict();

// Onboarding predictions schema (Step 3 - user confirms/edits predictions)
const onboardingPredictionsSchema = z
  .object({
    height_cm: heightSchema.optional(),
    weight_lbs: z.preprocess((val) => {
      if (val === "" || val === null || val === undefined) return undefined;
      const num = typeof val === "string" ? parseFloat(val) : val;
      return isNaN(num) ? undefined : num;
    }, z.number().min(80).max(300).optional()),
    bust: bustSchema.optional(),
    waist: waistSchema.optional(),
    hips: hipsSchema.optional(),
    hair_color: z.string().trim().max(30).optional(),
    eye_color: z.string().trim().max(30).optional(),
    skin_tone: z.string().trim().max(50).optional(),
  })
  .passthrough(); // Allow extra fields for flexibility

// Onboarding complete schema (validates essentials before completion)
const onboardingCompleteSchema = z
  .object({
    first_name: nameSchema,
    last_name: nameSchema,
    city: nameSchema,
    height_cm: heightSchema,
    bust: bustSchema,
    waist: waistSchema,
    hips: hipsSchema,
  })
  .strict();

/**
 * Talent media — structured `images` columns (Phase 1).
 * Permissive known enums; unknown string values are rejected when explicitly sent.
 */
const IMAGE_TYPE_VALUES = [
  "digital",
  "portfolio",
  "comp_card",
  "campaign",
  "test",
];

const SHOT_TYPE_VALUES = [
  "headshot",
  "three_quarter",
  "full_length",
  "profile_left",
  "profile_right",
  "back",
  "detail",
];

const STYLE_TYPE_VALUES = [
  "editorial",
  "commercial",
  "lifestyle",
  "beauty",
  "ecommerce",
  "swimwear",
  "fitness",
];

const IMAGE_STATUS_VALUES = ["active", "archived", "retired", "test"];

const IMAGE_STRUCTURED_KEYS = [
  "image_type",
  "shot_type",
  "style_type",
  "status",
  "exclude_from_public",
  "exclude_from_agency",
  "captured_at",
  "retouched_at",
  "set_id",
];

function normalizeEnumToken(raw, allowedSet, label) {
  if (raw === null || raw === undefined) return { ok: true, value: null };
  if (typeof raw !== "string") {
    return { ok: false, error: `${label} must be a string or null` };
  }
  const v = raw.trim().toLowerCase().replace(/\s+/g, "_");
  if (v === "") return { ok: true, value: null };
  if (!allowedSet.has(v)) {
    return { ok: false, error: `Invalid ${label}` };
  }
  return { ok: true, value: v };
}

function parseOptionalIsoDate(raw, label) {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: true, value: null };
  }
  if (typeof raw !== "string" && !(raw instanceof Date)) {
    return { ok: false, error: `${label} must be an ISO date string or null` };
  }
  const d =
    raw instanceof Date ? raw : new Date(typeof raw === "string" ? raw : "");
  if (Number.isNaN(d.getTime())) {
    return { ok: false, error: `Invalid ${label}` };
  }
  return { ok: true, value: d };
}

function coerceBoolean(raw, label) {
  if (raw === null || raw === undefined) return { ok: true, value: false };
  if (typeof raw === "boolean") return { ok: true, value: raw };
  if (raw === 1 || raw === 0) return { ok: true, value: !!raw };
  if (typeof raw === "string") {
    const s = raw.trim().toLowerCase();
    if (s === "true" || s === "1" || s === "yes")
      return { ok: true, value: true };
    if (s === "false" || s === "0" || s === "no")
      return { ok: true, value: false };
  }
  return { ok: false, error: `Invalid ${label}` };
}

function parseOptionalUuid(raw, label) {
  if (raw === null || raw === undefined || raw === "") {
    return { ok: true, value: null };
  }
  if (typeof raw !== "string") {
    return { ok: false, error: `${label} must be a UUID string or null` };
  }
  const uuidRe =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  const t = raw.trim();
  if (!uuidRe.test(t)) return { ok: false, error: `Invalid ${label}` };
  return { ok: true, value: t };
}

const imageTypeSet = new Set(IMAGE_TYPE_VALUES);
const shotTypeSet = new Set(SHOT_TYPE_VALUES);
const styleTypeSet = new Set(STYLE_TYPE_VALUES);
const imageStatusSet = new Set(IMAGE_STATUS_VALUES);

/**
 * Extract validated structured image fields present on `body` (top-level).
 * @returns {{ ok: boolean, values?: Record<string, unknown>, error?: string }}
 */
function parseImageStructuredFieldsFromBody(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: true, values: {} };
  }

  const values = {};
  const errors = [];

  if (Object.hasOwn(body, "image_type")) {
    const r = normalizeEnumToken(body.image_type, imageTypeSet, "image_type");
    if (!r.ok) errors.push(r.error);
    else values.image_type = r.value;
  }
  if (Object.hasOwn(body, "shot_type")) {
    const r = normalizeEnumToken(body.shot_type, shotTypeSet, "shot_type");
    if (!r.ok) errors.push(r.error);
    else values.shot_type = r.value;
  }
  if (Object.hasOwn(body, "style_type")) {
    const r = normalizeEnumToken(body.style_type, styleTypeSet, "style_type");
    if (!r.ok) errors.push(r.error);
    else values.style_type = r.value;
  }
  if (Object.hasOwn(body, "status")) {
    const r = normalizeEnumToken(body.status, imageStatusSet, "status");
    if (!r.ok) errors.push(r.error);
    else {
      values.status = r.value === null ? "active" : r.value;
    }
  }
  if (Object.hasOwn(body, "exclude_from_public")) {
    const r = coerceBoolean(body.exclude_from_public, "exclude_from_public");
    if (!r.ok) errors.push(r.error);
    else values.exclude_from_public = r.value;
  }
  if (Object.hasOwn(body, "exclude_from_agency")) {
    const r = coerceBoolean(body.exclude_from_agency, "exclude_from_agency");
    if (!r.ok) errors.push(r.error);
    else values.exclude_from_agency = r.value;
  }
  if (Object.hasOwn(body, "captured_at")) {
    const r = parseOptionalIsoDate(body.captured_at, "captured_at");
    if (!r.ok) errors.push(r.error);
    else values.captured_at = r.value;
  }
  if (Object.hasOwn(body, "retouched_at")) {
    const r = parseOptionalIsoDate(body.retouched_at, "retouched_at");
    if (!r.ok) errors.push(r.error);
    else values.retouched_at = r.value;
  }
  if (Object.hasOwn(body, "set_id")) {
    const r = parseOptionalUuid(body.set_id, "set_id");
    if (!r.ok) errors.push(r.error);
    else values.set_id = r.value;
  }

  if (errors.length) return { ok: false, error: errors.join("; ") };
  return { ok: true, values };
}

const imageRightsPutSchema = z
  .object({
    copyright_owner: z
      .union([z.string().trim().max(200), z.literal(""), z.null()])
      .optional(),
    photographer_name: z
      .union([z.string().trim().max(200), z.literal(""), z.null()])
      .optional(),
    license_type: z
      .union([z.string().trim().max(80), z.literal(""), z.null()])
      .optional(),
    usage_scope: z
      .union([z.string().trim().max(80), z.literal(""), z.null()])
      .optional(),
    territory: z
      .union([z.string().trim().max(120), z.literal(""), z.null()])
      .optional(),
    start_at: z.union([z.string(), z.null()]).optional(),
    expires_at: z.union([z.string(), z.null()]).optional(),
    exclusive: z
      .union([z.boolean(), z.string(), z.number(), z.null()])
      .optional(),
    model_release_ref: z
      .union([z.string().trim().max(255), z.literal(""), z.null()])
      .optional(),
    rights_status: z
      .union([z.string().trim().max(80), z.literal(""), z.null()])
      .optional(),
    notes: z.union([z.string().max(5000), z.literal(""), z.null()]).optional(),
  })
  .strict();

/**
 * @param {unknown} body
 * @returns {{ ok: boolean, patch?: Record<string, unknown>, error?: string }}
 */
function parseImageRightsPatchFromBody(body) {
  const parsed = imageRightsPutSchema.safeParse(body || {});
  if (!parsed.success) {
    const msg =
      parsed.error.flatten().formErrors.join("; ") || "Invalid rights payload";
    return { ok: false, error: msg };
  }
  const patch = {};
  const d = parsed.data;
  if (Object.hasOwn(d, "copyright_owner")) {
    patch.copyright_owner =
      d.copyright_owner === "" || d.copyright_owner === null
        ? null
        : d.copyright_owner.trim();
  }
  if (Object.hasOwn(d, "photographer_name")) {
    patch.photographer_name =
      d.photographer_name === "" || d.photographer_name === null
        ? null
        : d.photographer_name.trim();
  }
  if (Object.hasOwn(d, "license_type")) {
    patch.license_type =
      d.license_type === "" || d.license_type === null
        ? null
        : d.license_type.trim();
  }
  if (Object.hasOwn(d, "usage_scope")) {
    patch.usage_scope =
      d.usage_scope === "" || d.usage_scope === null
        ? null
        : d.usage_scope.trim();
  }
  if (Object.hasOwn(d, "territory")) {
    patch.territory =
      d.territory === "" || d.territory === null ? null : d.territory.trim();
  }
  if (Object.hasOwn(d, "start_at")) {
    if (d.start_at === null) patch.start_at = null;
    else {
      const dt = new Date(d.start_at);
      if (Number.isNaN(dt.getTime()))
        return { ok: false, error: "Invalid start_at" };
      patch.start_at = dt;
    }
  }
  if (Object.hasOwn(d, "expires_at")) {
    if (d.expires_at === null) patch.expires_at = null;
    else {
      const dt = new Date(d.expires_at);
      if (Number.isNaN(dt.getTime()))
        return { ok: false, error: "Invalid expires_at" };
      patch.expires_at = dt;
    }
  }
  if (Object.hasOwn(d, "exclusive")) {
    patch.exclusive =
      d.exclusive === true ||
      d.exclusive === 1 ||
      String(d.exclusive).toLowerCase() === "true" ||
      String(d.exclusive).toLowerCase() === "1";
  }
  if (Object.hasOwn(d, "model_release_ref")) {
    patch.model_release_ref =
      d.model_release_ref === "" || d.model_release_ref === null
        ? null
        : d.model_release_ref.trim();
  }
  if (Object.hasOwn(d, "rights_status")) {
    patch.rights_status =
      d.rights_status === "" || d.rights_status === null
        ? null
        : d.rights_status.trim();
  }
  if (Object.hasOwn(d, "notes")) {
    patch.notes =
      d.notes === "" || d.notes === null
        ? null
        : String(d.notes).slice(0, 5000);
  }
  return { ok: true, patch };
}

function defaultImageRightsApiShape() {
  return {
    copyright_owner: null,
    photographer_name: null,
    license_type: null,
    usage_scope: null,
    territory: null,
    start_at: null,
    expires_at: null,
    exclusive: false,
    model_release_ref: null,
    rights_status: null,
    notes: null,
  };
}

function imageRightsRowToApi(row) {
  const base = defaultImageRightsApiShape();
  if (!row) return base;
  const iso = (v) => {
    if (!v) return null;
    const d = v instanceof Date ? v : new Date(v);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  };
  return {
    copyright_owner: row.copyright_owner ?? null,
    photographer_name: row.photographer_name ?? null,
    license_type: row.license_type ?? null,
    usage_scope: row.usage_scope ?? null,
    territory: row.territory ?? null,
    start_at: iso(row.start_at),
    expires_at: iso(row.expires_at),
    exclusive: !!row.exclusive,
    model_release_ref: row.model_release_ref ?? null,
    rights_status: row.rights_status ?? null,
    notes: row.notes ?? null,
  };
}

module.exports = {
  loginSchema,
  signupSchema,
  agencySignupSchema,
  applyProfileSchema,
  talentProfileUpdateSchema,
  partnerClaimSchema,
  onboardingDraftSchema,
  onboardingSubmitSchema,
  essentialsDraftSchema,
  essentialsSubmitSchema,
  onboardingIdentitySchema,
  onboardingPredictionsSchema,
  onboardingCompleteSchema,
  IMAGE_TYPE_VALUES,
  SHOT_TYPE_VALUES,
  STYLE_TYPE_VALUES,
  IMAGE_STATUS_VALUES,
  IMAGE_STRUCTURED_KEYS,
  parseImageStructuredFieldsFromBody,
  imageRightsPutSchema,
  parseImageRightsPatchFromBody,
  defaultImageRightsApiShape,
  imageRightsRowToApi,
};
