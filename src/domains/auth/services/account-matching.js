/**
 * Shared Firebase-identity → Pholio-user matching.
 *
 * Used by both POST /login (auth.js) and POST /onboarding/entry (casting.js),
 * which independently implemented slightly divergent versions of this same
 * lookup — a maintenance/consistency risk (a fix in one is easy to forget in
 * the other) and, in casting.js's case, a subtly different outcome: a single
 * combined `.where(uid).orWhere(email)` query does not guarantee which row
 * `.first()` returns if a data anomaly ever produced both a uid match and a
 * different email match simultaneously. Two sequential lookups — uid first,
 * verified-email fallback second — removes that ambiguity and is now the one
 * place this logic lives.
 *
 * Matching (and binding firebase_uid to) a pre-existing row on an UNVERIFIED
 * email claim is an account-takeover vector — a user whose email isn't
 * registered in Firebase (seeds, imports, legacy/Instagram rows) could
 * otherwise be claimed by registering that email and signing in with an
 * unverified token (audit finding H3). The email fallback only applies when
 * the caller passes emailVerified === true.
 *
 * @param {import('knex').Knex} knex
 * @param {{ firebaseUid: string, email?: string | null, emailVerified?: boolean }} identity
 * @returns {Promise<object | null>} The matched users row, or null.
 */
async function findUserByFirebaseIdentity(knex, { firebaseUid, email, emailVerified }) {
  let user = await knex("users").where({ firebase_uid: firebaseUid }).first();

  if (!user && email && emailVerified) {
    const normalizedEmail = email.toLowerCase().trim();
    user = await knex("users").where({ email: normalizedEmail }).first();
  }

  return user || null;
}

module.exports = { findUserByFirebaseIdentity };
