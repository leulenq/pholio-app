/**
 * Client-side profile readiness (mirrors `src/domains/talent/services/profile-strength.js`).
 */

import { analyzeBookReadiness, analyzeDigitalsReadiness } from './profileReadinessImages';
import { analyzePackageIntelligence, resolveReadinessGuidance } from './packageIntelligence';
import { DIGITALS_STALE_DAYS } from '../constants/packageIntelligence';
import {
  hasGuardianConsent,
  hasWorkPermitOnFile,
  isMinorProfile,
  minorSensitiveFieldsUnlocked,
} from './talentAge';

export const REQUIRED_POINTS = 60;
export const IMPROVE_POINTS = 40;
const IMPROVE_FIELD_POINTS = {
  bio: 4,
  look: 4,
  shoe: 3,
  weight: 2,
  skin: 2,
  status: 2,
  exp: 2,
  training: 2,
  social: 4,
  contact: 1,
  photo_profile: 2,
  photo_smile: 2,
  photo_back: 2,
  photo_editorial: 3,
  photo_lifestyle: 3,
  digitals_recency: 2,
};

/** DOM section ids on the talent profile page (scroll targets). */
export const PROFILE_STRENGTH_SCROLL_TARGETS = {
  name: 'identity',
  city: 'identity',
  dob: 'identity',
  gender: 'identity',
  height: 'appearance',
  measurements: 'appearance',
  photo_headshot: 'media',
  photo_full_body: 'media',
  photo_profile: 'media',
  photo_smile: 'media',
  photo_back: 'media',
  photo_editorial: 'media',
  photo_lifestyle: 'media',
  digitals_recency: 'media',
  bio: 'identity',
  look: 'appearance',
  weight: 'appearance',
  shoe: 'appearance',
  skin: 'appearance',
  status: 'roles',
  exp: 'credits',
  training: 'training',
  social: 'socials',
  contact: 'contact',
  guardian_consent: 'identity',
  work_permit: 'identity',
};

export const calculateProfileStrength = (data) => {
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
    digitals_recency: false,
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

  const pushMissing = (entry) => {
    missingFields.push(entry);
  };

  const hasName = isPresent(data.first_name) && isPresent(data.last_name);
  const hasCity = isPresent(data.city) && String(data.city).trim() !== 'Not specified';
  const hasDOB = isPresent(data.date_of_birth) || isPresent(data.dob);
  const hasGender = isPresent(data.gender);
  const minor = isMinorProfile(data);
  const unlocked = minorSensitiveFieldsUnlocked(data);
  const sensitiveRequired = !minor || unlocked;

  if (hasName) requiredScore += 8;
  else pushMissing({ key: 'name', label: 'Legal Name', why: 'Agencies file submissions under your legal name for contracts and casting.', impact: 'Critical', link: '/dashboard/talent/profile?tab=identity', points: 8, tier: 'Required' });

  if (hasCity) requiredScore += 4;
  else pushMissing({ key: 'city', label: 'Home City', why: 'Bookers match you to local castings and travel radius first.', impact: 'Critical', link: '/dashboard/talent/profile?tab=identity', points: 4, tier: 'Required' });

  if (hasDOB) requiredScore += 4;
  else pushMissing({ key: 'dob', label: 'Birth Date', why: 'Age range is a primary filter — agencies need this before reviewing your book.', impact: 'Critical', link: '/dashboard/talent/profile?tab=identity', points: 4, tier: 'Required' });

  if (hasGender) requiredScore += 4;
  else pushMissing({ key: 'gender', label: 'Gender', why: 'Board fit and category routing depend on accurate gender presentation.', impact: 'Critical', link: '/dashboard/talent/profile?tab=identity', points: 4, tier: 'Required' });

  const hasHeight = isPresent(data.height_cm) && Number(data.height_cm) > 0;
  const hasMeasurements =
    (isPresent(data.bust) || isPresent(data.bust_cm) || isPresent(data.chest) || isPresent(data.chest_cm)) &&
    (isPresent(data.waist) || isPresent(data.waist_cm)) &&
    (isPresent(data.hips) || isPresent(data.hips_cm));

  if (hasHeight) requiredScore += 8;
  else pushMissing({ key: 'height', label: 'Height', why: 'Height is the first stat agents scan on every submission.', impact: 'Critical', link: '/dashboard/talent/profile?tab=appearance', points: 8, tier: 'Required' });

  if (sensitiveRequired) {
    if (hasMeasurements) requiredScore += 12;
    else pushMissing({ key: 'measurements', label: 'Measurements (Bust/Waist/Hips)', why: 'Bust, waist, and hips let agencies assess fit without a fitting.', impact: 'Critical', link: '/dashboard/talent/profile?tab=appearance', points: 12, tier: 'Required' });
  }

  if (minor) {
    if (hasGuardianConsent(data)) requiredScore += 8;
    else pushMissing({ key: 'guardian_consent', label: 'Guardian Consent', why: 'A parent or guardian must consent before we collect measurements or full-length imagery.', impact: 'Critical', link: '/dashboard/talent/profile?tab=identity', points: 8, tier: 'Required' });

    if (hasWorkPermitOnFile(data)) requiredScore += 4;
    else pushMissing({ key: 'work_permit', label: 'Work Permit on File', why: 'Minors need a current work permit on record before booking in most markets.', impact: 'Critical', link: '/dashboard/talent/profile?tab=identity', points: 4, tier: 'Required' });
  }

  const book = analyzeBookReadiness(data.images);
  const digitals = analyzeDigitalsReadiness(data.images);
  const pkg = analyzePackageIntelligence({ images: data.images || [] });
  const hasHeadshot = book.hasHeadshot;
  const hasFullBody = book.hasFullBody;

  if (hasHeadshot) requiredScore += 8;
  else {
    const headshotGuidance = resolveReadinessGuidance('photo_headshot', pkg.advisories, {
      label: 'Digital Headshot',
      why: 'A clean, natural headshot is the first image on every agency digitals set.',
    });
    pushMissing({
      key: 'photo_headshot',
      label: headshotGuidance.label,
      why: headshotGuidance.why,
      impact: 'Critical',
      link: '/dashboard/talent/media',
      points: 8,
      tier: 'Required',
    });
  }

  if (sensitiveRequired) {
    if (hasFullBody) requiredScore += 12;
    else {
      const fullBodyGuidance = resolveReadinessGuidance('photo_full_body', pkg.advisories, {
        label: 'Full-Length Digital',
        why: 'Agents need a head-to-toe frame to verify proportions and stance.',
      });
      pushMissing({
        key: 'photo_full_body',
        label: fullBodyGuidance.label,
        why: fullBodyGuidance.why,
        impact: 'Critical',
        link: '/dashboard/talent/media',
        points: 12,
        tier: 'Required',
      });
    }
  }

  const hasRecencyAnchor = hasHeadshot || hasFullBody;
  const hasCurrentDigitals = hasRecencyAnchor && !pkg.recency.isStale;
  if (hasCurrentDigitals) {
    improveScore += IMPROVE_FIELD_POINTS.digitals_recency;
  } else if (pkg.recency.isStale && hasRecencyAnchor) {
    pushMissing({
      key: 'digitals_recency',
      label: 'Current Digitals',
      why: `Agencies expect digitals refreshed within ${DIGITALS_STALE_DAYS} days.`,
      impact: 'Medium',
      link: '/dashboard/talent/media',
      points: IMPROVE_FIELD_POINTS.digitals_recency,
      tier: 'Improve',
    });
  }

  const bioSource = data.bio ?? data.bio_raw ?? '';
  const hasBio = String(bioSource).trim().length > 50;
  if (hasBio) improveScore += IMPROVE_FIELD_POINTS.bio;
  else pushMissing({ key: 'bio', label: 'Professional Bio', why: 'A short bio gives context beyond stats — training, market, and personality.', impact: 'Medium', link: '/dashboard/talent/profile?tab=identity', points: IMPROVE_FIELD_POINTS.bio, tier: 'Improve' });

  const hasLook = isPresent(data.eye_color) && isPresent(data.hair_color);
  if (hasLook) improveScore += IMPROVE_FIELD_POINTS.look;
  else pushMissing({ key: 'look', label: 'Eye & Hair Color', why: 'Hair and eye color belong on every comp-card stats block.', impact: 'Medium', link: '/dashboard/talent/profile?tab=appearance', points: IMPROVE_FIELD_POINTS.look, tier: 'Improve' });

  const hasShoe = isPresent(data.shoe_size);
  if (hasShoe) improveScore += IMPROVE_FIELD_POINTS.shoe;
  else pushMissing({ key: 'shoe', label: 'Shoe Size', why: 'Footwear sizing is standard on agency stats sheets and castings.', impact: 'Low', link: '/dashboard/talent/profile?tab=appearance', points: IMPROVE_FIELD_POINTS.shoe, tier: 'Improve' });

  const hasWeight = isPresent(data.weight_kg) && Number(data.weight_kg) > 0;
  if (sensitiveRequired) {
    if (hasWeight) improveScore += IMPROVE_FIELD_POINTS.weight;
    else pushMissing({ key: 'weight', label: 'Weight', why: 'Some markets list weight alongside measurements for fit checks.', impact: 'Low', link: '/dashboard/talent/profile?tab=appearance', points: IMPROVE_FIELD_POINTS.weight, tier: 'Improve' });
  }

  const hasPhysicalDetails =
    isPresent(data.skin_tone) ||
    data.tattoos === true ||
    data.piercings === true;
  if (hasPhysicalDetails) improveScore += IMPROVE_FIELD_POINTS.skin;
  else pushMissing({ key: 'skin', label: 'Skin Tone & Markings', why: 'Visible tattoos, piercings, and skin tone prevent set-day surprises.', impact: 'Medium', link: '/dashboard/talent/profile?tab=appearance', points: IMPROVE_FIELD_POINTS.skin, tier: 'Improve' });

  const hasStatus = isPresent(data.work_status);
  if (hasStatus) improveScore += IMPROVE_FIELD_POINTS.status;
  else pushMissing({ key: 'status', label: 'Work Status', why: 'Availability signals whether you can take bookings now.', impact: 'Medium', link: '/dashboard/talent/profile?tab=roles', points: IMPROVE_FIELD_POINTS.status, tier: 'Improve' });

  const hasExpLevel = isPresent(data.experience_level);
  if (hasExpLevel) improveScore += IMPROVE_FIELD_POINTS.exp;
  else pushMissing({ key: 'exp', label: 'Experience Level', why: 'New faces and working talent are pitched differently to clients.', impact: 'Low', link: '/dashboard/talent/profile?tab=credits', points: IMPROVE_FIELD_POINTS.exp, tier: 'Improve' });

  const training = String(data.training || data.training_summary || '').trim();
  const skills = parseJSON(data.specialties);
  const languages = parseJSON(data.languages);
  const skillsList = Array.isArray(skills) ? skills : [];
  const languagesList = Array.isArray(languages) ? languages : [];
  const hasTrainingSkills = training.length > 30 || skillsList.length > 0 || languagesList.length > 0;
  if (hasTrainingSkills) improveScore += IMPROVE_FIELD_POINTS.training;
  else pushMissing({ key: 'training', label: 'Training & Specialties', why: 'Skills and languages show bookers what you can do once the brief fits.', impact: 'Medium', link: '/dashboard/talent/profile?tab=training', points: IMPROVE_FIELD_POINTS.training, tier: 'Improve' });

  const hasSocial = isPresent(data.instagram_handle) || isPresent(data.portfolio_url);
  if (hasSocial) improveScore += IMPROVE_FIELD_POINTS.social;
  else pushMissing({ key: 'social', label: 'Social or Portfolio Link', why: 'Instagram and portfolio links are how scouts verify your current look.', impact: 'Medium', link: '/dashboard/talent/profile?tab=socials', points: IMPROVE_FIELD_POINTS.social, tier: 'Improve' });

  const hasContact = isPresent(data.email) && isPresent(data.phone);
  if (hasContact) improveScore += IMPROVE_FIELD_POINTS.contact;
  else pushMissing({ key: 'contact', label: 'Email & Phone', why: 'Agencies need direct contact details to follow up on submissions.', impact: 'Medium', link: '/dashboard/talent/settings', points: IMPROVE_FIELD_POINTS.contact, tier: 'Improve' });

  if (digitals.hasProfile) improveScore += IMPROVE_FIELD_POINTS.photo_profile;
  else pushMissing({ key: 'photo_profile', label: 'Profile Digital (Side View)', why: 'A side profile helps agencies confirm facial structure and neck line.', impact: 'Low', link: '/dashboard/talent/media', points: IMPROVE_FIELD_POINTS.photo_profile, tier: 'Improve' });

  if (digitals.hasSmile) improveScore += IMPROVE_FIELD_POINTS.photo_smile;
  else pushMissing({ key: 'photo_smile', label: 'Smiling Digital', why: 'A smiling frame shows commercial range and approachability.', impact: 'Low', link: '/dashboard/talent/media', points: IMPROVE_FIELD_POINTS.photo_smile, tier: 'Improve' });

  if (digitals.hasBack) improveScore += IMPROVE_FIELD_POINTS.photo_back;
  else pushMissing({ key: 'photo_back', label: 'Back View Digital', why: 'Back-view digitals help agencies evaluate posture and line.', impact: 'Low', link: '/dashboard/talent/media', points: IMPROVE_FIELD_POINTS.photo_back, tier: 'Improve' });

  if (digitals.hasEditorial) improveScore += IMPROVE_FIELD_POINTS.photo_editorial;
  else pushMissing({ key: 'photo_editorial', label: 'Editorial Portfolio Frame', why: 'An editorial frame demonstrates shape control and booking range.', impact: 'Medium', link: '/dashboard/talent/media', points: IMPROVE_FIELD_POINTS.photo_editorial, tier: 'Improve' });

  if (digitals.hasLifestyle) improveScore += IMPROVE_FIELD_POINTS.photo_lifestyle;
  else pushMissing({ key: 'photo_lifestyle', label: 'Lifestyle/Commercial Frame', why: 'Commercial-style imagery helps agencies pitch you for lifestyle briefs.', impact: 'Medium', link: '/dashboard/talent/media', points: IMPROVE_FIELD_POINTS.photo_lifestyle, tier: 'Improve' });

  const percentage = Math.min(Math.round(requiredScore + improveScore), REQUIRED_POINTS + IMPROVE_POINTS);
  const isRequiredComplete = !missingFields.some((f) => f.tier === 'Required');

  const sortedMissing = missingFields.sort((a, b) => {
    if (a.tier === 'Required' && b.tier !== 'Required') return -1;
    if (a.tier !== 'Required' && b.tier === 'Required') return 1;
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
      key: 'maintenance',
      title: 'Keep digitals current',
      action: 'Refresh measurements and photos',
      why: 'Agencies expect stats and digitals updated every 8–12 weeks.',
      link: '/dashboard/talent/profile?tab=appearance',
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
    photo_headshot: hasHeadshot,
    photo_full_body: hasFullBody,
    photo_profile: digitals.hasProfile,
    photo_smile: digitals.hasSmile,
    photo_back: digitals.hasBack,
    photo_editorial: digitals.hasEditorial,
    photo_lifestyle: digitals.hasLifestyle,
    digitals_recency: !pkg.recency.isStale,
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
    missingCoreItems: sortedMissing.filter((f) => f.tier === 'Required').map((f) => f.label),
    nextSteps: nextSteps.slice(0, 3),
    allNextSteps: nextSteps,
    fieldCompletion,
    scrollTargetByKey: PROFILE_STRENGTH_SCROLL_TARGETS,
    bookReadiness: book,
    digitalsReadiness: digitals,
  };
};

export const getStrengthUI = (score, isRequiredComplete = false) => {
  if (!isRequiredComplete) {
    return {
      label: 'Build your package',
      color: '#C0392B',
      message: 'Add missing essentials.',
      status: 'locked',
    };
  }

  if (score < 85) {
    return {
      label: 'Essentials complete',
      color: '#C9A55A',
      message: 'Add look details and contact to strengthen your package.',
      status: 'improvement',
    };
  }

  if (score < 100) {
    return {
      label: 'Strong package',
      color: '#2D8A56',
      message: 'Your profile matches what bookers look for when shortlisting.',
      status: 'improvement',
    };
  }

  return {
    label: 'Agency grade',
    color: '#C9A55A',
    message: 'Complete and current — ready for agency review.',
    status: 'perfect',
  };
};
