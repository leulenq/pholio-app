/**
 * Calculates profile strength based on unified Pholio Canonical Model.
 *
 * Total Weighting (100%):
 * A. Required (60%) - Core fields that gate platform access.
 * B. Improve (40%) - Depth fields that enhance the profile.
 */
const calculateProfileStrength = (data) => {
  if (!data)
    return {
      score: 0,
      isCoreReady: false,
      missingCoreItems: [],
      nextSteps: [],
    };

  let requiredScore = 0;
  let improveScore = 0;
  const missingFields = []; // { label, impact: 'Critical' | 'High' | 'Medium', link, points, tier: 'Required' | 'Improve' }

  // Treat whitespace-only strings as absent; booleans (including false) count as present.
  const isPresent = (val) => {
    if (val === null || val === undefined || val === "") return false;
    if (typeof val === "string" && val.trim() === "") return false;
    return true;
  };

  const parseJSON = (val) => {
    if (!val) return [];
    if (Array.isArray(val)) return val;
    try {
      if (
        typeof val === "string" &&
        (val.startsWith("[") || val.startsWith("{"))
      ) {
        return JSON.parse(val);
      }
      return val;
    } catch (e) {
      return [];
    }
  };

  // --- A. REQUIRED FIELDS (60 Points) ---
  // Aligned with backend/essentials-check.js + Onboarding Steps

  // 1. Identity (20 pts)
  const hasName = isPresent(data.first_name) && isPresent(data.last_name);
  const hasCity =
    isPresent(data.city) && String(data.city).trim() !== "Not specified";
  const hasDOB = isPresent(data.date_of_birth) || isPresent(data.dob);
  const hasGender = isPresent(data.gender);

  if (hasName) requiredScore += 8;
  else
    missingFields.push({
      label: "Legal Name",
      impact: "Critical",
      link: "/dashboard/talent/profile?tab=details",
      points: 8,
      tier: "Required",
    });

  if (hasCity) requiredScore += 4;
  else
    missingFields.push({
      label: "Home City",
      impact: "Critical",
      link: "/dashboard/talent/profile?tab=details",
      points: 4,
      tier: "Required",
    });

  if (hasDOB) requiredScore += 4;
  else
    missingFields.push({
      label: "Birth Date",
      impact: "Critical",
      link: "/dashboard/talent/profile?tab=details",
      points: 4,
      tier: "Required",
    });

  if (hasGender) requiredScore += 4;
  else
    missingFields.push({
      label: "Gender",
      impact: "Critical",
      link: "/dashboard/talent/profile?tab=details",
      points: 4,
      tier: "Required",
    });

  // 2. Physicals (25 pts)
  const hasHeight = isPresent(data.height_cm) && data.height_cm > 0;
  const hasMeasurements =
    (isPresent(data.bust) ||
      isPresent(data.bust_cm) ||
      isPresent(data.chest)) &&
    (isPresent(data.waist) || isPresent(data.waist_cm)) &&
    (isPresent(data.hips) || isPresent(data.hips_cm));

  if (hasHeight) requiredScore += 10;
  else
    missingFields.push({
      label: "Height",
      impact: "Critical",
      link: "/dashboard/talent/profile?tab=physical",
      points: 10,
      tier: "Required",
    });

  if (hasMeasurements) requiredScore += 15;
  else
    missingFields.push({
      label: "Measurements (Bust/Waist/Hips)",
      impact: "Critical",
      link: "/dashboard/talent/profile?tab=physical",
      points: 15,
      tier: "Required",
    });

  // 3. Imagery (15 pts) — align with GET /api/talent/profile: hero falls back to first gallery image
  const hasGalleryImage = Array.isArray(data.images) && data.images.length > 0;
  const hasHeadshot =
    isPresent(data.primary_photo_id) ||
    (data.images &&
      data.images.some((img) => img.is_primary || img.isPrimary)) ||
    isPresent(data.hero_image_path) ||
    hasGalleryImage;
  if (hasHeadshot) requiredScore += 15;
  else
    missingFields.push({
      label: "Primary Photo",
      impact: "Critical",
      link: "/dashboard/talent/profile?tab=photos",
      points: 15,
      tier: "Required",
    });

  // --- B. IMPROVE FIELDS (40 Points) ---

  // 1. Profile Depth (10 pts)
  const bioSource = data.bio ?? data.bio_raw ?? "";
  const bioLength = String(bioSource).trim().length;
  const hasBio = bioLength > 50;
  const hasPronouns = isPresent(data.pronouns);
  if (hasBio) improveScore += 7;
  else
    missingFields.push({
      label: "Professional Bio",
      impact: "Medium",
      link: "/dashboard/talent/profile?tab=details",
      points: 7,
      tier: "Improve",
    });
  if (hasPronouns) improveScore += 3;
  else
    missingFields.push({
      label: "Pronouns",
      impact: "Low",
      link: "/dashboard/talent/profile?tab=details",
      points: 3,
      tier: "Improve",
    });

  // 2. Physical Depth (10 pts)
  const hasWeight = isPresent(data.weight_kg) && data.weight_kg > 0;
  const hasBasicLook = isPresent(data.eye_color) && isPresent(data.hair_color);
  const hasShoe = isPresent(data.shoe_size);
  const hasPhysicalDetails =
    isPresent(data.skin_tone) ||
    data.tattoos === true ||
    data.piercings === true;

  if (hasWeight) improveScore += 2;
  else
    missingFields.push({
      label: "Weight",
      impact: "Low",
      link: "/dashboard/talent/profile?tab=physical",
      points: 2,
      tier: "Improve",
    });
  if (hasBasicLook) improveScore += 3;
  else
    missingFields.push({
      label: "Eye & Hair Color",
      impact: "Low",
      link: "/dashboard/talent/profile?tab=physical",
      points: 3,
      tier: "Improve",
    });
  if (hasShoe) improveScore += 2;
  else
    missingFields.push({
      label: "Shoe Size",
      impact: "Low",
      link: "/dashboard/talent/profile?tab=physical",
      points: 2,
      tier: "Improve",
    });
  if (hasPhysicalDetails) improveScore += 3;
  else
    missingFields.push({
      label: "Skin Tone or Tattoos",
      impact: "Medium",
      link: "/dashboard/talent/profile?tab=physical",
      points: 3,
      tier: "Improve",
    });

  // 3. Professional Depth (10 pts)
  const hasStatus = isPresent(data.work_status);
  const training = String(data.training || data.training_summary || "").trim();
  const skills = parseJSON(data.specialties);
  const languages = parseJSON(data.languages);
  const hasExpLevel = isPresent(data.experience_level);
  const skillsList = Array.isArray(skills) ? skills : [];
  const languagesList = Array.isArray(languages) ? languages : [];
  const hasTrainingSkills =
    training.length > 30 || skillsList.length > 0 || languagesList.length > 0;

  if (hasStatus) improveScore += 4;
  else
    missingFields.push({
      label: "Work Status",
      impact: "Medium",
      link: "/dashboard/talent/profile?tab=details",
      points: 4,
      tier: "Improve",
    });
  if (hasExpLevel) improveScore += 2;
  else
    missingFields.push({
      label: "Experience Level",
      impact: "Low",
      link: "/dashboard/talent/profile?tab=details",
      points: 2,
      tier: "Improve",
    });
  if (hasTrainingSkills) improveScore += 4;
  else
    missingFields.push({
      label: "Training, Skills, or Languages",
      impact: "Medium",
      link: "/dashboard/talent/profile?tab=details",
      points: 4,
      tier: "Improve",
    });

  // 4. Social & Contact (10 pts)
  const hasSocial =
    isPresent(data.instagram_handle) || isPresent(data.portfolio_url);
  const hasEmergency = isPresent(data.emergency_contact_name);

  if (hasSocial) improveScore += 7;
  else
    missingFields.push({
      label: "Social Links",
      impact: "Medium",
      link: "/dashboard/talent/profile?tab=details",
      points: 7,
      tier: "Improve",
    });

  if (hasEmergency) improveScore += 3;
  else
    missingFields.push({
      label: "Emergency Contact",
      impact: "Low",
      link: "/dashboard/talent/profile?tab=details",
      points: 3,
      tier: "Improve",
    });

  // --- Calculation ---
  const percentage = Math.min(Math.round(requiredScore + improveScore), 100);
  const isRequiredComplete = requiredScore === 60;

  // Sort missing fields: Required first, then by points DESC
  const sortedMissing = missingFields.sort((a, b) => {
    if (a.tier === "Required" && b.tier !== "Required") return -1;
    if (a.tier !== "Required" && b.tier === "Required") return 1;
    return b.points - a.points;
  });

  const nextSteps = sortedMissing.map((f) => ({
    title: f.label,
    action: f.label,
    link: f.link,
    impact: f.impact,
    tier: f.tier,
  }));

  // If complete, suggest maintenance
  if (percentage === 100) {
    nextSteps.push({
      title: "Maintenance",
      action: "Update Measurements",
      link: "/dashboard/talent/profile?tab=physical",
      impact: "Optional",
      tier: "Improve",
    });
  }

  return {
    score: percentage,
    requiredScore,
    improveScore,
    isRequiredComplete,
    isCoreReady: isRequiredComplete, // Now strictly tied to all required fields
    missingCoreItems: sortedMissing
      .filter((f) => f.tier === "Required")
      .map((f) => f.label),
    nextSteps: nextSteps.slice(0, 3),
    allNextSteps: nextSteps,
  };
};

const getStrengthUI = (score, isRequiredComplete = false) => {
  if (!isRequiredComplete) {
    return {
      label: "Action Needed",
      color: "#ef4444",
      message: "Complete missing required fields to unlock your profile",
      status: "locked",
    };
  }

  if (score < 85) {
    return {
      label: "Profile Ready",
      color: "#C9A55A",
      message: "Required info set. Add depth to stand out.",
      status: "improvement",
    };
  }

  if (score < 100) {
    return {
      label: "Strong Profile",
      color: "#22c55e",
      message: "Your profile is highly competitive",
      status: "improvement",
    };
  }

  return {
    label: "Perfect Profile",
    color: "#C9A55A",
    message: "100% complete",
    status: "perfect",
  };
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    calculateProfileStrength,
    getStrengthUI,
  };
} else if (typeof exports !== "undefined") {
  exports.calculateProfileStrength = calculateProfileStrength;
  exports.getStrengthUI = getStrengthUI;
} else if (typeof window !== "undefined") {
  window.calculateProfileStrength = calculateProfileStrength;
  window.getStrengthUI = getStrengthUI;
}
