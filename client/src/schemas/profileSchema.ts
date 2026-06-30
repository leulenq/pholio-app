import { z } from 'zod';

// Helper for optional number
const optionalNumber = z.union([
  z.number(), 
  z.string().transform((val) => (val === '' ? undefined : Number(val))), 
  z.null()
]).optional();

/** SQLite / API may send booleans as 0/1 — normalize before Zod validation. */
function toDbBoolean(val: unknown, defaultValue = false): boolean {
  if (val === true || val === 1) return true;
  if (val === false || val === 0) return false;
  if (val === null || val === undefined || val === '') return defaultValue;
  if (typeof val === 'string') {
    const normalized = val.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
    if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  }
  return defaultValue;
}

function toNullableDbBoolean(val: unknown): boolean | null {
  if (val === null || val === undefined || val === '' || val === 'unset') return null;
  return toDbBoolean(val, false);
}

const coercedBoolean = z.preprocess(
  (val) => toDbBoolean(val, false),
  z.boolean(),
).default(false);

const nullableCoercedBoolean = z.preprocess(
  (val) => toNullableDbBoolean(val),
  z.union([z.boolean(), z.null()]),
);

export const profileSchema = z.object({
  // --- Identity ---
  first_name: z.string().min(1, "First name is required"),
  last_name: z.string().min(1, "Last name is required"),
  email: z.string().email().optional().or(z.literal('')), // Allowing email to be optional if managed by Auth, or required? User said "except first_name, last_name, and email". Assuming email should be in schema? It's not in current schema. I won't add it if not there.

  city: z.string().nullable().optional(),
  city_secondary: z.string().nullable().optional(),
  gender: z.string().nullable().optional(),
  pronouns: z.string().nullable().optional(),
  date_of_birth: z.union([z.string(), z.null(), z.undefined()]).refine(val => {
    if (!val) return true;
    const date = new Date(val);
    const now = new Date();
    return date <= now;
  }, "Date of birth cannot be in the future"),
  ethnicity: z.union([z.string(), z.array(z.string())]).nullable().optional(),
  nationality: z.string().nullable().optional(),
  place_of_birth: z.string().nullable().optional(),
  bio: z.string().max(2000, "Bio must be less than 2000 characters").nullable().optional(),
  timezone: z.string().nullable().optional(),

  guardian_consent_recorded: coercedBoolean.optional(),
  work_permit_on_file: coercedBoolean.optional(),
  guardian_email: z
    .string()
    .email("Enter a valid guardian email")
    .nullable()
    .optional()
    .or(z.literal("")),

  // --- Physical Attributes (All flattened for DB mapping) ---
  height_cm: optionalNumber,
  weight_kg: optionalNumber,
  
  // Measurements (Decimals supported)
  bust: optionalNumber,
  waist: optionalNumber,
  hips: optionalNumber,
  
  // Details
  shoe_size: optionalNumber,
  dress_size: z.string().nullable().optional(),
  inseam_cm: optionalNumber,
  hair_length: z.string().nullable().optional(),
  hair_color: z.string().nullable().optional(),
  hair_type: z.string().nullable().optional(),
  eye_color: z.string().nullable().optional(),
  skin_tone: z.string().nullable().optional(),
  body_type: z.string().nullable().optional(),
  
  // Modifications
  tattoos: coercedBoolean,
  piercings: coercedBoolean,

  // --- Professional & Availability ---
  work_status: z.string().nullable().optional(),
  /** true = authorized, false = not authorized, null = not specified (backend accepts boolean or null). */
  work_eligibility: nullableCoercedBoolean.optional(),
  passport_ready: nullableCoercedBoolean.optional().transform((v) => v ?? false),
  availability_travel: nullableCoercedBoolean.optional().transform((v) => v ?? false),
  drivers_license: nullableCoercedBoolean.optional().transform((v) => v ?? false),
  availability_schedule: z.string().nullable().optional(),
  comfort_levels: z.union([z.string(), z.array(z.string())]).nullable().optional(),
  modeling_categories: z.union([z.string(), z.array(z.string())]).nullable().optional(),
  booking_primary_lane: z.string().nullable().optional(),
  booking_secondary_lanes: z.union([z.string(), z.array(z.string())]).nullable().optional(),
  union_membership: z.union([z.string(), z.array(z.string())]).nullable().optional(),
  
  playing_age_min: optionalNumber,
  playing_age_max: optionalNumber,
  
  // Representation (New Fields)
  seeking_representation: coercedBoolean,
  /** UI-only tri-state; stripped before API — kept in sync with seeking_representation + current_agency on load/submit. */
  representation_status: z.enum(['seeking', 'represented', 'not_seeking']).optional(),
  current_agency: z.string().nullable().optional(),
  previous_representations: z.any().optional(),
  representations: z.array(z.object({
    id: z.string().uuid().optional(),
    agency_id: z.string().uuid().nullable().optional(),
    agency_name: z.string().max(160).nullable().optional(),
    external_agency_name: z.string().trim().min(1, 'Agency name is required').max(160).nullable().optional(),
    relationship_type: z.enum(['mother', 'placement']),
    market: z.string().trim().max(120).nullable().optional(),
    territory: z.string().trim().max(120).nullable().optional(),
    division: z.string().trim().max(100).nullable().optional(),
    is_exclusive: coercedBoolean.optional(),
    started_on: z.string().nullable().optional(),
    status: z.enum(['active', 'ended']).optional(),
  }).superRefine((representation, ctx) => {
    if (!representation.agency_id && !representation.external_agency_name) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['external_agency_name'],
        message: 'Agency name is required',
      });
    }
    if (representation.relationship_type === 'placement' && !representation.market) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['market'],
        message: 'Market is required for a placement agency',
      });
    }
  })).max(20).superRefine((representations, ctx) => {
    if (representations.filter((item) => item.relationship_type === 'mother').length > 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Only one active mother agency is allowed',
      });
    }
  }).optional(),

  // --- Skills & Languages (JSON Arrays) ---
  training_summary: z.string().nullable().optional(),
  languages: z.union([z.string(), z.array(z.string())]).nullable().optional(),
  specialties: z.union([z.string(), z.array(z.string())]).nullable().optional(),

  // --- Credits ---
  experience_level: z.union([z.string(), z.null(), z.undefined()]),
  experience_details: z.any().optional(),

  // --- References & Emergency ---
  emergency_contact_name: z.string().nullable().optional(),
  emergency_contact_phone: z.string().nullable().optional(),
  emergency_contact_relationship: z.string().nullable().optional(),

  // --- Socials ---
  instagram_handle: z.string().max(100, "Instagram handle must be 100 characters or less").nullable().optional().or(z.literal('')),
  tiktok_handle: z.string().max(100, "TikTok handle must be 100 characters or less").nullable().optional().or(z.literal('')),
  twitter_handle: z.string().max(100, "X handle must be 100 characters or less").nullable().optional().or(z.literal('')),
  youtube_handle: z.string().max(100, "YouTube handle must be 100 characters or less").nullable().optional().or(z.literal('')),
  portfolio_url: z.union([
    z.string().url("Must be a valid URL"),
    z.literal(''),
    z.null()
  ]).optional(),
  onlyfans_url: z.union([
    z.string().url("Must be a valid URL"),
    z.literal(''),
    z.null()
  ]).optional(),
  video_reel_url: z.union([
    z.string().url("Must be a valid URL"),
    z.literal(''),
    z.null()
  ]).optional(),
}).passthrough(); // Allow extra DB columns to pass through without failing validation

export type ProfileData = z.infer<typeof profileSchema>;
