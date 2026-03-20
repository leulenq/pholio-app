const { z } = require('zod');

/**
 * Core field schemas
 */

const emailSchema = z
  .string({ required_error: 'Email is required' })
  .trim()
  .email('Enter a valid email')
  .max(255, 'Email too long')
  .transform((value) => value.toLowerCase());

const passwordSchema = z
  .string({ required_error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be 128 characters or less');

const nameSchema = z
  .string({ required_error: 'Required' })
  .trim()
  .min(1, 'Required')
  .max(60, 'Too long');

const roleSchema = z.enum(['TALENT', 'AGENCY']);

/**
 * Auth schemas
 */

const loginSchema = z.object({
  email: emailSchema,
  password: z
    .string({ required_error: 'Password is required' })
    .min(1, 'Password is required')
});

const signupSchema = z.object({
  first_name: nameSchema,
  last_name: nameSchema,
  email: emailSchema,
  password: passwordSchema,
  role: roleSchema
});

const agencySignupSchema = z.object({
  agency_name: z
    .string({ required_error: 'Agency name is required' })
    .trim()
    .min(1, 'Agency name is required')
    .max(100, 'Agency name is too long'),
  company_website: z
    .string()
    .trim()
    .max(255, 'Website URL is too long')
    .optional()
    .transform((val) => {
      if (!val || val.trim() === '') return undefined;
      return val.trim();
    })
    .refine((val) => {
      if (!val) return true;
      // Basic URL validation - must start with http:// or https://
      return /^https?:\/\/.+/i.test(val);
    }, {
      message: 'Enter a valid URL starting with http:// or https://'
    }),
  contact_name: nameSchema,
  contact_role: z.enum(['Booker', 'Director', 'Scout', 'Other'], {
    required_error: 'Please select your role'
  }),
  email: emailSchema,
  password: passwordSchema
});

/**
 * Profile + Apply
 */

const heightSchema = z
  .preprocess(
    (val) => {
      if (typeof val === 'string') {
        const trimmed = val.trim();
        // Try to parse feet and inches format (e.g., "5' 11"", "5'11"", "5ft 11in")
        const feetInchesMatch = trimmed.match(/(\d+)\s*['ft]+\s*(\d+)?/i);
        if (feetInchesMatch) {
          const feet = parseInt(feetInchesMatch[1], 10);
          const inches = parseInt(feetInchesMatch[2] || '0', 10);
          const cm = Math.round((feet * 30.48) + (inches * 2.54));
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
    z.union([
      z.string(),
      z.number(),
      z.null()
    ]).optional()
  )
  .transform((val) => {
    if (typeof val === 'number') return val;
    return parseInt(val, 10);
  });

const bioSchema = z
  .string()
  .trim()
  .max(2000, 'Bio must be less than 2000 characters') // Frontend limit
  .optional()
  .or(z.literal(''));


const phoneSchema = z
  .string()
  .trim()
  .max(20, 'Phone number too long')
  .optional()
  .or(z.literal(''))
  .or(z.null());

const bustSchema = z
  .preprocess(
    (val) => (typeof val === 'string' ? val.trim() : val),
    z.union([
      z.string().min(1).transform((val) => parseFloat(val)), // Changed to parseFloat for decimal support
      z.number(),
      z.null()
    ])
  )
  .optional();

const waistSchema = z
  .preprocess(
    (val) => (typeof val === 'string' ? val.trim() : val),
    z.union([
      z.string().min(1).transform((val) => parseFloat(val)), // Changed to parseFloat for decimal support
      z.number(),
      z.null()
    ])
  )
  .optional();

const hipsSchema = z
  .preprocess(
    (val) => (typeof val === 'string' ? val.trim() : val),
    z.union([
      z.string().min(1).transform((val) => parseFloat(val)), // Changed to parseFloat for decimal support
      z.number(),
      z.null()
    ])
  )
  .optional();

// New comprehensive profile field schemas
const genderSchema = z.union([
  z.enum(['Male', 'Female', 'Non-binary', 'Other', 'Prefer not to say']),
  z.literal(''),
  z.null()
]).optional();

const dateOfBirthSchema = z
  .union([
    z.string().trim().refine((val) => {
      if (!val || val.trim() === '') return true; // Optional field
      const date = new Date(val);
      if (isNaN(date.getTime())) return false;
      
      // Check if date is not in the future
      const today = new Date();
      today.setHours(23, 59, 59, 999); // End of today
      return date <= today;
    }, {
      message: 'Date of birth cannot be in the future'
    }),
    z.null(),
    z.literal('')
  ])
  .optional();

const weightSchema = z
  .preprocess(
    (val) => {
      if (typeof val === 'string') {
        const trimmed = val.trim();
        if (!trimmed) return null;
        const num = parseFloat(trimmed);
        return isNaN(num) ? null : num;
      }
      return val;
    },
    z.union([
      z.number().refine((val) => !val || (val >= 30 && val <= 200), {
        message: 'Weight must be between 30 and 200 kg'
      }),
      z.null()
    ])
  )
  .optional();

const dressSizeSchema = z.string().trim().max(10).optional().or(z.literal('')).or(z.null());

const hairLengthSchema = z.string().nullable().optional().or(z.literal(''));

const skinToneSchema = z.string().trim().max(50).optional().or(z.literal('')).or(z.null());

const languagesSchema = z
  .union([
    z.array(z.string()),
    z.string().transform((val) => {
      if (!val || val.trim() === '') return [];
      try {
        const parsed = JSON.parse(val);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return val.split(',').map(l => l.trim()).filter(l => l);
      }
    }),
    z.null()
  ])
  .optional();

const specialtiesSchema = z
  .union([
    z.array(z.string()),
    z.string().transform((val) => {
      if (!val || val.trim() === '') return [];
      try {
        const parsed = JSON.parse(val);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return val.split(',').map(l => l.trim()).filter(l => l);
      }
    }),
    z.null()
  ])
  .optional();

const availabilityTravelSchema = z
  .union([
    z.boolean(),
    z.string().transform((val) => val === 'true' || val === 'on' || val === '1'),
    z.null()
  ])
  .optional();

const availabilityScheduleSchema = z.string().nullable().optional().or(z.literal(''));

// Relaxed check - allow any string for experience level as frontend uses various terms
const experienceLevelSchema = z.string().nullable().optional().or(z.literal(''));

const trainingSchema = z.string().trim().max(1000).optional().or(z.literal('')).or(z.null());

const portfolioUrlSchema = z
  .string()
  .trim()
  .max(255)
  .refine((val) => {
    if (!val || typeof val !== 'string' || val.trim() === '') return true;
    return /^https?:\/\/.+/i.test(val);
  }, {
    message: 'Enter a valid URL starting with http:// or https://'
  })
  .nullable()
  .optional();

const socialMediaHandleSchema = z.string().trim().max(100).optional().or(z.literal('')).or(z.null());

const socialMediaUrlSchema = z
  .string()
  .trim()
  .max(255)
  .refine((val) => {
    if (!val || typeof val !== 'string' || val.trim() === '') return true;
    return /^https?:\/\/.+/i.test(val);
  }, {
    message: 'Enter a valid URL'
  })
  .nullable()
  .optional();

const referenceNameSchema = z.string().trim().max(100).optional().or(z.literal('')).or(z.null());
const referenceEmailSchema = z.string().trim().email('Enter a valid email').max(255).optional().or(z.literal('')).or(z.null());
const referencePhoneSchema = z.string().trim().max(20).optional().or(z.literal('')).or(z.null());
const referenceRelationshipSchema = z.string().trim().max(50).optional().or(z.literal('')).or(z.null());

const emergencyContactNameSchema = z.string().trim().max(100).optional().or(z.literal('')).or(z.null());
const emergencyContactPhoneSchema = z.string().trim().max(20).optional().or(z.literal('')).or(z.null());
const emergencyContactRelationshipSchema = z.string().trim().max(50).optional().or(z.literal('')).or(z.null());

const nationalitySchema = z.string().trim().max(100).optional().or(z.literal('')).or(z.null());

const multiSelectSchema = z
  .union([
    z.array(z.string()),
    z.string().transform((val) => {
      if (!val || val.trim() === '') return [];
      try {
        const parsed = JSON.parse(val);
        return Array.isArray(parsed) ? parsed : [parsed];
      } catch {
        return val.split(',').map(s => s.trim()).filter(s => s);
      }
    }),
    z.null()
  ])
  .optional();

const unionMembershipSchema = multiSelectSchema;
const ethnicitySchema = multiSelectSchema;

const tattoosSchema = z
  .union([
    z.boolean(),
    z.string().transform((val) => val === 'true' || val === 'on' || val === '1'),
    z.null(),
    z.literal('')
  ])
  .optional();

const piercingsSchema = z
  .union([
    z.boolean(),
    z.string().transform((val) => val === 'true' || val === 'on' || val === '1'),
    z.null(),
    z.literal('')
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
    experience_details: z.union([
      z.string().transform((val) => {
        if (!val || val.trim() === '') return null;
        try {
          return JSON.parse(val);
        } catch {
          return null;
        }
      }),
      z.record(z.string(), z.string()).optional(),
      z.null()
    ]).optional(),
    partner_agency_email: z
      .string()
      .trim()
      .email('Enter a valid email')
      .max(255, 'Email too long')
      .transform((val) => val.toLowerCase())
      .optional(),
    // New comprehensive fields
    gender: genderSchema,
    date_of_birth: dateOfBirthSchema,
    weight: z.preprocess((val) => {
      if (val === '' || val === null || val === undefined) return undefined;
      const num = typeof val === 'string' ? parseFloat(val) : val;
      return isNaN(num) ? undefined : num;
    }, z.number().min(30).max(440).optional()),
    weight_unit: z.enum(['kg', 'lbs']).optional(),
    weight_kg: weightSchema,
    weight_lbs: weightSchema,
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
    work_eligibility: z.enum(['Yes', 'No']).optional(),
    work_status: z.string().trim().max(50).optional(),
    union_membership: unionMembershipSchema,
    ethnicity: ethnicitySchema,
    tattoos: tattoosSchema,
    piercings: piercingsSchema,
    comfort_levels: z.array(z.string()).optional(),
    previous_representations: z.union([
      z.string().transform((val) => {
        if (!val || val.trim() === '') return null;
        try {
          return JSON.parse(val);
        } catch {
          return null;
        }
      }),
      z.array(z.object({
        has_manager: z.boolean().optional(),
        has_agency: z.boolean().optional(),
        manager_name: z.string().optional(),
        manager_contact: z.string().optional(),
        agency_name: z.string().optional(),
        agent_name: z.string().optional(),
        agency_contact: z.string().optional(),
        reason_leaving: z.string().optional()
      })).optional(),
      z.null()
    ]).optional()
  })
  .strict();

const talentProfileUpdateSchema = z
  .object({
    first_name: nameSchema.optional(), // Keep required if provided, but optional in the partial update object
    last_name: nameSchema.optional(),
    email: z.string().email().optional().or(z.literal('')).or(z.null()),
    city: z.string().optional().or(z.literal('')).or(z.null()),
    city_secondary: z.string().optional().or(z.literal('')).or(z.null()),
    height_cm: heightSchema,
    bio: bioSchema,
    phone: phoneSchema.optional(),
    bust: bustSchema.optional(),
    waist: waistSchema.optional(),
    hips: hipsSchema.optional(),
    shoe_size: z.union([z.string(), z.number()]).optional().or(z.literal('')).or(z.null()),
    eye_color: z.string().trim().max(50).optional().or(z.literal('')).or(z.null()),
    hair_color: z.string().trim().max(50).optional().or(z.literal('')).or(z.null()),
    specialties: specialtiesSchema.optional(),
    experience_details: z.any().optional(),
    gender: genderSchema.optional(),
    date_of_birth: dateOfBirthSchema.optional(),
    playing_age_min: z.number().optional().or(z.literal('')).or(z.null()),
    playing_age_max: z.number().optional().or(z.literal('')).or(z.null()),
    weight: z.preprocess((val) => {
      if (val === '' || val === null || val === undefined) return undefined;
      const num = typeof val === 'string' ? parseFloat(val) : val;
      return isNaN(num) ? undefined : num;
    }, z.union([z.number(), z.literal(''), z.null()]).optional()),
    weight_unit: z.enum(['kg', 'lbs']).optional().or(z.literal('')).or(z.null()),
    weight_kg: weightSchema.optional(),
    weight_lbs: weightSchema.optional(),
    dress_size: dressSizeSchema.optional(),
    hair_length: hairLengthSchema.optional(),
    skin_tone: skinToneSchema.optional(),
    languages: languagesSchema.optional(),
    availability_travel: availabilityTravelSchema.optional(),
    availability_schedule: availabilityScheduleSchema.optional(),
    experience_level: experienceLevelSchema.optional(),
    training: trainingSchema.optional(),
    portfolio_url: portfolioUrlSchema,
    instagram_handle: socialMediaHandleSchema,
    instagram_url: socialMediaUrlSchema,
    twitter_handle: socialMediaHandleSchema,
    twitter_url: socialMediaUrlSchema,
    tiktok_handle: socialMediaHandleSchema,
    tiktok_url: socialMediaUrlSchema,
    youtube_handle: socialMediaHandleSchema,
    youtube_url: socialMediaUrlSchema,
    training_summary: z.string().optional(),
    reference_name: referenceNameSchema,
    reference_email: referenceEmailSchema,
    reference_phone: referencePhoneSchema,
    emergency_contact_name: emergencyContactNameSchema,
    emergency_contact_phone: emergencyContactPhoneSchema,
    emergency_contact_relationship: emergencyContactRelationshipSchema,
    work_eligibility: z.union([z.enum(['Yes', 'No']), z.boolean(), z.literal(''), z.null()]).optional(),
    work_status: z.string().trim().max(50).optional().or(z.literal('')).or(z.null()),
    union_membership: unionMembershipSchema,
    ethnicity: ethnicitySchema,
    tattoos: tattoosSchema,
    piercings: piercingsSchema,
    seeking_representation: z.any().optional(),
    current_agency: z.string().optional().or(z.literal('')).or(z.null()),
    comfort_levels: languagesSchema,
    previous_representations: z.any().optional(),
    primary_photo_id: z.string().uuid().optional().or(z.literal('')).or(z.null()),
    inseam_cm: z.number().min(40).max(120).optional().or(z.literal('')).or(z.null()),
    video_reel_url: z.string().url().max(500).optional().or(z.literal('')).or(z.null()),
    place_of_birth: z.string().trim().max(100).optional().or(z.literal('')).or(z.null()),
    timezone: z.string().trim().max(100).optional().or(z.literal('')).or(z.null()),
    nationality: z.string().trim().max(100).optional().or(z.literal('')).or(z.null()),
    hair_type: z.string().trim().max(50).optional().or(z.literal('')).or(z.null()),
    pronouns: z.string().trim().max(50).optional().or(z.literal('')).or(z.null()),
    body_type: z.string().trim().max(50).optional().or(z.literal('')).or(z.null()),
    drivers_license: z.union([z.boolean(), z.literal(''), z.null()]).optional(),
    passport_ready: z.union([z.boolean(), z.literal(''), z.null()]).optional(),
    modeling_categories: z.array(z.string()).optional().or(z.null())
  })
  .passthrough();

/**
 * Partner claim
 */

const partnerClaimSchema = z.object({
  slug: z.string().trim().min(1, 'Profile required')
});

/**
 * Onboarding schemas
 */

// Permissive draft schema - all fields optional for partial saves
const onboardingDraftSchema = z.object({
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
  experience_details: z.union([
    z.string().transform((val) => {
      if (!val || val.trim() === '') return null;
      try {
        return JSON.parse(val);
      } catch {
        return null;
      }
    }),
    z.record(z.string(), z.string()).optional(),
    z.null()
  ]).optional(),
  gender: genderSchema,
  date_of_birth: dateOfBirthSchema,
  weight: z.preprocess((val) => {
    if (val === '' || val === null || val === undefined) return undefined;
    const num = typeof val === 'string' ? parseFloat(val) : val;
    return isNaN(num) ? undefined : num;
  }, z.number().min(30).max(440).optional()),
  weight_unit: z.enum(['kg', 'lbs']).optional(),
  weight_kg: weightSchema,
  weight_lbs: weightSchema,
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
  work_eligibility: z.union([z.enum(['Yes', 'No']), z.boolean(), z.null()]).optional(), // Allow boolean for draft
  work_status: z.string().trim().max(50).optional(),
  union_membership: unionMembershipSchema,
  ethnicity: ethnicitySchema,
  tattoos: tattoosSchema,
  piercings: piercingsSchema,
  comfort_levels: z.array(z.string()).optional(),
  previous_representations: z.union([
    z.string().transform((val) => {
      if (!val || val.trim() === '') return null;
      try {
        return JSON.parse(val);
      } catch {
        return null;
      }
    }),
    z.array(z.object({
      has_manager: z.boolean().optional(),
      has_agency: z.boolean().optional(),
      manager_name: z.string().optional(),
      manager_contact: z.string().optional(),
      agency_name: z.string().optional(),
      agent_name: z.string().optional(),
      agency_contact: z.string().optional(),
      reason_leaving: z.string().optional()
    })).optional(),
    z.null()
  ]).optional()
}).passthrough(); // Allow extra fields for flexibility

// Strict submit schema - required fields for profile submission
const onboardingSubmitSchema = z.object({
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
  experience_details: z.union([
    z.string().transform((val) => {
      if (!val || val.trim() === '') return null;
      try {
        return JSON.parse(val);
      } catch {
        return null;
      }
    }),
    z.record(z.string(), z.string()).optional(),
    z.null()
  ]).optional(),
  gender: genderSchema,
  pronouns: z.string().nullable().optional(),
  date_of_birth: dateOfBirthSchema,
  weight: z.preprocess((val) => {
    if (val === '' || val === null || val === undefined) return undefined;
    const num = typeof val === 'string' ? parseFloat(val) : val;
    return isNaN(num) ? undefined : num;
  }, z.number().min(30).max(440).optional()),
  weight_unit: z.enum(['kg', 'lbs']).optional(),
  weight_kg: weightSchema,
  weight_lbs: weightSchema,
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
  work_eligibility: z.enum(['Yes', 'No']).optional(),
  work_status: z.string().trim().max(50).optional(),
  union_membership: unionMembershipSchema,
  ethnicity: ethnicitySchema,
  tattoos: tattoosSchema,
  piercings: piercingsSchema,
  comfort_levels: z.array(z.string()).optional(),
  previous_representations: z.union([
    z.string().transform((val) => {
      if (!val || val.trim() === '') return null;
      try {
        return JSON.parse(val);
      } catch {
        return null;
      }
    }),
    z.array(z.object({
      has_manager: z.boolean().optional(),
      has_agency: z.boolean().optional(),
      manager_name: z.string().optional(),
      manager_contact: z.string().optional(),
      agency_name: z.string().optional(),
      agent_name: z.string().optional(),
      agency_contact: z.string().optional(),
      reason_leaving: z.string().optional()
    })).optional(),
    z.null()
  ]).optional()
}).strict();

// Essentials wizard schemas (Phase A)
// Permissive draft schema for wizard step saves
const essentialsDraftSchema = z.object({
  first_name: nameSchema.optional(),
  last_name: nameSchema.optional(),
  city: nameSchema.optional(),
  gender: genderSchema,
  height_cm: heightSchema.optional(),
  bust: bustSchema.optional(),
  waist: waistSchema.optional(),
  hips: hipsSchema.optional(),
  shoe_size: z.string().trim().max(10).optional(),
  date_of_birth: dateOfBirthSchema
}).passthrough(); // Allow extra fields for flexibility

// Strict essentials submit schema - minimal required fields for wizard completion
const essentialsSubmitSchema = z.object({
  first_name: nameSchema,
  last_name: nameSchema,
  city: nameSchema,
  gender: genderSchema, // Optional for essentials
  height_cm: heightSchema,
  bust: bustSchema, // Required for essentials
  waist: waistSchema, // Required for essentials
  hips: hipsSchema, // Required for essentials
  shoe_size: z.string().trim().max(10).optional(),
  date_of_birth: dateOfBirthSchema // Optional for essentials
}).strict();

// Onboarding identity schema (Step 1)
const onboardingIdentitySchema = z.object({
  first_name: nameSchema,
  last_name: nameSchema,
  city: nameSchema,
  gender: genderSchema // Optional
}).strict();

// Onboarding predictions schema (Step 3 - user confirms/edits predictions)
const onboardingPredictionsSchema = z.object({
  height_cm: heightSchema.optional(),
  weight_lbs: z.preprocess((val) => {
    if (val === '' || val === null || val === undefined) return undefined;
    const num = typeof val === 'string' ? parseFloat(val) : val;
    return isNaN(num) ? undefined : num;
  }, z.number().min(80).max(300).optional()),
  bust: bustSchema.optional(),
  waist: waistSchema.optional(),
  hips: hipsSchema.optional(),
  hair_color: z.string().trim().max(30).optional(),
  eye_color: z.string().trim().max(30).optional(),
  skin_tone: z.string().trim().max(50).optional()
}).passthrough(); // Allow extra fields for flexibility

// Onboarding complete schema (validates essentials before completion)
const onboardingCompleteSchema = z.object({
  first_name: nameSchema,
  last_name: nameSchema,
  city: nameSchema,
  height_cm: heightSchema,
  bust: bustSchema,
  waist: waistSchema,
  hips: hipsSchema
}).strict();

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
  onboardingCompleteSchema
};
