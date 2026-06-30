"use strict";

const knex = require("../../src/shared/db/knex");
const {
  runDraftLifecycleCleanup,
} = require("../../src/domains/talent/services/application-drafts");
const {
  redactExpiredSubmissionPackages,
} = require("../../src/shared/lib/submission-retention");

exports.handler = async function handler() {
  try {
    const drafts = await runDraftLifecycleCleanup(knex);
    const redactedSubmissionPackages =
      await redactExpiredSubmissionPackages(knex);
    console.log("[ApplicationLifecycleCleanup]", {
      ...drafts,
      redactedSubmissionPackages,
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
