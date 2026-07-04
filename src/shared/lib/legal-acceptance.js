const CURRENT_TERMS_VERSION = "2026-06-25";
const CURRENT_PRIVACY_VERSION = "2026-06-25";

async function recordLegalAcceptance(knex, userId, acceptance = {}) {
  if (!knex) {
    throw new Error("knex instance is required");
  }

  if (!userId) {
    throw new Error("userId is required");
  }

  const updates = {};

  if (acceptance.terms === true) {
    updates.terms_accepted_at = knex.fn.now();
    updates.terms_accepted_version = CURRENT_TERMS_VERSION;
  }

  if (acceptance.privacy === true) {
    updates.privacy_accepted_at = knex.fn.now();
    updates.privacy_accepted_version = CURRENT_PRIVACY_VERSION;
  }

  if (!Object.keys(updates).length) {
    return false;
  }

  await knex("users").where({ id: userId }).update(updates);
  return true;
}

function requireLegalAcceptance(user, options = {}) {
  // Acceptance must be recorded AND match the current version. Comparing the
  // stored version (not just its presence) is what re-prompts talent when the
  // Terms or Privacy Policy are bumped — otherwise a stale acceptance would
  // satisfy the gate forever and the "our terms have changed" flow would never
  // appear when it should.
  const hasAccepted =
    Boolean(user?.terms_accepted_at) &&
    user?.terms_accepted_version === CURRENT_TERMS_VERSION &&
    Boolean(user?.privacy_accepted_at) &&
    user?.privacy_accepted_version === CURRENT_PRIVACY_VERSION;

  if (hasAccepted) {
    return true;
  }

  if (options.throwOnMissing === false) {
    return false;
  }

  const error = new Error("Legal acceptance required");
  error.code = "LEGAL_ACCEPTANCE_REQUIRED";
  throw error;
}

module.exports = {
  CURRENT_TERMS_VERSION,
  CURRENT_PRIVACY_VERSION,
  recordLegalAcceptance,
  requireLegalAcceptance,
};
