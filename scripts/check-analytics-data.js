const knex = require('../src/db/knex');

async function checkAnalyticsData() {
  try {
    console.log('📊 Checking Analytics Data...\n');

    // Check analytics events
    const viewCount = await knex('analytics')
      .where({ event_type: 'view' })
      .count('* as count')
      .first();
    console.log(`✓ Portfolio Views: ${viewCount?.count || 0}`);

    const engagementCount = await knex('analytics')
      .whereIn('event_type', ['bio_read', 'social_click', 'portfolio_click', 'scroll_depth'])
      .count('* as count')
      .first();
    console.log(`✓ Engagement Events: ${engagementCount?.count || 0}`);

    // Check visitor sessions
    const sessionCount = await knex('visitor_sessions')
      .count('* as count')
      .first();
    console.log(`✓ Visitor Sessions: ${sessionCount?.count || 0}`);

    // Check unique visitors
    const uniqueVisitors = await knex('visitor_sessions')
      .countDistinct('visitor_id as count')
      .first();
    console.log(`✓ Unique Visitors: ${uniqueVisitors?.count || 0}`);

    // Recent activity
    const recentViews = await knex('analytics')
      .where({ event_type: 'view' })
      .orderBy('created_at', 'desc')
      .limit(5)
      .select('profile_id', 'created_at', 'ip_address');
    
    if (recentViews.length > 0) {
      console.log('\n📅 Recent Views:');
      recentViews.forEach(v => {
        console.log(`  - ${v.created_at} from ${v.ip_address}`);
      });
    } else {
      console.log('\n⚠️  No analytics data found. Visit a portfolio page to generate data.');
    }

    await knex.destroy();
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

checkAnalyticsData();
