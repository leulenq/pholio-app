const knex = require("../db/knex");
const crypto = require("crypto");
const { parseSocialMediaHandle, generateSocialMediaUrl } = require("../../domains/talent/services/profile-helpers");
const { loadSocialAccountsForProfile } = require("./social-accounts");

/**
 * Fetch and attach social fields to a profile object (compatibility layer).
 * Reuses the canonical `social_accounts` loader (social-accounts.js) so the
 * owner editor and every other reader agree on what "verified" means.
 */
async function injectSocialFields(profile) {
  if (!profile) return profile;

  const accounts = await loadSocialAccountsForProfile(profile.id);

  // Initialize with null/false to match old flat columns
  profile.instagram_handle = null;
  profile.instagram_url = null;
  profile.instagram_verified = false;
  profile.instagram_followers = null;
  profile.instagram_engagement = null;

  profile.tiktok_handle = null;
  profile.tiktok_url = null;
  profile.tiktok_verified = false;
  profile.tiktok_followers = null;
  profile.tiktok_engagement = null;

  profile.twitter_handle = null;
  profile.twitter_url = null;
  profile.twitter_verified = false;
  profile.twitter_followers = null;
  profile.twitter_engagement = null;

  profile.youtube_handle = null;
  profile.youtube_url = null;
  profile.youtube_verified = false;
  profile.youtube_followers = null;
  profile.youtube_engagement = null;

  profile.onlyfans_url = null;
  profile.portfolio_url = null;

  for (const acct of accounts) {
    if (acct.platform === "instagram") {
      profile.instagram_handle = acct.handle;
      profile.instagram_url = acct.url;
      profile.instagram_verified = acct.verified;
      profile.instagram_followers = acct.follower_count;
      profile.instagram_engagement = acct.engagement_rate;
    } else if (acct.platform === "tiktok") {
      profile.tiktok_handle = acct.handle;
      profile.tiktok_url = acct.url;
      profile.tiktok_verified = acct.verified;
      profile.tiktok_followers = acct.follower_count;
      profile.tiktok_engagement = acct.engagement_rate;
    } else if (acct.platform === "twitter") {
      profile.twitter_handle = acct.handle;
      profile.twitter_url = acct.url;
      profile.twitter_verified = acct.verified;
      profile.twitter_followers = acct.follower_count;
      profile.twitter_engagement = acct.engagement_rate;
    } else if (acct.platform === "youtube") {
      profile.youtube_handle = acct.handle;
      profile.youtube_url = acct.url;
      profile.youtube_verified = acct.verified;
      profile.youtube_followers = acct.follower_count;
      profile.youtube_engagement = acct.engagement_rate;
    } else if (acct.platform === "onlyfans") {
      profile.onlyfans_url = acct.url;
    } else if (acct.platform === "portfolio") {
      profile.portfolio_url = acct.url;
    }
  }
  
  return profile;
}

/**
 * Fetch and attach social fields to an agency object (compatibility layer)
 */
async function injectAgencySocialFields(agency) {
  if (!agency) return agency;

  const accounts = await knex("social_accounts").where({ agency_id: agency.id });

  agency.instagram_handle = null;
  agency.tiktok_handle = null;
  agency.twitter_handle = null;
  agency.youtube_handle = null;
  agency.video_reel_url = null;

  for (const acct of accounts) {
    if (acct.platform === "instagram") {
      agency.instagram_handle = acct.url || acct.handle;
    } else if (acct.platform === "tiktok") {
      agency.tiktok_handle = acct.url || acct.handle;
    } else if (acct.platform === "twitter") {
      agency.twitter_handle = acct.url || acct.handle;
    } else if (acct.platform === "youtube") {
      agency.youtube_handle = acct.url || acct.handle;
    } else if (acct.platform === "video_reel") {
      agency.video_reel_url = acct.url;
    }
  }

  return agency;
}

/**
 * Save profile social accounts and update profiles.social_reach
 */
async function saveProfileSocialFields(profileId, data, isPro = false) {
  const platforms = [
    { name: "instagram", handleKey: "instagram_handle", urlKey: "instagram_url" },
    { name: "tiktok", handleKey: "tiktok_handle", urlKey: "tiktok_url" },
    { name: "twitter", handleKey: "twitter_handle", urlKey: "twitter_url" },
    { name: "youtube", handleKey: "youtube_handle", urlKey: "youtube_url" },
    { name: "onlyfans", handleKey: null, urlKey: "onlyfans_url" },
    { name: "portfolio", handleKey: null, urlKey: "portfolio_url" }
  ];

  for (const p of platforms) {
    let handle = null;
    let url = null;
    let hasValue = false;

    // Check if field was passed in the request body (handling undefined vs null/empty)
    if (p.handleKey && data[p.handleKey] !== undefined) {
      handle = data[p.handleKey] ? parseSocialMediaHandle(data[p.handleKey]) : null;
      if (isPro && handle) {
        url = generateSocialMediaUrl(p.name, handle);
      } else if (data[p.urlKey] !== undefined) {
        url = data[p.urlKey] || null;
      } else {
        // Compute static default url if not pro
        url = handle ? generateSocialMediaUrl(p.name, handle) : null;
      }
      hasValue = true;
    } else if (p.urlKey && data[p.urlKey] !== undefined) {
      url = data[p.urlKey] || null;
      hasValue = true;
    }

    if (hasValue) {
      if (handle || url) {
        // Upsert social account
        const existing = await knex("social_accounts")
          .where({ profile_id: profileId, platform: p.name })
          .first();

        if (existing) {
          await knex("social_accounts")
            .where({ id: existing.id })
            .update({
              handle: handle,
              url: url,
              updated_at: knex.fn.now()
            });
        } else {
          await knex("social_accounts").insert({
            id: crypto.randomUUID(),
            profile_id: profileId,
            platform: p.name,
            handle: handle,
            url: url,
            created_at: knex.fn.now(),
            updated_at: knex.fn.now()
          });
        }
      } else {
        // Delete if set to empty/null
        await knex("social_accounts")
          .where({ profile_id: profileId, platform: p.name })
          .delete();
      }
    }
  }

  // Recalculate denormalized profiles.social_reach
  const accounts = await knex("social_accounts").where({ profile_id: profileId });
  const totalReach = accounts.reduce((sum, acct) => sum + (acct.follower_count || 0), 0);
  await knex("profiles").where({ id: profileId }).update({ social_reach: totalReach });
}

/**
 * Save agency social accounts
 */
async function saveAgencySocialFields(agencyId, data) {
  const platforms = [
    { name: "instagram", handleKey: "instagram_handle" },
    { name: "tiktok", handleKey: "tiktok_handle" },
    { name: "twitter", handleKey: "twitter_handle" },
    { name: "youtube", handleKey: "youtube_handle" },
    { name: "video_reel", urlKey: "video_reel_url" }
  ];

  for (const p of platforms) {
    let handle = null;
    let url = null;
    let hasValue = false;

    if (p.handleKey && data[p.handleKey] !== undefined) {
      handle = data[p.handleKey] ? parseSocialMediaHandle(data[p.handleKey]) : null;
      if (handle) {
        url = generateSocialMediaUrl(p.name, handle) || `https://${p.name}.com/${handle}`;
      }
      hasValue = true;
    } else if (p.urlKey && data[p.urlKey] !== undefined) {
      url = data[p.urlKey] || null;
      hasValue = true;
    }

    if (hasValue) {
      if (handle || url) {
        const existing = await knex("social_accounts")
          .where({ agency_id: agencyId, platform: p.name })
          .first();

        if (existing) {
          await knex("social_accounts")
            .where({ id: existing.id })
            .update({
              handle: handle,
              url: url,
              updated_at: knex.fn.now()
            });
        } else {
          await knex("social_accounts").insert({
            id: crypto.randomUUID(),
            agency_id: agencyId,
            platform: p.name,
            handle: handle,
            url: url,
            created_at: knex.fn.now(),
            updated_at: knex.fn.now()
          });
        }
      } else {
        await knex("social_accounts")
          .where({ agency_id: agencyId, platform: p.name })
          .delete();
      }
    }
  }
}

module.exports = {
  injectSocialFields,
  injectAgencySocialFields,
  saveProfileSocialFields,
  saveAgencySocialFields
};
