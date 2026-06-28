"use strict";

const knex = require("../../src/shared/db/knex");
const {
  runDraftLifecycleCleanup,
} = require("../../src/domains/talent/services/application-drafts");

exports.handler = async function handler() {
  try {
    const result = await runDraftLifecycleCleanup(knex);
    console.log("[ApplicationDraftCleanup]", {
      ...result,
      completedAt: new Date().toISOString(),
    });
    return { statusCode: 204 };
  } catch (error) {
    console.error("[ApplicationDraftCleanup] Failed:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "application_draft_cleanup_failed" }),
    };
  }
};
