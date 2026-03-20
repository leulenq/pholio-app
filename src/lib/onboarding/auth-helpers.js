/**
 * Onboarding Authentication Helpers
 * Utilities for user/profile creation during Phase A onboarding
 */

const { v4: uuidv4 } = require('uuid');
const knex = require('../../db/knex');
const { ensureUniqueSlug } = require('../slugify');
const { verifyGoogleToken, normalizeGoogleUser } = require('./providers/google');
const { verifyInstagramCode, normalizeInstagramUser } = require('./providers/instagram');
const { initialState } = require('./state-machine');

/**
 * Normalize email address
 * @param {string} email - Raw email address
 * @returns {string} Normalized email (lowercase, trimmed)
 */
function normalizeEmail(email) {
  if (!email || typeof email !== 'string') {
    return null;
  }
  return email.toLowerCase().trim();
}

/**
 * Get locked agency ID from session
 * @param {Object} req - Express request object
 * @returns {string|null} Agency ID or null
 */
function getLockedAgencyId(req) {
  return req.session?.lockedAgencyId || null;
}

/**
 * Ensure user and draft profile exist
 * Creates user and minimal draft profile if they don't exist
 * 
 * @param {Object} providerUser - Provider user data from OAuth
 * @param {string|null} lockedAgencyId - Locked agency ID (from partner route)
 * @returns {Promise<Object>} {user, profile, isNewUser, isNewProfile}
 */
async function ensureUserAndDraftProfile(providerUser, lockedAgencyId = null) {
  const { uid, email, first_name, last_name, picture, instagram_handle } = providerUser;

  // Normalize email
  const normalizedEmail = normalizeEmail(email);

  // Determine provider (Google or Instagram)
  const isGoogle = !!uid && !instagram_handle;
  const isInstagram = !!instagram_handle;

  // Find or create user
  let user = null;
  let isNewUser = false;

  if (isGoogle && uid) {
    // Look up by Firebase UID first (Google)
    user = await knex('users').where({ firebase_uid: uid }).first();
  }

  if (!user && normalizedEmail) {
    // Look up by email (fallback)
    user = await knex('users').where({ email: normalizedEmail }).first();
  }

  if (!user) {
    // Create new user
    const userId = uuidv4();
    await knex('users').insert({
      id: userId,
      email: normalizedEmail || `temp_${Date.now()}@pholio.me`, // Placeholder email if none (Instagram)
      firebase_uid: isGoogle ? uid : null,
      role: 'TALENT',
      created_at: knex.fn.now()
    });

    user = await knex('users').where({ id: userId }).first();
    isNewUser = true;
  }

  // Find or create draft profile
  let profile = await knex('profiles').where({ user_id: user.id }).first();
  let isNewProfile = false;

  if (!profile) {
    // Create minimal draft profile
    const profileId = uuidv4();
    const slug = await ensureUniqueSlug(knex, 'profiles', 
      first_name && last_name 
        ? `${first_name}-${last_name}` 
        : `user-${user.id.substring(0, 8)}`
    );

    // Use provider data for initial profile values
    // Determine visibility mode and source agency from partner route
    const visibilityMode = lockedAgencyId ? 'agency_locked' : 'private_intake';
    
    const draftProfileData = {
      id: profileId,
      user_id: user.id,
      slug,
      first_name: first_name || 'User',
      last_name: last_name || 'User',
      city: 'Not specified', // Required field, placeholder (will be set in onboarding)
      height_cm: 0, // Required field, will be set in onboarding
      bio_raw: '', // Required field
      bio_curated: '', // Required field
      
      // Use State Machine for initial state
      ...initialState('identity', knex),
      
      source_agency_id: lockedAgencyId || null,
      visibility_mode: visibilityMode,
      services_locked: true,
      analysis_status: 'pending',
      profile_completeness: 0,
      partner_agency_id: lockedAgencyId || null, // Keep for backward compatibility
      instagram_handle: instagram_handle || null,
      is_pro: false,
      created_at: knex.fn.now(),
      updated_at: knex.fn.now()
    };

    await knex('profiles').insert(draftProfileData);

    // Sync provider picture to images table as primary
    if (picture) {
      await knex('images').insert({
        id: uuidv4(),
        profile_id: profileId,
        path: picture,
        public_url: picture,
        is_primary: true,
        sort: 0,
        created_at: knex.fn.now()
      });
    }
    profile = await knex('profiles').where({ id: profileId }).first();
    isNewProfile = true;
    } else {
      // Profile exists - update onboarding_stage if needed
      const updateData = { updated_at: knex.fn.now() };
      
      if (!profile.onboarding_stage || profile.onboarding_stage === 'draft') {
        const initial = initialState('identity', knex);
        Object.assign(updateData, initial);
      }
      
      // Set source_agency_id and visibility_mode if from partner route and not set
      if (lockedAgencyId && !profile.source_agency_id) {
        updateData.source_agency_id = lockedAgencyId;
        updateData.visibility_mode = 'agency_locked';
      } else if (!lockedAgencyId && !profile.visibility_mode) {
        updateData.visibility_mode = 'private_intake';
      }
      
      if (Object.keys(updateData).length > 1) { // More than just updated_at
        await knex('profiles')
          .where({ id: profile.id })
          .update(updateData);
        profile = await knex('profiles').where({ id: profile.id }).first();
      }

    // Update hero image if profile picture available and no primary exists
    if (picture) {
      const primary = await knex('images').where({ profile_id: profile.id, is_primary: true }).first();
      if (!primary) {
        await knex('images')
          .insert({ 
            id: uuidv4(),
            profile_id: profile.id,
            path: picture,
            public_url: picture,
            is_primary: true,
            sort: 0,
            created_at: knex.fn.now()
          });
      }
    }

    // Update Instagram handle if provided and not set
    if (instagram_handle && !profile.instagram_handle) {
      await knex('profiles')
        .where({ id: profile.id })
        .update({ 
          instagram_handle: instagram_handle,
          updated_at: knex.fn.now()
        });
      profile.instagram_handle = instagram_handle;
    }
  }

  return {
    user,
    profile,
    isNewUser,
    isNewProfile
  };
}

module.exports = {
  normalizeEmail,
  getLockedAgencyId,
  ensureUserAndDraftProfile,
  verifyGoogleToken,
  normalizeGoogleUser,
  verifyInstagramCode,
  normalizeInstagramUser
};
