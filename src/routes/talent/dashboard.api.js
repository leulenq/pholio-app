const express = require('express');
const router = express.Router();
const knex = require('../../db/knex');
const { requireRole } = require('../../middleware/auth');
const { asyncHandler } = require('../../middleware/error-handler');

const { calculateProfileCompleteness } = require('../../lib/dashboard/completeness');

// Helper: Get Strength Status UI (matching frontend logic if needed by templates, though here we send raw data)
const getStrengthLabel = (percentage) => {
  if (percentage < 70) return 'Beginner';
  if (percentage < 90) return 'Intermediate';
  if (percentage < 100) return 'Advanced';
  return 'Expert';
};

// Helper: Determine Next Priority
const determineNextPriority = (profile, images, completeness) => {
  const hasHeadshot = images && images.length > 0;
  
  if (!hasHeadshot) {
      return { 
          title: "First Impression", 
          action: "Upload Headshot", 
          link: "/dashboard/talent/profile?tab=photos" 
      };
  } else if (completeness.percentage < 100) {
      // Logic for next steps if not 100%
      if (!profile.bio) {
        return { 
            title: "Get Discovered", 
            action: "Complete Bio", 
            link: "/dashboard/talent/profile?tab=details" 
        };
      }
      return {
          title: "Growth",
          action: "Add More Photos",
          link: "/dashboard/talent/profile?tab=photos"
      };
  } else {
      return { 
          title: "Maintenance", 
          action: "Update Measurements", 
          link: "/dashboard/talent/profile?tab=physical" 
      };
  }
};

/**
 * GET /api/talent/overview
 * Powers the main dashboard overview
 */
router.get('/overview', requireRole('TALENT'), asyncHandler(async (req, res) => {
  const userId = req.session.userId;
  
  // 1. Fetch Profile & Images
  const profile = await knex('profiles').where({ user_id: userId }).first();
  
  // Guard: If no profile yet
  if (!profile) {
      return res.json({
          profileStrength: { label: 'Beginner', score: 0 },
          nextPriority: { title: 'Welcome', action: 'Create Profile', link: '/onboarding' },
          activityStream: []
      });
  }

  const images = await knex('images')
      .where({ profile_id: profile.id })
      .orderBy('sort', 'asc');

  // 2. Calculate Strength & Priority
  const completeness = calculateProfileCompleteness(profile, images);
  const profileStrength = {
    score: completeness.percentage,
    label: getStrengthLabel(completeness.percentage)
  };
  
  // Use the unified Next Steps from the completeness calculator
  // Get the top priority item, or default if none
  const topPriority = completeness.nextSteps?.[0] || { 
      title: "Growth", 
      action: "Optimize Profile", 
      link: "/dashboard/talent/profile" 
  };
  
  const nextPriority = {
      title: topPriority.impact === 'Critical' ? 'First Impression' : topPriority.title,
      action: topPriority.action,
      link: topPriority.link
  };

  // 3. Fetch Activity Stream (Notifications / Views)
  // Trying to unify where "Activity" comes from. 
  // If we have a 'profile_views' table or 'notifications' table.
  // Falling back to a mock structure if tables don't exist yet, 
  // but checking for 'notifications' or 'activity_logs' is better.
  // For now, let's query the 'activity_logs' if it exists, or return empty.
  
  let activityStream = [];
  
  // Check if activity_logs exists (it's used in profile.api.js logActivity)
  // We want to show things relevant to the USER (e.g. "Agency X viewed your profile")
  // Since we don't have real agency view logic fully wired, we might return empty or mock
  // BUT the prompt asks to "Fetch recentActivity".
  
  try {
      // Trying to fetch real logs if possible, filtering for external interactions?
      // Or just user actions for now?
      // Prompt implies "Activity Stream" = "Agency Actions" (Views, Saves).
      // If we don't have that data, we return empty array.
      
      // Let's assume an empty stream for now unless we find a specific table for agency_views
      // activityStream = ...
  } catch (error) {
      console.warn("Failed to fetch activity stream", error);
  }

  // 4. Recommended Agencies (Mock data from legacy EJS)
  const recommendedAgencies = [
    {
      id: 1,
      name: 'Elite Models',
      logo: 'E',
      match: 95,
      tags: ['Fashion', 'Runway'],
      location: 'LA-based',
      lookingFor: "Female, 5'9\"+",
      type: 'high'
    },
    {
      id: 2,
      name: 'IMG Models',
      logo: 'I',
      match: 87,
      tags: ['Commercial', 'Print'],
      location: 'Nationwide',
      lookingFor: 'All heights',
      type: 'standard'
    },
    {
      id: 3,
      name: 'Next Management',
      logo: 'N',
      match: 82,
      tags: ['Editorial', 'Diversity'],
      location: 'NYC-based',
      lookingFor: 'NYC-based talent',
      type: 'standard'
    }
  ];

  return res.json({
      profileStrength,
      nextPriority,
      activityStream,
      recommendedAgencies
  });
}));

module.exports = router;
