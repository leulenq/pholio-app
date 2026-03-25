/**
 * portfolioGapAnalysis.js
 * Analyzes a talent's portfolio images to identify missing standard agency requirements.
 */

// The "Gold Standard" Book Checklist
const STANDARD_CHECKLIST = [
  {
    id: 'headshot',
    label: 'Clean Headshot',
    description: 'Face forward, neutral expression, minimal makeup.',
    tags: ['Headshot', 'Beauty', 'Polaroid', 'Face']
  },
  {
    id: 'fullbody',
    label: 'Full Body Shot',
    description: 'Shows your proportions and physique clearly.',
    tags: ['Full Body', 'Body', 'Fitness', 'Swim']
  },
  {
    id: 'side_profile',
    label: 'Side Profile',
    description: 'Profile view of your face (left or right).',
    tags: ['Side Profile', 'Profile', 'Lateral']
  },
  {
    id: 'smile',
    label: 'Smile / Commercial',
    description: 'Warm, approachable smile showing teeth.',
    tags: ['Smile', 'Commercial', 'Lifestyle', 'Happy']
  },
  {
    id: 'editorial',
    label: 'Editorial / Creative',
    description: 'High-fashion or styled creative work.',
    tags: ['Editorial', 'Fashion', 'Creative', 'Studio']
  }
];

// Helper to check if an image matches any of the required tags (case-insensitive)
function imageHasTag(image, tagList) {
  if (!image || !image.metadata || !Array.isArray(image.metadata.tags)) return false;
  return image.metadata.tags.some(t => 
    tagList.some(reqTag => reqTag.toLowerCase() === t.toLowerCase())
  );
}

/**
 * Analyzes the current set of images against the standard checklist.
 * @param {Array} images - Array of image objects from the DB
 * @returns {Object} result - { checks, score, missingCount }
 */
export function analyzePortfolio(images = []) {
  const checks = STANDARD_CHECKLIST.map(item => {
    // Check if any image in the portfolio meets this requirement
    const met = images.some(img => imageHasTag(img, item.tags));
    return {
      ...item,
      met
    };
  });

  // Calculate generic checks
  const minCountMet = images.length >= 5;
  checks.unshift({
    id: 'min_count',
    label: 'At least 5 photos',
    description: 'Agencies need to see variety.',
    met: minCountMet,
    tags: [] // Logic check, not tag check
  });

  const metCount = checks.filter(c => c.met).length;
  const score = Math.round((metCount / checks.length) * 100);

  return {
    checks,
    score,
    missingCount: checks.length - metCount,
    isComplete: score === 100
  };
}
