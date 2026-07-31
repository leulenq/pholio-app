"use strict";

const {
  CURRENT_TERMS_VERSION,
  CURRENT_PRIVACY_VERSION,
} = require("../../src/shared/lib/legal-acceptance");

/**
 * Legal-acceptance columns for a test fixture user.
 *
 * Talent API routes sit behind `requireTalentLegalAcceptance`, so a fixture
 * user created without these gets a 403 before reaching the handler under
 * test — which looks like a failure in whatever the suite was actually
 * testing. Several suites hit exactly that.
 *
 * Derived from the live constants rather than hardcoded, because a hardcoded
 * version is what silently broke seeds/seed.js when CURRENT_LEGAL_VERSION was
 * bumped.
 *
 * Spread into a `users` insert:
 *   await knex("users").insert({ id, email, role: "TALENT", ...acceptedLegal() });
 */
function acceptedLegal(at = new Date()) {
  return {
    terms_accepted_at: at,
    terms_accepted_version: CURRENT_TERMS_VERSION,
    privacy_accepted_at: at,
    privacy_accepted_version: CURRENT_PRIVACY_VERSION,
  };
}

module.exports = { acceptedLegal };
