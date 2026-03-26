/**
 * Google OAuth Provider Helper
 * Handles Google Sign-In via Firebase ID token verification
 */

const { verifyIdToken } = require("../../../auth/services/firebase-admin");

/**
 * Verify Google ID token (Firebase)
 * @param {string} idToken - Firebase ID token
 * @returns {Promise<Object>} Decoded token with user info
 */
async function verifyGoogleToken(idToken) {
  if (!idToken || typeof idToken !== "string") {
    throw new Error("Invalid token: token is required");
  }

  try {
    const decodedToken = await verifyIdToken(idToken);
    return decodedToken;
  } catch (error) {
    // Re-throw with clearer error message
    if (error.message.includes("expired")) {
      throw new Error("Token expired");
    } else if (error.message.includes("Invalid token")) {
      throw new Error("Invalid token format");
    }
    throw new Error(`Token verification failed: ${error.message}`);
  }
}

/**
 * Normalize Google user data from decoded token
 * Extracts and parses user information
 * @param {Object} decodedToken - Decoded Firebase ID token
 * @returns {Object} Normalized user data: {uid, email, name, picture, first_name, last_name}
 */
function normalizeGoogleUser(decodedToken) {
  if (!decodedToken || !decodedToken.uid) {
    throw new Error("Invalid decoded token: uid is required");
  }

  const uid = decodedToken.uid;
  const email = decodedToken.email || null;
  const displayName = decodedToken.name || null;
  const picture = decodedToken.picture || null;

  // Prioritize direct claims from Google
  let firstName = decodedToken.given_name || null;
  let lastName = decodedToken.family_name || null;

  // Fallback: Parse display name into first_name and last_name if claims missing
  if (!firstName && displayName) {
    const nameParts = displayName.trim().split(/\s+/);
    firstName = nameParts[0] || null;
    lastName = nameParts.slice(1).join(" ") || null;
  }

  return {
    uid,
    email,
    name: displayName,
    picture,
    first_name: firstName,
    last_name: lastName,
  };
}

module.exports = {
  verifyGoogleToken,
  normalizeGoogleUser,
};
