import { z } from 'zod';

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
      z.string().min(1, 'Height is required'),
      z.number()
    ])
  )
  .transform((val) => {
    if (typeof val === 'number') return val;
    return parseInt(val, 10);
  })
  .refine(
    (val) => Number.isFinite(val) && val >= 120 && val <= 220,
    { message: 'Provide height in cm between 120 and 220 (or use feet/inches like 5\' 11")' }
  );

const bioSchema = z
  .string({ required_error: 'Bio required' })
  .trim()
  .min(10, 'Tell us more so we can curate')
  .max(600, 'Bio is too long');


const phoneSchema = z
  .string()
  .trim()
  .max(20, 'Phone number too long')
  .optional();

const bustSchema = z
  .preprocess(
    (val) => (typeof val === 'string' ? val.trim() : val),
    z.union([
      z.string().min(1).transform((val) => parseFloat(val)), // Changed to parseFloat for decimal support
      z.number()
    ])
  )
  .refine((val) => !val || (Number.isFinite(val) && val >= 20 && val <= 60), {
    message: 'Bust must be between 20 and 60 inches (half sizes like 32.5 are supported)'
  })
  .optional();

const waistSchema = z
  .preprocess(
    (val) => (typeof val === 'string' ? val.trim() : val),
    z.union([
      z.string().min(1).transform((val) => parseFloat(val)), // Changed to parseFloat for decimal support
      z.number()
    ])
  )
  .refine((val) => !val || (Number.isFinite(val) && val >= 20 && val <= 50), {
    message: 'Waist must be between 20 and 50 inches (half sizes like 28.5 are supported)'
  })
  .optional();

const hipsSchema = z
  .preprocess(
    (val) => (typeof val === 'string' ? val.trim() : val),
    z.union([
      z.string().min(1).transform((val) => parseFloat(val)), // Changed to parseFloat for decimal support
      z.number()
    ])
  )
  .refine((val) => !val || (Number.isFinite(val) && val >= 25 && val <= 60), {
    message: 'Hips must be between 25 and 60 inches (half sizes like 36.5 are supported)'
  })
  .optional();

// New comprehensive profile field schemas
const genderSchema = z.enum(['Male', 'Female', 'Non-binary', 'Other', 'Prefer not to say'], {
  errorMap: () => ({ message: 'Please select a valid gender option' })
}).optional();

const dateOfBirthSchema = z
  .string()
  .trim()
  .optional()
  .refine((val) => {
    if (!val || val.trim() === '') return true; // Optional field
    const date = new Date(val);
    if (isNaN(date.getTime())) return false;
    
    // Check if date is not in the future
    const today = new Date();
    today.setHours(23, 59, 59, 999); // End of today
    return date <= today;
  }, {
    message: 'Date of birth cannot be in the future'
  });

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

const dressSizeSchema = z.string().trim().max(10).optional();

const hairLengthSchema = z.enum(['Short', 'Medium', 'Long', 'Very Long']).optional();

const skinToneSchema = z.string().trim().max(50).optional();

const languagesSchema = z
  .union([
    z.array(z.string()),
    z.string().transform((val) => {
      try {
        return JSON.parse(val);
      } catch {
        return val.split(',').map(l => l.trim()).filter(l => l);
      }
    })
  ])
  .optional();

const availabilityTravelSchema = z
  .union([
    z.boolean(),
    z.string().transform((val) => val === 'true' || val === 'on' || val === '1')
  ])
  .optional();

const availabilityScheduleSchema = z.enum(['Full-time', 'Part-time', 'Flexible', 'Weekends only']).optional();

const experienceLevelSchema = z.enum(['Beginner', 'Intermediate', 'Experienced', 'Professional']).optional();

const trainingSchema = z.string().trim().max(1000).optional();

const portfolioUrlSchema = z
  .string()
  .trim()
  .max(255)
  .refine((val) => {
    if (!val || val.trim() === '') return true;
    return /^https?:\/\/.+/i.test(val);
  }, {
    message: 'Enter a valid URL starting with http:// or https://'
  })
  .optional();

const socialMediaHandleSchema = z.string().trim().max(100).optional();

const socialMediaUrlSchema = z
  .string()
  .trim()
  .max(255)
  .refine((val) => {
    if (!val || val.trim() === '') return true;
    return /^https?:\/\/.+/i.test(val);
  }, {
    message: 'Enter a valid URL'
  })
  .optional();

const referenceNameSchema = z.string().trim().max(100).optional();
const referenceEmailSchema = z.string().trim().email('Enter a valid email').max(255).optional().or(z.literal(''));
const referencePhoneSchema = z.string().trim().max(20).optional();
const referenceRelationshipSchema = z.string().trim().max(50).optional();

const emergencyContactNameSchema = z.string().trim().max(100).optional();
const emergencyContactPhoneSchema = z.string().trim().max(20).optional();
const emergencyContactRelationshipSchema = z.string().trim().max(50).optional();

const nationalitySchema = z.string().trim().max(100).optional();
const unionMembershipSchema = z.string().trim().max(100).optional();
const ethnicitySchema = z.string().trim().max(100).optional();

const tattoosSchema = z
  .union([
    z.boolean(),
    z.string().transform((val) => val === 'true' || val === 'on' || val === '1')
  ])
  .optional();

const piercingsSchema = z
  .union([
    z.boolean(),
    z.string().transform((val) => val === 'true' || val === 'on' || val === '1')
  ])
  .optional();


