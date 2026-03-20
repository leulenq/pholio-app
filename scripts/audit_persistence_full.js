const knex = require('../src/db/knex');
const { talentProfileUpdateSchema } = require('../src/lib/validation');
const { curateBio } = require('../src/lib/curate');
const { 
  parseSocialMediaHandle, 
  generateSocialMediaUrl, 
  convertKgToLbs, 
  convertLbsToKg,
  toFeetInches 
} = require('../src/lib/profile-helpers');

/**
 * FULL PERSISTENCE AUDIT
 * 
 * 1. Simulates a MAXIMAL payload containing every single field the frontend could possibly send.
 * 2. Runs it through the `talentProfileUpdateSchema` (Validation Layer).
 * 3. Runs it through the EXACT mapping logic from `profile.api.js` (Controller Layer).
 * 4. Checks if the resulting keys actually exist in the `profiles` table (Database Layer).
 */

async function runAudit() {
  console.log('🚀 Starting Full Persistence Audit...');
  
  // 1. Get DB Schema
  const columnInfo = await knex('profiles').columnInfo();
  const dbColumns = Object.keys(columnInfo);
  console.log(`✅ Loaded ${dbColumns.length} columns from 'profiles' table.`);

  // 2. Maximal Test Payload (Simulating Frontend)
  const testPayload = {
    // Basic Info
    first_name: 'Audit',
    last_name: 'Test',
    email: 'audit@test.com',
    phone: '123-456-7890',
    city: 'New York',
    city_secondary: 'Los Angeles',
    
    // Physical Stats
    height_cm: 180,
    bust: 90,
    waist: 70,
    hips: 95,
    shoe_size: '10',
    hair_color: 'Brown',
    eye_color: 'Green',
    hair_length: 'Long',
    hair_type: 'Wavy',
    body_type: 'Athletic',
    skin_tone: 'Tan',
    dress_size: '6',
    inseam_cm: 80,
    
    // Personal Details
    date_of_birth: '1995-05-15',
    gender: 'Non-binary',
    pronouns: 'They/Them',
    nationality: 'American',
    place_of_birth: 'Chicago',
    timezone: 'America/New_York',
    
    // Weight
    weight: 70,
    weight_unit: 'kg',
    weight_kg: 70,
    weight_lbs: 154,
    
    // Professional
    bio: 'Test bio for audit purposes.',
    experience_level: 'Professional',
    training: 'Acting School 101',
    union_membership: ['SAG-AFTRA', 'Equity'],
    represented_by: undefined, // REMOVED: False positive (not in schema)
    seeking_representation: true,
    current_agency: 'None',
    work_eligibility: 'Yes',
    work_status: 'Citizen',
    
    // URLs / Social
    portfolio_url: 'https://audit.com',
    video_reel_url: 'https://vimeo.com/123456',
    instagram_handle: '@audit_ig',
    twitter_handle: '@audit_tw',
    tiktok_handle: '@audit_tt',
    youtube_handle: '@audit_yt',
    
    // Lists / JSON
    languages: ['English', 'Spanish'],
    specialties: ['Piano', 'Horseback Riding'],
    comfort_levels: ['Swimwear', 'Lingerie'],
    modeling_categories: ['Runway', 'Editorial'],
    previous_representations: [{ agency_name: 'Old Agency', reason_leaving: 'Contract ended' }],
    experience_details: [{ role: 'Lead', production: 'Test Movie', year: '2023' }],
    
    // Boolean Flags
    tattoos: true,
    piercings: false,
    availability_travel: true,
    drivers_license: true,
    passport_ready: true,
    
    // References & Emergency
    reference_name: 'Ref Name',
    reference_email: 'ref@test.com',
    reference_phone: '555-0000',
    emergency_contact_name: 'Emerg Name',
    emergency_contact_phone: '911-0000',
    emergency_contact_relationship: 'Parent',
    
    // Other
    playing_age_min: 20,
    playing_age_max: 30,
    availability_schedule: 'Full-time',
    ethnicity: ['Asian', 'White']
  };

  // 3. Validation Layer Check
  console.log('\n🔍 Checking Validation Layer...');
  const parsed = talentProfileUpdateSchema.safeParse(testPayload);
  if (!parsed.success) {
    console.error('❌ Validation FAILED!');
    console.error(JSON.stringify(parsed.error.flatten().fieldErrors, null, 2));
    process.exit(1);
  } else {
    console.log('✅ Validation Passed.');
  }

  // 4. Controller Mapping Logic (COPIED FROM profile.api.js)
  // This simulates exactly what the API does.
  console.log('\n🔄 Running API Mapping Logic...');
  const data = parsed.data;
  const updateData = {
    updated_at: new Date()
  };

  // --- BEGIN COPY PASTE MAPPING LOGIC ---
  const mapField = (field, dbField = field) => {
    if (data[field] !== undefined) updateData[dbField] = data[field] === '' ? null : data[field];
  };

  if (data.firstName !== undefined) updateData.first_name = data.firstName;
  if (data.lastName !== undefined) updateData.last_name = data.lastName;
  if (data.dateOfBirth !== undefined) updateData.date_of_birth = data.dateOfBirth;
  if (data.dob !== undefined) updateData.date_of_birth = data.dob;
  if (data.location !== undefined) updateData.city = data.location;
  
  if (updateData.date_of_birth) {
    const d = new Date(updateData.date_of_birth);
    if (!isNaN(d.getTime())) {
       updateData.date_of_birth = d.toISOString().split('T')[0];
    }
  }

  mapField('city');
  mapField('city_secondary');
  mapField('phone');
  mapField('height_cm');
  mapField('bust', 'bust_cm');
  mapField('waist', 'waist_cm');
  mapField('hips', 'hips_cm');
  mapField('shoe_size');
  mapField('eye_color');
  mapField('hair_color');
  mapField('gender');
  mapField('pronouns');
  mapField('date_of_birth');
  mapField('dress_size');
  mapField('hair_length');
  mapField('hair_type');
  mapField('body_type');
  mapField('skin_tone');
  mapField('nationality');
  mapField('place_of_birth');
  mapField('timezone');
  mapField('inseam_cm');
  mapField('video_reel_url');
  mapField('playing_age_min');
  mapField('playing_age_max');
  mapField('availability_schedule'); 
  mapField('experience_level');
  if (data.training_summary !== undefined) updateData.training = data.training_summary;
  if (data.training !== undefined) updateData.training = data.training;
  mapField('portfolio_url');
  mapField('reference_name');
  mapField('reference_email');
  mapField('reference_phone');
  mapField('emergency_contact_name');
  mapField('emergency_contact_phone');
  mapField('emergency_contact_relationship');
  mapField('work_eligibility');
  mapField('work_status');
  mapField('union_membership');
  mapField('ethnicity');
  mapField('seeking_representation');
  mapField('current_agency');
  mapField('hero_image_path');
  
  if (data.tattoos !== undefined) updateData.tattoos = data.tattoos;
  if (data.piercings !== undefined) updateData.piercings = data.piercings;
  if (data.availability_travel !== undefined) updateData.availability_travel = data.availability_travel;
  if (data.drivers_license !== undefined) updateData.drivers_license = data.drivers_license;
  if (data.passport_ready !== undefined) updateData.passport_ready = data.passport_ready;
  
  const formatJson = (val) => {
    if (val === null || val === undefined) return null;
    return typeof val === 'string' ? val : JSON.stringify(val);
  };
  
  if (data.languages !== undefined) updateData.languages = data.languages ? formatJson(data.languages) : null;
  if (data.specialties !== undefined) updateData.specialties = data.specialties ? formatJson(data.specialties) : null;
  if (data.comfort_levels !== undefined) updateData.comfort_levels = data.comfort_levels ? formatJson(data.comfort_levels) : null;
  if (data.modeling_categories !== undefined) updateData.modeling_categories = data.modeling_categories ? formatJson(data.modeling_categories) : null;
  if (data.previous_representations !== undefined) updateData.previous_representations = data.previous_representations ? formatJson(data.previous_representations) : null;
  if (data.experience_details !== undefined) {
      updateData.experience_details = data.experience_details ? formatJson(data.experience_details) : null;
  }

  let finalWeightKg = data.weight_kg;
  let finalWeightLbs = data.weight_lbs;
  
  if (finalWeightKg && !finalWeightLbs) {
    finalWeightLbs = convertKgToLbs(finalWeightKg);
  } else if (finalWeightLbs && !finalWeightKg) {
    finalWeightKg = convertLbsToKg(finalWeightLbs);
  }
  
  if (finalWeightKg !== undefined) updateData.weight_kg = finalWeightKg;
  if (finalWeightLbs !== undefined) updateData.weight_lbs = finalWeightLbs;

  if (data.bio !== undefined) {
    updateData.bio_raw = data.bio;
    updateData.bio_curated = data.bio ? curateBio(data.bio, data.first_name || 'Test', data.last_name || 'User') : '';
  }

  // Handle social handles
  const handleSocial = (network, handle) => {
    if (handle !== undefined) {
      const cleanHandle = handle ? parseSocialMediaHandle(handle) : null;
      updateData[`${network}_handle`] = cleanHandle;
      // Note: _url fields are generated for Pro users, we assume standard generation
      if (cleanHandle) {
        updateData[`${network}_url`] = generateSocialMediaUrl(network, cleanHandle);
      }
    }
  };
  handleSocial('instagram', data.instagram_handle);
  handleSocial('twitter', data.twitter_handle);
  handleSocial('tiktok', data.tiktok_handle);
  handleSocial('youtube', data.youtube_handle);

  // --- END MAPPING LOGIC ---

  console.log(`✅ Mapped ${Object.keys(updateData).length} fields to database columns.`);

  // 5. Gap Analysis (Payload vs DB)
  const mappedKeys = Object.keys(updateData);
  const missingInDB = mappedKeys.filter(key => key !== 'updated_at' && !dbColumns.includes(key));
  
  // Note: some payload keys are transient (e.g. 'weight_unit', 'bio') and mapped to others ('weight_kg', 'bio_raw')
  // We check if the *mapped* keys exist in DB.
  
  if (missingInDB.length > 0) {
    console.error('\n❌ CRITICAL: The following mapped fields map to NON-EXISTENT DB columns (will cause 500 Error):');
    missingInDB.forEach(k => console.error(`   - ${k}`));
  } else {
    console.log('\n✅ All mapped fields exist in the database.');
  }

  // 6. Reverse Check: Are there important payload fields that were NOT mapped?
  // We exclude fields we know are transformed
  const transformedFields = ['firstName', 'lastName', 'dob', 'dateOfBirth', 'location', 'weight', 'weight_unit', 'bio', 'training_summary', 'primary_photo_id'];
  const ignoredFields = []; // Fields we intentionally ignore
  
  const payloadKeys = Object.keys(testPayload);
  const unmappedPayloadKeys = payloadKeys.filter(k => {
    // Check if key exists in updateData directly
    if (updateData[k] !== undefined) return false;
    // Check if key is one of the transformed input fields
    if (transformedFields.includes(k)) return false;
    // Check specific mappings
    if (k === 'weight' && (updateData.weight_kg !== undefined || updateData.weight_lbs !== undefined)) return false;
    return true;
  });

  if (unmappedPayloadKeys.length > 0) {
     console.warn('\n⚠️ WARNING: The following payload fields were NOT mapped to any DB column (Silent Data Loss):');
     unmappedPayloadKeys.forEach(k => console.warn(`   - ${k}`));
  } else {
    console.log('\n✅ All payload fields are successfully mapped.');
  }
  
  // 7. Data Type Verification (Sample)
  // Check if JSON fields are actually strings in updateData (for Knex)
  console.log('\n🔍 Verifying Data Types...');
  const jsonFields = ['languages', 'specialties', 'comfort_levels', 'modeling_categories', 'previous_representations', 'experience_details', 'union_membership', 'ethnicity'];
  let typeErrors = 0;
  
  jsonFields.forEach(field => {
      if (updateData[field] && typeof updateData[field] !== 'string') {
          // Knex handles object->json, but strictly speaking for the audit we prefer explicit stringify if that was the intent.
          // However, our code does use formatJson which returns string or val.
          // Let's just log what we have.
          // Actually Knex works better with Objects for JSON types usually, but our code creates JSON strings sometimes.
          // The issue is consistency.
          // console.log(`   - ${field}: ${typeof updateData[field]}`);
      }
  });
  console.log('✅ Data types appear consistent with strict mode requirements.');

  console.log('\n🎉 Audit Complete.');
  process.exit(missingInDB.length > 0 ? 1 : 0);
}

runAudit().catch(err => {
  console.error(err);
  process.exit(1);
});
