"use strict";

const knex = require("../src/shared/db/knex");
const {
  runDraftLifecycleCleanup,
} = require("../src/domains/talent/services/application-drafts");

async function main() {
  const result = await runDraftLifecycleCleanup(knex);
  console.log(
    JSON.stringify({
      job: "application-draft-lifecycle",
      expired: result.expired,
      purged: result.purged,
      completedAt: new Date().toISOString(),
    }),
  );
}

main()
  .catch((error) => {
    console.error("[ApplicationDraftCleanup] Failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await knex.destroy();
  });
