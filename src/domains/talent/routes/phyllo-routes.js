const express = require("express");
const router = express.Router();
const crypto = require("crypto");
const knex = require("../../../shared/db/knex");
const { requireAuth } = require("../../auth/middleware/require-auth");
const { parseSocialMediaHandle, generateSocialMediaUrl } = require("../services/profile-helpers");
const {
  IS_SANDBOX,
  createPhylloUser,
  getPhylloSdkToken,
  fetchPhylloAccount,
  fetchPhylloEngagement
} = require("../../../shared/lib/phyllo");

// Helper to calculate and update profile.social_reach
async function updateSocialReach(profileId) {
  const accounts = await knex("social_accounts").where({ profile_id: profileId });
  const totalReach = accounts.reduce((sum, acct) => sum + (acct.follower_count || 0), 0);
  await knex("profiles").where({ id: profileId }).update({ social_reach: totalReach });
}

/**
 * POST /api/talent/socials/phyllo/sdk-token
 * Retrieve or generate Phyllo user ID and SDK connect token
 */
router.post("/sdk-token", requireAuth, async (req, res) => {
  const userId = req.session.userId;

  try {
    const profile = await knex("profiles").where({ user_id: userId }).first();
    if (!profile) {
      return res.status(404).json({ success: false, error: "Profile not found" });
    }

    let phylloUserId = profile.phyllo_user_id;

    if (!phylloUserId) {
      // Create user in Phyllo
      const fullName = `${profile.first_name || ""} ${profile.last_name || ""}`.trim() || "Pholio Creator";
      const phylloUser = await createPhylloUser(fullName, profile.id);
      
      phylloUserId = phylloUser.id;
      
      // Persist in profiles
      await knex("profiles").where({ id: profile.id }).update({ phyllo_user_id: phylloUserId });
    }

    // Get SDK Token
    const sdkToken = await getPhylloSdkToken(phylloUserId);

    return res.json({
      success: true,
      token: sdkToken.value,
      userId: phylloUserId,
      environment: IS_SANDBOX ? "sandbox" : "staging"
    });
  } catch (error) {
    console.error("[Phyllo Router] sdk-token failed:", error);
    return res.status(500).json({ success: false, error: "Failed to generate SDK token" });
  }
});

/**
 * POST /api/talent/socials/phyllo/callback
 * Sync connected account handle and engagement metrics
 */
router.post("/callback", requireAuth, async (req, res) => {
  const { account_id, workplatform_id, user_id } = req.body;
  const sessionUserId = req.session.userId;

  if (!account_id || !workplatform_id || !user_id) {
    return res.status(400).json({ success: false, error: "Missing required callback arguments" });
  }

  try {
    const profile = await knex("profiles").where({ user_id: sessionUserId }).first();
    if (!profile) {
      return res.status(404).json({ success: false, error: "Profile not found" });
    }

    // Fetch details from Phyllo API
    const phylloAccount = await fetchPhylloAccount(account_id);
    const engagement = await fetchPhylloEngagement(account_id);

    // Map workplatform name to our local platform key
    const workplatformName = phylloAccount.workplatform.name.toLowerCase();
    let platformKey = "instagram";
    if (workplatformName.includes("tiktok")) platformKey = "tiktok";
    if (workplatformName.includes("youtube")) platformKey = "youtube";

    const handle = parseSocialMediaHandle(phylloAccount.username);
    const url = generateSocialMediaUrl(platformKey, handle);

    // Upsert social_accounts
    const existing = await knex("social_accounts")
      .where({ profile_id: profile.id, platform: platformKey })
      .first();

    if (existing) {
      await knex("social_accounts")
        .where({ id: existing.id })
        .update({
          handle,
          url,
          is_oauth_connected: true,
          follower_count: engagement.follower_count,
          engagement_rate: engagement.engagement_rate,
          phyllo_account_id: account_id,
          updated_at: knex.fn.now()
        });
    } else {
      await knex("social_accounts").insert({
        id: crypto.randomUUID(),
        profile_id: profile.id,
        platform: platformKey,
        handle,
        url,
        is_oauth_connected: true,
        follower_count: engagement.follower_count,
        engagement_rate: engagement.engagement_rate,
        phyllo_account_id: account_id,
        created_at: knex.fn.now(),
        updated_at: knex.fn.now()
      });
    }

    // Update profiles.social_reach
    await updateSocialReach(profile.id);

    return res.json({
      success: true,
      message: `${platformKey} synced successfully via Phyllo.`,
      data: {
        platform: platformKey,
        handle,
        follower_count: engagement.follower_count,
        engagement_rate: engagement.engagement_rate
      }
    });
  } catch (error) {
    console.error("[Phyllo Router] Callback failed:", error);
    return res.status(500).json({ success: false, error: "Failed to sync connection metrics" });
  }
});

/**
 * POST /api/talent/socials/phyllo/disconnect/:platform
 * Disconnect verification status and metrics (retaining handle link)
 */
router.post("/disconnect/:platform", requireAuth, async (req, res) => {
  const { platform } = req.params;
  const sessionUserId = req.session.userId;

  try {
    const profile = await knex("profiles").where({ user_id: sessionUserId }).first();
    if (!profile) {
      return res.status(404).json({ success: false, error: "Profile not found" });
    }

    const existing = await knex("social_accounts")
      .where({ profile_id: profile.id, platform: platform.toLowerCase() })
      .first();

    if (!existing) {
      return res.status(404).json({ success: false, error: "Social account not connected" });
    }

    // Graceful degradation
    await knex("social_accounts")
      .where({ id: existing.id })
      .update({
        is_oauth_connected: false,
        follower_count: null,
        engagement_rate: null,
        phyllo_account_id: null,
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
    console.error("[Phyllo Router] Disconnect failed:", error);
    return res.status(500).json({ success: false, error: "Failed to disconnect account" });
  }
});

module.exports = router;
