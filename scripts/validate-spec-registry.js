#!/usr/bin/env node
"use strict";

/*
 * CLI for the Spec Registry validator.
 *
 * The rules themselves live in src/domains/spec-registry/validation so that a
 * revision an agency authors in-product is held to exactly the same standard as
 * the editorial package. This file is the command line around them.
 */

const {
  DEFAULT_REGISTRY_ROOT,
  RegistryValidationError,
  collectSemanticErrors,
  createSchemaValidators,
  formatSchemaErrors,
  readJson,
  validateRegistry,
} = require("../src/domains/spec-registry/validation/registry-validator");

if (require.main === module) {
  try {
    const { summary } = validateRegistry();
    console.log(
      `Spec Registry valid: ${summary.currentSeries} current series, ` +
        `${summary.revisions} revisions, ${summary.taxonomyFields} taxonomy fields, ` +
        `${summary.unknownFacts} unknown facts.`,
    );
  } catch (error) {
    if (error instanceof RegistryValidationError) {
      console.error(error.message);
      for (const issue of error.errors) {
        console.error(`- [${issue.code}] ${issue.location}: ${issue.message}`);
      }
      process.exitCode = 1;
    } else {
      console.error(error.stack || error.message);
      process.exitCode = 1;
    }
  }
}

module.exports = {
  DEFAULT_REGISTRY_ROOT,
  RegistryValidationError,
  collectSemanticErrors,
  createSchemaValidators,
  formatSchemaErrors,
  readJson,
  validateRegistry,
};
