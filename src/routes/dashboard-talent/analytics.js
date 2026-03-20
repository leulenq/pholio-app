/**
 * Analytics Routes for Talent Dashboard
 * 
 * Handles analytics and activity feed
 */

const express = require('express');
const knex = require('../../db/knex');
const { requireRole } = require('../../middleware/auth');
const { asyncHandler, createErrorResponse, createSuccessResponse } = require('../../middleware/error-handler');

const router = express.Router();

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
 * GET /dashboard/talent/analytics
 * Get analytics data for the profile
 */
router.get('/dashboard/talent/analytics', requireRole('TALENT'), asyncHandler(async (req, res) => {
  const profile = await knex('profiles').where({ user_id: req.session.userId }).first();
  
  if (!profile) {
    // Return empty analytics when no profile exists
    return res.json(createSuccessResponse({
      views: {
        total: 0,
        thisWeek: 0,
        thisMonth: 0
      },
      downloads: {
        total: 0,
        thisWeek: 0,
        thisMonth: 0,
        byTheme: []
      }
    }));
  }

  // Get analytics for the last 30 days
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  // Get view counts
  const views = await knex('analytics')
    .where({ profile_id: profile.id, event_type: 'view' })
    .where('created_at', '>=', thirtyDaysAgo)
    .count({ total: '*' })
    .first();

  // Get download counts
  const downloads = await knex('analytics')
    .where({ profile_id: profile.id, event_type: 'download' })
    .where('created_at', '>=', thirtyDaysAgo)
    .count({ total: '*' })
    .first();

  // Get views this week
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const viewsThisWeek = await knex('analytics')
    .where({ profile_id: profile.id, event_type: 'view' })
    .where('created_at', '>=', weekAgo)
    .count({ total: '*' })
    .first();

  // Get downloads this week
  const downloadsThisWeek = await knex('analytics')
    .where({ profile_id: profile.id, event_type: 'download' })
    .where('created_at', '>=', weekAgo)
    .count({ total: '*' })
    .first();

  // Get views this month
  const monthAgo = new Date();
  monthAgo.setMonth(monthAgo.getMonth() - 1);
  const viewsThisMonth = await knex('analytics')
    .where({ profile_id: profile.id, event_type: 'view' })
    .where('created_at', '>=', monthAgo)
    .count({ total: '*' })
    .first();

  // Get downloads this month
  const downloadsThisMonth = await knex('analytics')
    .where({ profile_id: profile.id, event_type: 'download' })
    .where('created_at', '>=', monthAgo)
    .count({ total: '*' })
    .first();

  // Get downloads by theme
  const downloadsByTheme = await knex('analytics')
    .where({ profile_id: profile.id, event_type: 'download' })
    .where('created_at', '>=', thirtyDaysAgo)
    .select(knex.raw('metadata->>\'theme\' as theme'))
    .count({ total: '*' })
    .groupBy('theme');

  return res.json(createSuccessResponse({
    views: {
      total: Number(views?.total || 0),
      thisWeek: Number(viewsThisWeek?.total || 0),
      thisMonth: Number(viewsThisMonth?.total || 0)
    },
    downloads: {
      total: Number(downloads?.total || 0),
      thisWeek: Number(downloadsThisWeek?.total || 0),
      thisMonth: Number(downloadsThisMonth?.total || 0),
      byTheme: downloadsByTheme.map(item => ({
        theme: item.theme || 'unknown',
        count: Number(item.total || 0)
      }))
    }
  }));
}));

/**
 * GET /dashboard/talent/activity
 * Get activity feed for the user
 */
router.get('/dashboard/talent/activity', requireRole('TALENT'), asyncHandler(async (req, res) => {
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

  return res.json(createSuccessResponse({
    activities: formattedActivities
  }));
}));

module.exports = router;
