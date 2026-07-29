/**
 * Backfill `users.auth_provider` for accounts that pre-date the column.
 *
 * The login path records the provider from the Firebase token, but only on the
 * next sign-in — an account with a long-lived Express session can sit on a null
 * column for weeks. Settings then has to describe a sign-in identity it cannot
 * see, and the neutral fallback ("Email and password") is a false statement to
 * anyone who signs in with Google.
 *
 * Firebase Admin already knows the answer, so ask it once and persist. Every
 * later request reads the column.
 */

const {
  isInstagramUid,
} = require("../../onboarding/services/providers/oauth-user");
const { getUser } = require("./firebase-admin");

/**
 * Map a Firebase `providerData[].providerId` to the value stored in
 * `users.auth_provider`. Mirrors `resolveAuthProvider`, which reads the
 * `sign_in_provider` token claim for the same set of providers.
 *
 * @param {string|null} providerId
 * @returns {"google"|"instagram"|"password"|"apple"|"facebook"|string|null}
 */
function normalizeProviderId(providerId) {
  if (!providerId) return null;
  switch (providerId) {
    case "google.com":
      return "google";
    case "password":
      return "password";
    case "apple.com":
      return "apple";
    case "facebook.com":
      return "facebook";
    default:
      return String(providerId).replace(/\.com$/, "");
  }
}

/**
 * The account's sign-in provider, resolving and persisting it when the column is
 * still null. Returns null when it genuinely cannot be determined — callers must
 * treat that as "unknown", never as "email and password".
 *
 * @param {import('knex')} knex
 * @param {Object|null} user - Row from `users`
 * @returns {Promise<string|null>}
 */
async function ensureAuthProvider(knex, user) {
  if (!user) return null;
  if (user.auth_provider) return String(user.auth_provider);
  if (!user.firebase_uid) return null;

  let resolved = null;

  if (isInstagramUid(user.firebase_uid)) {
    // Instagram sign-in mints its own uid namespace; no Firebase lookup needed.
    resolved = "instagram";
  } else {
    try {
      const record = await getUser(user.firebase_uid);
      const providerId = record?.providerData?.[0]?.providerId || null;
      resolved = normalizeProviderId(providerId);
    } catch (error) {
      // Non-critical: the surface falls back to the neutral representation and
      // the next sign-in records the provider anyway.
      console.warn(
        "[AuthProvider] Unable to resolve provider from Firebase:",
        error.message,
      );
      return null;
    }
  }

  if (!resolved) return null;

  try {
    if (await knex.schema.hasColumn("users", "auth_provider")) {
      await knex("users")
        .where({ id: user.id })
        .update({ auth_provider: resolved });
      user.auth_provider = resolved;
    }
  } catch (error) {
    console.warn(
      "[AuthProvider] Unable to persist resolved provider:",
      error.message,
    );
  }

  return resolved;
}

module.exports = {
  normalizeProviderId,
  ensureAuthProvider,
};
