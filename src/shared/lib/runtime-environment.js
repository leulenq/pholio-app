"use strict";

/**
 * One answer to "is this a real deployment?", and it fails closed.
 *
 * The codebase gates development-only behaviour on `NODE_ENV !== "production"`.
 * For leaking an error stack that is acceptable. For the two gates that mint a
 * session without credentials — `isDevSeedAuthEnabled` in dev-seed-session.js
 * and `isDevLoginEnabled` in auth/routes/auth.js — it is the wrong direction,
 * because the dangerous state is the DEFAULT one:
 *
 *   NODE_ENV unset          → "!== production" is true  → auth bypass available
 *   NODE_ENV="Production"   → true (capital P)          → auth bypass available
 *   NODE_ENV="prod"         → true                      → auth bypass available
 *   NODE_ENV="staging"      → true                      → auth bypass available
 *
 * Every one of those is a plausible misconfiguration, and each opens a door that
 * signs a caller in as a seeded principal with no credentials. A serverless
 * platform that drops the environment on a cold start, a renamed stage, a typo
 * in a dashboard field — the failure is silent and total.
 *
 * `isDevelopmentRuntime()` inverts that. Development behaviour is available only
 * when the environment SAYS it is development or test. Anything unrecognised —
 * including nothing at all — is treated as a real deployment.
 *
 * This is deliberately not a general-purpose "is production" helper. It answers
 * one question: may this process do something it would never be allowed to do in
 * front of real users?
 */

/** The only values that unlock development-only behaviour. */
const DEVELOPMENT_ENVIRONMENTS = Object.freeze(["development", "test"]);

/**
 * True only when the runtime explicitly declares itself development or test.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
function isDevelopmentRuntime(env = process.env) {
  const declared = String(env.NODE_ENV || "")
    .trim()
    .toLowerCase();
  return DEVELOPMENT_ENVIRONMENTS.includes(declared);
}

/**
 * The inverse, named for the question callers usually ask. Unset NODE_ENV counts
 * as a deployment, which is the safe reading.
 *
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {boolean}
 */
function isDeployedRuntime(env = process.env) {
  return !isDevelopmentRuntime(env);
}

module.exports = {
  DEVELOPMENT_ENVIRONMENTS,
  isDevelopmentRuntime,
  isDeployedRuntime,
};
