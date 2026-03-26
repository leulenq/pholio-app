const knex = require('../src/shared/db/knex');
const { v4: uuidv4 } = require('uuid');

async function seedActivities() {
  try {
    console.log('🌱 Seeding Activity Data...\n');

    // Get the first user
    const user = await knex('users')
      .where({ role: 'TALENT' })
      .orderBy('created_at', 'asc')
      .first();

    if (!user) {
      console.error('❌ No talent users found.');
      process.exit(1);
    }

    console.log(`✓ Using user: ${user.email}`);

    const now = new Date();
    const activities = [];

    // Generate activities for the last 14 days
    for (let daysAgo = 14; daysAgo >= 0; daysAgo--) {
      const date = new Date(now);
      date.setDate(date.getDate() - daysAgo);
      date.setHours(Math.floor(Math.random() * 24));
      date.setMinutes(Math.floor(Math.random() * 60));

      // Random activity types
      const activityTypes = [
        { type: 'profile_updated', metadata: { fields: ['bio', 'height'] } },
        { type: 'image_uploaded', metadata: { imageCount: Math.floor(Math.random() * 3) + 1 } },
        { type: 'pdf_downloaded', metadata: { theme: ['minimal', 'editorial', 'bold'][Math.floor(Math.random() * 3)] } },
        { type: 'portfolio_viewed', metadata: { source: 'direct' } }
      ];

      // 1-3 activities per day
      const dailyActivities = Math.floor(Math.random() * 3) + 1;
      
      for (let i = 0; i < dailyActivities; i++) {
        const activity = activityTypes[Math.floor(Math.random() * activityTypes.length)];
        
        activities.push({
          id: uuidv4(),
          user_id: user.id,
          activity_type: activity.type,
          metadata: JSON.stringify(activity.metadata),
          created_at: new Date(date.getTime() + i * 1000 * 60 * 60) // Spread throughout the day
        });
      }
    }

    // Insert all activities
    await knex('activities').insert(activities);

    console.log(`\n✅ Seed Complete!`);
    console.log(`   📊 Total Activities: ${activities.length}`);
    console.log(`   📅 Date Range: Last 14 days`);
    console.log('\n🎉 Refresh your analytics page to see the activity feed!');

    await knex.destroy();
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  }
}

seedActivities();
