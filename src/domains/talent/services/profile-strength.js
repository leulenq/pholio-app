/**
 * Agency-aligned profile readiness scoring (Pholio canonical model).
 *
 * Required (60 pts) — minimum credible agency submission package:
 *   Identity, full stats block (height + B/W/H), headshot + full-body digitals.
 *
 * Improve (40 pts) — depth agencies scan for when shortlisting:
 *   Look details, bio, social proof, professional context, contact.
 */

const { analyzeBookReadiness, analyzeDigitalsReadiness } = require("./profile-readiness-images");
const {
  hasGuardianConsent,
  hasWorkPermitOnFile,
  isMinorProfile,
  minorSensitiveFieldsUnlocked,
} = require("../../../shared/lib/talent-age");

const REQUIRED_POINTS = 60;
const IMPROVE_POINTS = 40;

const calculateProfileStrength = (data) => {
  const emptyCompletion = {
    name: false,
    city: false,
    dob: false,
    gender: false,
    height: false,
    measurements: false,
    photo_headshot: false,
    photo_full_body: false,
    photo_profile: false,
    photo_smile: false,
    photo_back: false,
    photo_editorial: false,
    photo_lifestyle: false,
    bio: false,
    look: false,
    shoe: false,
    weight: false,
    skin: false,
    status: false,
    exp: false,
    training: false,
    social: false,
    contact: false,
    guardian_consent: false,
    work_permit: false,
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
    };
  }

  let requiredScore = 0;
  let improveScore = 0;
  const missingFields = [];

  const isPresent = (val) => {
    if (val === null || val === undefined || val === "") return false;
    if (typeof val === "string") return val.trim() !== "";
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
    } catch {
      return [];
    }
  };

  const pushMissing = (entry) => {
    missingFields.push(entry);
  };

  // --- REQUIRED (60) ---

  const hasName = isPresent(data.first_name) && isPresent(data.last_name);
  const hasCity =
    isPresent(data.city) && String(data.city).trim() !== "Not specified";
  const hasDOB = isPresent(data.date_of_birth) || isPresent(data.dob);
  const hasGender = isPresent(data.gender);
  const minor = isMinorProfile(data);
  const unlocked = minorSensitiveFieldsUnlocked(data);
  const sensitiveRequired = !minor || unlocked;

  if (hasName) requiredScore += 8;
  else
    pushMissing({
      key: "name",
      label: "Legal Name",
      why: "Agencies file submissions under your legal name for contracts and casting.",
      impact: "Critical",
      link: "/dashboard/talent/profile?tab=identity",
      points: 8,
      tier: "Required",
    });

  if (hasCity) requiredScore += 4;
  else
    pushMissing({
      key: "city",
      label: "Home City",
      why: "Bookers match you to local castings and travel radius first.",
      impact: "Critical",
      link: "/dashboard/talent/profile?tab=identity",
      points: 4,
      tier: "Required",
    });

  if (hasDOB) requiredScore += 4;
  else
    pushMissing({
      key: "dob",
      label: "Birth Date",
      why: "Age range is a primary filter — agencies need this before reviewing your book.",
      impact: "Critical",
      link: "/dashboard/talent/profile?tab=identity",
      points: 4,
      tier: "Required",
    });

  if (hasGender) requiredScore += 4;
  else
    pushMissing({
      key: "gender",
      label: "Gender",
      why: "Board fit and category routing depend on accurate gender presentation.",
      impact: "Critical",
      link: "/dashboard/talent/profile?tab=identity",
      points: 4,
      tier: "Required",
    });

  const hasHeight = isPresent(data.height_cm) && Number(data.height_cm) > 0;
  const hasMeasurements =
    (isPresent(data.bust) ||
      isPresent(data.bust_cm) ||
      isPresent(data.chest) ||
      isPresent(data.chest_cm)) &&
    (isPresent(data.waist) || isPresent(data.waist_cm)) &&
    (isPresent(data.hips) || isPresent(data.hips_cm));

  if (hasHeight) requiredScore += 8;
  else
    pushMissing({
      key: "height",
      label: "Height",
      why: "Height is the first stat agents scan on every submission.",
      impact: "Critical",
      link: "/dashboard/talent/profile?tab=appearance",
      points: 8,
      tier: "Required",
    });

  if (sensitiveRequired) {
    if (hasMeasurements) requiredScore += 12;
    else
      pushMissing({
        key: "measurements",
        label: "Measurements (Bust/Waist/Hips)",
        why: "Bust, waist, and hips let agencies assess fit without a fitting.",
        impact: "Critical",
        link: "/dashboard/talent/profile?tab=appearance",
        points: 12,
        tier: "Required",
      });
  }

  if (minor) {
    if (hasGuardianConsent(data)) requiredScore += 8;
    else
      pushMissing({
        key: "guardian_consent",
        label: "Guardian Consent",
        why: "A parent or guardian must consent before we collect measurements or full-length imagery.",
        impact: "Critical",
        link: "/dashboard/talent/profile?tab=identity",
        points: 8,
        tier: "Required",
      });

    if (hasWorkPermitOnFile(data)) requiredScore += 4;
    else
      pushMissing({
        key: "work_permit",
        label: "Work Permit on File",
        why: "Minors need a current work permit on record before booking in most markets.",
        impact: "Critical",
        link: "/dashboard/talent/profile?tab=identity",
        points: 4,
        tier: "Required",
      });
  }

  const book = analyzeBookReadiness(data.images);
  const digitals = analyzeDigitalsReadiness(data.images);
  const hasHeadshot =
    book.hasHeadshot ||
    isPresent(data.primary_photo_id) ||
    isPresent(data.hero_image_path);
  const hasFullBody = book.hasFullBody;

  if (hasHeadshot) requiredScore += 8;
  else
    pushMissing({
      key: "photo_headshot",
      label: "Headshot",
      why: "A clean, natural headshot is the first image on every agency digitals set.",
      impact: "Critical",
      link: "/dashboard/talent/media",
      points: 8,
      tier: "Required",
    });

  if (sensitiveRequired) {
    if (hasFullBody) requiredScore += 12;
    else
      pushMissing({
        key: "photo_full_body",
        label: "Full-Body Photo",
        why: "Agents need a head-to-toe frame to verify proportions and stance.",
        impact: "Critical",
        link: "/dashboard/talent/media",
        points: 12,
        tier: "Required",
      });
  }

  // --- IMPROVE (40) ---

  const bioSource = data.bio ?? data.bio_raw ?? "";
  const hasBio = String(bioSource).trim().length > 50;
  if (hasBio) improveScore += 6;
  else
    pushMissing({
      key: "bio",
      label: "Professional Bio",
      why: "A short bio gives context beyond stats — training, market, and personality.",
      impact: "Medium",
      link: "/dashboard/talent/profile?tab=identity",
      points: 6,
      tier: "Improve",
    });

  const hasLook = isPresent(data.eye_color) && isPresent(data.hair_color);
  if (hasLook) improveScore += 5;
  else
    pushMissing({
      key: "look",
      label: "Eye & Hair Color",
      why: "Hair and eye color belong on every comp-card stats block.",
      impact: "Medium",
      link: "/dashboard/talent/profile?tab=appearance",
      points: 5,
      tier: "Improve",
    });

  const hasShoe = isPresent(data.shoe_size);
  if (hasShoe) improveScore += 4;
  else
    pushMissing({
      key: "shoe",
      label: "Shoe Size",
      why: "Footwear sizing is standard on agency stats sheets and castings.",
      impact: "Low",
      link: "/dashboard/talent/profile?tab=appearance",
      points: 4,
      tier: "Improve",
    });

  const hasWeight = isPresent(data.weight_kg) && Number(data.weight_kg) > 0;
  if (sensitiveRequired) {
    if (hasWeight) improveScore += 2;
    else
      pushMissing({
        key: "weight",
        label: "Weight",
        why: "Some markets list weight alongside measurements for fit checks.",
        impact: "Low",
        link: "/dashboard/talent/profile?tab=appearance",
        points: 2,
        tier: "Improve",
      });
  }

  const hasPhysicalDetails =
    isPresent(data.skin_tone) ||
    data.tattoos === true ||
    data.piercings === true;
  if (hasPhysicalDetails) improveScore += 3;
  else
    pushMissing({
      key: "skin",
      label: "Skin Tone & Markings",
      why: "Visible tattoos, piercings, and skin tone prevent set-day surprises.",
      impact: "Medium",
      link: "/dashboard/talent/profile?tab=appearance",
      points: 3,
      tier: "Improve",
    });

  const hasStatus = isPresent(data.work_status);
  if (hasStatus) improveScore += 4;
  else
    pushMissing({
      key: "status",
      label: "Work Status",
      why: "Availability signals whether you can take bookings now.",
      impact: "Medium",
      link: "/dashboard/talent/profile?tab=roles",
      points: 4,
      tier: "Improve",
    });

  const hasExpLevel = isPresent(data.experience_level);
  if (hasExpLevel) improveScore += 3;
  else
    pushMissing({
      key: "exp",
      label: "Experience Level",
      why: "New faces and working talent are pitched differently to clients.",
      impact: "Low",
      link: "/dashboard/talent/profile?tab=credits",
      points: 3,
      tier: "Improve",
    });

  const training = String(data.training || data.training_summary || "").trim();
  const skills = parseJSON(data.specialties);
  const languages = parseJSON(data.languages);
  const skillsList = Array.isArray(skills) ? skills : [];
  const languagesList = Array.isArray(languages) ? languages : [];
  const hasTrainingSkills =
    training.length > 30 || skillsList.length > 0 || languagesList.length > 0;
  if (hasTrainingSkills) improveScore += 4;
  else
    pushMissing({
      key: "training",
      label: "Training & Specialties",
      why: "Skills and languages show bookers what you can do once the brief fits.",
      impact: "Medium",
      link: "/dashboard/talent/profile?tab=training",
      points: 4,
      tier: "Improve",
    });

  const hasSocial =
    isPresent(data.instagram_handle) || isPresent(data.portfolio_url);
  if (hasSocial) improveScore += 6;
  else
    pushMissing({
      key: "social",
      label: "Social or Portfolio Link",
      why: "Instagram and portfolio links are how scouts verify your current look.",
      impact: "Medium",
      link: "/dashboard/talent/profile?tab=socials",
      points: 6,
      tier: "Improve",
    });

  const hasContact = isPresent(data.email) && isPresent(data.phone);
  if (hasContact) improveScore += 3;
  else
    pushMissing({
      key: "contact",
      label: "Email & Phone",
      why: "Agencies need direct contact details to follow up on submissions.",
      impact: "Medium",
      link: "/dashboard/talent/settings",
      points: 3,
      tier: "Improve",
    });

  const percentage = Math.min(
    Math.round(requiredScore + improveScore),
    REQUIRED_POINTS + IMPROVE_POINTS,
  );
  const isRequiredComplete = !missingFields.some((f) => f.tier === "Required");

  const sortedMissing = missingFields.sort((a, b) => {
    if (a.tier === "Required" && b.tier !== "Required") return -1;
    if (a.tier !== "Required" && b.tier === "Required") return 1;
    return b.points - a.points;
  });

  const nextSteps = sortedMissing.map((f) => ({
    key: f.key,
    title: f.label,
    action: f.label,
    why: f.why,
    link: f.link,
    impact: f.impact,
    tier: f.tier,
  }));

  if (percentage === 100) {
    nextSteps.push({
      key: "maintenance",
      title: "Keep digitals current",
      action: "Refresh measurements and photos",
      why: "Agencies expect stats and digitals updated every 8–12 weeks.",
      link: "/dashboard/talent/profile?tab=appearance",
      impact: "Optional",
      tier: "Improve",
    });
  }

  const fieldCompletion = {
    name: hasName,
    city: hasCity,
    dob: hasDOB,
    gender: hasGender,
    height: hasHeight,
    measurements: hasMeasurements,
    photo_headshot: hasHeadshot,
    photo_full_body: hasFullBody,
    photo_profile: digitals.hasProfile,
    photo_smile: digitals.hasSmile,
    photo_back: digitals.hasBack,
    photo_editorial: digitals.hasEditorial,
    photo_lifestyle: digitals.hasLifestyle,
    bio: hasBio,
    look: hasLook,
    shoe: hasShoe,
    weight: hasWeight,
    skin: hasPhysicalDetails,
    status: hasStatus,
    exp: hasExpLevel,
    training: hasTrainingSkills,
    social: hasSocial,
    contact: hasContact,
    guardian_consent: minor ? hasGuardianConsent(data) : false,
    work_permit: minor ? hasWorkPermitOnFile(data) : false,
  };

  return {
    score: percentage,
    requiredScore,
    improveScore,
    isRequiredComplete,
    isCoreReady: isRequiredComplete,
    missingCoreItems: sortedMissing
      .filter((f) => f.tier === "Required")
      .map((f) => f.label),
    nextSteps: nextSteps.slice(0, 3),
    allNextSteps: nextSteps,
    fieldCompletion,
    bookReadiness: book,
    digitalsReadiness: digitals,
  };
};

const getStrengthUI = (score, isRequiredComplete = false) => {
  if (!isRequiredComplete) {
    return {
      label: "Build your package",
      color: "#C0392B",
      message: "Complete the essentials agencies expect on every submission.",
      status: "locked",
    };
  }

  if (score < 85) {
    return {
      label: "Submission ready",
      color: "#C9A55A",
      message: "Core package set. Add look details and socials to stand out.",
      status: "improvement",
    };
  }

  if (score < 100) {
    return {
      label: "Strong package",
      color: "#2D8A56",
      message: "Your profile matches what bookers look for when shortlisting.",
      status: "improvement",
    };
  }

  return {
    label: "Agency grade",
    color: "#C9A55A",
    message: "Complete and current — ready for agency review.",
    status: "perfect",
  };
};

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    calculateProfileStrength,
    getStrengthUI,
    REQUIRED_POINTS,
    IMPROVE_POINTS,
  };
}
