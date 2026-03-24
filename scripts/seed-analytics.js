const knex = require('../src/shared/db/knex');
const { v4: uuidv4 } = require('uuid');

async function seedAnalyticsData() {
  try {
    console.log('🌱 Seeding Analytics Test Data...\n');

    // Get the first profile (likely yours)
    const profile = await knex('profiles')
      .orderBy('created_at', 'asc')
      .first();

    if (!profile) {
      console.error('❌ No profiles found. Create a profile first.');
      process.exit(1);
    }

    console.log(`✓ Using profile: ${profile.first_name} ${profile.last_name} (${profile.slug})`);

    // Generate data for the last 30 days
    const now = new Date();
    const visitorIds = Array.from({ length: 15 }, () => uuidv4()); // 15 unique visitors

    let totalViews = 0;
    let totalSessions = 0;
    let totalEngagements = 0;

    // Generate daily data
    for (let daysAgo = 30; daysAgo >= 0; daysAgo--) {
      const date = new Date(now);
      date.setDate(date.getDate() - daysAgo);

      // More traffic on recent days and weekends
      const isWeekend = date.getDay() === 0 || date.getDay() === 6;
      const recencyBoost = 1 + (30 - daysAgo) / 30; // More recent = more traffic
      const baseViews = Math.floor(Math.random() * 5) + 3;
      const dailyViews = Math.floor(baseViews * recencyBoost * (isWeekend ? 1.5 : 1));

      for (let v = 0; v < dailyViews; v++) {
        // Pick a random visitor (70% returning, 30% new)
        const isReturning = Math.random() > 0.3;
        const visitorId = isReturning 
          ? visitorIds[Math.floor(Math.random() * Math.min(visitorIds.length, 10))]
          : visitorIds[visitorIds.length - 1];

        const sessionId = uuidv4();
        const viewTime = new Date(date);
        viewTime.setHours(Math.floor(Math.random() * 24));
        viewTime.setMinutes(Math.floor(Math.random() * 60));

        // Create visitor session
        await knex('visitor_sessions').insert({
          id: sessionId,
          profile_id: profile.id,
          visitor_id: visitorId,
          started_at: viewTime,
          last_activity_at: viewTime,
          ip_address: `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
          user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
          referrer: Math.random() > 0.5 ? 'https://instagram.com' : (Math.random() > 0.5 ? 'https://google.com' : null),
          is_returning: isReturning
        });
        totalSessions++;

        // Log view event
        await knex('analytics').insert({
          id: uuidv4(),
          profile_id: profile.id,
          event_type: 'view',
          event_source: 'web',
          metadata: JSON.stringify({ 
            source: 'web', 
            slug: profile.slug,
            referrer: Math.random() > 0.5 ? 'https://instagram.com' : null
          }),
          ip_address: `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
          user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)',
          created_at: viewTime
        });
        totalViews++;

        // 60% chance of engagement
        if (Math.random() > 0.4) {
          const engagementTime = new Date(viewTime);
          engagementTime.setSeconds(engagementTime.getSeconds() + Math.floor(Math.random() * 30) + 5);

          // Bio read
          if (Math.random() > 0.3) {
            await knex('analytics').insert({
              id: uuidv4(),
              profile_id: profile.id,
              event_type: 'bio_read',
              event_source: 'web',
              metadata: JSON.stringify({ duration: Math.floor(Math.random() * 20) + 5 }),
              ip_address: `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
              created_at: engagementTime
            });
            totalEngagements++;
          }

          // Social click (30% of engagements)
          if (Math.random() > 0.7) {
            await knex('analytics').insert({
              id: uuidv4(),
              profile_id: profile.id,
              event_type: 'social_click',
              event_source: 'web',
              metadata: JSON.stringify({ platform: 'instagram' }),
              ip_address: `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
              created_at: engagementTime
            });
            totalEngagements++;
          }

          // Scroll depth (50% of engagements)
          if (Math.random() > 0.5) {
            await knex('analytics').insert({
              id: uuidv4(),
              profile_id: profile.id,
              event_type: 'scroll_depth',
              event_source: 'web',
              metadata: JSON.stringify({ depth: Math.random() > 0.5 ? 75 : 100 }),
              ip_address: `${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
              created_at: engagementTime
            });
            totalEngagements++;
          }
        }
      }
    }

    console.log('\n✅ Seed Complete!');
    console.log(`   📊 Total Views: ${totalViews}`);
    console.log(`   👥 Visitor Sessions: ${totalSessions}`);
    console.log(`   ⚡ Engagement Events: ${totalEngagements}`);
    console.log(`   🔁 Unique Visitors: ${visitorIds.length}`);
    console.log('\n🎉 Refresh your analytics dashboard to see the data!');

    await knex.destroy();
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

seedAnalyticsData();
