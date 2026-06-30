const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const knex = require("../../../shared/db/knex");
const { requireAuth } = require("../../auth/middleware/require-auth");
const { parseSocialMediaHandle, generateSocialMediaUrl } = require("../services/profile-helpers");

// Helper to calculate and update profile.social_reach
async function updateSocialReach(profileId) {
  const accounts = await knex("social_accounts").where({ profile_id: profileId });
  const totalReach = accounts.reduce((sum, acct) => sum + (acct.follower_count || 0), 0);
  await knex("profiles").where({ id: profileId }).update({ social_reach: totalReach });
}

/**
 * POST /api/talent/socials/oauth/callback
 * Complete simulated OAuth flow for a platform, saving mock metrics and setting verified status.
 */
router.post("/callback", requireAuth, async (req, res) => {
  const { platform, handle } = req.body;
  const userId = req.session.userId;

  if (!platform || !handle) {
    return res.status(400).json({
      success: false,
      error: "Missing platform or handle"
    });
  }

  const validPlatforms = ["instagram", "tiktok", "youtube"];
  if (!validPlatforms.includes(platform.toLowerCase())) {
    return res.status(400).json({
      success: false,
      error: `OAuth connection is not supported for platform: ${platform}`
    });
  }

  try {
    // Resolve user's profile
    const profile = await knex("profiles").where({ user_id: userId }).first();
    if (!profile) {
      return res.status(404).json({
        success: false,
        error: "Profile not found"
      });
    }

    const normalizedHandle = parseSocialMediaHandle(handle);
    const url = generateSocialMediaUrl(platform, normalizedHandle);

    // Generate simulated metrics
    // Instagram/TikTok/YouTube creators generally range from 10k to 500k followers
    const mockFollowers = Math.floor(Math.random() * 240000) + 10000;
    // Engagement rates typically range between 1.5% and 8.5%
    const mockEngagement = parseFloat((Math.random() * 7 + 1.5).toFixed(2));
    
    const mockMetricsData = {
      avg_likes: Math.floor(mockFollowers * (mockEngagement / 100)),
      avg_comments: Math.floor(mockFollowers * (mockEngagement / 100) * 0.1),
      audience_demographics: {
        gender: { male: "42%", female: "55%", other: "3%" },
        age_ranges: { "18-24": "45%", "25-34": "38%", "35+": "17%" }
      }
    };

    // Upsert into social_accounts
    const existing = await knex("social_accounts")
      .where({ profile_id: profile.id, platform: platform.toLowerCase() })
      .first();

    if (existing) {
      await knex("social_accounts")
        .where({ id: existing.id })
        .update({
          handle: normalizedHandle,
          url: url,
          is_oauth_connected: true,
          follower_count: mockFollowers,
          engagement_rate: mockEngagement,
          metrics_data: JSON.stringify(mockMetricsData),
          metrics_updated_at: knex.fn.now(),
          updated_at: knex.fn.now()
        });
    } else {
      await knex("social_accounts").insert({
        id: crypto.randomUUID(),
        profile_id: profile.id,
        platform: platform.toLowerCase(),
        handle: normalizedHandle,
        url: url,
        is_oauth_connected: true,
        follower_count: mockFollowers,
        engagement_rate: mockEngagement,
        metrics_data: JSON.stringify(mockMetricsData),
        metrics_updated_at: knex.fn.now(),
        created_at: knex.fn.now(),
        updated_at: knex.fn.now()
      });
    }

    // Update profiles.social_reach
    await updateSocialReach(profile.id);

    return res.json({
      success: true,
      message: `${platform} connected successfully.`,
      data: {
        platform,
        handle: normalizedHandle,
        follower_count: mockFollowers,
        engagement_rate: mockEngagement
      }
    });
  } catch (error) {
    console.error("[Social OAuth Callback] Error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to connect social account"
    });
  }
});

/**
 * POST /api/talent/socials/oauth/disconnect/:platform
 * Disconnect/remove OAuth verification for a social account (retains handle as manual link).
 */
router.post("/disconnect/:platform", requireAuth, async (req, res) => {
  const { platform } = req.params;
  const userId = req.session.userId;

  try {
    const profile = await knex("profiles").where({ user_id: userId }).first();
    if (!profile) {
      return res.status(404).json({
        success: false,
        error: "Profile not found"
      });
    }

    const existing = await knex("social_accounts")
      .where({ profile_id: profile.id, platform: platform.toLowerCase() })
      .first();

    if (!existing) {
      return res.status(404).json({
        success: false,
        error: "Social account not connected"
      });
    }

    // Degrade gracefully back to manual entry, clearing metrics and verified status
    await knex("social_accounts")
      .where({ id: existing.id })
      .update({
        is_oauth_connected: false,
        follower_count: null,
        engagement_rate: null,
        metrics_data: null,
        metrics_updated_at: null,
        updated_at: knex.fn.now()
      });

    // Update profiles.social_reach
    await updateSocialReach(profile.id);

    return res.json({
      success: true,
      message: `${platform} disconnected successfully.`
    });
  } catch (error) {
    console.error("[Social OAuth Disconnect] Error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to disconnect social account"
    });
  }
});

module.exports = router;
