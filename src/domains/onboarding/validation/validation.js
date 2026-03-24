/**
 * Onboarding validation helpers
 */

const { onboardingSubmitSchema } = require("../../../lib/validation");

// Minimum photos required for profile submission
const ONBOARDING_MIN_PHOTOS = 6;

/**
 * Validates if a profile can be submitted
 * Checks required fields and minimum photo count
 *
 * @param {Object|null} profile - Profile object from database
 * @param {Array} images - Array of image objects
 * @returns {Object} Validation result with:
 *   - ok: boolean - true if profile can be submitted
 *   - missing_fields: string[] - Array of missing required field names
 *   - photo_count: number - Current number of photos
 *   - min_photos: number - Minimum photos required
 */
function canSubmitProfile(profile, images = []) {
  if (!profile) {
    return {
      ok: false,
      missing_fields: ["profile"],
      photo_count: 0,
      min_photos: ONBOARDING_MIN_PHOTOS,
    };
  }

  const imagesArray = Array.isArray(images) ? images : [];
  const photoCount = imagesArray.length;

  // Helper: Check if a value is truly present (not null, undefined, or empty string)
  const hasValue = (val) => {
    if (val === null || val === undefined || val === "") return false;
    // For numbers, check that they're greater than 0 (0 is not a valid measurement)
    if (typeof val === "number" && val <= 0) return false;
    return true;
  };

  // Required fields for submission (based on onboardingSubmitSchema)
  const requiredFields = [
    { key: "first_name", label: "First name" },
    { key: "last_name", label: "Last name" },
    { key: "city", label: "City" },
    { key: "phone", label: "Phone" },
    { key: "height_cm", label: "Height" },
    { key: "bust", label: "Bust" },
    { key: "waist", label: "Waist" },
    { key: "hips", label: "Hips" },
    { key: "bio_raw", label: "Bio" }, // Check bio_raw, not bio (bio is processed field)
  ];

  const missingFields = requiredFields
    .filter((field) => !hasValue(profile[field.key]))
    .map((field) => field.label);

  // Check photo count
  const hasEnoughPhotos = photoCount >= ONBOARDING_MIN_PHOTOS;

  return {
    ok: missingFields.length === 0 && hasEnoughPhotos,
    missing_fields: missingFields,
    photo_count: photoCount,
    min_photos: ONBOARDING_MIN_PHOTOS,
    has_enough_photos: hasEnoughPhotos,
  };
}

module.exports = {
  canSubmitProfile,
  ONBOARDING_MIN_PHOTOS,
};
