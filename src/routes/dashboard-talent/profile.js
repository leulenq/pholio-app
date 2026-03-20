/**
 * Profile Routes for Talent Dashboard
 * 
 * Handles profile viewing and updating
 */

const express = require('express');
const knex = require('../../db/knex');
const { requireRole } = require('../../middleware/auth');
const { talentProfileUpdateSchema } = require('../../lib/validation');
const { normalizeMeasurements, curateBio } = require('../../lib/curate');
const { addMessage } = require('../../middleware/context');
const { v4: uuidv4 } = require('uuid');
const { ensureUniqueSlug } = require('../../lib/slugify');
const { calculateAge, generateSocialMediaUrl, parseSocialMediaHandle, convertKgToLbs, convertLbsToKg } = require('../../lib/profile-helpers');
const { calculateProfileCompleteness } = require('../../lib/dashboard/completeness');
const { loadDashboardData, renderDashboard, logActivity } = require('../../lib/dashboard/shared-utils');
const { asyncHandler } = require('../../middleware/error-handler');

const router = express.Router();

/**
 * GET /dashboard/talent
 * Main dashboard page - displays profile and form
 */
router.get('/dashboard/talent', requireRole('TALENT'), asyncHandler(async (req, res) => {
  console.log('[Dashboard/Talent] Loading profile for user:', {
    userId: req.session.userId,
    role: req.session.role
  });
  
  const profile = await knex('profiles').where({ user_id: req.session.userId }).first();
  
  console.log('[Dashboard/Talent] Profile lookup result:', {
    userId: req.session.userId,
    profileFound: !!profile,
    profileId: profile?.id || null,
    profileSlug: profile?.slug || null,
    profileName: profile ? `${profile.first_name} ${profile.last_name}` : null
  });
  
  if (!profile) {
    // Logged-in user without profile - show dashboard with empty state
    const currentUser = await knex('users')
      .where({ id: req.session.userId })
      .first();
    
    addMessage(req, 'info', 'Complete your profile to get started! Fill out the form below.');
    
    // Use unified completeness calculation (even for empty profile)
    const emptyCompleteness = calculateProfileCompleteness(null, []);
    
    const { getAllThemes, getFreeThemes, getProThemes, getDefaultTheme } = require('../../lib/themes');
    return renderDashboard(res, {
      profile: null,
      images: [],
      completeness: emptyCompleteness,
      stats: null,
      shareUrl: null,
      user: currentUser,
      currentUser,
      allThemes: getAllThemes(),
      freeThemes: getFreeThemes(),
      proThemes: getProThemes(),
      currentTheme: getDefaultTheme(),
      baseUrl: `${req.protocol}://${req.get('host')}`
    }, { showProfileForm: true });
  }
  
  // Check if onboarding is complete (for gating)
  const { checkEssentialsComplete } = require('../../lib/onboarding/essentials-check');
  const images = await knex('images').where({ profile_id: profile.id }).orderBy('sort', 'asc');
  const essentialsCheck = checkEssentialsComplete(profile, images);
  const isOnboardingComplete = !!profile.onboarding_completed_at;
  const canGenerateCompCard = isOnboardingComplete && essentialsCheck.ok;
  const canApplyToAgencies = isOnboardingComplete && essentialsCheck.ok;
  const canPublishPortfolio = isOnboardingComplete && essentialsCheck.ok;
  
  // Load dashboard data
  const data = await loadDashboardData(req, profile);
  
  // Add gating flags
  data.canGenerateCompCard = canGenerateCompCard;
  data.canApplyToAgencies = canApplyToAgencies;
  data.canPublishPortfolio = canPublishPortfolio;
  data.isOnboardingComplete = isOnboardingComplete;
  data.essentialsCheck = essentialsCheck;
  
  // Debug: Log image count and paths for troubleshooting
  if (process.env.NODE_ENV === 'development' && data.images.length > 0) {
    console.log(`[Dashboard] Loaded ${data.images.length} images for profile ${profile.id}`);
  }
  
  return renderDashboard(res, data);
}));

/**
 * POST /dashboard/talent
 * Update or create profile
 */
router.post('/dashboard/talent', requireRole('TALENT'), asyncHandler(async (req, res) => {
  // Preprocess req.body to merge "_other" fields into main fields before validation
  const processedBody = { ...req.body };
  
  // Merge "Other" fields into main fields
  const otherFieldMappings = [
    { main: 'shoe_size', other: 'shoe_size_other' },
    { main: 'eye_color', other: 'eye_color_other' },
    { main: 'hair_color', other: 'hair_color_other' },
    { main: 'skin_tone', other: 'skin_tone_other' },
    { main: 'work_status', other: 'work_status_other' }
  ];
  
  for (const { main, other } of otherFieldMappings) {
    if (processedBody[main] === 'Other' && processedBody[other] && processedBody[other].trim()) {
      processedBody[main] = processedBody[other].trim();
      console.log(`[Dashboard/Talent POST] Merged "${other}" into "${main}":`, processedBody[main]);
    }
    delete processedBody[other];
  }
  
  // Handle array fields
  const arrayStringFields = ['city_secondary', 'ethnicity', 'union_membership'];
  for (const field of arrayStringFields) {
    if (Array.isArray(processedBody[field])) {
      const nonEmptyValue = processedBody[field].find(val => val && val.trim() !== '');
      processedBody[field] = nonEmptyValue || undefined;
    }
  }
  
  // Convert empty strings to undefined for optional fields
  const optionalFields = [
    'city_secondary', 'phone', 'bust', 'waist', 'hips', 'shoe_size', 'eye_color', 'hair_color',
    'hair_length', 'skin_tone', 'dress_size', 'ethnicity', 'union_membership', 'training',
    'portfolio_url', 'instagram_handle', 'twitter_handle', 'tiktok_handle',
    'reference_name', 'reference_email', 'reference_phone',
    'emergency_contact_name', 'emergency_contact_phone', 'emergency_contact_relationship',
    'work_status', 'bio', 'date_of_birth'
  ];
  
  const enumFields = [
    'availability_schedule', 'experience_level', 'gender', 'work_eligibility'
  ];
  
  for (const field of optionalFields) {
    if (processedBody[field] === '') {
      processedBody[field] = undefined;
    }
  }
  
  for (const field of enumFields) {
    if (processedBody[field] === '') {
      processedBody[field] = undefined;
    }
  }
  
  // Handle boolean checkbox fields
  const booleanCheckboxFields = ['tattoos', 'piercings', 'availability_travel'];
  for (const field of booleanCheckboxFields) {
    if (processedBody[field] === 'true' || processedBody[field] === true || processedBody[field] === 'on') {
      processedBody[field] = true;
    } else if (Array.isArray(processedBody[field])) {
      processedBody[field] = processedBody[field].includes('true') || processedBody[field].includes('on') ? true : false;
    } else if (processedBody[field] === null || processedBody[field] === 'null' || processedBody[field] === 'false') {
      processedBody[field] = false;
    } else if (!(field in processedBody) || processedBody[field] === '' || processedBody[field] === undefined) {
      processedBody[field] = false;
    }
  }
  
  // work_eligibility is a select dropdown
  if (processedBody.work_eligibility === 'Yes') {
    processedBody.work_eligibility = true;
  } else if (processedBody.work_eligibility === 'No') {
    processedBody.work_eligibility = false;
  } else if (processedBody.work_eligibility === '' || processedBody.work_eligibility === undefined) {
    processedBody.work_eligibility = undefined;
  }
  
  // Remove fields that aren't in the validation schema
  const fieldsToRemove = ['age', 'language_other_input'];
  for (const field of fieldsToRemove) {
    delete processedBody[field];
  }
  
  console.log('[Dashboard/Talent POST] Processing profile update request:', {
    userId: req.session.userId,
    bodyKeys: Object.keys(req.body),
    processedBodyKeys: Object.keys(processedBody)
  });
  
  const parsed = talentProfileUpdateSchema.safeParse(processedBody);
  if (!parsed.success) {
    console.error('[Dashboard/Talent POST] Validation failed:', {
      errors: parsed.error.flatten().fieldErrors
    });
    const fieldErrors = parsed.error.flatten().fieldErrors;
    
    // Ensure userId exists in session
    if (!req.session || !req.session.userId) {
      console.error('[Dashboard/Talent POST] No userId in session');
      addMessage(req, 'error', 'Session expired. Please log in again.');
      return res.redirect('/login');
    }
    
    const data = await loadDashboardData(req);
    return renderDashboard(res, data, {
      formErrors: fieldErrors,
      values: processedBody,
      showProfileForm: !data.profile
    });
  }
  
  // Ensure userId exists in session
  if (!req.session || !req.session.userId) {
    console.error('[Dashboard/Talent POST] No userId in session');
    addMessage(req, 'error', 'Session expired. Please log in again.');
    return res.redirect('/login');
  }
  
  // Get user record
  const currentUser = await knex('users').where({ id: req.session.userId }).first();
  if (!currentUser) {
    console.error('[Dashboard/Talent POST] User not found:', req.session.userId);
    addMessage(req, 'error', 'User account not found. Please log in again.');
    return res.redirect('/login');
  }
  
  let profile = await knex('profiles').where({ user_id: req.session.userId }).first();
  
  // If profile doesn't exist, create it
  if (!profile) {
    console.log('[Dashboard/Talent POST] Profile not found, creating profile for user:', req.session.userId);
    
    const emailParts = currentUser.email.split('@')[0];
    const placeholderFirstName = emailParts.charAt(0).toUpperCase() + emailParts.slice(1).split('.')[0];
    const placeholderLastName = 'User';
    
    const {
      first_name, last_name, city, city_secondary, height_cm, bio,
      gender, date_of_birth, weight_kg, weight_lbs, dress_size, hair_length, skin_tone,
      languages, availability_travel, availability_schedule, experience_level, training, portfolio_url,
      instagram_handle, twitter_handle, tiktok_handle,
      reference_name, reference_email, reference_phone,
      emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
      work_eligibility, work_status, union_membership, ethnicity, tattoos, piercings, comfort_levels, previous_representations,
      phone, bust, waist, hips, shoe_size, eye_color, hair_color, specialties, experience_details
    } = parsed.data;
    
    const finalFirstName = first_name || placeholderFirstName;
    const finalLastName = last_name || placeholderLastName;
    
    const profileId = uuidv4();
    const slug = await ensureUniqueSlug(knex, 'profiles', `${finalFirstName}-${finalLastName}`);
    
    // Calculate age from date of birth
    let age = null;
    if (date_of_birth) {
      age = calculateAge(date_of_birth);
    }
    
    // Handle weight conversion
    let finalWeightKg = weight_kg || null;
    let finalWeightLbs = weight_lbs || null;
    if (finalWeightKg && !finalWeightLbs) {
      finalWeightLbs = convertKgToLbs(finalWeightKg);
    } else if (finalWeightLbs && !finalWeightKg) {
      finalWeightKg = convertLbsToKg(finalWeightLbs);
    }
    
    // Handle JSON fields
    const languagesJson = languages && Array.isArray(languages) && languages.length > 0
      ? JSON.stringify(languages)
      : null;
    
    const specialtiesJson = specialties && Array.isArray(specialties) && specialties.length > 0
      ? JSON.stringify(specialties)
      : null;
    
    // Clean social media handles
    const cleanInstagramHandle = instagram_handle ? parseSocialMediaHandle(instagram_handle) : null;
    const cleanTwitterHandle = twitter_handle ? parseSocialMediaHandle(twitter_handle) : null;
    const cleanTiktokHandle = tiktok_handle ? parseSocialMediaHandle(tiktok_handle) : null;
    
    const curatedBio = bio ? curateBio(bio, finalFirstName, finalLastName) : null;
    
    const finalCity = city || 'Not specified';
    const finalHeightCm = height_cm || 0;
    const finalBioRaw = bio || '';
    const finalBioCurated = curatedBio || '';
    
    await knex('profiles').insert({
      id: profileId,
      user_id: req.session.userId,
      slug,
      first_name: finalFirstName,
      last_name: finalLastName,
      city: finalCity,
      city_secondary: city_secondary || null,
      phone: phone || null,
      height_cm: finalHeightCm,
      bust: bust || null,
      waist: waist || null,
      hips: hips || null,
      shoe_size: shoe_size || null,
      eye_color: eye_color || null,
      hair_color: hair_color || null,
      bio_raw: finalBioRaw,
      bio_curated: finalBioCurated,
      specialties: specialtiesJson,
      experience_details: typeof experience_details === 'string' ? experience_details : (experience_details ? JSON.stringify(experience_details) : null),
      gender: gender || null,
      date_of_birth: date_of_birth || null,
      age: age,
      weight_kg: finalWeightKg,
      weight_lbs: finalWeightLbs,
      dress_size: dress_size || null,
      hair_length: hair_length || null,
      skin_tone: skin_tone || null,
      languages: languagesJson,
      availability_travel: availability_travel || null,
      availability_schedule: availability_schedule || null,
      experience_level: experience_level || null,
      training: training || null,
      portfolio_url: portfolio_url || null,
      instagram_handle: cleanInstagramHandle,
      instagram_url: null,
      twitter_handle: cleanTwitterHandle,
      twitter_url: null,
      tiktok_handle: cleanTiktokHandle,
      tiktok_url: null,
      reference_name: reference_name || null,
      reference_email: reference_email || null,
      reference_phone: reference_phone || null,
      emergency_contact_name: emergency_contact_name || null,
      emergency_contact_phone: emergency_contact_phone || null,
      emergency_contact_relationship: emergency_contact_relationship || null,
      work_eligibility: work_eligibility || null,
      work_status: work_status || null,
      union_membership: union_membership || null,
      ethnicity: ethnicity || null,
      tattoos: tattoos || null,
      piercings: piercings || null,
      comfort_levels: comfort_levels && Array.isArray(comfort_levels) && comfort_levels.length > 0 ? JSON.stringify(comfort_levels) : null,
      previous_representations: typeof previous_representations === 'string' ? previous_representations : (previous_representations ? JSON.stringify(previous_representations) : null),
      is_pro: false,
      pdf_theme: null,
      pdf_customizations: null
    });
    
    console.log('[Dashboard/Talent POST] Created profile successfully:', {
      profileId,
      userId: req.session.userId,
      slug
    });
    
    await logActivity(req.session.userId, 'profile_created', {
      profileId,
      slug,
      action: 'created'
    });
    
    addMessage(req, 'success', 'Profile created! You can update your name and other details anytime.');
    return res.redirect('/dashboard/talent');
  }
  
  // Profile exists - update it
  // Extract all fields from parsed data
  const {
    first_name, last_name, city, city_secondary, height_cm, measurements, bio,
    gender, date_of_birth, weight_kg, weight_lbs, dress_size, hair_length, skin_tone,
    languages, availability_travel, availability_schedule, experience_level, training, portfolio_url,
    instagram_handle, twitter_handle, tiktok_handle,
    reference_name, reference_email, reference_phone,
    emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
    union_membership, ethnicity, tattoos, piercings, work_eligibility, work_status,
    phone, bust, waist, hips, shoe_size, eye_color, hair_color, specialties, experience_details,
    comfort_levels, previous_representations
  } = parsed.data;
  
  const updatedFirstName = first_name !== undefined ? first_name : profile.first_name;
  const updatedLastName = last_name !== undefined ? last_name : profile.last_name;
  
  const curatedBio = bio ? curateBio(bio, updatedFirstName, updatedLastName) : profile.bio_curated;
  const cleanedMeasurements = normalizeMeasurements(measurements);
  
  // Handle weight conversion
  let finalWeightKg = weight_kg || null;
  let finalWeightLbs = weight_lbs || null;
  if (finalWeightKg && !finalWeightLbs) {
    finalWeightLbs = convertKgToLbs(finalWeightKg);
  } else if (finalWeightLbs && !finalWeightKg) {
    finalWeightKg = convertLbsToKg(finalWeightLbs);
  }
  
  // Handle JSON fields - check if PostgreSQL or SQLite
  const isPostgres = knex.client.config.client === 'pg' || knex.client.config.client === 'postgresql';
  
  let languagesJson = profile.languages;
  if (languages !== undefined) {
    if (isPostgres) {
      languagesJson = (languages && Array.isArray(languages) && languages.length > 0) ? languages : null;
    } else {
      if (typeof languages === 'string') {
        languagesJson = languages || null;
      } else if (languages && Array.isArray(languages) && languages.length > 0) {
        languagesJson = JSON.stringify(languages);
      } else {
        languagesJson = null;
      }
    }
  }
  
  let specialtiesJson = profile.specialties;
  if (specialties !== undefined) {
    if (isPostgres) {
      specialtiesJson = (specialties && Array.isArray(specialties) && specialties.length > 0) ? specialties : null;
    } else {
      if (typeof specialties === 'string') {
        specialtiesJson = specialties || null;
      } else if (specialties && Array.isArray(specialties) && specialties.length > 0) {
        specialtiesJson = JSON.stringify(specialties);
      } else {
        specialtiesJson = null;
      }
    }
  }
  
  // Handle weight (only if provided in form)
  if (weight_kg === undefined && weight_lbs === undefined) {
    finalWeightKg = profile.weight_kg;
    finalWeightLbs = profile.weight_lbs;
  }
  
  // Check if user is Studio+
  const isPro = profile.is_pro || false;
  
  // Clean social media handles
  let cleanInstagramHandle = profile.instagram_handle;
  let cleanTwitterHandle = profile.twitter_handle;
  let cleanTiktokHandle = profile.tiktok_handle;
  
  if (instagram_handle !== undefined) {
    cleanInstagramHandle = instagram_handle ? parseSocialMediaHandle(instagram_handle) : null;
  }
  if (twitter_handle !== undefined) {
    cleanTwitterHandle = twitter_handle ? parseSocialMediaHandle(twitter_handle) : null;
  }
  if (tiktok_handle !== undefined) {
    cleanTiktokHandle = tiktok_handle ? parseSocialMediaHandle(tiktok_handle) : null;
  }
  
  // Generate social media URLs for Studio+ users
  let finalInstagramUrl = null;
  let finalTwitterUrl = null;
  let finalTiktokUrl = null;
  
  if (isPro) {
    if (cleanInstagramHandle) {
      finalInstagramUrl = generateSocialMediaUrl('instagram', cleanInstagramHandle);
    }
    if (cleanTwitterHandle) {
      finalTwitterUrl = generateSocialMediaUrl('twitter', cleanTwitterHandle);
    }
    if (cleanTiktokHandle) {
      finalTiktokUrl = generateSocialMediaUrl('tiktok', cleanTiktokHandle);
    }
  }
  
  // Build update object
  const updateData = {
    updated_at: knex.fn.now()
  };
  
  // Handle name updates - if name changes, we may need to update the slug
  let needsSlugUpdate = false;
  if (first_name !== undefined && first_name !== profile.first_name) {
    updateData.first_name = first_name || null;
    needsSlugUpdate = true;
  }
  if (last_name !== undefined && last_name !== profile.last_name) {
    updateData.last_name = last_name || null;
    needsSlugUpdate = true;
  }
  
  // Only update fields that are explicitly in parsed.data
  if (city !== undefined) updateData.city = city || null;
  if (city_secondary !== undefined) updateData.city_secondary = city_secondary || null;
  if (phone !== undefined) updateData.phone = phone || null;
  if (height_cm !== undefined) updateData.height_cm = height_cm;
  if (bust !== undefined) updateData.bust = bust || null;
  if (waist !== undefined) updateData.waist = waist || null;
  if (hips !== undefined) updateData.hips = hips || null;
  if (shoe_size !== undefined) updateData.shoe_size = shoe_size || null;
  if (eye_color !== undefined) updateData.eye_color = eye_color || null;
  if (hair_color !== undefined) updateData.hair_color = hair_color || null;
  if (bio !== undefined) {
    updateData.bio_raw = bio;
    updateData.bio_curated = curatedBio;
  }
  if (specialties !== undefined) updateData.specialties = specialtiesJson;
  if (gender !== undefined) updateData.gender = gender || null;
  if (date_of_birth !== undefined) {
    updateData.date_of_birth = date_of_birth || null;
  }
  if (weight_kg !== undefined || weight_lbs !== undefined) {
    updateData.weight_kg = finalWeightKg;
    updateData.weight_lbs = finalWeightLbs;
  }
  if (dress_size !== undefined) updateData.dress_size = dress_size || null;
  if (hair_length !== undefined) updateData.hair_length = hair_length || null;
  if (skin_tone !== undefined) updateData.skin_tone = skin_tone || null;
  if (languages !== undefined) updateData.languages = languagesJson;
  if (availability_travel !== undefined) updateData.availability_travel = availability_travel === false ? false : (availability_travel || false);
  if (availability_schedule !== undefined) updateData.availability_schedule = availability_schedule || null;
  if (experience_level !== undefined) updateData.experience_level = experience_level || null;
  if (training !== undefined) updateData.training = training || null;
  if (portfolio_url !== undefined) updateData.portfolio_url = portfolio_url || null;
  if (instagram_handle !== undefined) {
    updateData.instagram_handle = cleanInstagramHandle;
    updateData.instagram_url = finalInstagramUrl;
  }
  if (twitter_handle !== undefined) {
    updateData.twitter_handle = cleanTwitterHandle;
    updateData.twitter_url = finalTwitterUrl;
  }
  if (tiktok_handle !== undefined) {
    updateData.tiktok_handle = cleanTiktokHandle;
    updateData.tiktok_url = finalTiktokUrl;
  }
  if (reference_name !== undefined) updateData.reference_name = reference_name || null;
  if (reference_email !== undefined) updateData.reference_email = reference_email || null;
  if (reference_phone !== undefined) updateData.reference_phone = reference_phone || null;
  if (emergency_contact_name !== undefined) updateData.emergency_contact_name = emergency_contact_name || null;
  if (emergency_contact_phone !== undefined) updateData.emergency_contact_phone = emergency_contact_phone || null;
  if (emergency_contact_relationship !== undefined) updateData.emergency_contact_relationship = emergency_contact_relationship || null;
  if (work_eligibility !== undefined) updateData.work_eligibility = work_eligibility || null;
  if (work_status !== undefined) updateData.work_status = work_status || null;
  if (union_membership !== undefined) updateData.union_membership = union_membership || null;
  if (ethnicity !== undefined) updateData.ethnicity = ethnicity || null;
  if (tattoos !== undefined) updateData.tattoos = tattoos === false ? false : (tattoos || false);
  if (piercings !== undefined) updateData.piercings = piercings === false ? false : (piercings || false);
  
  // Handle JSONB fields
  if (comfort_levels !== undefined) {
    if (isPostgres) {
      updateData.comfort_levels = (comfort_levels && Array.isArray(comfort_levels) && comfort_levels.length > 0) ? comfort_levels : null;
    } else {
      if (typeof comfort_levels === 'string') {
        updateData.comfort_levels = comfort_levels || null;
      } else if (comfort_levels && Array.isArray(comfort_levels) && comfort_levels.length > 0) {
        updateData.comfort_levels = JSON.stringify(comfort_levels);
      } else {
        updateData.comfort_levels = null;
      }
    }
  }
  
  if (previous_representations !== undefined) {
    if (isPostgres) {
      updateData.previous_representations = (previous_representations && (typeof previous_representations === 'object' || Array.isArray(previous_representations))) ? previous_representations : null;
    } else {
      if (typeof previous_representations === 'string') {
        updateData.previous_representations = previous_representations || null;
      } else if (previous_representations && (typeof previous_representations === 'object' || Array.isArray(previous_representations))) {
        updateData.previous_representations = JSON.stringify(previous_representations);
      } else {
        updateData.previous_representations = null;
      }
    }
  }
  
  if (experience_details !== undefined) {
    if (isPostgres) {
      updateData.experience_details = (experience_details && typeof experience_details === 'object') ? experience_details : null;
    } else {
      updateData.experience_details = typeof experience_details === 'string' 
        ? experience_details 
        : (experience_details ? JSON.stringify(experience_details) : null);
    }
  }
  
  // Update slug if name changed
  if (needsSlugUpdate && (first_name !== undefined || last_name !== undefined)) {
    const finalFirstName = first_name !== undefined ? first_name : profile.first_name;
    const finalLastName = last_name !== undefined ? last_name : profile.last_name;
    
    const oldNameSlug = `${profile.first_name}-${profile.last_name}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
    if (profile.slug === oldNameSlug || profile.slug.startsWith(`${oldNameSlug}-`)) {
      const newNameSlug = `${finalFirstName}-${finalLastName}`.toLowerCase().replace(/[^a-z0-9-]+/g, '-');
      const uniqueSlug = await ensureUniqueSlug(knex, 'profiles', newNameSlug);
      updateData.slug = uniqueSlug;
      console.log('[Dashboard/Talent POST] Updating slug due to name change:', {
        oldSlug: profile.slug,
        newSlug: uniqueSlug
      });
    }
  }
  
  await knex('profiles')
    .where({ id: profile.id })
    .update(updateData);
  
  console.log('[Dashboard/Talent POST] Profile updated successfully:', {
    profileId: profile.id,
    userId: req.session.userId,
    updatedFields: Object.keys(updateData)
  });
  
  // Fetch updated profile to recalculate completeness
  const updatedProfile = await knex('profiles').where({ id: profile.id }).first();
  const images = await knex('images').where({ profile_id: profile.id }).orderBy('sort', 'asc');
  
  const profileForCompleteness = {
    ...updatedProfile,
    email: updatedProfile.email || currentUser?.email || null
  };
  const completeness = calculateProfileCompleteness(profileForCompleteness, images);
  
  console.log('[Dashboard/Talent POST] Completeness recalculated:', {
    percentage: completeness.percentage,
    completedSections: Object.values(completeness.sections).filter(s => s.complete).length
  });
  
  await logActivity(req.session.userId, 'profile_updated', {
    profileId: profile.id,
    slug: updateData.slug || profile.slug,
    nameChanged: needsSlugUpdate,
    completenessPercentage: completeness.percentage
  });
  
  addMessage(req, 'success', `Profile updated successfully. ${completeness.percentage}% complete.`);
  return res.redirect('/dashboard/talent');
}));

/**
 * POST /dashboard/talent/visibility
 * AJAX endpoint to toggle discoverability
 */
router.post('/dashboard/talent/visibility', requireRole('TALENT'), asyncHandler(async (req, res) => {
  const { discoverable } = req.body;
  
  if (discoverable === undefined) {
    return res.status(400).json({ success: false, message: 'Missing discoverable state' });
  }
  
  const isDiscoverable = discoverable === true || discoverable === 'true';
  const profile = await knex('profiles').where({ user_id: req.session.userId }).first();
  
  if (!profile) {
    return res.status(404).json({ success: false, message: 'Profile not found' });
  }
  
  try {
    // Try updating is_discoverable
    await knex('profiles')
      .where({ id: profile.id })
      .update({ 
        is_discoverable: isDiscoverable,
        updated_at: knex.fn.now()
      });
      
    // Also try to update is_public for compatibility if it exists
    try {
       await knex('profiles')
        .where({ id: profile.id })
        .update({ is_public: isDiscoverable });
    } catch (e) {
      // Ignore if is_public column missing
    }
      
    return res.json({ success: true, is_discoverable: isDiscoverable });
  } catch (error) {
    console.error('Error updating visibility:', error);
    return res.status(500).json({ success: false, message: 'Database error' });
  }
}));

module.exports = router;
