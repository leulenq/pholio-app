/**
 * @deprecated Use scripts/backfill-discover-index.js for multi-channel backfill.
 */
"use strict";

const { backfillDiscoverIndex } = require("./backfill-discover-index");

async function backfillDiscoverEmbeddings(knex, options = {}) {
  return backfillDiscoverIndex(knex, {
    ...options,
    channels: options.channels || ["discover_index"],
  });
}

if (require.main === module) {
  console.warn(
    "[backfill-discover-embeddings] Deprecated — use scripts/backfill-discover-index.js",
  );
  const dryRun = process.argv.includes("--dry-run");
  const knex = require("knex")(require("../knexfile.js"));

  backfillDiscoverEmbeddings(knex, { dryRun })
    .then(() => knex.destroy())
    .catch((e) => {
      console.error("BACKFILL ERROR:", e.message);
      knex.destroy();
      process.exit(1);
    });
}

module.exports = { backfillDiscoverEmbeddings };
