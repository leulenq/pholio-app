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
  const hasAccepted =
    Boolean(user?.terms_accepted_at) &&
    Boolean(user?.terms_accepted_version) &&
    Boolean(user?.privacy_accepted_at) &&
    Boolean(user?.privacy_accepted_version);

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
