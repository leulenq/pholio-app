const express = require('express');
const router = express.Router();
const knex = require('../../shared/db/knex');
const { requireRole } = require('../../domains/auth/middleware/require-auth');
const { asyncHandler } = require('../../shared/middleware/error-handler');
const apiResponse = require('../../shared/lib/api-response');

/**
 * Helper function to format time ago
 */
function getTimeAgo(date) {
  if (!date) return 'Unknown';
  const now = new Date();
  const then = new Date(date);
  const diffMs = now - then;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  return then.toLocaleDateString();
}

/**
 * GET /api/talent/analytics
 * Get analytics data for the profile
 */
router.get('/analytics', requireRole('TALENT'), asyncHandler(async (req, res) => {
  const profile = await knex('profiles').where({ user_id: req.session.userId }).first();
  
  if (!profile) {
    return res.json({
      success: true,
      data: {
        views: { total: 0, thisWeek: 0, thisMonth: 0 },
        downloads: { total: 0, thisWeek: 0, thisMonth: 0, byTheme: [] }
      }
    });
  }

  // Determine DB client for JSON extraction
  const isPostgres = knex.client.config.client === 'pg';
  const jsonExtract = (field, path) => 
    isPostgres ? knex.raw(`metadata->>'${path}' as ${path}`) : knex.raw(`json_extract(metadata, '$.${path}') as ${path}`);

  // Dynamic Date Filter
  const daysParam = req.query.days ? parseInt(req.query.days) : null;
  const breakdownDays = daysParam || 30; // Default to 30 days for breakdowns if not specified
  
  const filterDate = new Date();
  filterDate.setDate(filterDate.getDate() - breakdownDays);
  
  // Helper for counts
  const getCount = async (type, dateFilter) => {
    const query = knex('analytics')
      .where({ profile_id: profile.id, event_type: type });
    if (dateFilter) query.where('created_at', '>=', dateFilter);
    const res = await query.count({ total: '*' }).first();
    return Number(res?.total || 0);
  };

  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);

  // If days param provided, filter totals by it. Otherwise, all time.
  const totalFilter = daysParam ? filterDate : null;

  const [
    viewsTotal,
    downloadsTotal,
    viewsThisWeek,
    downloadsThisWeek,
    engagementEvents
  ] = await Promise.all([
    getCount('view', totalFilter),
    getCount('download', totalFilter),
    getCount('view', weekAgo),
    getCount('download', weekAgo),
    knex('analytics')
      .where({ profile_id: profile.id })
      .where('created_at', '>=', filterDate)
      .whereIn('event_type', ['bio_read', 'social_click', 'portfolio_click', 'scroll_depth'])
      .select('event_type')
      .count({ total: '*' })
      .groupBy('event_type')
  ]);

  // Format engagement events for easier consumption
  const engagementMap = engagementEvents.reduce((acc, curr) => {
    acc[curr.event_type] = Number(curr.total);
    return acc;
  }, {});

  // Get views by source (referrer)
  const viewsBySource = await knex('analytics')
    .where({ profile_id: profile.id, event_type: 'view' })
    .where('created_at', '>=', filterDate)
    .select(jsonExtract('metadata', 'referrer'))
    .count({ total: '*' })
    .groupBy('referrer');

  // Helper to categorize referrers
  const categorizeReferrer = (ref) => {
    if (!ref) return 'Direct';
    const lowRef = ref.toLowerCase();
    if (lowRef.includes('instagram.com') || lowRef.includes('t.co') || lowRef.includes('facebook.com')) return 'Social Media';
    if (lowRef.includes('google.com') || lowRef.includes('bing.com')) return 'Search Engine';
    return 'External Links';
  };

  const sourceBreakdownMap = viewsBySource.reduce((acc, curr) => {
    const cat = categorizeReferrer(curr.referrer);
    acc[cat] = (acc[cat] || 0) + Number(curr.total);
    return acc;
  }, {});

  // Get downloads by theme
  const downloadsByTheme = await knex('analytics')
    .where({ profile_id: profile.id, event_type: 'download' })
    .where('created_at', '>=', filterDate)
    .select(jsonExtract('metadata', 'theme'))
    .count({ total: '*' })
    .groupBy('theme');

  return res.json({
    success: true,
    data: {
      views: {
        total: viewsTotal,
        thisWeek: viewsThisWeek,
        thisMonth: viewsTotal, // Last 30 days = thisMonth
        latestSourceBreakdown: Object.entries(sourceBreakdownMap).map(([label, count]) => ({
          label,
          percentage: viewsTotal > 0 ? Math.round((count / viewsTotal) * 100) : 0,
          count
        }))
      },
      downloads: {
        total: downloadsTotal,
        thisWeek: downloadsThisWeek,
        thisMonth: downloadsTotal, // Last 30 days = thisMonth
        byTheme: downloadsByTheme.map(item => ({
          theme: item.theme || 'unknown',
          count: Number(item.total || 0)
        }))
      },
      engagement: {
        counts: engagementMap,
        score: (viewsTotal * 1) + 
               ((engagementMap.bio_read || 0) * 5) + 
               ((engagementMap.social_click || 0) * 10) + 
               ((engagementMap.portfolio_click || 0) * 10)
      }
    }
  });
}));

/**
 * GET /api/talent/activity
 * Get activity feed for the user
 */
router.get('/activity', requireRole('TALENT'), asyncHandler(async (req, res) => {
  const activities = await knex('activities')
    .where({ user_id: req.session.userId })
    .orderBy('created_at', 'desc')
    .limit(10);

  // Format activities
  const formattedActivities = activities.map(activity => {
    const metadata = typeof activity.metadata === 'string' 
      ? JSON.parse(activity.metadata) 
      : activity.metadata || {};
    
    let message = '';
    let icon = '📝';
    
    switch (activity.activity_type) {
      case 'profile_updated':
        message = 'Profile updated';
        icon = '✏️';
        break;
      case 'image_uploaded':
        const imageCount = metadata.imageCount || 1;
        message = `${imageCount} image${imageCount > 1 ? 's' : ''} uploaded`;
        icon = '📷';
        break;
      case 'pdf_downloaded':
        const theme = metadata.theme || 'default';
        message = `PDF downloaded (${theme} theme)`;
        icon = '📄';
        break;
      case 'portfolio_viewed':
        message = 'Portfolio viewed';
        icon = '👁️';
        break;
      default:
        message = 'Activity recorded';
        icon = '📝';
    }
    
    return {
      id: activity.id,
      type: activity.activity_type,
      message,
      icon,
      metadata,
      createdAt: activity.created_at,
      timeAgo: getTimeAgo(activity.created_at)
    };
  });

  return res.json({
    success: true,
    data: formattedActivities
  });
}));

/**
 * GET /api/talent/analytics/summary
 * Get summary stats for dashboard overview
 */
const { calculateProfileCompleteness } = require('../../lib/dashboard/completeness');

// ... (existing code) ...

router.get('/summary', requireRole('TALENT'), asyncHandler(async (req, res) => {
  const profile = await knex('profiles').where({ user_id: req.session.userId }).first();
  
  if (!profile) {
    return apiResponse.success(res, {
      views: { total: 0, change: '0%', trend: 'neutral' },
      downloads: { total: 0, change: '0%', trend: 'neutral' },
      completeness: { percentage: 0, missingItems: [] }
    });
  }

  // Fetch images for completeness calculation
  const images = await knex('images')
    .where({ profile_id: profile.id })
    .orderBy('sort', 'asc')
    .select('id', 'path', 'label as kind', 'created_at');

  // Use the shared source of truth for calculations
  const completenessResult = calculateProfileCompleteness(profile, images);
  
  // Extract missing items from incomplete sections
  const missingItems = [];
  Object.entries(completenessResult.sections).forEach(([key, section]) => {
    if (!section.complete) {
      // Use the friendly message from the section
      missingItems.push(section.message);
    }
  });
  
  // Ensure we limit to top 3 missing items to not overwhelm the UI card
  const topMissingItems = missingItems.slice(0, 3);
  
  const completeness = completenessResult.percentage;

  // --- Analytics Trends Logic ---
  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const sixtyDaysAgo = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  const getPeriodCount = async (type, startDate, endDate) => {
    const result = await knex('analytics')
      .where({ profile_id: profile.id, event_type: type })
      .whereBetween('created_at', [endDate, startDate]) // note: whereBetween usually takes [min, max]
      .count('* as count')
      .first();
    return Number(result?.count || 0);
  };

  // Fix whereBetween date order: [older, newer]
  const [currentViews, funcPrevViews, currentDownloads, funcPrevDownloads] = await Promise.all([
    knex('analytics').where({ profile_id: profile.id, event_type: 'view' }).whereBetween('created_at', [thirtyDaysAgo, now]).count('* as count').first(),
    knex('analytics').where({ profile_id: profile.id, event_type: 'view' }).whereBetween('created_at', [sixtyDaysAgo, thirtyDaysAgo]).count('* as count').first(),
    knex('analytics').where({ profile_id: profile.id, event_type: 'download' }).whereBetween('created_at', [thirtyDaysAgo, now]).count('* as count').first(),
    knex('analytics').where({ profile_id: profile.id, event_type: 'download' }).whereBetween('created_at', [sixtyDaysAgo, thirtyDaysAgo]).count('* as count').first()
  ]);

  const calcTrend = (current, previous) => {
    const cur = Number(current?.count || 0);
    const prev = Number(previous?.count || 0);
    
    if (prev === 0) {
      return { change: cur > 0 ? '+100%' : '0%', trend: cur > 0 ? 'up' : 'neutral' };
    }
    
    const percent = ((cur - prev) / prev) * 100;
    const sign = percent > 0 ? '+' : '';
    const trend = percent > 0 ? 'up' : percent < 0 ? 'down' : 'neutral';
    
    return { change: `${sign}${Math.round(percent)}%`, trend };
  };

  const viewsTrend = calcTrend(currentViews, funcPrevViews);
  const downloadsTrend = calcTrend(currentDownloads, funcPrevDownloads);

  // Calculate thisWeek and thisMonth for Free tier display
  const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const [thisWeekViews, thisWeekDownloads] = await Promise.all([
    knex('analytics').where({ profile_id: profile.id, event_type: 'view' }).whereBetween('created_at', [sevenDaysAgo, now]).count('* as count').first(),
    knex('analytics').where({ profile_id: profile.id, event_type: 'download' }).whereBetween('created_at', [sevenDaysAgo, now]).count('* as count').first()
  ]);

  apiResponse.success(res, {
    views: {
      total: Number(currentViews?.count || 0),
      thisWeek: Number(thisWeekViews?.count || 0),
      thisMonth: Number(currentViews?.count || 0), // Last 30 days = thisMonth
      change: viewsTrend.change,
      trend: viewsTrend.trend
    },
    downloads: {
      total: Number(currentDownloads?.count || 0),
      thisWeek: Number(thisWeekDownloads?.count || 0),
      thisMonth: Number(currentDownloads?.count || 0), // Last 30 days = thisMonth
      change: downloadsTrend.change,
      trend: downloadsTrend.trend
    },
    completeness: {
      percentage: completeness,
      missingItems: topMissingItems
    }
  });
}));

/**
 * GET /api/talent/analytics/timeseries
 * Get daily analytics data for charts
 */
router.get('/timeseries', requireRole('TALENT'), asyncHandler(async (req, res) => {
  const profile = await knex('profiles').where({ user_id: req.session.userId }).first();
  
  if (!profile) {
    return res.json({
      success: true,
      data: []
    });
  }

  const requestedDays = parseInt(req.query.days) || 30;
  const isPro = profile.is_pro || false;
  
  // Enforce tier-based limits
  // Free users: max 7 days
  // Studio+ users: max 90 days
  const maxDays = isPro ? 90 : 7;
  const days = Math.min(requestedDays, maxDays);
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // Get daily counts grouped by date
  const rawData = await knex('analytics')
    .where({ profile_id: profile.id })
    .where('created_at', '>=', startDate)
    .select(
      knex.raw("DATE(created_at) as date"),
      'event_type',
      knex.raw('COUNT(*) as count')
    )
    .groupBy('date', 'event_type')
    .orderBy('date', 'asc');

  // Transform into a format suitable for charts: { date, views, downloads }
  const dataMap = {};
  
  // Initialize all dates in range with zeros
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - days + i + 1);
    const dateStr = d.toISOString().split('T')[0];
    dataMap[dateStr] = { date: dateStr, views: 0, downloads: 0 };
  }

  // Fill in actual data
  rawData.forEach(row => {
    const dateStr = typeof row.date === 'string' ? row.date : new Date(row.date).toISOString().split('T')[0];
    if (!dataMap[dateStr]) {
      dataMap[dateStr] = { date: dateStr, views: 0, downloads: 0 };
    }
    if (row.event_type === 'view') {
      dataMap[dateStr].views = Number(row.count);
    } else if (row.event_type === 'download') {
      dataMap[dateStr].downloads = Number(row.count);
    }
  });

  const data = Object.values(dataMap).sort((a, b) => a.date.localeCompare(b.date));

  res.json({
    success: true,
    data
  });
}));

/**
 * GET /api/talent/analytics/insights
 * Get dynamic insights based on real data patterns
 */
router.get('/insights', requireRole('TALENT'), asyncHandler(async (req, res) => {
  const profile = await knex('profiles').where({ user_id: req.session.userId }).first();
  if (!profile) return res.json({ success: true, insights: [] });

  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  const insights = [];

  // Determine DB client for specific functions
  const isPostgres = knex.client.config.client === 'pg';

  // 1. Peak Day Insight
  const dailyViews = await knex('analytics')
    .where({ profile_id: profile.id, event_type: 'view' })
    .where('created_at', '>=', thirtyDaysAgo)
    .select(knex.raw(isPostgres ? "to_char(created_at, 'ID') as day_of_week" : "strftime('%w', created_at) as day_of_week"))
    .count('* as count')
    .groupBy('day_of_week')
    .orderBy('count', 'desc')
    .first();

  if (dailyViews) {
    // Note: strftime %w is 0-6 (Sun-Sat), to_char ID is 1-7 (Mon-Sun)
    const dayIndex = isPostgres ? Number(dailyViews.day_of_week) % 7 : Number(dailyViews.day_of_week);
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    insights.push({
      title: "Peak Performance",
      message: `Your profile gets the most engagement on ${days[dayIndex]}s.`,
      tip: "Consider updating your portfolio mid-week to capitalize on this spike."
    });
  }

  // 2. Completeness Insight
  const hasPrimaryImg = images.some(img => img.is_primary);
  const requiredFields = ['height_cm', 'city'];
  const missing = requiredFields.filter(f => !profile[f]);
  if (missing.length > 0 || !hasPrimaryImg) {
    insights.push({
      title: "Boost Visibility",
      message: `Your profile is missing some key details.`,
      tip: "Talent with complete profiles are 3x more likely to be found by agencies."
    });
  }

  // 3. Growth Insight (Simple version)
  const views = await knex('analytics')
    .where({ profile_id: profile.id, event_type: 'view' })
    .where('created_at', '>=', thirtyDaysAgo)
    .count('* as count')
    .first();
  
  if (Number(views?.count || 0) > 4) {
    insights.push({
      title: "Audience Growth",
      message: `You've had ${views.count} profile views this month.`,
      tip: "Sharing your Pholio link on social media can increase this by up to 40%."
    });
  }

  // Fallback if no specific data
  if (insights.length === 0) {
    insights.push({
      title: "Welcome to Insights",
      message: "We're gathering data to provide you with personalized tips.",
      tip: "Keep your profile up to date to get the best results."
    });
  }

  res.json({
    success: true,
    insights: insights.slice(0, 3)
  });
}));

/**
 * GET /api/talent/analytics/sessions
 * Get daily session data for charts
 */
router.get('/sessions', requireRole('TALENT'), asyncHandler(async (req, res) => {
  const profile = await knex('profiles').where({ user_id: req.session.userId }).first();
  if (!profile) return res.json({ success: true, data: [] });

  const requestedDays = parseInt(req.query.days) || 30;
  const isPro = profile.is_pro || false;
  const maxDays = isPro ? 90 : 7;
  const days = Math.min(requestedDays, maxDays);
  
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  const rawSessions = await knex('visitor_sessions')
    .where({ profile_id: profile.id })
    .where('started_at', '>=', startDate)
    .select(
      knex.raw("DATE(started_at) as date"),
      knex.raw('COUNT(*) as count')
    )
    .groupBy('date')
    .orderBy('date', 'asc');

  // Format for chart
  const dataMap = {};
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - days + i + 1);
    const dateStr = d.toISOString().split('T')[0];
    const dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
    dataMap[dateStr] = { date: dateStr, time: dayName, value: 0 };
  }

  rawSessions.forEach(row => {
    const dateStr = typeof row.date === 'string' ? row.date : new Date(row.date).toISOString().split('T')[0];
    if (dataMap[dateStr]) {
      dataMap[dateStr].value = Number(row.count);
    }
  });

  const data = Object.values(dataMap).sort((a, b) => a.date.localeCompare(b.date));

  res.json({
    success: true,
    data
  });
}));

/**
 * GET /api/talent/analytics/cohorts
 * Get cohort analysis data for retention heatmap
 */
router.get('/cohorts', requireRole('TALENT'), asyncHandler(async (req, res) => {
  const profile = await knex('profiles').where({ user_id: req.session.userId }).first();
  if (!profile) return res.json({ success: true, data: [] });

  const isPostgres = knex.client.config.client === 'pg';
  
  // Logic: 
  // 1. Find the first session date for each visitor
  // 2. Map sessions to weeks relative to first session
  // 3. Aggregate into cohorts
  
  try {
    // This is a complex query, we'll use subqueries for clarity
    const firstSessions = knex('visitor_sessions')
      .where({ profile_id: profile.id })
      .groupBy('visitor_id')
      .select('visitor_id', knex.raw('MIN(started_at) as first_visit'));

    const sessionsWithCohort = knex.select(
      'vs.visitor_id',
      'vs.started_at',
      'fs.first_visit',
      knex.raw(isPostgres 
        ? "floor(extract(day from vs.started_at - fs.first_visit) / 7) as week_number"
        : "cast((julianday(vs.started_at) - julianday(fs.first_visit)) / 7 as integer) as week_number"
      )
    )
    .from('visitor_sessions as vs')
    .join(firstSessions.as('fs'), 'vs.visitor_id', 'fs.visitor_id')
    .where('vs.profile_id', profile.id);

    const cohortStats = await knex.select(
      knex.raw(isPostgres 
        ? "to_char(first_visit, 'DD/MM') || ' - ' || to_char(first_visit + interval '4 days', 'DD/MM') as label"
        : "strftime('%d/%m', first_visit) || ' - ' || strftime('%d/%m', date(first_visit, '+4 days')) as label"
      ),
      'week_number'
    )
    .from(sessionsWithCohort.as('swc'))
    .countDistinct('visitor_id as unique_visitors')
    .groupBy('label', 'week_number')
    .orderBy('label', 'asc');

    // Pivot data for frontend CohortHeatmap
    const pivoted = {};
    cohortStats.forEach(row => {
      if (!pivoted[row.label]) {
        pivoted[row.label] = { label: row.label, retention: [0, 0, 0, 0, 0, 0] };
      }
      if (row.week_number >= 0 && row.week_number < 6) {
        pivoted[row.label].retention[row.week_number] = Number(row.unique_visitors);
      }
    });

    // Convert to percentages relative to week 0 (W0 is always 100%)
    const finalData = Object.values(pivoted).map(row => {
      const w0Count = row.retention[0] || 1;
      return {
        label: row.label,
        retention: row.retention.map((count, i) => i === 0 ? 100 : (count > 0 ? Math.round((count / w0Count) * 100 * 10) / 10 : (i < 2 ? 0 : null)))
      };
    });

    res.json({ success: true, data: finalData.slice(-6) }); // Last 6 cohorts
  } catch (error) {
    console.error('[Cohorts API] Error:', error);
    res.status(500).json({ success: false, error: 'Failed to calculate cohorts' });
  }
}));

/**
 * GET /api/talent/analytics/export
 * Export analytics data as CSV (Studio+ only)
 */
router.get('/analytics/export', requireRole('TALENT'), asyncHandler(async (req, res) => {
  const profile = await knex('profiles').where({ user_id: req.session.userId }).first();
  
  if (!profile) return res.status(404).json({ error: 'Profile not found' });
  
  // Allow debug mode to bypass subscription check
  const isDebugPro = req.query.debug === 'pro';
  if (!profile.is_pro && !isDebugPro) return res.status(403).json({ error: 'Studio+ subscription required' });

  const days = 90;
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);

  // Fetch daily stats
  const rawData = await knex('analytics')
    .where({ profile_id: profile.id })
    .where('created_at', '>=', startDate)
    .select(
      knex.raw("DATE(created_at) as date"),
      'event_type',
      knex.raw('COUNT(*) as count')
    )
    .groupBy('date', 'event_type')
    .orderBy('date', 'asc');

  // Process data
  const dataMap = {};
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - days + i + 1);
    const dateStr = d.toISOString().split('T')[0];
    dataMap[dateStr] = { date: dateStr, views: 0, downloads: 0 };
  }

  rawData.forEach(row => {
    const dateStr = typeof row.date === 'string' ? row.date : new Date(row.date).toISOString().split('T')[0];
    if (dataMap[dateStr]) {
      if (row.event_type === 'view') dataMap[dateStr].views = Number(row.count);
      if (row.event_type === 'download') dataMap[dateStr].downloads = Number(row.count);
    }
  });

  // Generate CSV
  const csvRows = ['Date,Profile Views,Comp Card Downloads'];
  Object.values(dataMap)
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach(row => {
      csvRows.push(`${row.date},${row.views},${row.downloads}`);
    });

  const csvContent = csvRows.join('\n');

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="pholio_analytics.csv"');
  res.send(csvContent);
}));

module.exports = router;

