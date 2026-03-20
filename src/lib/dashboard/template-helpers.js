/**
 * Template Helper Functions for Dashboard Templates
 * 
 * These functions provide safe data extraction and transformation for EJS templates.
 * They handle null/undefined values, type coercion, and edge cases gracefully.
 */

/**
 * Safely extract a value from an object, preserving falsy values (false, 0, '')
 * but treating null and undefined as missing.
 * 
 * @param {*} val - Value to extract
 * @param {*} def - Default value if val is null or undefined
 * @returns {*} The value or default
 * 
 * @example
 * safeValue(null) // ''
 * safeValue(undefined) // ''
 * safeValue(0) // 0 (preserved)
 * safeValue(false) // false (preserved)
 * safeValue('') // '' (preserved)
 * safeValue('test') // 'test'
 */
function safeValue(val, def = '') {
  return (val !== null && val !== undefined) ? val : def;
}

/**
 * Safely extract and validate JSON fields.
 * Handles both string JSON and object values, validates JSON strings,
 * and provides safe defaults for invalid input.
 * 
 * @param {*} val - JSON string, object, or null/undefined
 * @param {string} def - Default JSON string (must be valid JSON)
 * @returns {string} Valid JSON string
 * 
 * @example
 * safeJsonValue(null) // '[]'
 * safeJsonValue('[1,2,3]') // '[1,2,3]'
 * safeJsonValue({a: 1}) // '{"a":1}'
 * safeJsonValue('invalid json') // '[]' (fallback)
 */
function safeJsonValue(val, def = '[]') {
  if (val === null || val === undefined) return def;
  
  // If it's already a string, validate it's valid JSON
  if (typeof val === 'string') {
    try {
      // Validate by parsing
      JSON.parse(val);
      return val;
    } catch (e) {
      // Invalid JSON string, return default
      console.warn('[Template Helper] Invalid JSON string:', val, e.message);
      return def;
    }
  }
  
  // If it's an object/array, stringify it
  if (typeof val === 'object') {
    try {
      return JSON.stringify(val);
    } catch (e) {
      console.warn('[Template Helper] Failed to stringify object:', e.message);
      return def;
    }
  }
  
  // For other types, return default
  return def;
}

/**
 * Normalize image paths to ensure consistent formatting.
 * Handles external URLs, local paths, and missing paths.
 * 
 * @param {string|null|undefined} imagePath - Image path to normalize
 * @returns {string} Normalized image path or empty string
 * 
 * @example
 * normalizeImagePath('/uploads/img.jpg') // '/uploads/img.jpg'
 * normalizeImagePath('uploads/img.jpg') // '/uploads/img.jpg'
 * normalizeImagePath('https://example.com/img.jpg') // 'https://example.com/img.jpg'
 * normalizeImagePath(null) // ''
 */
function normalizeImagePath(imagePath) {
  if (!imagePath) return '';
  
  // Preserve external URLs
  if (imagePath.startsWith('http://') || imagePath.startsWith('https://')) {
    return imagePath;
  }
  
  // Normalize local paths
  let normalized = imagePath;
  
  // Ensure leading slash
  if (!normalized.startsWith('/')) {
    normalized = '/' + normalized;
  }
  
  // If it doesn't start with /uploads/, extract filename and prepend /uploads/
  if (!normalized.startsWith('/uploads/')) {
    const filename = normalized.split('/').pop();
    normalized = '/uploads/' + filename;
  }
  
  return normalized;
}

/**
 * Create a safe profile object with all fields mapped to form values.
 * This ensures consistent field access in templates.
 * 
 * @param {Object|null} profile - Profile object from database
 * @param {Object} values - Form values from POST (if any)
 * @returns {Object} Combined form values object
 */
function createFormValues(profile, values = {}) {
  const safeProfile = profile || {};
  
  const editDefaults = {
    // Personal Information
    first_name: safeValue(safeProfile.first_name),
    last_name: safeValue(safeProfile.last_name),
    email: safeValue(safeProfile.email),
    phone: safeValue(safeProfile.phone),
    city: safeValue(safeProfile.city),
    city_secondary: safeValue(safeProfile.city_secondary),
    
    // Bio
    bio: safeValue(safeProfile.bio_raw),
    bio_curated: safeValue(safeProfile.bio_curated),
    
    // Physical Profile
    height_cm: safeValue(safeProfile.height_cm),
    bust: safeValue(safeProfile.bust_cm),
    waist: safeValue(safeProfile.waist_cm),
    hips: safeValue(safeProfile.hips_cm),
    shoe_size: safeValue(safeProfile.shoe_size),
    eye_color: safeValue(safeProfile.eye_color),
    hair_color: safeValue(safeProfile.hair_color),
    hair_length: safeValue(safeProfile.hair_length),
    skin_tone: safeValue(safeProfile.skin_tone),
    gender: safeValue(safeProfile.gender),
    date_of_birth: safeValue(safeProfile.date_of_birth),
    age: safeValue(safeProfile.age),
    weight: safeValue(safeProfile.weight_lbs || safeProfile.weight_kg || null),
    weight_unit: safeValue(safeProfile.weight_unit || (safeProfile.weight_kg ? 'kg' : 'lbs') || 'lbs'),
    weight_kg: safeValue(safeProfile.weight_kg),
    weight_lbs: safeValue(safeProfile.weight_lbs),
    dress_size: safeValue(safeProfile.dress_size),
    
    // Experience & Training
    experience_level: safeValue(safeProfile.experience_level),
    experience_details: safeJsonValue(safeProfile.experience_details, '{}'),
    training: safeValue(safeProfile.training),
    
    // Skills & Lifestyle
    specialties: safeJsonValue(safeProfile.specialties, '[]'),
    languages: safeJsonValue(safeProfile.languages, '[]'),
    ethnicity: safeValue(safeProfile.ethnicity),
    tattoos: safeValue(safeProfile.tattoos),
    piercings: safeValue(safeProfile.piercings),
    
    // Comfort & Boundaries
    comfort_levels: safeJsonValue(safeProfile.comfort_levels, '[]'),
    
    // Availability & Locations
    availability_travel: safeValue(safeProfile.availability_travel),
    availability_schedule: safeValue(safeProfile.availability_schedule),
    
    // Social & Portfolio
    portfolio_url: safeValue(safeProfile.portfolio_url),
    instagram_handle: safeValue(safeProfile.instagram_handle),
    twitter_handle: safeValue(safeProfile.twitter_handle),
    tiktok_handle: safeValue(safeProfile.tiktok_handle),
    
    // Work Information
    work_eligibility: safeValue(safeProfile.work_eligibility),
    work_status: safeValue(safeProfile.work_status),
    union_membership: safeValue(safeProfile.union_membership),
    
    // References
    reference_name: safeValue(safeProfile.reference_name),
    reference_email: safeValue(safeProfile.reference_email),
    reference_phone: safeValue(safeProfile.reference_phone),
    
    // Emergency Contact
    emergency_contact_name: safeValue(safeProfile.emergency_contact_name),
    emergency_contact_phone: safeValue(safeProfile.emergency_contact_phone),
    emergency_contact_relationship: safeValue(safeProfile.emergency_contact_relationship),
    
    // Previous Representations
    previous_representations: safeJsonValue(safeProfile.previous_representations, '[]')
  };
  
  // Merge with form values (form values take precedence)
  return { ...editDefaults, ...values };
}

/**
 * Extract form value helper for templates.
 * Returns empty string for null/undefined values.
 * 
 * @param {Object} formValues - Form values object
 * @param {string} key - Field key to extract
 * @returns {string} Field value or empty string
 */
function valueFor(formValues, key) {
  const val = formValues[key];
  return (val !== null && val !== undefined) ? val : '';
}

module.exports = {
  safeValue,
  safeJsonValue,
  normalizeImagePath,
  createFormValues,
  valueFor
};