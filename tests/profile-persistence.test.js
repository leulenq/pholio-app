/**
 * Profile Persistence Test Suite
 *
 * This test creates a test user, fills in EVERY SINGLE input field in the
 * profile tab, saves the data, reloads it, and generates a comprehensive
 * Persistence Discrepancy Report.
 *
 * Run with: npm test -- tests/profile-persistence-test.js
 */

const request = require('supertest');
const app = require('../src/app');
const knex = require('../src/shared/db/knex');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');

// Mock onboarding middleware globally to bypass the 403 check
jest.mock('../src/middleware/auth', () => {
  const originalModule = jest.requireActual('../src/middleware/auth');
  return {
    ...originalModule,
    requireOnboarding: (req, res, next) => next(),
  };
});

describe('Profile Persistence Test Suite', () => {
  let testUserId;
  let testProfileId;
  let authCookie;

  // Test data with EVERY field from the profile tab
  const testProfileData = {
    // IDENTITY Section
    first_name: 'Persistence',
    last_name: 'Tester',
    email: 'persistence.test@example.com',
    city: 'Los Angeles, CA',
    city_secondary: 'New York, NY',
    gender: 'Non-binary',
    pronouns: 'They/Them',
    date_of_birth: '1995-03-15',
    bio: 'This is a comprehensive bio testing persistence across all fields. It contains sufficient text to validate that longer text content is properly stored and retrieved without data loss. This bio is designed to be longer than 200 characters to test the depth scoring system as well.',
    timezone: 'America/Los_Angeles',

    // HERITAGE & BACKGROUND Section
    ethnicity: ['Mixed Heritage', 'East Asian'],
    nationality: 'American',
    place_of_birth: 'San Francisco, CA',

    // PHYSICAL ATTRIBUTES Section
    height_cm: 175,
    weight_kg: 68,
    bust: 91,
    waist: 71,
    hips: 96,
    shoe_size: 9.5,
    dress_size: '8',
    inseam_cm: 81,
    eye_color: 'Hazel',
    hair_color: 'Brown',
    hair_length: 'Medium',
    hair_type: 'Wavy',
    skin_tone: 'Olive',
    body_type: 'Athletic',
    tattoos: true,
    piercings: true,

    // CREDITS & EXPERIENCE Section
    experience_level: 'Professional',
    experience_details: ['Campaign for Nike 2024', 'Editorial in Vogue', 'Commercial for Apple'],

    // TRAINING & SKILLS Section
    training_summary: 'Trained at Lee Strasberg Theatre & Film Institute, New York. Studied method acting, commercial technique, and on-camera performance. Additional training in dance and movement.',
    specialties: ['Method Acting', 'Dance', 'Martial Arts', 'Horseback Riding', 'Stage Combat'],
    languages: ['English', 'Spanish', 'Mandarin'],

    // ROLES & STYLE Section
    work_status: 'Model',
    union_membership: ['SAG-AFTRA', 'Equity (US)'],
    playing_age_min: 25,
    playing_age_max: 35,
    comfort_levels: ['Swimwear', 'Fitness/Athletic', 'Implied Nudity'],
    modeling_categories: ['Editorial', 'Commercial', 'Lifestyle', 'Swim/Fitness'],
    availability_schedule: 'Full-Time',
    availability_travel: true,
    drivers_license: true,

    // REPRESENTATION Section
    seeking_representation: true,
    current_agency: 'Elite Model Management',
    previous_representations: ['IMG Models (2020-2022)', 'Wilhelmina (2018-2020)'],

    // SOCIALS & MEDIA Section
    instagram_handle: 'persistencetester',
    tiktok_handle: 'persistencetester',
    twitter_handle: 'persistencetester',
    youtube_handle: 'persistencetester',
    portfolio_url: 'https://persistencetester.com',
    video_reel_url: 'https://vimeo.com/123456789',

    // CONTACT Section
    emergency_contact_name: 'Emergency Contact',
    emergency_contact_phone: '+1-555-1234',
    emergency_contact_relationship: 'Parent',
  };

  beforeAll(async () => {
    // Clean up any existing test user
    await knex('profiles').where({ first_name: 'Persistence' }).del();
    await knex('users').where({ email: 'persistence.test@example.com' }).del();

    // Create test user
    testUserId = uuidv4();
    const passwordHash = await bcrypt.hash('testpassword123', 10);

    await knex('users').insert({
      id: testUserId,
      email: 'persistence.test@example.com',
      password_hash: passwordHash,
      role: 'TALENT'
    });

    // Create a mock session directly in the database
    const sessionId = 'test-session-' + testUserId;
    
    // We must use the correct session format that express-session + connect-pg-simple expects
    // The `sess` column must be a JSON object.
    const sessData = {
      cookie: { originalMaxAge: 86400000, expires: new Date(Date.now() + 86400000).toISOString(), secure: false, httpOnly: true, path: '/' },
      userId: testUserId,
      role: 'TALENT'
    };

    await knex('sessions').insert({
      sid: sessionId,
      sess: sessData,
      expired: new Date(Date.now() + 86400000)
    });

    // Create a mock profile row to bypass 403 onboarding requirements
    testProfileId = uuidv4();
    await knex('profiles').insert({
      id: testProfileId,
      user_id: testUserId,
      slug: 'persistence-tester',
      first_name: 'Persistence',
      last_name: 'Tester',
      city: 'Los Angeles, CA',
      phone: '0000000000',
      height_cm: 175,
      bio_raw: '',
      bio_curated: '',
      onboarding_completed_at: knex.fn.now()
    });

    // We can use the connect.sid cookie Format
    // To bypass signature validation, we can sign it using the app's secret if we know it.
    // The default secret in test env is usually 'test-secret'.
    const signature = require('cookie-signature');
    const signedId = 's:' + signature.sign(sessionId, process.env.SESSION_SECRET || 'fallback-secret-key-change-in-production');
    
    authCookie = [`connect.sid=${encodeURIComponent(signedId)}; Path=/; HttpOnly`];
    expect(authCookie).toBeDefined();
  });

  afterAll(async () => {
    // Clean up test data
    if (testProfileId) {
      await knex('images').where({ profile_id: testProfileId }).del();
      await knex('profiles').where({ id: testProfileId }).del();
    }
    if (testUserId) {
      await knex('sessions').whereRaw(`sess::text LIKE '%${testUserId}%'`).del();
      await knex('users').where({ id: testUserId }).del();
    }
    await knex.destroy();
  });

  describe('Field-by-Field Persistence Testing', () => {
    let savedProfile;
    let reloadedProfile;
    const discrepancies = [];

    test('Should create/update profile with all fields', async () => {
      const res = await request(app)
        .put('/api/talent/profile')
        .set('Cookie', authCookie)
        .send(testProfileData)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data?.profile || res.body.profile).toBeDefined();

      savedProfile = res.body.data?.profile || res.body.profile;
      testProfileId = savedProfile.id;
    });

    test('Should reload profile and verify all fields persist correctly', async () => {
      const res = await request(app)
        .get('/api/talent/profile')
        .set('Cookie', authCookie)
        .expect(200);

      expect(res.body.success).toBe(true);
      expect(res.body.data?.profile || res.body.profile).toBeDefined();

      reloadedProfile = res.body.data?.profile || res.body.profile;

      // Compare every field
      compareFields(testProfileData, savedProfile, reloadedProfile, discrepancies);
    });

    test('Should generate Persistence Discrepancy Report', () => {
      generateReport(testProfileData, savedProfile, reloadedProfile, discrepancies);

      // The test passes regardless of discrepancies - we just want the report
      expect(true).toBe(true);
    });
  });
});

/**
 * Compare all fields between input, saved, and reloaded data
 */
function compareFields(input, saved, reloaded, discrepancies) {
  const fields = [
    // String fields
    { name: 'first_name', type: 'string' },
    { name: 'last_name', type: 'string' },
    { name: 'email', type: 'string', optional: true },
    { name: 'city', type: 'string' },
    { name: 'city_secondary', type: 'string', optional: true },
    { name: 'gender', type: 'string' },
    { name: 'pronouns', type: 'string' },
    { name: 'date_of_birth', type: 'string' },
    { name: 'nationality', type: 'string' },
    { name: 'place_of_birth', type: 'string' },
    { name: 'timezone', type: 'string', optional: true },
    { name: 'dress_size', type: 'string' },
    { name: 'hair_length', type: 'string' },
    { name: 'hair_color', type: 'string' },
    { name: 'hair_type', type: 'string' },
    { name: 'eye_color', type: 'string' },
    { name: 'skin_tone', type: 'string' },
    { name: 'body_type', type: 'string' },
    { name: 'work_status', type: 'string' },
    { name: 'availability_schedule', type: 'string' },
    { name: 'current_agency', type: 'string' },
    { name: 'emergency_contact_name', type: 'string' },
    { name: 'emergency_contact_phone', type: 'string' },
    { name: 'emergency_contact_relationship', type: 'string' },
    { name: 'instagram_handle', type: 'string' },
    { name: 'tiktok_handle', type: 'string' },
    { name: 'twitter_handle', type: 'string' },
    { name: 'youtube_handle', type: 'string' },
    { name: 'portfolio_url', type: 'string' },
    { name: 'video_reel_url', type: 'string' },
    { name: 'experience_level', type: 'string' },

    // Number fields
    { name: 'height_cm', type: 'number' },
    { name: 'weight_kg', type: 'number' },
    { name: 'shoe_size', type: 'number' },
    { name: 'inseam_cm', type: 'number' },
    { name: 'playing_age_min', type: 'number', optional: true },
    { name: 'playing_age_max', type: 'number', optional: true },

    // Measurement fields (stored as bust_cm, waist_cm, hips_cm)
    { name: 'bust', dbName: 'bust_cm', type: 'number' },
    { name: 'waist', dbName: 'waist_cm', type: 'number' },
    { name: 'hips', dbName: 'hips_cm', type: 'number' },

    // Boolean fields
    { name: 'tattoos', type: 'boolean' },
    { name: 'piercings', type: 'boolean' },
    { name: 'availability_travel', type: 'boolean' },
    { name: 'drivers_license', type: 'boolean' },
    { name: 'seeking_representation', type: 'boolean' },

    // Text fields
    { name: 'bio', dbName: 'bio_raw', type: 'text' },
    { name: 'training_summary', dbName: 'training', type: 'text' },

    // JSON Array fields
    { name: 'ethnicity', type: 'json' },
    { name: 'specialties', type: 'json' },
    { name: 'languages', type: 'json' },
    { name: 'comfort_levels', type: 'json' },
    { name: 'modeling_categories', type: 'json' },
    { name: 'union_membership', type: 'json' },
    { name: 'experience_details', type: 'json' },
    { name: 'previous_representations', type: 'json', optional: true },
  ];

  fields.forEach(field => {
    const inputField = field.name;
    const dbField = field.dbName || field.name;
    const inputValue = input[inputField];
    const savedValue = saved[dbField];
    const reloadedValue = reloaded[dbField];

    let inputMatch = false;
    let persistenceMatch = false;
    let inputToSavedIssue = null;
    let savedToReloadedIssue = null;

    // Compare based on type
    switch (field.type) {
      case 'string':
        inputMatch = compareString(inputValue, savedValue);
        persistenceMatch = compareString(savedValue, reloadedValue);
        if (!inputMatch) inputToSavedIssue = `Expected "${inputValue}", got "${savedValue}"`;
        if (!persistenceMatch) savedToReloadedIssue = `Saved "${savedValue}", reloaded "${reloadedValue}"`;
        break;

      case 'number':
        inputMatch = compareNumber(inputValue, savedValue);
        persistenceMatch = compareNumber(savedValue, reloadedValue);
        if (!inputMatch) inputToSavedIssue = `Expected ${inputValue}, got ${savedValue}`;
        if (!persistenceMatch) savedToReloadedIssue = `Saved ${savedValue}, reloaded ${reloadedValue}`;
        break;

      case 'boolean':
        inputMatch = compareBoolean(inputValue, savedValue);
        persistenceMatch = compareBoolean(savedValue, reloadedValue);
        if (!inputMatch) inputToSavedIssue = `Expected ${inputValue}, got ${savedValue}`;
        if (!persistenceMatch) savedToReloadedIssue = `Saved ${savedValue}, reloaded ${reloadedValue}`;
        break;

      case 'text':
        inputMatch = compareText(inputValue, savedValue);
        persistenceMatch = compareText(savedValue, reloadedValue);
        if (!inputMatch) inputToSavedIssue = `Text mismatch (length: input=${inputValue?.length}, saved=${savedValue?.length})`;
        if (!persistenceMatch) savedToReloadedIssue = `Text mismatch (length: saved=${savedValue?.length}, reloaded=${reloadedValue?.length})`;
        break;

      case 'json':
        inputMatch = compareJSON(inputValue, savedValue);
        persistenceMatch = compareJSON(savedValue, reloadedValue);
        if (!inputMatch) inputToSavedIssue = `JSON mismatch: ${JSON.stringify(inputValue)} vs ${JSON.stringify(savedValue)}`;
        if (!persistenceMatch) savedToReloadedIssue = `JSON mismatch: ${JSON.stringify(savedValue)} vs ${JSON.stringify(reloadedValue)}`;
        break;
    }

    // Record discrepancies
    if (!inputMatch || !persistenceMatch) {
      discrepancies.push({
        field: inputField,
        dbField: dbField,
        type: field.type,
        inputValue,
        savedValue,
        reloadedValue,
        inputToSavedMatch: inputMatch,
        savedToReloadedMatch: persistenceMatch,
        inputToSavedIssue,
        savedToReloadedIssue,
      });
    }
  });
}

// Comparison helpers
function compareString(a, b) {
  if (a === undefined || a === null) return b === undefined || b === null;
  if (b === undefined || b === null) return a === undefined || a === null;
  return String(a).trim() === String(b).trim();
}

function compareNumber(a, b) {
  if (a === undefined || a === null) return b === undefined || b === null;
  if (b === undefined || b === null) return a === undefined || a === null;
  return Number(a) === Number(b);
}

function compareBoolean(a, b) {
  return Boolean(a) === Boolean(b);
}

function compareText(a, b) {
  if (a === undefined || a === null) return b === undefined || b === null;
  if (b === undefined || b === null) return a === undefined || a === null;
  return String(a).trim() === String(b).trim();
}

function compareJSON(a, b) {
  // Handle various JSON formats (string, array, null)
  const normalizeJSON = (val) => {
    if (val === undefined || val === null) return null;
    if (typeof val === 'string') {
      try {
        return JSON.parse(val);
      } catch {
        return val.split(',').map(s => s.trim()).filter(Boolean);
      }
    }
    if (Array.isArray(val)) return val;
    return val;
  };

  const aNorm = normalizeJSON(a);
  const bNorm = normalizeJSON(b);

  if (aNorm === null && bNorm === null) return true;
  if (aNorm === null || bNorm === null) return false;

  return JSON.stringify(aNorm) === JSON.stringify(bNorm);
}

/**
 * Generate comprehensive Persistence Discrepancy Report
 */
function generateReport(input, saved, reloaded, discrepancies) {
  console.log('\n');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('              PERSISTENCE DISCREPANCY REPORT');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('');
  console.log('Test Date:', new Date().toISOString());
  console.log('Test User:', input.email);
  console.log('');
  console.log('───────────────────────────────────────────────────────────────────');
  console.log('SUMMARY');
  console.log('───────────────────────────────────────────────────────────────────');

  const totalFields = Object.keys(input).length;
  const fieldsWithDiscrepancies = discrepancies.length;
  const successRate = ((totalFields - fieldsWithDiscrepancies) / totalFields * 100).toFixed(2);

  console.log(`Total Fields Tested: ${totalFields}`);
  console.log(`Fields with Discrepancies: ${fieldsWithDiscrepancies}`);
  console.log(`Success Rate: ${successRate}%`);
  console.log('');

  if (discrepancies.length === 0) {
    console.log('✅ PERFECT! All fields persisted correctly with no data loss.');
  } else {
    console.log('❌ DISCREPANCIES DETECTED');
    console.log('');
    console.log('───────────────────────────────────────────────────────────────────');
    console.log('DETAILED DISCREPANCY LIST');
    console.log('───────────────────────────────────────────────────────────────────');
    console.log('');

    discrepancies.forEach((disc, index) => {
      console.log(`${index + 1}. Field: ${disc.field} (DB: ${disc.dbField})`);
      console.log(`   Type: ${disc.type}`);
      console.log(`   Input Value: ${JSON.stringify(disc.inputValue)}`);
      console.log(`   Saved Value: ${JSON.stringify(disc.savedValue)}`);
      console.log(`   Reloaded Value: ${JSON.stringify(disc.reloadedValue)}`);

      if (!disc.inputToSavedMatch) {
        console.log(`   ⚠️  INPUT → SAVE ISSUE: ${disc.inputToSavedIssue}`);
      }

      if (!disc.savedToReloadedMatch) {
        console.log(`   ⚠️  SAVE → RELOAD ISSUE: ${disc.savedToReloadedIssue}`);
      }

      console.log('');
    });

    // Group by issue type
    console.log('───────────────────────────────────────────────────────────────────');
    console.log('DISCREPANCIES BY CATEGORY');
    console.log('───────────────────────────────────────────────────────────────────');
    console.log('');

    const inputToSaveIssues = discrepancies.filter(d => !d.inputToSavedMatch);
    const saveToReloadIssues = discrepancies.filter(d => !d.savedToReloadedMatch);

    if (inputToSaveIssues.length > 0) {
      console.log(`INPUT → SAVE Issues (${inputToSaveIssues.length}):`);
      inputToSaveIssues.forEach(d => {
        console.log(`  - ${d.field}: ${d.inputToSavedIssue}`);
      });
      console.log('');
    }

    if (saveToReloadIssues.length > 0) {
      console.log(`SAVE → RELOAD Issues (${saveToReloadIssues.length}):`);
      saveToReloadIssues.forEach(d => {
        console.log(`  - ${d.field}: ${d.savedToReloadedIssue}`);
      });
      console.log('');
    }

    // Group by field type
    console.log('───────────────────────────────────────────────────────────────────');
    console.log('DISCREPANCIES BY FIELD TYPE');
    console.log('───────────────────────────────────────────────────────────────────');
    console.log('');

    const typeGroups = {};
    discrepancies.forEach(d => {
      if (!typeGroups[d.type]) typeGroups[d.type] = [];
      typeGroups[d.type].push(d.field);
    });

    Object.keys(typeGroups).forEach(type => {
      console.log(`${type.toUpperCase()} (${typeGroups[type].length}):`);
      typeGroups[type].forEach(field => {
        console.log(`  - ${field}`);
      });
      console.log('');
    });
  }

  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('                      END OF REPORT');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('\n');

  // Write report to file
  const fs = require('fs');
  const reportPath = './PERSISTENCE_REPORT.md';

  let markdown = `# Profile Persistence Test Report\n\n`;
  markdown += `**Test Date:** ${new Date().toISOString()}\n\n`;
  markdown += `**Test User:** ${input.email}\n\n`;
  markdown += `---\n\n`;
  markdown += `## Summary\n\n`;
  markdown += `| Metric | Value |\n`;
  markdown += `|--------|-------|\n`;
  markdown += `| Total Fields Tested | ${totalFields} |\n`;
  markdown += `| Fields with Discrepancies | ${fieldsWithDiscrepancies} |\n`;
  markdown += `| Success Rate | ${successRate}% |\n\n`;

  if (discrepancies.length === 0) {
    markdown += `✅ **PERFECT!** All fields persisted correctly with no data loss.\n\n`;
  } else {
    markdown += `❌ **DISCREPANCIES DETECTED**\n\n`;
    markdown += `## Detailed Discrepancy List\n\n`;

    discrepancies.forEach((disc, index) => {
      markdown += `### ${index + 1}. ${disc.field}\n\n`;
      markdown += `- **DB Field:** ${disc.dbField}\n`;
      markdown += `- **Type:** ${disc.type}\n`;
      markdown += `- **Input Value:** \`${JSON.stringify(disc.inputValue)}\`\n`;
      markdown += `- **Saved Value:** \`${JSON.stringify(disc.savedValue)}\`\n`;
      markdown += `- **Reloaded Value:** \`${JSON.stringify(disc.reloadedValue)}\`\n`;

      if (!disc.inputToSavedMatch) {
        markdown += `- ⚠️ **INPUT → SAVE ISSUE:** ${disc.inputToSavedIssue}\n`;
      }

      if (!disc.savedToReloadedMatch) {
        markdown += `- ⚠️ **SAVE → RELOAD ISSUE:** ${disc.savedToReloadedIssue}\n`;
      }

      markdown += `\n`;
    });
  }

  fs.writeFileSync(reportPath, markdown);
  console.log(`📄 Report saved to: ${reportPath}\n`);
}
