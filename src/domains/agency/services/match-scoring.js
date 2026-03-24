/**
 * Match Scoring Algorithm
 * Calculates match scores (0-100) for profiles against board requirements
 */

/**
 * Calculate match score for a profile against a board
 * @param {Object} profile - Profile object with all fields
 * @param {Object} board - Board object with requirements and weights
 * @returns {Object} { score: 0-100, passed: boolean, details: Object }
 */
function calculateMatchScore(profile, board) {
  const { requirements, scoring_weights: weights } = board;
  
  // Hard filters first
  const hardFilterResult = passesHardFilters(profile, requirements);
  if (!hardFilterResult.passed) {
    return { 
      score: 0, 
      passed: false, 
      details: { 
        reason: hardFilterResult.reason,
        ...hardFilterResult.details 
      } 
    };
  }

  // Weighted scoring
  let totalWeightedScore = 0;
  let totalWeight = 0;
  const details = {};

  // Age scoring
  if (weights.age_weight > 0) {
    const ageScore = scoreAge(profile, requirements);
    details.age = { score: ageScore, weight: weights.age_weight };
    totalWeightedScore += ageScore * weights.age_weight;
    totalWeight += weights.age_weight;
  }

  // Height scoring
  if (weights.height_weight > 0) {
    const heightScore = scoreHeight(profile, requirements);
    details.height = { score: heightScore, weight: weights.height_weight };
    totalWeightedScore += heightScore * weights.height_weight;
    totalWeight += weights.height_weight;
  }

  // Measurements scoring
  if (weights.measurements_weight > 0) {
    const measurementsScore = scoreMeasurements(profile, requirements);
    details.measurements = { score: measurementsScore, weight: weights.measurements_weight };
    totalWeightedScore += measurementsScore * weights.measurements_weight;
    totalWeight += weights.measurements_weight;
  }

  // Body type scoring
  if (weights.body_type_weight > 0) {
    const bodyTypeScore = scoreBodyType(profile, requirements);
    details.body_type = { score: bodyTypeScore, weight: weights.body_type_weight };
    totalWeightedScore += bodyTypeScore * weights.body_type_weight;
    totalWeight += weights.body_type_weight;
  }

  // Comfort scoring
  if (weights.comfort_weight > 0) {
    const comfortScore = scoreComfort(profile, requirements);
    details.comfort = { score: comfortScore, weight: weights.comfort_weight };
    totalWeightedScore += comfortScore * weights.comfort_weight;
    totalWeight += weights.comfort_weight;
  }

  // Experience scoring
  if (weights.experience_weight > 0) {
    const experienceScore = scoreExperience(profile, requirements);
    details.experience = { score: experienceScore, weight: weights.experience_weight };
    totalWeightedScore += experienceScore * weights.experience_weight;
    totalWeight += weights.experience_weight;
  }

  // Skills scoring
  if (weights.skills_weight > 0) {
    const skillsScore = scoreSkills(profile, requirements);
    details.skills = { score: skillsScore, weight: weights.skills_weight };
    totalWeightedScore += skillsScore * weights.skills_weight;
    totalWeight += weights.skills_weight;
  }

  // Location scoring
  if (weights.location_weight > 0) {
    const locationScore = scoreLocation(profile, requirements);
    details.location = { score: locationScore, weight: weights.location_weight };
    totalWeightedScore += locationScore * weights.location_weight;
    totalWeight += weights.location_weight;
  }

  // Social reach scoring
  if (weights.social_reach_weight > 0) {
    const socialScore = scoreSocialReach(profile, requirements);
    details.social_reach = { score: socialScore, weight: weights.social_reach_weight };
    totalWeightedScore += socialScore * weights.social_reach_weight;
    totalWeight += weights.social_reach_weight;
  }

  // Calculate final score
  const finalScore = totalWeight > 0 
    ? Math.round((totalWeightedScore / totalWeight) * 100)
    : 0;

  return { 
    score: Math.max(0, Math.min(100, finalScore)), 
    passed: true, 
    details 
  };
}

/**
 * Check if profile passes hard filters
 * Hard filters: age range, height range, gender, critical comfort levels
 */
function passesHardFilters(profile, requirements) {
  const details = {};

  // Age filter
  if (requirements.min_age !== null || requirements.max_age !== null) {
    const age = profile.age || calculateAge(profile.date_of_birth);
    if (age === null || age === undefined) {
      return { passed: false, reason: 'Missing age', details: { age: 'missing' } };
    }
    if (requirements.min_age !== null && age < requirements.min_age) {
      return { passed: false, reason: 'Age below minimum', details: { age: `Age ${age} < ${requirements.min_age}` } };
    }
    if (requirements.max_age !== null && age > requirements.max_age) {
      return { passed: false, reason: 'Age above maximum', details: { age: `Age ${age} > ${requirements.max_age}` } };
    }
  }

  // Height filter
  if (requirements.min_height_cm !== null || requirements.max_height_cm !== null) {
    const height = profile.height_cm;
    if (!height) {
      return { passed: false, reason: 'Missing height', details: { height: 'missing' } };
    }
    if (requirements.min_height_cm !== null && height < requirements.min_height_cm) {
      return { passed: false, reason: 'Height below minimum', details: { height: `${height}cm < ${requirements.min_height_cm}cm` } };
    }
    if (requirements.max_height_cm !== null && height > requirements.max_height_cm) {
      return { passed: false, reason: 'Height above maximum', details: { height: `${height}cm > ${requirements.max_height_cm}cm` } };
    }
  }

  // Gender filter
  if (requirements.genders) {
    const genders = Array.isArray(requirements.genders) ? requirements.genders : JSON.parse(requirements.genders || '[]');
    if (genders.length > 0 && profile.gender && !genders.includes(profile.gender)) {
      return { passed: false, reason: 'Gender mismatch', details: { gender: `Profile: ${profile.gender}, Required: ${genders.join(', ')}` } };
    }
  }

  // Critical comfort levels (if social_reach_importance is 'critical')
  if (requirements.social_reach_importance === 'critical' && requirements.comfort_levels) {
    const requiredComfort = Array.isArray(requirements.comfort_levels) 
      ? requirements.comfort_levels 
      : JSON.parse(requirements.comfort_levels || '[]');
    const profileComfort = Array.isArray(profile.comfort_levels) 
      ? profile.comfort_levels 
      : JSON.parse(profile.comfort_levels || '[]');
    
    if (requiredComfort.length > 0) {
      const hasAllRequired = requiredComfort.every(req => profileComfort.includes(req));
      if (!hasAllRequired) {
        return { passed: false, reason: 'Missing critical comfort levels', details: { comfort: 'missing_required' } };
      }
    }
  }

  return { passed: true, details };
}

/**
 * Score age (0-100%)
 */
function scoreAge(profile, requirements) {
  if (requirements.min_age === null && requirements.max_age === null) {
    return 100; // No requirement = 100%
  }

  const age = profile.age || calculateAge(profile.date_of_birth);
  if (!age) return 0;

  if (requirements.min_age !== null && age < requirements.min_age) return 0;
  if (requirements.max_age !== null && age > requirements.max_age) return 0;

  return 100; // Within range = 100%
}

/**
 * Score height (0-100%) with linear falloff outside range
 */
function scoreHeight(profile, requirements) {
  if (requirements.min_height_cm === null && requirements.max_height_cm === null) {
    return 100;
  }

  const height = profile.height_cm;
  if (!height) return 0;

  // Within range = 100%
  const withinRange = (!requirements.min_height_cm || height >= requirements.min_height_cm) &&
                      (!requirements.max_height_cm || height <= requirements.max_height_cm);
  
  if (withinRange) return 100;

  // Linear falloff (10% penalty per cm outside range)
  let penalty = 0;
  if (requirements.min_height_cm && height < requirements.min_height_cm) {
    penalty = (requirements.min_height_cm - height) * 10;
  } else if (requirements.max_height_cm && height > requirements.max_height_cm) {
    penalty = (height - requirements.max_height_cm) * 10;
  }

  return Math.max(0, 100 - penalty);
}

/**
 * Score measurements (average of bust/waist/hips)
 */
function scoreMeasurements(profile, requirements) {
  const scores = [];
  
  // Bust
  if (requirements.min_bust !== null || requirements.max_bust !== null) {
    const bust = parseFloat(profile.bust_cm) || 0;
    if (bust === 0) {
      scores.push(0);
    } else {
      const withinRange = (!requirements.min_bust || bust >= requirements.min_bust) &&
                          (!requirements.max_bust || bust <= requirements.max_bust);
      scores.push(withinRange ? 100 : 0);
    }
  }

  // Waist
  if (requirements.min_waist !== null || requirements.max_waist !== null) {
    const waist = parseFloat(profile.waist_cm) || 0;
    if (waist === 0) {
      scores.push(0);
    } else {
      const withinRange = (!requirements.min_waist || waist >= requirements.min_waist) &&
                          (!requirements.max_waist || waist <= requirements.max_waist);
      scores.push(withinRange ? 100 : 0);
    }
  }

  // Hips
  if (requirements.min_hips !== null || requirements.max_hips !== null) {
    const hips = parseFloat(profile.hips_cm) || 0;
    if (hips === 0) {
      scores.push(0);
    } else {
      const withinRange = (!requirements.min_hips || hips >= requirements.min_hips) &&
                          (!requirements.max_hips || hips <= requirements.max_hips);
      scores.push(withinRange ? 100 : 0);
    }
  }

  if (scores.length === 0) return 100; // No requirements
  return scores.reduce((a, b) => a + b, 0) / scores.length;
}

/**
 * Score body type (100% if matches, 0% if not)
 */
function scoreBodyType(profile, requirements) {
  if (!requirements.body_types) return 100;
  
  const requiredTypes = Array.isArray(requirements.body_types) 
    ? requirements.body_types 
    : JSON.parse(requirements.body_types || '[]');
  
  if (requiredTypes.length === 0) return 100;
  if (!profile.body_type) return 0;
  
  return requiredTypes.includes(profile.body_type) ? 100 : 0;
}

/**
 * Score comfort levels (percentage of required levels met)
 */
function scoreComfort(profile, requirements) {
  if (!requirements.comfort_levels) return 100;
  
  const required = Array.isArray(requirements.comfort_levels) 
    ? requirements.comfort_levels 
    : JSON.parse(requirements.comfort_levels || '[]');
  
  if (required.length === 0) return 100;
  
  const profileComfort = Array.isArray(profile.comfort_levels) 
    ? profile.comfort_levels 
    : JSON.parse(profile.comfort_levels || '[]');
  
  if (profileComfort.length === 0) return 0;
  
  const matches = required.filter(req => profileComfort.includes(req)).length;
  return (matches / required.length) * 100;
}

/**
 * Score experience level
 */
function scoreExperience(profile, requirements) {
  if (!requirements.experience_levels) return 100;
  
  const required = Array.isArray(requirements.experience_levels) 
    ? requirements.experience_levels 
    : JSON.parse(requirements.experience_levels || '[]');
  
  if (required.length === 0) return 100;
  if (!profile.experience_level) return 0;
  
  return required.includes(profile.experience_level) ? 100 : 0;
}

/**
 * Score skills (percentage of required skills present)
 */
function scoreSkills(profile, requirements) {
  if (!requirements.skills) return 100;
  
  const required = Array.isArray(requirements.skills) 
    ? requirements.skills 
    : JSON.parse(requirements.skills || '[]');
  
  if (required.length === 0) return 100;
  
  const profileSkills = Array.isArray(profile.skills) 
    ? profile.skills 
    : JSON.parse(profile.skills || '[]');
  
  if (profileSkills.length === 0) return 0;
  
  const matches = required.filter(req => profileSkills.includes(req)).length;
  return (matches / required.length) * 100;
}

/**
 * Score location (100% if matches primary/secondary city, 0% if not)
 */
function scoreLocation(profile, requirements) {
  if (!requirements.locations) return 100;
  
  const required = Array.isArray(requirements.locations) 
    ? requirements.locations 
    : JSON.parse(requirements.locations || '[]');
  
  if (required.length === 0) return 100;
  
  const profileCity = profile.city || '';
  const profileSecondaryCity = profile.city_secondary || '';
  
  const matches = required.some(req => 
    profileCity.toLowerCase().includes(req.toLowerCase()) ||
    profileSecondaryCity.toLowerCase().includes(req.toLowerCase())
  );
  
  return matches ? 100 : 0;
}

/**
 * Score social reach (linear scale based on follower count vs. minimum)
 */
function scoreSocialReach(profile, requirements) {
  if (requirements.min_social_reach === null) return 100;
  
  // Get social reach from profile (sum of Instagram/TikTok followers if available)
  // For now, assume we have a social_reach field or calculate from handles
  const socialReach = profile.social_reach || 0;
  
  if (socialReach === 0) return 0;
  if (socialReach >= requirements.min_social_reach) return 100;
  
  // Linear scale: if 50% of minimum, score = 50%
  return Math.round((socialReach / requirements.min_social_reach) * 100);
}

/**
 * Calculate age from date of birth
 */
function calculateAge(dateOfBirth) {
  if (!dateOfBirth) return null;
  
  const birthDate = new Date(dateOfBirth);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  
  return age;
}

module.exports = {
  calculateMatchScore,
  passesHardFilters,
  scoreAge,
  scoreHeight,
  scoreMeasurements,
  scoreBodyType,
  scoreComfort,
  scoreExperience,
  scoreSkills,
  scoreLocation,
  scoreSocialReach
};

