/**
 * Profile helper functions
 */

/**
 * Calculate age from date of birth
 * @param {Date|string} dateOfBirth - Date of birth
 * @returns {number|null} Age in years, or null if invalid
 */
function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  
  try {
    const birthDate = new Date(dateOfBirth);
    if (isNaN(birthDate.getTime())) return null;
    
    const today = new Date();
    let age = today.getFullYear() - birthDate.getFullYear();
    const monthDiff = today.getMonth() - birthDate.getMonth();
    
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
      age--;
    }
    
    return age;
  } catch (error) {
    console.error('[calculateAge] Error calculating age:', error);
    return null;
  }
}

/**
 * Parse social media handle from various formats
 * @param {string} handle - Handle in various formats (@username, username, etc.)
 * @returns {string} Cleaned handle (username without @)
 */
function parseSocialMediaHandle(handle) {
  if (!handle || typeof handle !== 'string') return '';
  
  // Remove @ if present
  let cleaned = handle.trim().replace(/^@/, '');
  
  // Remove any URLs
  cleaned = cleaned.replace(/^https?:\/\//i, '');
  cleaned = cleaned.replace(/^www\./i, '');
  cleaned = cleaned.replace(/^(instagram|twitter|tiktok)\.com\//i, '');
  cleaned = cleaned.replace(/^@/, ''); // Remove @ again in case it was in URL
  
  // Get just the username part (before any / or ?)
  cleaned = cleaned.split('/')[0].split('?')[0].trim();
  
  return cleaned;
}

/**
 * Generate full social media URL from handle
 * @param {string} platform - Platform name ('instagram', 'twitter', 'tiktok')
 * @param {string} handle - Handle (with or without @)
 * @returns {string|null} Full URL or null if invalid
 */
function generateSocialMediaUrl(platform, handle) {
  if (!handle || !platform) return null;
  
  const cleanedHandle = parseSocialMediaHandle(handle);
  if (!cleanedHandle) return null;
  
  const platformUrls = {
    instagram: 'https://instagram.com',
    twitter: 'https://twitter.com',
    tiktok: 'https://tiktok.com'
  };
  
  const baseUrl = platformUrls[platform.toLowerCase()];
  if (!baseUrl) return null;
  
  return `${baseUrl}/${cleanedHandle}`;
}

/**
 * Format languages array for display
 * @param {string|array} languages - Languages as JSON string or array
 * @returns {string} Formatted languages string
 */
function formatLanguages(languages) {
  if (!languages) return '';
  
  try {
    let langArray = languages;
    if (typeof languages === 'string') {
      langArray = JSON.parse(languages);
    }
    
    if (Array.isArray(langArray)) {
      return langArray.join(', ');
    }
    
    return String(languages);
  } catch (error) {
    // If it's not JSON, return as is
    return String(languages);
  }
}

/**
 * Format availability for display
 * @param {boolean|null} travel - Willingness to travel
 * @param {string|null} schedule - Schedule availability
 * @returns {string} Formatted availability string
 */
function formatAvailability(travel, schedule) {
  const parts = [];
  
  if (schedule) {
    parts.push(schedule);
  }
  
  if (travel === true) {
    parts.push('Willing to travel');
  } else if (travel === false) {
    parts.push('Local only');
  }
  
  return parts.join(' • ') || '';
}

/**
 * Convert weight from kg to lbs
 * @param {number} kg - Weight in kilograms
 * @returns {number} Weight in pounds
 */
function convertKgToLbs(kg) {
  if (!kg || isNaN(kg)) return null;
  return Math.round((kg * 2.20462) * 10) / 10; // Round to 1 decimal place
}

/**
 * Convert weight from lbs to kg
 * @param {number} lbs - Weight in pounds
 * @returns {number} Weight in kilograms
 */
function convertLbsToKg(lbs) {
  if (!lbs || isNaN(lbs)) return null;
  return Math.round((lbs / 2.20462) * 10) / 10; // Round to 1 decimal place
}

/**
 * Convert cm to feet and inches string
 * @param {number} cm - Height in cm
 * @returns {string} Height string (e.g. 5' 10")
 */
function toFeetInches(cm) {
  if (!cm || isNaN(cm)) return '';
  const realFeet = (cm * 0.393700) / 12;
  const feet = Math.floor(realFeet);
  const inches = Math.round((realFeet - feet) * 12);
  // Handle edge case where rounding inches bumps to next foot (e.g. 5' 12" -> 6' 0")
  if (inches === 12) {
    return `${feet + 1}' 0"`;
  }
  return `${feet}' ${inches}"`;
}

module.exports = {
  calculateAge,
  parseSocialMediaHandle,
  generateSocialMediaUrl,
  formatLanguages,
  formatAvailability,
  convertKgToLbs,
  convertLbsToKg,
  toFeetInches
};

