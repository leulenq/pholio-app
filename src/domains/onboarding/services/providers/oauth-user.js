/**
 * Normalize Firebase OAuth tokens from Google or Instagram custom auth.
 */

const { normalizeGoogleUser } = require("./google");

function isInstagramUid(uid) {
  return typeof uid === "string" && uid.startsWith("instagram:");
}

function isInstagramToken(decodedToken) {
  if (!decodedToken) return false;
  return (
    decodedToken.provider === "instagram" ||
    isInstagramUid(decodedToken.uid) ||
    !!decodedToken.instagram_handle
  );
}

/**
 * @param {Object} decodedToken - Decoded Firebase ID token
 * @returns {Object} Normalized provider user
 */
function normalizeOAuthUser(decodedToken) {
  if (isInstagramToken(decodedToken)) {
    const handle =
      decodedToken.instagram_handle || decodedToken.username || null;
    const displayName = handle ? handle.replace(/^@/, "") : "User";

    return {
      uid: decodedToken.uid,
      email: decodedToken.email || null,
      name: displayName,
      picture: decodedToken.picture || null,
      first_name: displayName,
      last_name: null,
      instagram_handle: handle,
      oauth_provider: "instagram",
    };
  }

  const googleUser = normalizeGoogleUser(decodedToken);
  return {
    ...googleUser,
    instagram_handle: null,
    oauth_provider: "google",
  };
}

module.exports = {
  isInstagramUid,
  isInstagramToken,
  normalizeOAuthUser,
};
