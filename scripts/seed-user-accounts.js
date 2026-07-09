const knex = require('knex')(require('../knexfile.js'));
const { v4: uuidv4 } = require('uuid');

async function seedUser(email, profileDetails, seedApps = true) {
  console.log(`Seeding account: ${email}`);

  // 1. Get the user
  const user = await knex('users').where({ email }).first();
  if (!user) {
    console.error(`User with email ${email} not found!`);
    return;
  }

  // Update user name if null
  if (!user.first_name || !user.last_name) {
    await knex('users')
      .where({ id: user.id })
      .update({
        first_name: profileDetails.first_name,
        last_name: profileDetails.last_name,
      });
    console.log(`Updated names on user record for ${email}`);
  }

  // 2. Get/verify the profile
  const profile = await knex('profiles').where({ user_id: user.id }).first();
  if (!profile) {
    console.error(`Profile for user ${user.id} not found!`);
    return;
  }

  const profileId = profile.id;

  // 3. Update the profile details
  await knex('profiles')
    .where({ id: profileId })
    .update({
      first_name: profileDetails.first_name,
      last_name: profileDetails.last_name,
      slug: profileDetails.slug,
      city: profileDetails.city,
      height_cm: profileDetails.height_cm,
      weight_kg: profileDetails.weight_kg,
      bust_cm: profileDetails.bust_cm,
      waist_cm: profileDetails.waist_cm,
      hips_cm: profileDetails.hips_cm,
      dress_size: profileDetails.dress_size,
      shoe_size: profileDetails.shoe_size,
      hair_color: profileDetails.hair_color,
      hair_length: profileDetails.hair_length,
      eye_color: profileDetails.eye_color,
      skin_tone: profileDetails.skin_tone,
      gender: profileDetails.gender,
      experience_level: profileDetails.experience_level,
      specialties: JSON.stringify(profileDetails.specialties),
      languages: JSON.stringify(profileDetails.languages),
      bio_raw: profileDetails.bio_raw,
      bio_curated: profileDetails.bio_curated,
      training: profileDetails.training,
      ethnicity: JSON.stringify(profileDetails.ethnicity),
      is_pro: true,
      is_public: true,
      is_discoverable: true,
      profile_status: 'active',
      profile_completeness: '85.00',
      seeking_representation: true,
      onboarding_stage: 'done',
      updated_at: new Date(),
    });
  console.log(`Updated profile fields for ${email}`);

  // 4. Delete existing applications, visitor_sessions, analytics, activities for this user/profile to avoid duplicates
  await knex('applications').where({ profile_id: profileId }).del();
  await knex('analytics').where({ profile_id: profileId }).del();
  await knex('visitor_sessions').where({ profile_id: profileId }).del();
  await knex('activities').where({ user_id: user.id }).del();
  console.log(`Cleaned up old application and analytics data for ${email}`);

  if (!seedApps) {
    return;
  }

  // 5. Query active agencies
  const agencies = await knex('agencies').where({ status: 'ACTIVE' }).select('id', 'name');
  if (agencies.length === 0) {
    console.warn('No active agencies found to submit applications to.');
    return;
  }

  console.log(`Found ${agencies.length} active agencies.`);

  const agencyMap = {};
  for (const ag of agencies) {
    agencyMap[ag.name] = ag.id;
  }

  // 6. Create applications
  const now = new Date();
  const daysAgo = (n) => new Date(now.getTime() - n * 86400000).toISOString();

  // Mapping some typical agencies
  const targetAgencies = [
    { name: 'Wilhelmina Models', status: 'shortlisted', days: 3 },
    { name: 'Next Management', status: 'submitted', days: 5 },
    { name: 'IMG Models', status: 'accepted', days: 14 },
    { name: 'Elite Model Management', status: 'submitted', days: 21 },
    { name: 'Ford Models', status: 'represented', days: 28 },
    { name: 'DNA Model Management', status: 'declined', days: 45 },
    { name: 'The Society Management', status: 'submitted', days: 7 },
  ];

  for (const target of targetAgencies) {
    const agencyId = agencyMap[target.name];
    if (agencyId) {
      await knex('applications').insert({
        id: uuidv4(),
        profile_id: profileId,
        agency_id: agencyId,
        status: target.status,
        created_at: daysAgo(target.days),
        updated_at: daysAgo(target.days),
      });
      console.log(`Created application to ${target.name} (status: ${target.status})`);
    } else {
      // Fallback: use first available agency in list if target agency is not found
      const fallbackAgency = agencies[Math.floor(Math.random() * agencies.length)];
      await knex('applications').insert({
        id: uuidv4(),
        profile_id: profileId,
        agency_id: fallbackAgency.id,
        status: target.status,
        created_at: daysAgo(target.days),
        updated_at: daysAgo(target.days),
      });
      console.log(`Created fallback application to ${fallbackAgency.name} (status: ${target.status})`);
    }
  }

  // 7. Analytics & Visitor Sessions (90 days of synthetic data)
  const VISITOR_IDS = Array.from({ length: 15 }, () => uuidv4());
  const REFERRERS = [
    'https://instagram.com',
    'https://instagram.com',
    'https://instagram.com',
    null,
    null,
    'https://google.com',
    'https://google.com',
    'https://tiktok.com',
  ];
  const THEMES = ['editorial', 'minimal', 'bold'];
  const AGENTS = [
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64)',
  ];

  for (let daysBack = 90; daysBack >= 1; daysBack--) {
    const utcMidnight = Math.floor(now.getTime() / 86400000) * 86400000 - daysBack * 86400000;
    const day = new Date(utcMidnight);
    const isWeekend = day.getUTCDay() === 0 || day.getUTCDay() === 6;
    const recencyFactor = 1 + ((90 - daysBack) / 90) * 1.8;
    const base = isWeekend ? 5 : 3;
    const dailyViews = Math.round((base + Math.random() * 4) * recencyFactor);

    for (let v = 0; v < dailyViews; v++) {
      const viewTime = new Date(
        utcMidnight +
          (8 + Math.floor(Math.random() * 14)) * 3600000 +
          Math.floor(Math.random() * 60) * 60000
      );

      const isReturning = Math.random() < 0.65;
      const visitorId = isReturning
        ? VISITOR_IDS[Math.floor(Math.random() * 10)]
        : VISITOR_IDS[10 + Math.floor(Math.random() * 5)];

      const referrer = REFERRERS[Math.floor(Math.random() * REFERRERS.length)];
      const userAgent = AGENTS[Math.floor(Math.random() * AGENTS.length)];
      const ip = `${100 + Math.floor(Math.random() * 155)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`;

      await knex('visitor_sessions').insert({
        id: uuidv4(),
        profile_id: profileId,
        visitor_id: visitorId,
        started_at: viewTime.toISOString(),
        last_activity_at: viewTime.toISOString(),
        ip_address: ip,
        user_agent: userAgent,
        referrer,
        is_returning: isReturning,
      });

      await knex('analytics').insert({
        id: uuidv4(),
        profile_id: profileId,
        event_type: 'view',
        event_source: 'web',
        metadata: JSON.stringify({ referrer, slug: profileDetails.slug }),
        ip_address: ip,
        user_agent: userAgent,
        created_at: viewTime.toISOString(),
      });

      if (Math.random() < 0.65) {
        await knex('analytics').insert({
          id: uuidv4(),
          profile_id: profileId,
          event_type: 'bio_read',
          event_source: 'web',
          metadata: JSON.stringify({
            duration: 10 + Math.floor(Math.random() * 40),
          }),
          ip_address: ip,
          user_agent: userAgent,
          created_at: new Date(viewTime.getTime() + 15000).toISOString(),
        });
      }

      if (Math.random() < 0.25) {
        await knex('analytics').insert({
          id: uuidv4(),
          profile_id: profileId,
          event_type: 'social_click',
          event_source: 'web',
          metadata: JSON.stringify({ platform: 'instagram' }),
          ip_address: ip,
          user_agent: userAgent,
          created_at: new Date(viewTime.getTime() + 30000).toISOString(),
        });
      }

      if (Math.random() < 0.2) {
        await knex('analytics').insert({
          id: uuidv4(),
          profile_id: profileId,
          event_type: 'portfolio_click',
          event_source: 'web',
          metadata: JSON.stringify({ target: 'editorial' }),
          ip_address: ip,
          user_agent: userAgent,
          created_at: new Date(viewTime.getTime() + 45000).toISOString(),
        });
      }

      if (Math.random() < 0.5) {
        await knex('analytics').insert({
          id: uuidv4(),
          profile_id: profileId,
          event_type: 'scroll_depth',
          event_source: 'web',
          metadata: JSON.stringify({ depth: Math.random() < 0.6 ? 75 : 100 }),
          ip_address: ip,
          user_agent: userAgent,
          created_at: new Date(viewTime.getTime() + 60000).toISOString(),
        });
      }

      if (Math.random() < 0.12) {
        await knex('analytics').insert({
          id: uuidv4(),
          profile_id: profileId,
          event_type: 'download',
          event_source: 'web',
          metadata: JSON.stringify({
            theme: THEMES[Math.floor(Math.random() * THEMES.length)],
          }),
          ip_address: ip,
          user_agent: userAgent,
          created_at: new Date(viewTime.getTime() + 90000).toISOString(),
        });
      }
    }
  }
  console.log(`Generated 90 days of visitor sessions & analytics for ${email}`);

  // 8. Activities (30 days, 25 entries)
  const activityTemplates = [
    {
      type: 'image_uploaded',
      meta: () => ({ imageCount: 1 + Math.floor(Math.random() * 3) }),
    },
    { type: 'image_uploaded', meta: () => ({ imageCount: 2 }) },
    {
      type: 'profile_updated',
      meta: () => ({
        fields: [
          ['bio', 'measurements', 'city', 'training'][Math.floor(Math.random() * 4)],
        ],
      }),
    },
    {
      type: 'profile_updated',
      meta: () => ({ fields: ['height_cm', 'weight_kg'] }),
    },
    {
      type: 'pdf_downloaded',
      meta: () => ({
        theme: THEMES[Math.floor(Math.random() * THEMES.length)],
      }),
    },
    { type: 'pdf_downloaded', meta: () => ({ theme: 'editorial' }) },
    {
      type: 'portfolio_viewed',
      meta: () => ({
        source: ['direct', 'instagram', 'google'][Math.floor(Math.random() * 3)],
      }),
    },
    {
      type: 'submission_package_created',
      meta: () => ({ imageCount: 4 + Math.floor(Math.random() * 3) }),
    },
  ];

  const activityDays = [];
  for (let i = 0; i < 25; i++) {
    const bias = Math.random() < 0.7 ? Math.floor(Math.random() * 14) : 14 + Math.floor(Math.random() * 16);
    activityDays.push(bias);
  }
  activityDays.sort((a, b) => b - a);

  for (const dayOffset of activityDays) {
    const t = new Date(now.getTime() - dayOffset * 86400000);
    t.setHours(9 + Math.floor(Math.random() * 10));
    t.setMinutes(Math.floor(Math.random() * 60));
    const tmpl = activityTemplates[Math.floor(Math.random() * activityTemplates.length)];
    await knex('activities').insert({
      id: uuidv4(),
      user_id: user.id,
      activity_type: tmpl.type,
      metadata: JSON.stringify(tmpl.meta()),
      created_at: t.toISOString(),
    });
  }
  console.log(`Generated 25 activity log entries for ${email}`);
}

async function run() {
  try {
    // Seeding Leul Enquanhone
    await seedUser('leulenq@gmail.com', {
      first_name: 'Leul',
      last_name: 'Enquanhone',
      slug: 'leul-enquanhone',
      city: 'Los Angeles, California, United States',
      height_cm: 183,
      weight_kg: 72,
      bust_cm: 96,
      waist_cm: 76,
      hips_cm: 94,
      dress_size: '40R',
      shoe_size: '10.5 US',
      hair_color: 'Black',
      hair_length: 'Short',
      eye_color: 'Brown',
      skin_tone: 'Medium',
      gender: 'Male',
      experience_level: 'New face',
      specialties: ['Editorial', 'Runway'],
      languages: ['English'],
      bio_raw: 'Los Angeles-based editorial and runway model with a passion for high-fashion campaigns and avant-garde presentations.',
      bio_curated: 'Leul Enquanhone is a Los Angeles-based editorial and runway model. Standing at 6\'0" with a refined structural profile, he brings a compelling presence to high-fashion and avant-garde editorial shoots.',
      training: 'High-fashion runway and editorial posing workshops.',
      ethnicity: ['Black', 'African'],
    });

    console.log('\n----------------------------------------\n');

    // Seeding Natan Getahun
    await seedUser('natangethun@gmail.com', {
      first_name: 'Natan',
      last_name: 'Getahun',
      slug: 'natan-getahun',
      city: 'New York City, New York, United States',
      height_cm: 178,
      weight_kg: 68,
      bust_cm: 94,
      waist_cm: 74,
      hips_cm: 92,
      dress_size: '38R',
      shoe_size: '10.5 US',
      hair_color: 'Black',
      hair_length: 'Short',
      eye_color: 'Brown',
      skin_tone: 'Medium',
      gender: 'Male',
      experience_level: 'New face',
      specialties: ['Editorial', 'Runway'],
      languages: ['English'],
      bio_raw: 'New York-based editorial and runway model focusing on high-contrast studio work and luxury brand campaign lookbooks.',
      bio_curated: 'Natan Getahun is a New York-based editorial and runway model. Known for his classic proportions and striking modern look, he specializes in runway presentations, luxury lookbooks, and high-contrast studio campaigns.',
      training: 'High-fashion runway and editorial posing workshops.',
      ethnicity: ['Black', 'African'],
    });

    console.log('\nSeeding completed successfully!');
  } catch (err) {
    console.error('Error during seeding:', err);
  } finally {
    await knex.destroy();
  }
}

run();
