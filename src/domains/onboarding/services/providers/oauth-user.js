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

/**
 * The authoritative sign-in method for the account, for `users.auth_provider`.
 *
 * Distinct from `normalizeOAuthUser().oauth_provider`, which answers "how should
 * this token's profile fields be read" and therefore falls back to `google` for
 * anything non-Instagram — including password sign-ins. That fallback is fine for
 * field mapping and wrong for identity: settings has to be able to say "you sign
 * in with Google" without saying it to someone who uses a password.
 *
 * Reads Firebase's own `sign_in_provider` claim rather than inferring.
 *
 * @param {Object} decodedToken - Decoded Firebase ID token
 * @returns {"google"|"instagram"|"password"|"apple"|"facebook"|"custom"|null}
 */
function resolveAuthProvider(decodedToken) {
  if (!decodedToken) return null;
  if (isInstagramToken(decodedToken)) return "instagram";

  const claim = decodedToken.firebase?.sign_in_provider || null;
  switch (claim) {
    case "google.com":
      return "google";
    case "password":
      return "password";
    case "apple.com":
      return "apple";
    case "facebook.com":
      return "facebook";
    case "custom":
      return "custom";
    default:
      return claim ? String(claim).replace(/\.com$/, "") : null;
  }
}

module.exports = {
  isInstagramUid,
  isInstagramToken,
  normalizeOAuthUser,
  resolveAuthProvider,
};
