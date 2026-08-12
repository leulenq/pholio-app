"use strict";

/*
 * Hold an agency-authored revision to exactly the standard the editorial
 * package is held to.
 *
 * `collectSemanticErrors` was written to check a whole dataset, so a single
 * revision is wrapped in a one-record manifest here. That is a harness detail,
 * not a weaker check: every per-spec rule — taxonomy membership, allowed
 * values, evidence references, review provenance, freshness deadlines,
 * contradictory numeric intervals — runs unchanged.
 */

const {
  collectSemanticErrors,
  createSchemaValidators,
  formatSchemaErrors,
  DEFAULT_REGISTRY_ROOT,
} = require("../validation/registry-validator");

let cachedValidators = null;

function validators() {
  if (!cachedValidators) {
    cachedValidators = createSchemaValidators(DEFAULT_REGISTRY_ROOT);
  }
  return cachedValidators;
}

/** The `<series>--r<n>.json` name the validator expects for a revision. */
function specFileName(spec) {
  return `${spec.seriesId.replace(/[^a-z0-9]+/g, "-")}--r${spec.revision}.json`;
}

/**
 * The manifest the semantic pass expects, built around one series.
 *
 * `datasetVersion` must match the manifest schema's date-and-counter pattern
 * even though an agency-authored revision never joins a dataset. It is derived
 * from the publish date so the value is at least truthful about when this ran.
 */
function syntheticManifest(spec, publishedOn) {
  return {
    $schema: "./schemas/manifest.schema.json",
    schemaVersion: spec.schemaVersion,
    taxonomyVersion: spec.taxonomyVersion,
    datasetVersion: `${String(publishedOn).replace(/-/g, ".")}.1`,
    publishedOn,
    records: [
      {
        seriesId: spec.seriesId,
        currentRevisionId: spec.revisionId,
        path: `specs/${specFileName(spec)}`,
        status: spec.status,
      },
    ],
  };
}

/**
 * @param {object} params
 * @param {object} params.spec         composed revision payload
 * @param {object} params.taxonomy     the active taxonomy
 * @param {string} params.publishedOn  YYYY-MM-DD
 * @param {object|null} params.predecessor
 *   the revision this one supersedes. The chain check verifies that revision
 *   N names revision N-1 of the same series, which it cannot do from N alone —
 *   the predecessor lives in the database, not in this call. Passing it keeps a
 *   real integrity check rather than suppressing it.
 * @returns {Array<{code: string, location: string, message: string}>}
 */
function validateAuthoredRevision({ spec, taxonomy, publishedOn, predecessor = null }) {
  const { schemas, validators: compiled } = validators();

  if (!compiled.spec(spec)) {
    return formatSchemaErrors("/spec", compiled.spec.errors);
  }

  const chain = predecessor ? [predecessor, spec] : [spec];
  return collectSemanticErrors({
    manifest: syntheticManifest(spec, publishedOn),
    taxonomy,
    specs: chain,
    specPaths: chain.map(specFileName),
    specSchema: schemas.spec,
    asOf: new Date(`${publishedOn}T00:00:00.000Z`),
  });
}

module.exports = { validateAuthoredRevision };
