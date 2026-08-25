"use strict";

/**
 * One place errors are handed to, so there is somewhere to wire a destination.
 *
 * The production audit's finding was blunt: a 500 in production produced a
 * message and a path, with the stack explicitly discarded, into a log with no
 * retention on a plan with no alerting. Nothing anywhere told a human that
 * production had broken. That is most of why several bugs this week were
 * silent — swallowed catches and columns that did not exist, all of which
 * emitted something nobody could see.
 *
 * This deliberately does NOT install an APM client. Adding a runtime dependency
 * and requiring an account is a decision with a cost, and it is not mine to
 * make. What it does is remove the reason that decision keeps getting deferred:
 * the wiring is here, it no-ops until configured, and turning it on is one
 * environment variable rather than a refactor.
 *
 * Two destinations, both optional:
 *
 *   ERROR_WEBHOOK_URL — POSTs a compact JSON body. Works with Slack-style
 *   incoming webhooks, a Netlify function, an internal endpoint, anything that
 *   accepts a POST. No SDK, no account.
 *
 *   A registered reporter — `setErrorReporter(fn)` lets an app that DOES adopt
 *   Sentry (or anything else) hand it in at boot without this module knowing
 *   what it is.
 *
 * The rules that matter more than the plumbing:
 *
 * REPORTING NEVER THROWS. It runs inside an error handler; a reporter that
 * failed would replace a diagnosable error with an undiagnosable one.
 *
 * REPORTING NEVER BLOCKS. It is fire-and-forget with a hard timeout, because a
 * slow webhook must not add latency to a request that is already failing — and
 * under a serverless runtime a hanging report holds the whole invocation.
 *
 * NOTHING PERSONAL LEAVES. A user id, yes — an operator needs to correlate.
 * Never an email, a name, a body, headers or query values. An error report is
 * an outbound transmission to a third party, and it is subject to the same rule
 * as everything else the product sends anywhere.
 */

/** Long enough for a webhook, short enough not to matter. */
const REPORT_TIMEOUT_MS = 2000;

let customReporter = null;

/**
 * Register a reporter — an adopted APM client, a test spy, anything callable.
 *
 * @param {((error: Error, context: object) => void)|null} reporter
 */
function setErrorReporter(reporter) {
  customReporter = typeof reporter === "function" ? reporter : null;
}

/**
 * Everything the report carries. Explicitly built rather than spread, so a
 * caller cannot widen it by accident and personal data cannot arrive by
 * inheriting a request object.
 *
 * @param {Error} error
 * @param {object} context
 */
function buildReport(error, context = {}) {
  return {
    message: String(error?.message || "Unknown error").slice(0, 500),
    name: error?.name || "Error",
    code: error?.code || null,
    stack: String(error?.stack || "").slice(0, 4000),
    path: context.path || null,
    method: context.method || null,
    status: context.status || null,
    // An id, never an identity: enough to correlate, nothing to identify.
    userId: context.userId || null,
    environment: process.env.NODE_ENV || "unknown",
    at: new Date().toISOString(),
  };
}

/**
 * Report an error. Returns immediately; never throws.
 *
 * @param {Error} error
 * @param {object} [context]
 */
function reportError(error, context = {}) {
  if (!error) return;

  let report;
  try {
    report = buildReport(error, context);
  } catch {
    return;
  }

  if (customReporter) {
    try {
      customReporter(error, report);
    } catch {
      // A broken reporter must not become the error anyone sees.
    }
  }

  const url = process.env.ERROR_WEBHOOK_URL;
  if (!url) return;

  const send = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REPORT_TIMEOUT_MS);
    try {
      await globalThis.fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(report),
        signal: controller.signal,
      });
    } catch {
      // Swallowed on purpose: the original error is what matters, and a failed
      // report must never mask it or fail the response.
    } finally {
      clearTimeout(timer);
    }
  };

  send();
}

module.exports = { REPORT_TIMEOUT_MS, buildReport, reportError, setErrorReporter };
