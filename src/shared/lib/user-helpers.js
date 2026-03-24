const { v4: uuidv4 } = require('uuid');
const knex = require('../db/knex');
const { ensureUniqueSlug } = require('./slugify');
const { provisionAgencyForUser } = require('../../lib/agency-provisioning');

/**
 * Create a new user in the database
 * @param {Object} params - User creation parameters
 * @param {string} params.firebaseUid - Firebase user UID
 * @param {string} params.email - User email (normalized)
 * @param {string} params.role - User role ('TALENT' or 'AGENCY')
 * @param {string} [params.agencyName] - Agency name (for AGENCY role)
 * @param {Object} [params.profileData] - Optional profile data (for TALENT role)
 * @returns {Promise<Object>} Created user object
 */
async function createUser({ firebaseUid, email, role, agencyName = null, profileData = null, first_name = null, last_name = null }) {
  const userId = uuidv4();
  const normalizedEmail = email.toLowerCase().trim();

  // If profileData is provided, first_name and last_name should come from it
  const finalFirstName = profileData?.first_name || first_name;
  const finalLastName = profileData?.last_name || last_name;

  console.log('[User Helpers] Creating user:', {
    id: userId,
    email: normalizedEmail,
    firebase_uid: firebaseUid,
    role: role,
    agency_name: agencyName || null,
    first_name: finalFirstName,
    last_name: finalLastName
  });

  // Use transaction if profile data is provided (for TALENT)
  if (role === 'TALENT' && profileData) {
    return await knex.transaction(async (trx) => {
      // Insert user
      await trx('users').insert({
        id: userId,
        email: normalizedEmail,
        firebase_uid: firebaseUid,
        role: 'TALENT',
        first_name: finalFirstName,
        last_name: finalLastName
      });

      console.log('[User Helpers] User inserted in transaction:', userId);

      // Create profile
      const slug = await ensureUniqueSlug(trx, 'profiles', 
        finalFirstName && finalLastName
          ? `${finalFirstName}-${finalLastName}`
          : 'talent'
      );
      const profileId = uuidv4();

      const profileInsert = {
        id: profileId,
        user_id: userId,
        slug,
        first_name: finalFirstName,
        last_name: finalLastName,
        city: profileData.city || null,
        phone: profileData.phone || null,
        bio_raw: profileData.bio || null,
        bio_curated: profileData.bio || null,
        // Add other profile fields if provided
        ...(profileData.height_cm && { height_cm: profileData.height_cm }),
        ...(profileData.instagram_handle && { instagram_handle: profileData.instagram_handle }),
        ...(profileData.twitter_handle && { twitter_handle: profileData.twitter_handle }),
        ...(profileData.tiktok_handle && { tiktok_handle: profileData.tiktok_handle })
      };

      await trx('profiles').insert(profileInsert);

      console.log('[User Helpers] Profile created in transaction:', profileId);

      // Fetch and return user
      const user = await trx('users').where({ id: userId }).first();
      return user;
    });
  }

  // For AGENCY or TALENT without profile data, just create user
  await knex('users').insert({
    id: userId,
    email: normalizedEmail,
    firebase_uid: firebaseUid,
    role: role,
    first_name: finalFirstName,
    last_name: finalLastName
  });

  console.log('[User Helpers] User created successfully:', {
    id: userId,
    email: normalizedEmail,
    role: role
  });

  // Verify user was created
  const createdUser = await knex('users').where({ id: userId }).first();
  if (!createdUser) {
    throw new Error('Failed to create user account');
  }

  if (role === 'AGENCY' && agencyName) {
    await provisionAgencyForUser({
      userId,
      agencyName,
      db: knex,
    });
  }

  return createdUser;
}

/**
 * Determine user role from context
 * Defaults to 'TALENT' if not specified
 * @param {string} [role] - Explicit role
 * @param {string} [path] - Request path (e.g., '/apply' for talent, '/partners' for agency)
 * @returns {string} User role
 */
function determineRole(role = null, path = null) {
  if (role) {
    return role.toUpperCase();
  }
  
  if (path) {
    if (path.includes('/partners') || path.includes('/agency')) {
      return 'AGENCY';
    }
    if (path.includes('/apply') || path.includes('/talent')) {
      return 'TALENT';
    }
  }
  
  // Default to TALENT
  return 'TALENT';
}

module.exports = {
  createUser,
  determineRole
};
