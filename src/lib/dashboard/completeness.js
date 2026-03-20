const { calculateProfileStrength } = require('../shared/profile-strength.cjs');

/**
 * Unified Profile Completeness Calculator (Pholio Canonical Model)
 * 
 * @deprecated Use calculateProfileStrength from src/lib/shared/profile-strength directly for new code.
 * This is a backward-compatibility wrapper for the Legacy CJS backend.
 */
function calculateProfileCompleteness(profile, images = []) {
  if (!profile) {
    return { percentage: 0, isComplete: false, sections: {}, nextSteps: [] };
  }

  // Normalization Step: Map profile.date_of_birth -> dob for shared lib compatibility
  // Also pass through the images array which profile-strength.js handles
  const normalizedData = {
    ...profile,
    dob: profile.date_of_birth || profile.dob,
    images: images
  };

  const strength = calculateProfileStrength(normalizedData);

  // Backward Compatibility: Reconstruct the 'sections' object expected by existing templates
  const sections = {
    personalInfo: { 
      status: strength.score >= 10 ? 'complete' : 'incomplete', 
      complete: strength.score >= 10 
    },
    physicalProfile: { 
      status: profile.height_cm && profile.weight_kg ? 'complete' : 'incomplete', 
      complete: !!(profile.height_cm && profile.weight_kg) 
    },
    experienceTraining: { 
      status: (profile.training?.length > 30) ? 'complete' : 'incomplete', 
      complete: (profile.training?.length > 30) 
    },
    socialPortfolio: { 
      status: (profile.instagram_handle || profile.portfolio_url) ? 'complete' : 'incomplete', 
      complete: !!(profile.instagram_handle || profile.portfolio_url) 
    },
    skillsLifestyle: { status: 'complete', complete: true },
    comfortBoundaries: { status: 'complete', complete: true },
    availabilityLocations: { status: 'complete', complete: true },
    referencesEmergency: { 
      status: profile.emergency_contact_name ? 'complete' : 'incomplete', 
      complete: !!profile.emergency_contact_name 
    }
  };

  return {
    percentage: strength.score,
    isComplete: strength.score === 100,
    coreReady: strength.isCoreReady,
    displayBreakdown: {
        identity: strength.score >= 20,    // Identity essentials complete
        physicals: strength.score >= 45,   // Identity + Physicals essentials
        photos: strength.score >= 60,      // All Required items complete
        professional: strength.score >= 80, // Significant depth added
        socials: strength.score === 100    // Everything complete
    },
    sections, // Legacy support
    nextSteps: strength.nextSteps
  };
}

module.exports = {
  calculateProfileCompleteness
};
