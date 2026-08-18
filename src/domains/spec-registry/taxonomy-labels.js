"use strict";

const fs = require("fs");
const path = require("path");

/**
 * Presentation labels for the registry vocabulary.
 *
 * Every rule the matcher evaluates is written in taxonomy terms — `close_up`,
 * `shot.frame`, `appearance.hair_state`. Those are storage identifiers, and a
 * talent-facing surface that prints them (or Title-Cases them into "Close Up")
 * is leaking the backend's vocabulary into the product's voice. The taxonomy
 * pack already carries the human wording for every field and every allowed
 * value; this module hands that wording to the client so one resolver can turn
 * an identifier into words without hard-coding a second copy of the vocabulary
 * in the SPA.
 *
 * The map is built from the packaged taxonomy exactly once per process. The
 * published dataset carries the same document in `spec_registry_datasets`, so
 * `buildTaxonomyLabels()` is exported separately for any caller that would
 * rather resolve labels against the dataset a given revision belongs to.
 */

const TAXONOMY_PATH = path.join(
  __dirname,
  "..",
  "..",
  "..",
  "data",
  "spec-registry",
  "v1",
  "taxonomy.json",
);

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function text(value) {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}

function valueEntry(allowedValue) {
  const entry = { label: text(allowedValue.label) || allowedValue.id };
  const description = text(allowedValue.description);
  if (description) entry.description = description;
  return entry;
}

/**
 * @param {object} taxonomy the registry taxonomy document
 * @returns {Record<string, { label: string, description?: string, values: Record<string, { label: string, description?: string }> }>}
 */
function buildTaxonomyLabels(taxonomy) {
  const labels = {};
  if (!isObject(taxonomy)) return labels;

  for (const field of Array.isArray(taxonomy.fields) ? taxonomy.fields : []) {
    if (!isObject(field) || !text(field.id)) continue;
    const entry = { label: text(field.label) || field.id };
    const description = text(field.description);
    if (description) entry.description = description;
    entry.values = {};
    for (const allowedValue of Array.isArray(field.allowedValues) ? field.allowedValues : []) {
      if (!isObject(allowedValue) || !text(allowedValue.id)) continue;
      entry.values[allowedValue.id] = valueEntry(allowedValue);
    }
    labels[field.id] = entry;
  }

  // Facts a source never published are addressed by the same field-shaped id
  // and rendered by the same resolver, so they belong in the same map. A real
  // field always wins the key: it carries allowed values as well as a label.
  for (const fact of Array.isArray(taxonomy.unknownFacts) ? taxonomy.unknownFacts : []) {
    if (!isObject(fact) || !text(fact.id) || labels[fact.id]) continue;
    const entry = { label: text(fact.label) || fact.id };
    const description = text(fact.description);
    if (description) entry.description = description;
    entry.values = {};
    labels[fact.id] = entry;
  }

  return labels;
}

let cached = null;

function loadPackagedTaxonomy() {
  try {
    return JSON.parse(fs.readFileSync(TAXONOMY_PATH, "utf8"));
  } catch {
    // A deployment that ships without the pack still serves the registry from
    // the database. Missing labels mean the client falls back to its own
    // canonical names — never a failed request.
    return null;
  }
}

/** The packaged label map, resolved once per process. */
function registryTaxonomyLabels() {
  if (!cached) {
    const taxonomy = loadPackagedTaxonomy();
    cached = {
      version: text(taxonomy?.taxonomyVersion),
      labels: Object.freeze(buildTaxonomyLabels(taxonomy)),
    };
  }
  return cached.labels;
}

/** The taxonomy version the packaged labels came from, or null. */
function registryTaxonomyLabelsVersion() {
  if (!cached) registryTaxonomyLabels();
  return cached.version;
}

module.exports = {
  TAXONOMY_PATH,
  buildTaxonomyLabels,
  registryTaxonomyLabels,
  registryTaxonomyLabelsVersion,
};
