"use strict";

const knex = require("../../src/shared/db/knex");
const {
  runDraftLifecycleCleanup,
} = require("../../src/domains/talent/services/application-drafts");
const {
  redactExpiredSubmissionPackages,
} = require("../../src/shared/lib/submission-retention");
const {
  runApplicationAutoClose,
} = require("../../src/shared/lib/application-auto-close");
const {
  recordReturnedD30Events,
} = require("../../src/shared/services/event-funnel");

exports.handler = async function handler() {
  try {
    const drafts = await runDraftLifecycleCleanup(knex);
    const redactedSubmissionPackages =
      await redactExpiredSubmissionPackages(knex);
    const autoClosed = await runApplicationAutoClose(knex);
    // Funnel step 8 (design §g). Measured here rather than in the browser
    // because "did they come back?" reported by the client is a number the
    // client can invent. Swallows its own errors — it must never stop the
    // retention and auto-close work above from being reported as done.
    const returnedD30 = await recordReturnedD30Events({ db: knex });
    console.log("[ApplicationLifecycleCleanup]", {
      ...drafts,
      redactedSubmissionPackages,
      autoClosed,
      returnedD30,
      completedAt: new Date().toISOString(),
    });
    return { statusCode: 204 };
  } catch (error) {
    console.error("[ApplicationLifecycleCleanup] Failed:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "application_lifecycle_cleanup_failed" }),
    };
  }
};
