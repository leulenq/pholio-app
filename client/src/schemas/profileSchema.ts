import { z } from 'zod';

// Helper for optional number
const optionalNumber = z.union([
  z.number(), 
  z.string().transform((val) => (val === '' ? undefined : Number(val))), 
  z.null()
]).optional();

// Helper for boolean that might come as string "true"/"false" from forms, or null from DB
const coercedBoolean = z.union([
  z.boolean(),
  z.string().transform(val => val === 'true'),
  z.null().transform(() => false)
]).default(false);

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
  work_eligibility: z.union([z.boolean(), z.null()]).optional().transform(v => v ?? false),
  availability_travel: z.union([z.boolean(), z.null()]).optional().transform(v => v ?? false),
  drivers_license: z.union([z.boolean(), z.null()]).optional().transform(v => v ?? false),
  availability_schedule: z.string().nullable().optional(),
  comfort_levels: z.union([z.string(), z.array(z.string())]).nullable().optional(),
  modeling_categories: z.union([z.string(), z.array(z.string())]).nullable().optional(),
  union_membership: z.union([z.string(), z.array(z.string())]).nullable().optional(),
  
  playing_age_min: optionalNumber,
  playing_age_max: optionalNumber,
  
  // Representation (New Fields)
  seeking_representation: coercedBoolean,
  current_agency: z.string().nullable().optional(),
  previous_representations: z.any().optional(),

  // --- Skills & Languages (JSON Arrays) ---
  training_summary: z.string().nullable().optional(),
  languages: z.union([z.string(), z.array(z.string())]).nullable().optional(),
  specialties: z.union([z.string(), z.array(z.string())]).nullable().optional(),

  // --- Credits ---
  experience_level: z.union([z.string(), z.null(), z.undefined()]),
  experience_details: z.string().nullable().optional(),

  // --- References & Emergency ---
  emergency_contact_name: z.string().nullable().optional(),
  emergency_contact_phone: z.string().nullable().optional(),
  emergency_contact_relationship: z.string().nullable().optional(),

  // --- Socials ---
  instagram_handle: z.string().nullable().optional().or(z.literal('')),
  tiktok_handle: z.string().nullable().optional().or(z.literal('')),
  twitter_handle: z.string().nullable().optional().or(z.literal('')),
  youtube_handle: z.string().nullable().optional().or(z.literal('')),
  portfolio_url: z.union([
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
