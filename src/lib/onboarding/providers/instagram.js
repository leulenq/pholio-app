/**
 * Instagram OAuth Provider Helper (Stub)
 * Structure for future Instagram OAuth implementation
 */

/**
 * Verify Instagram OAuth code (STUB)
 * TODO: Implement Instagram OAuth code exchange
 * 
 * @param {string} code - Instagram OAuth authorization code
 * @returns {Promise<Object>} User data: {instagram_id, handle, picture, email}
 */
async function verifyInstagramCode(code) {
  // STUB: Return mock data for now
  // TODO: Implement actual Instagram OAuth flow:
  // 1. Exchange code for access token
  // 2. Use access token to fetch user info from Instagram Graph API
  // 3. Return normalized user data
  
  if (!code || typeof code !== 'string') {
    throw new Error('Invalid code: code is required');
  }

  // Stub implementation - returns mock data
  // In production, this would:
  // - Exchange code for access token via Instagram API
  // - Fetch user profile from Instagram Graph API
  // - Extract handle, profile picture, etc.
  // - Note: Instagram doesn't provide email in basic OAuth flow
  
  return {
    instagram_id: `stub_${Date.now()}`, // Placeholder
    handle: null, // Would come from Instagram API
    picture: null, // Would come from Instagram API
    email: null // Instagram doesn't provide email
  };
}

/**
 * Normalize Instagram user data (STUB)
 * @param {Object} instagramData - Instagram API response data
 * @returns {Object} Normalized user data: {instagram_id, handle, picture, email}
 */
function normalizeInstagramUser(instagramData) {
  // STUB: Structure for future implementation
  return {
    instagram_id: instagramData?.id || instagramData?.instagram_id || null,
    handle: instagramData?.username || instagramData?.handle || null,
    picture: instagramData?.profile_picture_url || instagramData?.picture || null,
    email: null // Instagram doesn't provide email in OAuth flow
  };
}

module.exports = {
  verifyInstagramCode,
  normalizeInstagramUser
};
