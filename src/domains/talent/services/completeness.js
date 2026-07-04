const { calculateProfileStrength } = require("./profile-strength");
const { hasCoreMeasurements } = require("../../../shared/lib/stats-formatter");

/**
 * Unified Profile Completeness Calculator (Pholio Canonical Model)
 *
 * Field-split aligned (tasks/field-split-design-2026-07-01.md, Wave 2B): this
 * is the GLOBAL professional-profile completeness score. It intentionally
 * does NOT gate on fields that moved out of generic completeness scope:
 *   - `comfort_levels` (content boundaries) → private `adult_context`,
 *     verified-adult only. Never a driver of generic completeness.
 *   - `emergency_contact_*` / `reference_*` / `work_eligibility` → scoped to
 *     `confirmed_job_safety` (only collected once a job is confirmed).
 *
 * @deprecated Use calculateProfileStrength from ./profile-strength directly
 * for new code — that is the richer, agency-aligned readiness scorer this
 * wrapper also returns (`nextSteps`, `coreReady`, `displayBreakdown`). This
 * function exists for the legacy `sections` shape older dashboard surfaces
 * still read.
 */

/** Defensive JSON-array parse — never throws, empty/malformed → []. */
function parseArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

function isNonEmptyString(value) {
  return typeof value === "string" && value.trim() !== "";
}

function calculateProfileCompleteness(profile, images = []) {
  if (!profile) {
    return { percentage: 0, isComplete: false, sections: {}, nextSteps: [] };
  }

  const imageList = Array.isArray(images) ? images : [];

  // Backward Compatibility: Reconstruct the 'sections' object expected by existing templates
  const hasPersonalInfo = !!(
    profile.first_name &&
    profile.last_name &&
    (profile.date_of_birth || profile.dob)
  );

  const hasPhysicalProfile = hasCoreMeasurements(profile);

  const hasSocialHandle = !!(
    profile.instagram_handle ||
    profile.portfolio_url ||
    profile.twitter_handle ||
    profile.tiktok_handle ||
    profile.youtube_handle
  );
  const hasImages = imageList.length > 0;

  const specialties = parseArray(profile.specialties);
  const skills = parseArray(profile.skills);
  const languages = parseArray(profile.languages);
  const hasSkillsLifestyle =
    specialties.length > 0 ||
    skills.length > 0 ||
    languages.length > 0 ||
    isNonEmptyString(profile.specializations) ||
    (isNonEmptyString(profile.training) && profile.training.trim().length > 30);

  const hasBase = !!(profile.city || profile.city_secondary);
  const hasAvailability = !!(
    profile.availability_schedule ||
    (profile.availability_travel !== null && profile.availability_travel !== undefined)
  );

  const hasRepresentation =
    profile.seeking_representation !== null &&
    profile.seeking_representation !== undefined;

  const sections = {
    personalInfo: {
      status: hasPersonalInfo ? "complete" : "incomplete",
      complete: hasPersonalInfo,
      message: hasPersonalInfo ? null : "identity",
    },
    physicalProfile: {
      status: hasPhysicalProfile ? "complete" : "incomplete",
      complete: hasPhysicalProfile,
      message: hasPhysicalProfile ? null : "measurements",
    },
    socialPortfolio: {
      status: hasSocialHandle && hasImages ? "complete" : "incomplete",
      complete: !!(hasSocialHandle && hasImages),
      message: !hasSocialHandle ? "social" : !hasImages ? "portfolio" : null,
    },
    skillsLifestyle: {
      status: hasSkillsLifestyle ? "complete" : "incomplete",
      complete: hasSkillsLifestyle,
      message: hasSkillsLifestyle ? null : "skills",
    },
    availabilityLocations: {
      status: hasAvailability && hasBase ? "complete" : "incomplete",
      complete: !!(hasAvailability && hasBase),
      message: !hasBase ? "base" : !hasAvailability ? "availability" : null,
    },
    representation: {
      status: hasRepresentation ? "complete" : "incomplete",
      complete: hasRepresentation,
      message: hasRepresentation ? null : "representation",
    },
  };

  const sectionsList = Object.values(sections);
  const completeCount = sectionsList.filter((s) => s.complete).length;
  const percentage = Math.floor((completeCount / sectionsList.length) * 100);

  const normalizedData = {
    ...profile,
    dob: profile.date_of_birth || profile.dob,
    images: imageList,
  };
  const strength = calculateProfileStrength(normalizedData);

  return {
    percentage,
    isComplete: percentage === 100,
    coreReady: strength.isCoreReady,
    displayBreakdown: {
      identity: strength.score >= 20, // Identity essentials complete
      physicals: strength.score >= 45, // Identity + Physicals essentials
      photos: strength.score >= 60, // All Required items complete
      professional: strength.score >= 80, // Significant depth added
      socials: strength.score === 100, // Everything complete
    },
    sections, // Legacy support
    nextSteps: strength.nextSteps,
  };
}

module.exports = {
  calculateProfileCompleteness,
};
