/**
 * Referral Handling Utilities
 * 
 * Handles agency referral parsing and validation from query params or signed tokens.
 * Sets partner_agency_id on profile, which derives REFERRAL_LOCKED pool status.
 */

const jwt = require('jsonwebtoken');
const knex = require('../../db/knex');

/**
 * Parse referral agency ID from query parameter
 * 
 * @param {Object} query - Express request query object
 * @returns {string|null} Agency ID or null
 * 
 * @example
 * const agencyId = parseReferralQuery(req.query); // 'uuid-here' or null
 */
function parseReferralQuery(query) {
  if (!query || typeof query !== 'object') {
    return null;
  }

  // Support common referral parameter names
  const referralParam = query.referral || query.agency_id || query.ref || query.agency;
  
  if (!referralParam || typeof referralParam !== 'string') {
    return null;
  }

  // Basic UUID validation (simple check)
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(referralParam)) {
    return referralParam;
  }

  return null;
}

/**
 * Parse and validate signed referral token (JWT)
 * 
 * @param {string} token - Signed JWT token
 * @returns {Object|null} Decoded token payload or null if invalid
 * 
 * @example
 * const payload = parseReferralToken(req.query.token);
 * if (payload && payload.agency_id) {
 *   // Use payload.agency_id
 * }
 */
function parseReferralToken(token) {
  if (!token || typeof token !== 'string') {
    return null;
  }

  try {
    const secret = process.env.REFERRAL_TOKEN_SECRET || process.env.JWT_SECRET || 'default-secret-change-in-production';
    const decoded = jwt.verify(token, secret);
    
    // Validate token structure
    if (!decoded || typeof decoded !== 'object') {
      return null;
    }

    // Check expiry (JWT handles this automatically in verify)
    // Check required fields
    if (!decoded.agency_id) {
      return null;
    }

    return decoded;
  } catch (error) {
    // Token invalid, expired, or malformed
    console.warn('[Referral] Token validation failed:', error.message);
    return null;
  }
}

/**
 * Validate that an agency exists in the database
 * 
 * @param {string} agencyId - Agency organization ID
 * @returns {Promise<Object|null>} Agency organization row or null
 */
async function validateAgency(agencyId) {
  if (!agencyId || typeof agencyId !== 'string') {
    return null;
  }

  try {
    const agency = await knex('agencies')
      .where({ id: agencyId })
      .first();
    
    return agency || null;
  } catch (error) {
    console.error('[Referral] Error validating agency:', error);
    return null;
  }
}

/**
 * Set referral agency on profile
 * 
 * Sets partner_agency_id on profile, which automatically derives REFERRAL_LOCKED pool status.
 * This function validates the agency exists before setting.
 * 
 * @param {string} profileId - Profile ID
 * @param {string} agencyId - Agency organization ID
 * @returns {Promise<boolean>} True if successfully set, false otherwise
 * 
 * @example
 * const success = await setReferralAgency(profileId, agencyId);
 * if (success) {
 *   // Profile is now REFERRAL_LOCKED to this agency
 * }
 */
async function setReferralAgency(profileId, agencyId) {
  if (!profileId || !agencyId) {
    return false;
  }

  try {
    // Validate agency exists
    const agency = await validateAgency(agencyId);
    if (!agency) {
      console.warn('[Referral] Agency not found:', agencyId);
      return false;
    }

    // Update profile
    await knex('profiles')
      .where({ id: profileId })
      .update({
        partner_agency_id: agencyId,
        updated_at: knex.fn.now()
      });

    return true;
  } catch (error) {
    console.error('[Referral] Error setting referral agency:', error);
    return false;
  }
}

/**
 * Extract referral agency ID from request (query param or signed token)
 * 
 * Checks both query parameters and signed tokens, validates agency exists.
 * 
 * @param {Object} req - Express request object
 * @returns {Promise<string|null>} Validated agency ID or null
 * 
 * @example
 * const agencyId = await extractReferralAgencyId(req);
 * if (agencyId) {
 *   await setReferralAgency(profileId, agencyId);
 * }
 */
async function extractReferralAgencyId(req) {
  if (!req) {
    return null;
  }

  // Try query parameter first
  const queryAgencyId = parseReferralQuery(req.query);
  if (queryAgencyId) {
    const validated = await validateAgency(queryAgencyId);
    if (validated) {
      return queryAgencyId;
    }
  }

  // Try signed token
  const token = req.query.token || req.body.token || req.headers['x-referral-token'];
  if (token) {
    const payload = parseReferralToken(token);
    if (payload && payload.agency_id) {
      const validated = await validateAgency(payload.agency_id);
      if (validated) {
        return payload.agency_id;
      }
    }
  }

  return null;
}

module.exports = {
  parseReferralQuery,
  parseReferralToken,
  validateAgency,
  setReferralAgency,
  extractReferralAgencyId
};
