"use strict";

/**
 * Deploy-before-migrate guard for the anonymous open-call applicant flow
 * (`docs/open-call-applicant-flow-design-2026-08.md` §3.3).
 *
 * Netlify ships code and runs migrations as two separate acts, so there is
 * always a window where the functions are new and the database is old. Every
 * surface built on the applicant-identity schema has to be able to answer "does
 * my schema exist yet?" without a query per request — the idiom is
 * `hasOpenCallSchema` in `src/domains/talent/services/open-call-claims.js`: one
 * promise, cached for the life of the process, reset on failure so a cold
 * database or a mid-deploy race can be re-checked rather than remembered as a
 * permanent no.
 *
 * Two probes, one per migration, because they land separately:
 *   `applicant_identities`                 — 20260819110000
 *   `applications.applicant_identity_id`   — 20260819120000
 *
 * A false answer means the applicant flow must degrade to the account-required
 * path, never throw.
 */

let applicantIdentitySchemaPromise = null;

/**
 * @param {import('knex').Knex} db
 * @returns {Promise<boolean>} true once both applicant-identity migrations have run.
 */
function hasApplicantIdentitySchema(db) {
  if (!applicantIdentitySchemaPromise) {
    applicantIdentitySchemaPromise = Promise.all([
      db.schema.hasTable("applicant_identities"),
      db.schema.hasColumn("applications", "applicant_identity_id"),
    ])
      .then((checks) => checks.every(Boolean))
      .catch(() => {
        applicantIdentitySchemaPromise = null;
        return false;
      });
  }
  return applicantIdentitySchemaPromise;
}

/**
 * Forget the cached answer. For tests that migrate a database mid-process — no
 * production caller should need this.
 */
function resetApplicantIdentitySchemaCache() {
  applicantIdentitySchemaPromise = null;
}

module.exports = {
  hasApplicantIdentitySchema,
  resetApplicantIdentitySchemaCache,
};
