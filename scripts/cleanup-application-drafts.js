"use strict";

const knex = require("../src/shared/db/knex");
const {
  runDraftLifecycleCleanup,
} = require("../src/domains/talent/services/application-drafts");
const {
  redactExpiredSubmissionPackages,
} = require("../src/shared/lib/submission-retention");

async function main() {
  const result = await runDraftLifecycleCleanup(knex);
  const redactedSubmissionPackages =
    await redactExpiredSubmissionPackages(knex);
  console.log(
    JSON.stringify({
      job: "application-lifecycle",
      expired: result.expired,
      purged: result.purged,
      redactedSubmissionPackages,
      completedAt: new Date().toISOString(),
    }),
  );
}

main()
  .catch((error) => {
    console.error("[ApplicationLifecycleCleanup] Failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await knex.destroy();
  });
