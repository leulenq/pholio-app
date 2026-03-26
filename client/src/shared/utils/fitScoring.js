/**
 * Fit Scoring Engine - Industry-Standard Modeling Assessments
 *
 * Calculates fit scores across 5 modeling categories based on industry standards:
 * - Runway: Height-dominant, high fashion proportions
 * - Editorial: Height + unique/striking proportions
 * - Commercial: Accessible, relatable proportions
 * - Lifestyle: Versatile, natural proportions
 * - Swim/Fitness: Athletic build, body composition
 *
 * Scoring Range: 0-100 per category
 *
 * Data-driven, transparent, and based on real casting requirements.
 */

const IN_PER_CM = 0.393701;

/**
 * Calculate comprehensive fit scores for all modeling categories
 *
 * @param {Object} profile - Profile data
 * @param {number} profile.height_cm - Height in centimeters
 * @param {number} profile.bust_cm - Bust measurement in cm
 * @param {number} profile.waist_cm - Waist measurement in cm
 * @param {number} profile.hips_cm - Hips measurement in cm
 * @param {string} profile.gender - Gender (optional, defaults to 'female')
 * @param {number} profile.weight_kg - Weight in kg (optional)
 * @returns {Object} Scores for each category (0-100)
 */
export function calculateFitScores(profile) {
  if (!profile) return getDefaultScores();

  const { height_cm, bust_cm, waist_cm, hips_cm, gender = 'female', weight_kg } = profile;

  // Require minimum data
  if (!height_cm || !waist_cm) {
    return getDefaultScores();
  }

  // Calculate ratios
  const ratios = calculateRatios(profile);

  // Calculate scores for each category
  const scores = {
    runway: calculateRunwayScore(profile, ratios),
    editorial: calculateEditorialScore(profile, ratios),
    commercial: calculateCommercialScore(profile, ratios),
    lifestyle: calculateLifestyleScore(profile, ratios),
    swimFitness: calculateSwimFitnessScore(profile, ratios)
  };

  return scores;
}

/**
 * Calculate body ratios for scoring
 */
function calculateRatios(profile) {
  const { height_cm, bust_cm, waist_cm, hips_cm, weight_kg, gender = 'female' } = profile;

  // Bust-to-waist ratio (BWR)
  const bustWaistRatio = bust_cm && waist_cm ? bust_cm / waist_cm : null;

  // Waist-to-hip ratio (WHR)
  const waistHipRatio = waist_cm && hips_cm ? waist_cm / hips_cm : null;

  // Hip-to-waist ratio (inverse of WHR)
  const hipWaistRatio = hips_cm && waist_cm ? hips_cm / waist_cm : null;

  // Body Mass Index (BMI) - if weight available
  const heightM = height_cm / 100;
  const bmi = weight_kg && heightM ? weight_kg / (heightM * heightM) : null;

  // Waist-to-height ratio (WHtR) - health indicator
  const waistHeightRatio = waist_cm && height_cm ? waist_cm / height_cm : null;

  // Calculate ideal proportions based on gender
  const idealRatios = getIdealRatios(gender);

  return {
    bustWaistRatio,
    waistHipRatio,
    hipWaistRatio,
    bmi,
    waistHeightRatio,
    idealRatios
  };
}

/**
 * Get ideal ratios based on gender and industry standards
 */
function getIdealRatios(gender) {
  if (gender === 'male') {
    return {
      waistHipRatio: 0.90, // V-taper ideal
      shoulderWaistRatio: 1.6, // Athletic build
      minHeight: 183, // 6'0"
      idealHeight: 188 // 6'2"
    };
  }

  // Female standards
  return {
    waistHipRatio: 0.70, // Classic hourglass
    bustWaistRatio: 1.3, // Balanced proportions
    minHeight: 175, // 5'9"
    idealHeight: 178 // 5'10"
  };
}

/**
 * Runway Score: Height-dominant, high fashion proportions
 *
 * Requirements:
 * - Women: 175-180cm (5'9"-5'11"), slender build
 * - Men: 183-193cm (6'0"-6'4"), lean athletic
 * - Narrow waist, long legs, striking presence
 */
function calculateRunwayScore(profile, ratios) {
  const { height_cm, waist_cm, gender = 'female' } = profile;
  let score = 0;

  // Height is PRIMARY factor for runway
  const heightScore = calculateHeightScore(height_cm, gender, 'runway');
  score += heightScore * 0.6; // 60% weight

  // Waist slenderness (runway requires narrow waist)
  if (waist_cm) {
    const idealWaist = gender === 'female' ? 63 : 78; // Industry standards
    const waistDeviation = Math.abs(waist_cm - idealWaist);
    const waistScore = Math.max(0, 100 - (waistDeviation * 4)); // -4 points per cm off
    score += waistScore * 0.3; // 30% weight
  }

  // Proportion elegance (waist-to-hip ratio)
  if (ratios.waistHipRatio) {
    const idealWHR = ratios.idealRatios.waistHipRatio;
    const whrDeviation = Math.abs(ratios.waistHipRatio - idealWHR);
    const proportionScore = Math.max(0, 100 - (whrDeviation * 100)); // Tight tolerance
    score += proportionScore * 0.1; // 10% weight
  }

  return Math.round(Math.min(100, score));
}

/**
 * Editorial Score: Height + unique/striking proportions
 *
 * Editorial values "interesting" over "perfect" - unique features,
 * striking proportions, photogenic angles. Height still matters but
 * uniqueness can compensate.
 */
function calculateEditorialScore(profile, ratios) {
  const { height_cm, bust_cm, waist_cm, hips_cm, gender = 'female' } = profile;
  let score = 0;

  // Height requirement (slightly more flexible than runway)
  const heightScore = calculateHeightScore(height_cm, gender, 'editorial');
  score += heightScore * 0.4; // 40% weight

  // Striking proportions (deviation from standard can be GOOD for editorial)
  if (ratios.waistHipRatio) {
    const deviation = Math.abs(ratios.waistHipRatio - ratios.idealRatios.waistHipRatio);

    // Editorial rewards both classic AND striking (high deviation)
    const strikingBonus = deviation > 0.15 ? 30 : 0; // Bonus for unique proportions
    const classicScore = Math.max(0, 100 - (deviation * 50));
    const proportionScore = Math.max(classicScore, 70 + strikingBonus);

    score += proportionScore * 0.3; // 30% weight
  }

  // Narrow waist creates dramatic angles (editorial loves drama)
  if (waist_cm) {
    const targetWaist = gender === 'female' ? 61 : 76;
    const narrownessScore = Math.max(0, 100 - Math.abs(waist_cm - targetWaist) * 3);
    score += narrownessScore * 0.3; // 30% weight
  }

  return Math.round(Math.min(100, score));
}

/**
 * Commercial Score: Accessible, relatable proportions
 *
 * Commercial modeling values "girl/boy next door" - relatable,
 * friendly, standard proportions. Height is less critical.
 * Think catalog, e-commerce, lifestyle brands.
 */
function calculateCommercialScore(profile, ratios) {
  const { height_cm, gender = 'female' } = profile;
  let score = 0;

  // Height: More flexible, but not too extreme
  const minHeight = gender === 'female' ? 165 : 175;
  const maxHeight = gender === 'female' ? 180 : 193;
  const idealHeight = gender === 'female' ? 172 : 183;

  let heightScore = 0;
  if (height_cm >= minHeight && height_cm <= maxHeight) {
    const deviation = Math.abs(height_cm - idealHeight);
    heightScore = Math.max(60, 100 - (deviation * 3)); // Gentle penalty
  } else {
    heightScore = 40; // Still possible outside range
  }
  score += heightScore * 0.2; // Only 20% weight

  // Classic proportions (commercial loves "standard" ratios)
  if (ratios.waistHipRatio) {
    const idealWHR = ratios.idealRatios.waistHipRatio;
    const deviation = Math.abs(ratios.waistHipRatio - idealWHR);
    const proportionScore = Math.max(0, 100 - (deviation * 70)); // Rewards close to ideal
    score += proportionScore * 0.5; // 50% weight - MOST important for commercial
  }

  // Balanced build (not too extreme in any direction)
  if (ratios.bustWaistRatio && ratios.hipWaistRatio) {
    const balanced = Math.abs(ratios.bustWaistRatio - ratios.hipWaistRatio) < 0.15;
    const balanceScore = balanced ? 100 : 70;
    score += balanceScore * 0.3; // 30% weight
  }

  return Math.round(Math.min(100, score));
}

/**
 * Lifestyle Score: Versatile, natural proportions
 *
 * Lifestyle modeling is the most accessible category - fitness wear,
 * casual brands, wellness, outdoor gear. Healthy appearance matters
 * more than specific measurements.
 */
function calculateLifestyleScore(profile, ratios) {
  const { height_cm, weight_kg, gender = 'female' } = profile;
  let score = 70; // Start with base score (most accessible)

  // Height: INVERSE weight - shorter can be better for lifestyle
  const minHeight = gender === 'female' ? 160 : 170;
  const maxHeight = gender === 'female' ? 178 : 188;

  if (height_cm >= minHeight && height_cm <= maxHeight) {
    score += 20; // Bonus for accessible height
  } else if (height_cm > maxHeight) {
    score -= 10; // Small penalty for too tall
  }

  // Healthy proportions (not extreme)
  if (ratios.waistHeightRatio) {
    const healthyWHtR = ratios.waistHeightRatio >= 0.35 && ratios.waistHeightRatio <= 0.45;
    score += healthyWHtR ? 10 : -5;
  }

  // BMI in healthy range (if available)
  if (ratios.bmi) {
    const healthyBMI = ratios.bmi >= 18.5 && ratios.bmi <= 24.9;
    score += healthyBMI ? 10 : 0;
  }

  return Math.round(Math.min(100, Math.max(0, score)));
}

/**
 * Swim/Fitness Score: Athletic build, muscle tone indicators
 *
 * Requires athletic proportions, low body fat indicators,
 * and balanced musculature. Height less important than build.
 */
function calculateSwimFitnessScore(profile, ratios) {
  const { height_cm, waist_cm, weight_kg, gender = 'female' } = profile;
  let score = 0;

  // Low waist circumference (indicates low body fat)
  if (waist_cm) {
    const athleticWaist = gender === 'female' ? 66 : 81;
    const waistDeviation = Math.abs(waist_cm - athleticWaist);
    const waistScore = Math.max(0, 100 - (waistDeviation * 2.5));
    score += waistScore * 0.4; // 40% weight
  }

  // Waist-to-height ratio (athletic indicator)
  if (ratios.waistHeightRatio) {
    const athleticWHtR = gender === 'female' ? 0.38 : 0.43;
    const deviation = Math.abs(ratios.waistHeightRatio - athleticWHtR);
    const whtRScore = Math.max(0, 100 - (deviation * 200));
    score += whtRScore * 0.3; // 30% weight
  }

  // BMI in athletic range (if available)
  if (ratios.bmi) {
    const athleticBMI = gender === 'female'
      ? (ratios.bmi >= 18.5 && ratios.bmi <= 22)
      : (ratios.bmi >= 20 && ratios.bmi <= 24);
    const bmiScore = athleticBMI ? 100 : 60;
    score += bmiScore * 0.2; // 20% weight
  }

  // Hip-to-waist ratio (athletic build)
  if (ratios.hipWaistRatio) {
    const athleticRatio = gender === 'female' ? 1.3 : 1.1;
    const deviation = Math.abs(ratios.hipWaistRatio - athleticRatio);
    const ratioScore = Math.max(0, 100 - (deviation * 50));
    score += ratioScore * 0.1; // 10% weight
  }

  return Math.round(Math.min(100, Math.max(0, score)));
}

/**
 * Height scoring helper - category-specific
 */
function calculateHeightScore(height_cm, gender, category) {
  const standards = {
    runway: {
      female: { min: 175, ideal: 178, max: 183 },
      male: { min: 183, ideal: 188, max: 196 }
    },
    editorial: {
      female: { min: 172, ideal: 178, max: 185 },
      male: { min: 180, ideal: 188, max: 198 }
    }
  };

  const std = standards[category]?.[gender];
  if (!std) return 50; // Default

  if (height_cm < std.min) {
    // Below minimum - harsh penalty
    const deficit = std.min - height_cm;
    return Math.max(0, 50 - (deficit * 5));
  } else if (height_cm > std.max) {
    // Above maximum - moderate penalty
    const excess = height_cm - std.max;
    return Math.max(60, 100 - (excess * 3));
  } else {
    // Within range - score based on proximity to ideal
    const deviation = Math.abs(height_cm - std.ideal);
    return Math.max(80, 100 - (deviation * 4));
  }
}

/**
 * Default scores when insufficient data
 */
function getDefaultScores() {
  return {
    runway: 0,
    editorial: 0,
    commercial: 0,
    lifestyle: 0,
    swimFitness: 0
  };
}

/**
 * Get category insights and explanations
 *
 * @param {Object} scores - Calculated fit scores
 * @param {Object} profile - Profile data
 * @returns {Object} Category-specific insights
 */
export function getCategoryInsights(scores, profile) {
  const { height_cm, gender = 'female' } = profile;

  return {
    runway: {
      score: scores.runway,
      title: 'Runway',
      description: 'High fashion, catwalk, designer shows',
      insight: getRunwayInsight(scores.runway, height_cm, gender),
      strength: scores.runway >= 70 ? 'strong' : scores.runway >= 50 ? 'moderate' : 'developing'
    },
    editorial: {
      score: scores.editorial,
      title: 'Editorial',
      description: 'Magazine spreads, artistic photography',
      insight: getEditorialInsight(scores.editorial, height_cm, gender),
      strength: scores.editorial >= 70 ? 'strong' : scores.editorial >= 50 ? 'moderate' : 'developing'
    },
    commercial: {
      score: scores.commercial,
      title: 'Commercial',
      description: 'Catalog, e-commerce, mainstream brands',
      insight: getCommercialInsight(scores.commercial, profile),
      strength: scores.commercial >= 70 ? 'strong' : scores.commercial >= 50 ? 'moderate' : 'developing'
    },
    lifestyle: {
      score: scores.lifestyle,
      title: 'Lifestyle',
      description: 'Wellness, fitness wear, outdoor brands',
      insight: getLifestyleInsight(scores.lifestyle, profile),
      strength: scores.lifestyle >= 70 ? 'strong' : scores.lifestyle >= 50 ? 'moderate' : 'developing'
    },
    swimFitness: {
      score: scores.swimFitness,
      title: 'Swim/Fitness',
      description: 'Athletic wear, swimwear, sports brands',
      insight: getSwimFitnessInsight(scores.swimFitness, profile),
      strength: scores.swimFitness >= 70 ? 'strong' : scores.swimFitness >= 50 ? 'moderate' : 'developing'
    }
  };
}

function getRunwayInsight(score, height_cm, gender) {
  const minHeight = gender === 'female' ? 175 : 183;
  if (height_cm < minHeight) {
    return `Height below runway minimum (${minHeight}cm). Consider editorial or commercial.`;
  }
  if (score >= 80) return 'Excellent runway potential. Strong fit for high fashion.';
  if (score >= 60) return 'Good runway fit. Competitive for designer shows.';
  return 'Developing runway profile. Focus on building portfolio.';
}

function getEditorialInsight(score, height_cm, gender) {
  if (score >= 80) return 'Strong editorial presence. Your proportions photograph well.';
  if (score >= 60) return 'Good editorial potential. Unique features are assets.';
  return 'Build your editorial portfolio with test shoots.';
}

function getCommercialInsight(score, profile) {
  if (score >= 80) return 'Excellent commercial fit. Highly relatable appeal.';
  if (score >= 60) return 'Strong commercial potential. Great for catalog work.';
  return 'Good foundations for commercial modeling.';
}

function getLifestyleInsight(score, profile) {
  if (score >= 70) return 'Perfect for lifestyle brands. Accessible and authentic.';
  return 'Strong lifestyle potential. Focus on wellness and outdoor brands.';
}

function getSwimFitnessInsight(score, profile) {
  if (score >= 75) return 'Athletic build ideal for fitness and swimwear.';
  if (score >= 55) return 'Good fitness potential. Build muscle definition.';
  return 'Developing athletic profile. Focus on fitness training.';
}

/**
 * Get top 3 categories for a profile
 */
export function getTopCategories(scores) {
  const categories = [
    { key: 'runway', score: scores.runway, label: 'Runway' },
    { key: 'editorial', score: scores.editorial, label: 'Editorial' },
    { key: 'commercial', score: scores.commercial, label: 'Commercial' },
    { key: 'lifestyle', score: scores.lifestyle, label: 'Lifestyle' },
    { key: 'swimFitness', score: scores.swimFitness, label: 'Swim/Fitness' }
  ];

  return categories
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

/**
 * Calculate overall casting readiness score
 * Weighted average of all category scores with emphasis on versatility
 *
 * @param {Object} scores - All category scores
 * @returns {number} Overall readiness score (0-100)
 */
export function calculateOverallReadiness(scores) {
  // Weighted approach:
  // - Top category (highest score): 30%
  // - Average of all categories: 50%
  // - Versatility bonus (how many categories >60): 20%

  const allScores = [
    scores.runway,
    scores.editorial,
    scores.commercial,
    scores.lifestyle,
    scores.swimFitness
  ];

  // Top category weight
  const topScore = Math.max(...allScores);
  const topWeight = topScore * 0.3;

  // Average weight
  const average = allScores.reduce((sum, score) => sum + score, 0) / allScores.length;
  const avgWeight = average * 0.5;

  // Versatility bonus (count categories scoring >60)
  const strongCategories = allScores.filter(score => score >= 60).length;
  const versatilityBonus = (strongCategories / allScores.length) * 100 * 0.2;

  // Calculate final score
  const readiness = Math.round(topWeight + avgWeight + versatilityBonus);

  // Ensure between 0-100
  return Math.max(0, Math.min(100, readiness));
}
