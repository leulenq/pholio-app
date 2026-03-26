/**
 * Client-side profile strength (mirrors server `src/domains/talent/services/profile-strength.js`).
 * Kept in the SPA so Vite can bundle without importing Node/CommonJS server modules.
 */

/** DOM section ids on the talent profile page (scroll targets). */
export const PROFILE_STRENGTH_SCROLL_TARGETS = {
  name: 'identity',
  city: 'identity',
  dob: 'identity',
  gender: 'identity',
  height: 'appearance',
  measurements: 'appearance',
  photo: 'photos-tab',
  bio: 'identity',
  weight: 'appearance',
  appearance: 'appearance',
  shoe: 'appearance',
  skin: 'appearance',
  status: 'roles',
  exp: 'credits',
  training: 'training',
  social: 'socials',
  emergency: 'contact',
};

export const calculateProfileStrength = (data) => {
  const emptyCompletion = {
    name: false,
    city: false,
    dob: false,
    gender: false,
    height: false,
    measurements: false,
    photo: false,
    bio: false,
    weight: false,
    appearance: false,
    shoe: false,
    skin: false,
    status: false,
    exp: false,
    training: false,
    social: false,
    emergency: false,
  };

  if (!data) {
    return {
      score: 0,
      requiredScore: 0,
      improveScore: 0,
      isRequiredComplete: false,
      isCoreReady: false,
      missingCoreItems: [],
      nextSteps: [],
      allNextSteps: [],
      fieldCompletion: emptyCompletion,
      scrollTargetByKey: PROFILE_STRENGTH_SCROLL_TARGETS,
    };
  }

  let requiredScore = 0;
  let improveScore = 0;
  const missingFields = [];

  const isPresent = (val) => {
    if (val === null || val === undefined || val === '') return false;
    if (typeof val === 'string') return val.trim() !== '';
    return true;
  };

  const parseJSON = (val) => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    try {
      if (typeof val === 'string' && (val.startsWith('[') || val.startsWith('{'))) {
        return JSON.parse(val);
      }
      return val;
    } catch {
      return [];
    }
  };

  const hasName = isPresent(data.first_name) && isPresent(data.last_name);
  const hasCity = isPresent(data.city) && String(data.city).trim() !== 'Not specified';
  const hasDOB = isPresent(data.date_of_birth) || isPresent(data.dob);
  const hasGender = isPresent(data.gender);

  if (hasName) requiredScore += 8;
  else missingFields.push({ label: 'Legal Name', impact: 'Critical', link: '/dashboard/talent/profile?tab=details', points: 8, tier: 'Required' });

  if (hasCity) requiredScore += 4;
  else missingFields.push({ label: 'Home City', impact: 'Critical', link: '/dashboard/talent/profile?tab=details', points: 4, tier: 'Required' });

  if (hasDOB) requiredScore += 4;
  else missingFields.push({ label: 'Birth Date', impact: 'Critical', link: '/dashboard/talent/profile?tab=details', points: 4, tier: 'Required' });

  if (hasGender) requiredScore += 4;
  else missingFields.push({ label: 'Gender', impact: 'Critical', link: '/dashboard/talent/profile?tab=details', points: 4, tier: 'Required' });

  const hasHeight = isPresent(data.height_cm) && Number(data.height_cm) > 0;
  const hasMeasurements = (isPresent(data.bust) || isPresent(data.bust_cm) || isPresent(data.chest)) &&
    (isPresent(data.waist) || isPresent(data.waist_cm)) &&
    (isPresent(data.hips) || isPresent(data.hips_cm));

  if (hasHeight) requiredScore += 10;
  else missingFields.push({ label: 'Height', impact: 'Critical', link: '/dashboard/talent/profile?tab=physical', points: 10, tier: 'Required' });

  if (hasMeasurements) requiredScore += 15;
  else missingFields.push({ label: 'Measurements (Bust/Waist/Hips)', impact: 'Critical', link: '/dashboard/talent/profile?tab=physical', points: 15, tier: 'Required' });

  const hasGalleryImage = Array.isArray(data.images) && data.images.length > 0;
  const hasHeadshot =
    isPresent(data.primary_photo_id) ||
    (data.images && data.images.some((img) => img.is_primary || img.isPrimary)) ||
    isPresent(data.hero_image_path) ||
    hasGalleryImage;
  if (hasHeadshot) requiredScore += 15;
  else missingFields.push({ label: 'Primary Photo', impact: 'Critical', link: '/dashboard/talent/profile?tab=photos', points: 15, tier: 'Required' });

  const bioSource = data.bio ?? data.bio_raw ?? '';
  const bioLength = String(bioSource).trim().length;
  const hasBio = bioLength > 50;
  const hasPronouns = isPresent(data.pronouns);
  if (hasBio) improveScore += 7;
  else missingFields.push({ label: 'Professional Bio', impact: 'Medium', link: '/dashboard/talent/profile?tab=details', points: 7, tier: 'Improve' });
  if (hasPronouns) improveScore += 3;

  const hasWeight = isPresent(data.weight_kg) && Number(data.weight_kg) > 0;
  const hasBasicLook = isPresent(data.eye_color) && isPresent(data.hair_color);
  const hasShoe = isPresent(data.shoe_size);
  const hasPhysicalDetails =
    isPresent(data.skin_tone) || data.tattoos === true || data.piercings === true;

  if (hasWeight) improveScore += 2;
  if (hasBasicLook) improveScore += 3;
  else missingFields.push({ label: 'Eye & Hair Color', impact: 'Low', link: '/dashboard/talent/profile?tab=physical', points: 3, tier: 'Improve' });
  if (hasShoe) improveScore += 2;
  else missingFields.push({ label: 'Shoe Size', impact: 'Low', link: '/dashboard/talent/profile?tab=physical', points: 2, tier: 'Improve' });
  if (hasPhysicalDetails) improveScore += 3;

  const hasStatus = isPresent(data.work_status);
  const training = data.training || data.training_summary || '';
  const skills = parseJSON(data.specialties);
  const languages = parseJSON(data.languages);
  const hasExpLevel = isPresent(data.experience_level);
  const trainingStr = typeof training === 'string' ? training : String(training ?? '');
  const hasTrainingSkills = trainingStr.trim().length > 30 || (Array.isArray(skills) && skills.length > 0) || (Array.isArray(languages) && languages.length > 0);

  if (hasStatus) improveScore += 4;
  else missingFields.push({ label: 'Work Status', impact: 'Medium', link: '/dashboard/talent/profile?tab=details', points: 4, tier: 'Improve' });
  if (hasExpLevel) improveScore += 2;
  if (hasTrainingSkills) improveScore += 4;

  const hasSocial = isPresent(data.instagram_handle) || isPresent(data.portfolio_url);
  const hasEmergency = isPresent(data.emergency_contact_name);

  if (hasSocial) improveScore += 7;
  else missingFields.push({ label: 'Social Links', impact: 'Medium', link: '/dashboard/talent/profile?tab=details', points: 7, tier: 'Improve' });

  if (hasEmergency) improveScore += 3;
  else missingFields.push({ label: 'Emergency Contact', impact: 'Low', link: '/dashboard/talent/profile?tab=details', points: 3, tier: 'Improve' });

  const percentage = Math.min(Math.round(requiredScore + improveScore), 100);
  const isRequiredComplete = requiredScore === 60;

  const sortedMissing = missingFields.sort((a, b) => {
    if (a.tier === 'Required' && b.tier !== 'Required') return -1;
    if (a.tier !== 'Required' && b.tier === 'Required') return 1;
    return b.points - a.points;
  });

  const nextSteps = sortedMissing.map((f) => ({
    title: f.label,
    action: f.label,
    link: f.link,
    impact: f.impact,
    tier: f.tier,
  }));

  if (percentage === 100) {
    nextSteps.push({
      title: 'Maintenance',
      action: 'Update Measurements',
      link: '/dashboard/talent/profile?tab=physical',
      impact: 'Optional',
      tier: 'Improve',
    });
  }

  const fieldCompletion = {
    name: hasName,
    city: hasCity,
    dob: hasDOB,
    gender: hasGender,
    height: hasHeight,
    measurements: hasMeasurements,
    photo: hasHeadshot,
    bio: hasBio,
    weight: hasWeight,
    appearance: hasBasicLook,
    shoe: hasShoe,
    skin: hasPhysicalDetails,
    status: hasStatus,
    exp: hasExpLevel,
    training: hasTrainingSkills,
    social: hasSocial,
    emergency: hasEmergency,
  };

  return {
    score: percentage,
    requiredScore,
    improveScore,
    isRequiredComplete,
    isCoreReady: isRequiredComplete,
    missingCoreItems: sortedMissing.filter((f) => f.tier === 'Required').map((f) => f.label),
    nextSteps: nextSteps.slice(0, 3),
    allNextSteps: nextSteps,
    fieldCompletion,
    scrollTargetByKey: PROFILE_STRENGTH_SCROLL_TARGETS,
  };
};

export const getStrengthUI = (score, isRequiredComplete = false) => {
  if (!isRequiredComplete) {
    return {
      label: 'Action Needed',
      color: '#ef4444',
      message: 'Complete missing required fields to unlock your profile',
      status: 'locked',
    };
  }

  if (score < 85) {
    return {
      label: 'Profile Ready',
      color: '#C9A55A',
      message: 'Required info set. Add depth to stand out.',
      status: 'improvement',
    };
  }

  if (score < 100) {
    return {
      label: 'Strong Profile',
      color: '#22c55e',
      message: 'Your profile is highly competitive',
      status: 'improvement',
    };
  }

  return {
    label: 'Perfect Profile',
    color: '#C9A55A',
    message: '100% complete',
    status: 'perfect',
  };
};
