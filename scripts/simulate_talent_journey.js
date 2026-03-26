#!/usr/bin/env node
/**
 * Black Box UAT: Simulate Complete Talent Onboarding Journey
 *
 * Tests the entire casting flow from signup to completion:
 * 1. Auth: Create Firebase user and login
 * 2. Entry: Initialize casting flow
 * 3. Scout: Upload photo and get AI analysis
 * 4. Measurements: Submit measurements in CM
 * 5. Profile: Submit location and experience
 * 6. Complete: Finalize onboarding
 * 7. Verify: Check database integrity
 *
 * Usage:
 *   node scripts/simulate_talent_journey.js
 *
 * Environment:
 *   Requires Firebase Admin credentials in .env
 */

const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
require('dotenv').config();

// Firebase Admin SDK
const admin = require('firebase-admin');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

const log = {
  step: (msg) => console.log(`\n${colors.bright}${colors.blue}▶ ${msg}${colors.reset}`),
  success: (msg) => console.log(`${colors.green}✓ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}✗ ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.cyan}  ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}⚠ ${msg}${colors.reset}`),
  data: (label, data) => console.log(`${colors.cyan}  ${label}:${colors.reset}`, JSON.stringify(data, null, 2))
};

// Configuration
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TIMESTAMP = Date.now();
const TEST_EMAIL = `test_talent_${TIMESTAMP}@example.com`;
const TEST_PASSWORD = 'TestPassword123!';

// Initialize Firebase Admin if not already initialized
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL
    })
  });
}

// Create axios instance with cookie jar
const jar = new CookieJar();
const client = wrapper(axios.create({
  baseURL: BASE_URL,
  jar,
  withCredentials: true,
  validateStatus: null // Don't throw on any status code
}));

// Test data
const testData = {
  measurements: {
    height_cm: 175,
    weight_kg: 60,
    bust_cm: 86,   // 34 inches
    waist_cm: 61,  // 24 inches
    hips_cm: 91    // 36 inches
  },
  profile: {
    city: 'New York, USA',
    experience_level: 'intermediate'
  }
};

/**
 * Step 1: Create Firebase user and get ID token
 */
async function setupAuth() {
  log.step('STEP 1: Authentication Setup');

  try {
    // Create Firebase user
    log.info('Creating Firebase user...');
    const userRecord = await admin.auth().createUser({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      displayName: 'Test Talent',
      emailVerified: true
    });

    log.success(`Firebase user created: ${userRecord.uid}`);
    log.data('User', { uid: userRecord.uid, email: userRecord.email });

    // Create custom token
    log.info('Generating custom token...');
    const customToken = await admin.auth().createCustomToken(userRecord.uid);
    log.success('Custom token generated');

    // Exchange custom token for ID token using Firebase REST API
    log.info('Exchanging for ID token...');
    const apiKey = process.env.FIREBASE_API_KEY;
    if (!apiKey) {
      throw new Error('FIREBASE_API_KEY not found in environment');
    }

    const tokenResponse = await axios.post(
      `https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${apiKey}`,
      { token: customToken, returnSecureToken: true }
    );

    const idToken = tokenResponse.data.idToken;
    log.success('ID token obtained');

    return { uid: userRecord.uid, idToken };

  } catch (error) {
    log.error(`Auth setup failed: ${error.message}`);
    if (error.response) {
      log.data('Error response', error.response.data);
    }
    throw error;
  }
}

/**
 * Step 2: Login to backend and create session
 */
async function login(idToken) {
  log.step('STEP 2: Backend Login');

  try {
    const response = await client.post('/login', {
      firebase_token: idToken
    }, {
      headers: { 'Content-Type': 'application/json' }
    });

    if (response.status === 200 || response.status === 302) {
      log.success('Login successful');
      log.data('Session cookies', jar.getCookiesSync(BASE_URL).map(c => c.key));
      return true;
    } else {
      log.error(`Login failed with status ${response.status}`);
      log.data('Response', response.data);
      return false;
    }
  } catch (error) {
    log.error(`Login request failed: ${error.message}`);
    throw error;
  }
}

/**
 * Step 3: Initialize casting flow (entry step)
 *
 * Note: Since user already logged in via Firebase, profile already exists.
 * This step just needs to initialize the state or can be skipped.
 */
async function initializeCasting() {
  log.step('STEP 3: Initialize Casting Flow');

  try {
    // User is already logged in and profile created by auto-login
    // Just verify we can access the status endpoint
    const statusResponse = await client.get('/casting/status');

    if (statusResponse.status === 200) {
      log.success('Casting flow ready - profile exists');
      log.data('Status', statusResponse.data);
      return statusResponse.data;
    }

    // If status returns 404, try initializing via entry
    log.info('Attempting to initialize via entry endpoint...');
    const response = await client.post('/casting/entry', {
      first_name: 'Test',
      last_name: 'Talent',
      date_of_birth: '1995-05-15'
    });

    if (response.status === 200) {
      log.success('Casting flow initialized via entry');
      log.data('Response', response.data);
      return response.data;
    } else {
      log.error(`Entry failed with status ${response.status}`);
      log.data('Response', response.data);
      throw new Error('Entry step failed');
    }
  } catch (error) {
    log.error(`Entry request failed: ${error.message}`);
    throw error;
  }
}

/**
 * Step 4: Upload photo (scout step)
 *
 * Note: This requires a real image file. We'll create a minimal test image.
 */
async function uploadPhoto() {
  log.step('STEP 4: Scout - Upload Photo');

  try {
    // Create a test image file (1x1 pixel PNG)
    const testImagePath = path.join(__dirname, 'test-headshot.png');

    // Minimal valid PNG (1x1 transparent pixel)
    const pngBuffer = Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00,
      0x0A, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82
    ]);

    fs.writeFileSync(testImagePath, pngBuffer);
    log.info(`Created test image: ${testImagePath}`);

    // Upload using multipart/form-data
    const form = new FormData();
    form.append('digi', fs.createReadStream(testImagePath), {
      filename: 'headshot.png',
      contentType: 'image/png'
    });

    const response = await client.post('/casting/scout', form, {
      headers: {
        ...form.getHeaders()
      },
      maxBodyLength: Infinity,
      maxContentLength: Infinity
    });

    // Cleanup
    fs.unlinkSync(testImagePath);

    if (response.status === 200) {
      log.success('Photo uploaded and analyzed');
      log.data('AI Predictions', response.data.predictions || 'N/A');
      return response.data;
    } else {
      log.error(`Scout failed with status ${response.status}`);
      log.data('Response', response.data);
      throw new Error('Scout step failed');
    }
  } catch (error) {
    log.error(`Scout request failed: ${error.message}`);
    if (error.response) {
      log.data('Error response', error.response.data);
    }
    throw error;
  }
}

/**
 * Step 5: Submit measurements (THE CRITICAL TEST)
 */
async function submitMeasurements() {
  log.step('STEP 5: Measurements - The Critical Unit Test');

  try {
    log.info('Submitting measurements in CM...');
    log.data('Payload', testData.measurements);

    const response = await client.post('/casting/measurements', testData.measurements);

    if (response.status === 200) {
      log.success('Measurements accepted');
      log.data('Response', response.data);
      return response.data;
    } else {
      log.error(`Measurements failed with status ${response.status}`);
      log.data('Response', response.data);
      throw new Error('Measurements step failed');
    }
  } catch (error) {
    log.error(`Measurements request failed: ${error.message}`);
    if (error.response) {
      log.data('Error response', error.response.data);
    }
    throw error;
  }
}

/**
 * Step 6: Submit profile details
 */
async function submitProfile() {
  log.step('STEP 6: Profile - Location & Experience');

  try {
    log.data('Payload', testData.profile);

    const response = await client.post('/casting/profile', testData.profile);

    if (response.status === 200) {
      log.success('Profile completed');
      log.data('Response', response.data);
      return response.data;
    } else {
      log.error(`Profile failed with status ${response.status}`);
      log.data('Response', response.data);
      throw new Error('Profile step failed');
    }
  } catch (error) {
    log.error(`Profile request failed: ${error.message}`);
    if (error.response) {
      log.data('Error response', error.response.data);
    }
    throw error;
  }
}

/**
 * Step 7: Complete casting flow
 */
async function completeCasting() {
  log.step('STEP 7: Complete Onboarding');

  try {
    const response = await client.post('/casting/complete', {});

    if (response.status === 200) {
      log.success('Onboarding completed');
      log.data('Response', response.data);
      return response.data;
    } else {
      log.error(`Complete failed with status ${response.status}`);
      log.data('Response', response.data);
      throw new Error('Complete step failed');
    }
  } catch (error) {
    log.error(`Complete request failed: ${error.message}`);
    if (error.response) {
      log.data('Error response', error.response.data);
    }
    throw error;
  }
}

/**
 * Step 8: Verify data integrity
 */
async function verifyData(uid) {
  log.step('STEP 8: DATA VERIFICATION - The Moment of Truth');

  try {
    // Fetch profile directly from database
    const knex = require('../src/shared/db/knex');

    const user = await knex('users').where({ firebase_uid: uid }).first();
    if (!user) {
      log.error('User not found in database');
      return false;
    }

    const profile = await knex('profiles').where({ user_id: user.id }).first();
    if (!profile) {
      log.error('Profile not found in database');
      return false;
    }

    log.info('Profile fetched successfully from database');

    // Helper: Compare numeric values (handles string vs number from Postgres NUMERIC)
    const compareNumeric = (actual, expected) => {
      return parseFloat(actual) === parseFloat(expected);
    };

    // Assertions
    const assertions = [];

    // 1. Bust measurement
    if (compareNumeric(profile.bust_cm, testData.measurements.bust_cm)) {
      log.success(`✓ bust_cm = ${profile.bust_cm} (expected: ${testData.measurements.bust_cm})`);
      assertions.push({ field: 'bust_cm', status: 'PASS' });
    } else {
      log.error(`✗ bust_cm = ${profile.bust_cm} (expected: ${testData.measurements.bust_cm})`);
      assertions.push({ field: 'bust_cm', status: 'FAIL', actual: profile.bust_cm, expected: testData.measurements.bust_cm });
    }

    // 2. Waist measurement
    if (compareNumeric(profile.waist_cm, testData.measurements.waist_cm)) {
      log.success(`✓ waist_cm = ${profile.waist_cm} (expected: ${testData.measurements.waist_cm})`);
      assertions.push({ field: 'waist_cm', status: 'PASS' });
    } else {
      log.error(`✗ waist_cm = ${profile.waist_cm} (expected: ${testData.measurements.waist_cm})`);
      assertions.push({ field: 'waist_cm', status: 'FAIL', actual: profile.waist_cm, expected: testData.measurements.waist_cm });
    }

    // 3. Hips measurement
    if (compareNumeric(profile.hips_cm, testData.measurements.hips_cm)) {
      log.success(`✓ hips_cm = ${profile.hips_cm} (expected: ${testData.measurements.hips_cm})`);
      assertions.push({ field: 'hips_cm', status: 'PASS' });
    } else {
      log.error(`✗ hips_cm = ${profile.hips_cm} (expected: ${testData.measurements.hips_cm})`);
      assertions.push({ field: 'hips_cm', status: 'FAIL', actual: profile.hips_cm, expected: testData.measurements.hips_cm });
    }

    // 4. Height measurement
    if (compareNumeric(profile.height_cm, testData.measurements.height_cm)) {
      log.success(`✓ height_cm = ${profile.height_cm} (expected: ${testData.measurements.height_cm})`);
      assertions.push({ field: 'height_cm', status: 'PASS' });
    } else {
      log.error(`✗ height_cm = ${profile.height_cm} (expected: ${testData.measurements.height_cm})`);
      assertions.push({ field: 'height_cm', status: 'FAIL', actual: profile.height_cm, expected: testData.measurements.height_cm });
    }

    // 5. Weight measurement
    if (compareNumeric(profile.weight_kg, testData.measurements.weight_kg)) {
      log.success(`✓ weight_kg = ${profile.weight_kg} (expected: ${testData.measurements.weight_kg})`);
      assertions.push({ field: 'weight_kg', status: 'PASS' });
    } else {
      log.error(`✗ weight_kg = ${profile.weight_kg} (expected: ${testData.measurements.weight_kg})`);
      assertions.push({ field: 'weight_kg', status: 'FAIL', actual: profile.weight_kg, expected: testData.measurements.weight_kg });
    }

    // 6. City/Location
    if (profile.city === testData.profile.city) {
      log.success(`✓ city = "${profile.city}" (expected: "${testData.profile.city}")`);
      assertions.push({ field: 'city', status: 'PASS' });
    } else {
      log.error(`✗ city = "${profile.city}" (expected: "${testData.profile.city}")`);
      assertions.push({ field: 'city', status: 'FAIL', actual: profile.city, expected: testData.profile.city });
    }

    // 7. Experience level
    if (profile.experience_level === testData.profile.experience_level) {
      log.success(`✓ experience_level = "${profile.experience_level}" (expected: "${testData.profile.experience_level}")`);
      assertions.push({ field: 'experience_level', status: 'PASS' });
    } else {
      log.error(`✗ experience_level = "${profile.experience_level}" (expected: "${testData.profile.experience_level}")`);
      assertions.push({ field: 'experience_level', status: 'FAIL', actual: profile.experience_level, expected: testData.profile.experience_level });
    }

    // 8. Photo URL
    if (profile.photo_url_primary) {
      log.success(`✓ photo_url_primary is present: ${profile.photo_url_primary}`);
      assertions.push({ field: 'photo_url_primary', status: 'PASS' });
    } else {
      log.error(`✗ photo_url_primary is missing`);
      assertions.push({ field: 'photo_url_primary', status: 'FAIL', actual: null, expected: 'non-null' });
    }

    // 9. Onboarding completion
    if (profile.onboarding_completed_at) {
      log.success(`✓ onboarding_completed_at is set: ${profile.onboarding_completed_at}`);
      assertions.push({ field: 'onboarding_completed_at', status: 'PASS' });
    } else {
      log.error(`✗ onboarding_completed_at is not set`);
      assertions.push({ field: 'onboarding_completed_at', status: 'FAIL', actual: null, expected: 'timestamp' });
    }

    // Summary
    const passed = assertions.filter(a => a.status === 'PASS').length;
    const failed = assertions.filter(a => a.status === 'FAIL').length;

    console.log('\n' + '='.repeat(60));
    if (failed === 0) {
      log.success(`ALL ASSERTIONS PASSED (${passed}/${assertions.length})`);
      console.log('='.repeat(60));
      return true;
    } else {
      log.error(`SOME ASSERTIONS FAILED (${passed}/${assertions.length} passed, ${failed} failed)`);
      console.log('='.repeat(60));
      log.data('Failed assertions', assertions.filter(a => a.status === 'FAIL'));
      return false;
    }

  } catch (error) {
    log.error(`Verification failed: ${error.message}`);
    if (error.response) {
      log.data('Error response', error.response.data);
    }
    return false;
  }
}

/**
 * Cleanup: Delete test user
 */
async function cleanup(uid) {
  log.step('CLEANUP: Removing Test User');

  try {
    await admin.auth().deleteUser(uid);
    log.success(`Firebase user deleted: ${uid}`);
  } catch (error) {
    log.warn(`Cleanup failed: ${error.message}`);
  }
}

/**
 * Main execution
 */
async function main() {
  console.log(`
${colors.bright}${colors.cyan}╔════════════════════════════════════════════════════════════╗
║                                                            ║
║        PHOLIO UAT - TALENT CASTING JOURNEY SIMULATOR       ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝${colors.reset}
`);

  log.info(`Test User: ${TEST_EMAIL}`);
  log.info(`Base URL: ${BASE_URL}`);
  log.info(`Timestamp: ${TIMESTAMP}`);

  let uid = null;
  let success = false;

  try {
    // Step 1: Setup auth
    const auth = await setupAuth();
    uid = auth.uid;

    // Step 2: Login
    await login(auth.idToken);

    // Step 3: Initialize casting
    await initializeCasting();

    // Step 4: Upload photo
    await uploadPhoto();

    // Step 5: Submit measurements (CRITICAL)
    await submitMeasurements();

    // Step 6: Submit profile
    await submitProfile();

    // Step 7: Complete
    await completeCasting();

    // Step 8: Verify
    success = await verifyData(uid);

  } catch (error) {
    log.error(`Journey failed: ${error.message}`);
    console.error(error.stack);
    success = false;
  } finally {
    // Cleanup (optional - comment out to inspect test data)
    if (uid) {
      // await cleanup(uid);
      log.info(`Test user left in database for inspection: ${TEST_EMAIL}`);
    }
  }

  // Final result
  console.log('\n' + '='.repeat(60));
  if (success) {
    console.log(`${colors.bright}${colors.green}✓ UAT PASSED${colors.reset}`);
  } else {
    console.log(`${colors.bright}${colors.red}✗ UAT FAILED${colors.reset}`);
    process.exit(1);
  }
  console.log('='.repeat(60) + '\n');
}

// Run
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
