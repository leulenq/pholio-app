const knex = require('knex')(require('../knexfile.js'));
const { v4: uuidv4 } = require('uuid');
const { updateProfileCompleteness } = require('../src/domains/talent/services/profile-completeness');

const LEUL_PROFILE_ID = '0b077046-44d7-4091-8bc5-b49cf52525c1';
const NATAN_PROFILE_ID = '7c1fe4d2-9b8c-4d48-b2ba-bdd1727ff808';

const leulImages = [
  {
    label: 'Digital Headshot',
    sort: 1,
    image_type: 'digital',
    shot_type: 'headshot',
    is_primary: true,
    status: 'active',
    path: 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=1000&q=80',
    metadata: JSON.stringify({
      caption: 'Digital Headshot (Front View)',
      ai: { signals: { expression: 'neutral' } }
    })
  },
  {
    label: 'Digital Full Body',
    sort: 2,
    image_type: 'digital',
    shot_type: 'full_length',
    is_primary: false,
    status: 'active',
    path: 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=1000&q=80',
    metadata: JSON.stringify({
      caption: 'Digital Full Body (Front View)',
      ai: { signals: {} }
    })
  },
  {
    label: 'Digital Profile View',
    sort: 3,
    image_type: 'digital',
    shot_type: 'profile',
    is_primary: false,
    status: 'active',
    path: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=1000&q=80',
    metadata: JSON.stringify({
      caption: 'Digital Profile (Side View)',
      ai: { signals: {} }
    })
  },
  {
    label: 'Digital Smiling Headshot',
    sort: 4,
    image_type: 'digital',
    shot_type: 'headshot',
    is_primary: false,
    status: 'active',
    path: 'https://images.unsplash.com/photo-1492562080023-ab3db95bfbce?auto=format&fit=crop&w=1000&q=80',
    metadata: JSON.stringify({
      caption: 'Digital Headshot (Smiling)',
      ai: { signals: { expression: 'smile' } }
    })
  },
  {
    label: 'Digital Back View',
    sort: 5,
    image_type: 'digital',
    shot_type: 'back',
    is_primary: false,
    status: 'active',
    path: 'https://images.unsplash.com/photo-1500048993953-d23a436266cf?auto=format&fit=crop&w=1000&q=80',
    metadata: JSON.stringify({
      caption: 'Digital Back (Rear View)',
      ai: { signals: {} }
    })
  },
  {
    label: 'Editorial Portfolio',
    sort: 6,
    image_type: 'portfolio',
    style_type: 'editorial',
    is_primary: false,
    status: 'active',
    path: 'https://images.unsplash.com/photo-1617137968427-85924c800a22?auto=format&fit=crop&w=1000&q=80',
    metadata: JSON.stringify({
      caption: 'High Fashion Editorial shoot',
      ai: { signals: {} }
    })
  },
  {
    label: 'Lifestyle Portfolio',
    sort: 7,
    image_type: 'portfolio',
    style_type: 'lifestyle',
    is_primary: false,
    status: 'active',
    path: 'https://images.unsplash.com/photo-1480455624313-e29b44bbfde1?auto=format&fit=crop&w=1000&q=80',
    metadata: JSON.stringify({
      caption: 'Lifestyle/Commercial campaign shoot',
      ai: { signals: {} }
    })
  }
];

const natanImages = [
  {
    label: 'Digital Headshot',
    sort: 1,
    image_type: 'digital',
    shot_type: 'headshot',
    is_primary: true,
    status: 'active',
    path: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=1000&q=80',
    metadata: JSON.stringify({
      caption: 'Digital Headshot (Front View)',
      ai: { signals: { expression: 'neutral' } }
    })
  },
  {
    label: 'Digital Full Body',
    sort: 2,
    image_type: 'digital',
    shot_type: 'full_length',
    is_primary: false,
    status: 'active',
    path: 'https://images.unsplash.com/photo-1618886614638-80e3c103d31a?auto=format&fit=crop&w=1000&q=80',
    metadata: JSON.stringify({
      caption: 'Digital Full Body (Front View)',
      ai: { signals: {} }
    })
  },
  {
    label: 'Digital Profile View',
    sort: 3,
    image_type: 'digital',
    shot_type: 'profile',
    is_primary: false,
    status: 'active',
    path: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?auto=format&fit=crop&w=1000&q=80',
    metadata: JSON.stringify({
      caption: 'Digital Profile (Side View)',
      ai: { signals: {} }
    })
  },
  {
    label: 'Digital Smiling Headshot',
    sort: 4,
    image_type: 'digital',
    shot_type: 'headshot',
    is_primary: false,
    status: 'active',
    path: 'https://images.unsplash.com/photo-1539571696357-5a69c17a67c6?auto=format&fit=crop&w=1000&q=80',
    metadata: JSON.stringify({
      caption: 'Digital Headshot (Smiling)',
      ai: { signals: { expression: 'smile' } }
    })
  },
  {
    label: 'Digital Back View',
    sort: 5,
    image_type: 'digital',
    shot_type: 'back',
    is_primary: false,
    status: 'active',
    path: 'https://images.unsplash.com/photo-1624561172888-ac93c696e10c?auto=format&fit=crop&w=1000&q=80',
    metadata: JSON.stringify({
      caption: 'Digital Back (Rear View)',
      ai: { signals: {} }
    })
  },
  {
    label: 'Editorial Portfolio',
    sort: 6,
    image_type: 'portfolio',
    style_type: 'editorial',
    is_primary: false,
    status: 'active',
    path: 'https://images.unsplash.com/photo-1501196354995-cbb51c65aaea?auto=format&fit=crop&w=1000&q=80',
    metadata: JSON.stringify({
      caption: 'High Fashion Editorial shoot',
      ai: { signals: {} }
    })
  },
  {
    label: 'Lifestyle Portfolio',
    sort: 7,
    image_type: 'portfolio',
    style_type: 'lifestyle',
    is_primary: false,
    status: 'active',
    path: 'https://images.unsplash.com/photo-1519345182560-3f2917c472ef?auto=format&fit=crop&w=1000&q=80',
    metadata: JSON.stringify({
      caption: 'Lifestyle/Commercial campaign shoot',
      ai: { signals: {} }
    })
  }
];

async function seedImages(profileId, imagesList) {
  console.log(`Clearing old images for profile ID: ${profileId}`);
  await knex('images').where({ profile_id: profileId }).del();

  console.log(`Inserting ${imagesList.length} new images for profile ID: ${profileId}`);
  for (const img of imagesList) {
    await knex('images').insert({
      id: uuidv4(),
      profile_id: profileId,
      ...img
    });
  }

  console.log(`Re-calculating profile completeness & unlock status for: ${profileId}`);
  const result = await updateProfileCompleteness(profileId);
  console.log(`Result: completeness percentage = ${result.percentage}%, servicesLocked = ${result.servicesLocked}`);
}

async function run() {
  try {
    await seedImages(LEUL_PROFILE_ID, leulImages);
    console.log('\n----------------------------------------\n');
    await seedImages(NATAN_PROFILE_ID, natanImages);
    console.log('\nAll images seeded and accounts unlocked successfully!');
  } catch (err) {
    console.error('Error seeding images:', err);
  } finally {
    await knex.destroy();
  }
}

run();
