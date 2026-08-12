#!/usr/bin/env node
"use strict";

const path = require("path");

const db = require("../src/shared/db/knex");
const { publishRegistry } = require("../src/domains/spec-registry/store/publisher");
const {
  DEFAULT_REGISTRY_ROOT,
  RegistryValidationError,
  validateRegistry,
} = require("./validate-spec-registry");

function registryRootFromArgs(argv) {
  const index = argv.indexOf("--registry-root");
  if (index === -1) return DEFAULT_REGISTRY_ROOT;
  const value = argv[index + 1];
  if (!value) throw new Error("--registry-root requires a path");
  return path.resolve(value);
}

async function main(argv = process.argv.slice(2)) {
  const registryRoot = registryRootFromArgs(argv);
  const registry = validateRegistry({ registryRoot });
  const result = await publishRegistry(db, registry);
  console.log(
    `Spec Registry ${result.status}: ${result.datasetVersion}, ` +
      `${result.counts.currentSeries} current series, ${result.counts.revisions} revisions.`,
  );
  return result;
}

if (require.main === module) {
  main()
    .catch((error) => {
      if (error instanceof RegistryValidationError) {
        console.error(error.message);
        for (const issue of error.errors) {
          console.error(`- [${issue.code}] ${issue.location}: ${issue.message}`);
        }
      } else {
        console.error(error.stack || error.message);
      }
      process.exitCode = 1;
    })
    .finally(async () => {
      await db.destroy();
    });
}

module.exports = {
  main,
  registryRootFromArgs,
};
