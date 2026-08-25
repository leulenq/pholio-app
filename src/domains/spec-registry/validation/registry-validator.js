"use strict";

/*
 * Registry validation core.
 *
 * Moved here from scripts/validate-spec-registry.js so the same rules that gate
 * the editorial package also gate a revision an agency authors at runtime. The
 * script remains the CLI entry point and re-exports this module unchanged.
 */

const fs = require("fs");
const path = require("path");
const Ajv2020 = require("ajv/dist/2020");
const addFormats = require("ajv-formats");

/* Under Netlify, esbuild collapses src/ to the zip root so `__dirname` is
   /var/task and the relative walk resolves outside the bundle. Both readers are
   fail-soft, so the symptom was agency requirement labels rendering as raw slug
   ids in production with nothing logged. Same branch app.js uses for views. */
const DEFAULT_REGISTRY_ROOT = path.join(
  process.env.LAMBDA_TASK_ROOT || path.join(__dirname, "..", "..", "..", ".."),
  "data",
  "spec-registry",
  "v1",
);

class RegistryValidationError extends Error {
  constructor(errors) {
    super(`Spec Registry validation failed with ${errors.length} error(s)`);
    this.name = "RegistryValidationError";
    this.errors = errors;
  }
}

function readJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Cannot read JSON at ${filePath}: ${error.message}`);
  }
}

function createSchemaValidators(registryRoot) {
  const ajv = new Ajv2020({
    allErrors: true,
    allowUnionTypes: true,
    strict: true,
    validateFormats: true,
  });
  addFormats(ajv);

  const schemasRoot = path.join(registryRoot, "schemas");
  const schemas = {
    manifest: readJson(path.join(schemasRoot, "manifest.schema.json")),
    taxonomy: readJson(path.join(schemasRoot, "taxonomy.schema.json")),
    spec: readJson(path.join(schemasRoot, "spec-revision.schema.json")),
  };

  return {
    schemas,
    validators: {
      manifest: ajv.compile(schemas.manifest),
      taxonomy: ajv.compile(schemas.taxonomy),
      spec: ajv.compile(schemas.spec),
    },
  };
}

function formatSchemaErrors(label, errors = []) {
  return errors.map((error) => ({
    code: "schema",
    location: `${label}${error.instancePath || "/"}`,
    message: error.message || "schema validation failed",
  }));
}

function walkExpression(expression, visit, location) {
  if (!expression) return;
  if (Object.prototype.hasOwnProperty.call(expression, "field")) {
    visit(expression, location);
    return;
  }

  for (const key of ["all", "any"]) {
    if (Array.isArray(expression[key])) {
      expression[key].forEach((child, index) =>
        walkExpression(child, visit, `${location}/${key}/${index}`),
      );
      return;
    }
  }

  if (expression.not) {
    walkExpression(expression.not, visit, `${location}/not`);
  }
}

function scalarValues(value) {
  return Array.isArray(value) ? value : [value];
}

function isSameOrSubdomain(hostname, domain) {
  const normalizedHost = hostname.toLowerCase();
  const normalizedDomain = domain.toLowerCase();
  return (
    normalizedHost === normalizedDomain ||
    normalizedHost.endsWith(`.${normalizedDomain}`)
  );
}

function expressionReferencesField(expression, fieldId) {
  let found = false;
  walkExpression(expression, (constraint) => {
    if (constraint.field === fieldId) found = true;
  });
  return found;
}

function intersectNumericIntervals(left, right) {
  let min = left.min;
  let minInclusive = left.minInclusive;
  if (right.min > min) {
    min = right.min;
    minInclusive = right.minInclusive;
  } else if (right.min === min) {
    minInclusive = minInclusive && right.minInclusive;
  }

  let max = left.max;
  let maxInclusive = left.maxInclusive;
  if (right.max < max) {
    max = right.max;
    maxInclusive = right.maxInclusive;
  } else if (right.max === max) {
    maxInclusive = maxInclusive && right.maxInclusive;
  }

  return { min, minInclusive, max, maxInclusive };
}

function numericIntervalForField(expression, fieldId) {
  const unbounded = {
    min: Number.NEGATIVE_INFINITY,
    minInclusive: false,
    max: Number.POSITIVE_INFINITY,
    maxInclusive: false,
  };
  if (!expression) return unbounded;

  if (Object.prototype.hasOwnProperty.call(expression, "field")) {
    if (expression.field !== fieldId) return unbounded;
    if (typeof expression.value !== "number") return null;

    switch (expression.operator) {
      case "equals":
        return {
          min: expression.value,
          minInclusive: true,
          max: expression.value,
          maxInclusive: true,
        };
      case "gte":
        return {
          ...unbounded,
          min: expression.value,
          minInclusive: true,
        };
      case "gt":
        return {
          ...unbounded,
          min: expression.value,
          minInclusive: false,
        };
      case "lte":
        return {
          ...unbounded,
          max: expression.value,
          maxInclusive: true,
        };
      case "lt":
        return {
          ...unbounded,
          max: expression.value,
          maxInclusive: false,
        };
      default:
        return null;
    }
  }

  if (Array.isArray(expression.all)) {
    return expression.all.reduce((interval, child) => {
      if (interval === null) return null;
      const childInterval = numericIntervalForField(child, fieldId);
      return childInterval === null
        ? null
        : intersectNumericIntervals(interval, childInterval);
    }, unbounded);
  }

  return null;
}

function numericIntervalsOverlap(left, right) {
  if (left.max < right.min || right.max < left.min) return false;
  if (left.max === right.min) return left.maxInclusive && right.minInclusive;
  if (right.max === left.min) return right.maxInclusive && left.minInclusive;
  return true;
}

function collectSemanticErrors({
  manifest,
  taxonomy,
  specs,
  specPaths,
  specSchema,
  asOf = new Date(),
}) {
  const errors = [];
  const add = (code, location, message) =>
    errors.push({ code, location, message });

  const taxonomyByField = new Map();
  for (const field of taxonomy.fields) {
    if (taxonomyByField.has(field.id)) {
      add("duplicate-taxonomy-field", "/taxonomy/fields", `Duplicate field ${field.id}`);
    }
    taxonomyByField.set(field.id, field);

    const valueIds = new Set();
    for (const value of field.allowedValues) {
      if (valueIds.has(value.id)) {
        add(
          "duplicate-taxonomy-value",
          `/taxonomy/fields/${field.id}`,
          `Duplicate value ${value.id}`,
        );
      }
      valueIds.add(value.id);
    }
  }

  const unknownFactIds = new Set();
  for (const fact of taxonomy.unknownFacts) {
    if (unknownFactIds.has(fact.id)) {
      add("duplicate-unknown-fact", "/taxonomy/unknownFacts", `Duplicate fact ${fact.id}`);
    }
    unknownFactIds.add(fact.id);
  }

  const schemaFields = new Set(specSchema.$defs.field.enum);
  const taxonomyFields = new Set(taxonomyByField.keys());
  for (const field of schemaFields) {
    if (!taxonomyFields.has(field)) {
      add("taxonomy-schema-drift", "/taxonomy", `Schema field ${field} is missing`);
    }
  }
  for (const field of taxonomyFields) {
    if (!schemaFields.has(field)) {
      add("taxonomy-schema-drift", "/schemas/spec", `Taxonomy field ${field} is missing`);
    }
  }

  const revisionById = new Map();
  const revisionsBySeries = new Map();
  specs.forEach((spec, index) => {
    const location = `/specs/${specPaths[index]}`;
    if (revisionById.has(spec.revisionId)) {
      add("duplicate-revision", location, `Duplicate revisionId ${spec.revisionId}`);
    }
    revisionById.set(spec.revisionId, { spec, location });
    if (!revisionsBySeries.has(spec.seriesId)) revisionsBySeries.set(spec.seriesId, []);
    revisionsBySeries.get(spec.seriesId).push({ spec, location });

    if (spec.revisionId !== `${spec.seriesId}@${spec.revision}`) {
      add(
        "revision-identity",
        `${location}/revisionId`,
        "revisionId must equal seriesId@revision",
      );
    }
    if (!specPaths[index].endsWith(`--r${spec.revision}.json`)) {
      add(
        "filename-revision",
        location,
        `Filename must end in --r${spec.revision}.json`,
      );
    }
  });

  for (const [seriesId, revisions] of revisionsBySeries) {
    revisions.sort((a, b) => a.spec.revision - b.spec.revision);
    const seenNumbers = new Set();
    for (const { spec, location } of revisions) {
      if (seenNumbers.has(spec.revision)) {
        add("duplicate-revision-number", location, `Duplicate revision ${spec.revision}`);
      }
      seenNumbers.add(spec.revision);

      if (spec.revision === 1 && spec.supersedesRevisionId !== null) {
        add("revision-chain", `${location}/supersedesRevisionId`, "Revision 1 cannot supersede");
      }
      if (spec.revision > 1) {
        const previous = revisionById.get(spec.supersedesRevisionId);
        if (!previous) {
          add(
            "revision-chain",
            `${location}/supersedesRevisionId`,
            "Superseded revision does not exist",
          );
        } else if (
          previous.spec.seriesId !== seriesId ||
          previous.spec.revision !== spec.revision - 1
        ) {
          add(
            "revision-chain",
            `${location}/supersedesRevisionId`,
            "Revision must supersede the immediately previous revision in the same series",
          );
        }
      }
    }
  }

  const manifestSeries = new Set();
  const manifestPaths = new Set();
  const manifestRevisionIds = new Set();
  for (const [index, record] of manifest.records.entries()) {
    const location = `/manifest/records/${index}`;
    if (manifestSeries.has(record.seriesId)) {
      add("duplicate-manifest-series", location, `Duplicate series ${record.seriesId}`);
    }
    if (manifestPaths.has(record.path)) {
      add("duplicate-manifest-path", location, `Duplicate path ${record.path}`);
    }
    if (manifestRevisionIds.has(record.currentRevisionId)) {
      add("duplicate-manifest-revision", location, `Duplicate current revision ${record.currentRevisionId}`);
    }
    manifestSeries.add(record.seriesId);
    manifestPaths.add(record.path);
    manifestRevisionIds.add(record.currentRevisionId);

    const referenced = revisionById.get(record.currentRevisionId);
    if (!referenced) {
      add("manifest-reference", location, `Unknown revision ${record.currentRevisionId}`);
      continue;
    }
    if (referenced.spec.seriesId !== record.seriesId) {
      add("manifest-reference", location, "Manifest series does not match its revision");
    }
    if (referenced.spec.status !== record.status) {
      add("manifest-status", location, "Manifest status does not match its revision");
    }
    if (record.path !== referenced.location.replace("/specs/", "specs/")) {
      add("manifest-path", location, "Manifest path does not match its revision file");
    }
    const seriesRevisions = revisionsBySeries.get(record.seriesId) || [];
    const latestRevision = Math.max(
      ...seriesRevisions.map(({ spec }) => spec.revision),
    );
    if (seriesRevisions.length > 0 && referenced.spec.revision !== latestRevision) {
      add(
        "manifest-not-latest",
        `${location}/currentRevisionId`,
        `Current revision must be the latest revision (${latestRevision})`,
      );
    }
    if (Date.parse(manifest.publishedOn) < Date.parse(referenced.spec.lifecycle.reviewedOn)) {
      add(
        "manifest-publication-order",
        `${location}/currentRevisionId`,
        "Manifest publication predates the current revision review",
      );
    }
  }
  for (const seriesId of revisionsBySeries.keys()) {
    if (!manifestSeries.has(seriesId)) {
      add("manifest-series", "/manifest/records", `Series ${seriesId} has no current pointer`);
    }
  }

  const validateConstraint = (constraint, location) => {
    const field = taxonomyByField.get(constraint.field);
    if (!field) {
      add("unknown-taxonomy-field", `${location}/field`, `Unknown field ${constraint.field}`);
      return;
    }

    if (constraint.unit !== field.unit) {
      add(
        "unit-mismatch",
        `${location}/unit`,
        `${constraint.field} requires unit ${String(field.unit)}`,
      );
    }

    const numericOperators = new Set(["gte", "lte", "gt", "lt", "between"]);
    if (numericOperators.has(constraint.operator) && field.valueType !== "number") {
      add("operator-type", `${location}/operator`, "Numeric operator used on non-number field");
    }
    if (constraint.operator === "between") {
      if (
        !Array.isArray(constraint.value) ||
        constraint.value.length !== 2 ||
        constraint.value.some((value) => typeof value !== "number") ||
        constraint.value[0] > constraint.value[1]
      ) {
        add("operator-value", `${location}/value`, "between requires two ordered numbers");
      }
    } else if (["in", "not_in"].includes(constraint.operator)) {
      if (!Array.isArray(constraint.value)) {
        add("operator-value", `${location}/value`, `${constraint.operator} requires an array`);
      }
    } else if (["equals", "not_equals"].includes(constraint.operator)) {
      if (Array.isArray(constraint.value)) {
        add("operator-value", `${location}/value`, `${constraint.operator} requires a scalar`);
      }
    } else if (constraint.operator === "exists") {
      if (constraint.value !== null) {
        add("operator-value", `${location}/value`, "exists requires a null value");
      }
    } else if (numericOperators.has(constraint.operator) && typeof constraint.value !== "number") {
      add("operator-value", `${location}/value`, `${constraint.operator} requires a number`);
    }

    if (field.allowedValues.length > 0 && constraint.operator !== "exists") {
      const allowed = new Set(field.allowedValues.map((value) => value.id));
      for (const value of scalarValues(constraint.value)) {
        if (typeof value === "string" && !allowed.has(value)) {
          add(
            "unknown-taxonomy-value",
            `${location}/value`,
            `${value} is not allowed for ${constraint.field}`,
          );
        }
      }
    }

    if (constraint.operator !== "exists") {
      const values = scalarValues(constraint.value);
      const expectedType = field.valueType === "date" ? "string" : field.valueType;
      for (const value of values) {
        if (typeof value !== expectedType) {
          add(
            "value-type",
            `${location}/value`,
            `${constraint.field} requires ${field.valueType} values`,
          );
        }
      }
    }
  };

  specs.forEach((spec, specIndex) => {
    const specLocation = `/specs/${specPaths[specIndex]}`;
    const evidenceById = new Map();
    for (const [index, evidence] of spec.evidence.entries()) {
      if (evidenceById.has(evidence.id)) {
        add("duplicate-evidence", `${specLocation}/evidence/${index}`, `Duplicate ${evidence.id}`);
      }
      evidenceById.set(evidence.id, evidence);

      if (evidence.authority === "first_party_published") {
        const hostname = new URL(evidence.url).hostname;
        const isOfficial = spec.scope.organization.officialDomains.some((domain) =>
          isSameOrSubdomain(hostname, domain),
        );
        if (!isOfficial) {
          add(
            "first-party-domain",
            `${specLocation}/evidence/${index}/url`,
            `${hostname} is not a declared official domain`,
          );
        }
      }
    }

    const checkEvidenceIds = (ids, location) => {
      for (const id of ids) {
        if (!evidenceById.has(id)) {
          add("dangling-evidence", location, `Unknown evidence ID ${id}`);
        }
      }
    };
    const hasAgencyConfirmedEvidence = (ids) =>
      ids.some((id) => evidenceById.get(id)?.authority === "agency_confirmed");
    const checkBlockingEvidence = (ids, location) => {
      if (spec.evaluationMode === "blocking" && !hasAgencyConfirmedEvidence(ids)) {
        add(
          "unsupported-blocking-assertion",
          location,
          "Every blocking assertion needs agency-confirmed evidence",
        );
      }
    };

    checkEvidenceIds(spec.scope.evidenceIds, `${specLocation}/scope/evidenceIds`);
    checkEvidenceIds(spec.rules.shots.count.evidenceIds, `${specLocation}/rules/shots/count/evidenceIds`);
    checkBlockingEvidence(spec.scope.evidenceIds, `${specLocation}/scope/evidenceIds`);
    checkBlockingEvidence(
      spec.rules.shots.count.evidenceIds,
      `${specLocation}/rules/shots/count/evidenceIds`,
    );
    if (spec.rules.shots.count.appliesWhen) {
      walkExpression(
        spec.rules.shots.count.appliesWhen,
        validateConstraint,
        `${specLocation}/rules/shots/count/appliesWhen`,
      );
    }

    const assertionIds = new Set();
    const registerAssertion = (rule, location) => {
      if (assertionIds.has(rule.id)) {
        add("duplicate-assertion", `${location}/id`, `Duplicate assertion ID ${rule.id}`);
      }
      assertionIds.add(rule.id);
      checkEvidenceIds(rule.evidenceIds, `${location}/evidenceIds`);
      checkBlockingEvidence(rule.evidenceIds, `${location}/evidenceIds`);
      if (rule.constraint) validateConstraint(rule.constraint, `${location}/constraint`);
      if (
        rule.modality === "prohibited" &&
        rule.constraint?.operator === "equals" &&
        rule.constraint.value === false
      ) {
        add(
          "inverted-prohibition",
          `${location}/constraint/value`,
          "A prohibited boolean predicate must describe the disallowed true state",
        );
      }
      if (rule.match) {
        walkExpression(rule.match, validateConstraint, `${location}/match`);
      }
      if (rule.appliesWhen) {
        walkExpression(rule.appliesWhen, validateConstraint, `${location}/appliesWhen`);
      }
    };

    const shotIds = new Set();
    let targetSlotMinimum = 0;
    spec.rules.shots.slots.forEach((slot, index) => {
      const location = `${specLocation}/rules/shots/slots/${index}`;
      registerAssertion(slot, location);
      if (shotIds.has(slot.id)) add("duplicate-shot", `${location}/id`, `Duplicate ${slot.id}`);
      shotIds.add(slot.id);
      if (slot.quantity.minimum > slot.quantity.maximum) {
        add("quantity-bounds", `${location}/quantity`, "minimum exceeds maximum");
      }
      if (["required", "requested"].includes(slot.modality)) {
        targetSlotMinimum += slot.quantity.minimum;
      }

      let containsNonAutomaticConcept = false;
      walkExpression(
        slot.match,
        (constraint) => {
          const field = taxonomyByField.get(constraint.field);
          if (field && field.matchabilityDefault !== "automatic") {
            containsNonAutomaticConcept = true;
          }
        },
        location,
      );
      if (containsNonAutomaticConcept && slot.matchability === "automatic") {
        add(
          "overstated-matchability",
          `${location}/matchability`,
          "Slot cannot be automatic when one of its concepts is not automatic",
        );
      }
    });

    const count = spec.rules.shots.count;
    if (count.minimum !== null && count.maximum !== null && count.minimum > count.maximum) {
      add("count-bounds", `${specLocation}/rules/shots/count`, "minimum exceeds maximum");
    }
    if (count.maximum !== null && targetSlotMinimum > count.maximum) {
      add(
        "slot-count",
        `${specLocation}/rules/shots/slots`,
        "Required/requested slot minima exceed the published maximum",
      );
    }

    const unknownByKey = new Map();
    spec.unknowns.forEach((unknown, index) => {
      const key = `${unknown.fact}:${JSON.stringify(unknown.appliesWhen)}`;
      if (unknownByKey.has(key)) {
        add("duplicate-unknown", `${specLocation}/unknowns/${index}`, `Duplicate ${unknown.fact}`);
      }
      unknownByKey.set(key, unknown);
      if (!unknownFactIds.has(unknown.fact)) {
        add(
          "unknown-fact",
          `${specLocation}/unknowns/${index}/fact`,
          `Unknown fact ${unknown.fact}`,
        );
      }
      if (unknown.appliesWhen) {
        walkExpression(
          unknown.appliesWhen,
          validateConstraint,
          `${specLocation}/unknowns/${index}/appliesWhen`,
        );
      }
      checkEvidenceIds(unknown.evidenceIds, `${specLocation}/unknowns/${index}/evidenceIds`);
    });
    const nullableFacts = [
      ["shots.count.minimum", count.minimum],
      ["shots.count.maximum", count.maximum],
      [
        "shots.image_reuse",
        spec.rules.shots.allowImageReuseAcrossSlots,
      ],
    ];
    for (const [fact, value] of nullableFacts) {
      const unknown = unknownByKey.get(`${fact}:null`);
      if (value === null && !unknown) {
        add("missing-unknown", `${specLocation}/${fact}`, "Null fact needs an explicit unknown");
      }
      if (value !== null && unknown && unknown.reason !== "conflicting") {
        add("unknown-conflict", `${specLocation}/${fact}`, "Known fact also declared unknown");
      }
    }

    spec.rules.setWide.forEach((rule, index) => {
      const location = `${specLocation}/rules/setWide/${index}`;
      registerAssertion(rule, location);
      if (rule.appliesTo.mode === "all_shots" && rule.appliesTo.shotIds.length > 0) {
        add("shot-reference", `${location}/appliesTo`, "all_shots must have no shot IDs");
      }
      if (rule.appliesTo.mode === "selected_shots" && rule.appliesTo.shotIds.length === 0) {
        add("shot-reference", `${location}/appliesTo`, "selected_shots needs at least one ID");
      }
      for (const shotId of rule.appliesTo.shotIds) {
        if (!shotIds.has(shotId)) {
          add("shot-reference", `${location}/appliesTo/shotIds`, `Unknown shot ${shotId}`);
        }
      }
    });

    spec.rules.files.forEach((rule, index) => {
      const location = `${specLocation}/rules/files/${index}`;
      registerAssertion(rule, location);
      if (rule.constraint.field === "file.size_bytes" && rule.sourceValue) {
        const { value, unit, normalization } = rule.sourceValue;
        let expected;
        const decimalMultiplier = { KB: 1_000, MB: 1_000_000 }[unit];
        const binaryMultiplier = { KB: 1024, MB: 1024 * 1024 }[unit];
        if (normalization === "decimal_conservative" && decimalMultiplier) {
          expected = value * decimalMultiplier;
        }
        if (normalization === "binary_explicit" && binaryMultiplier) {
          expected = value * binaryMultiplier;
        }
        if (normalization === "identity" && unit === "byte") expected = value;
        if (expected === undefined || rule.constraint.value !== expected) {
          add(
            "file-normalization",
            `${location}/sourceValue`,
            "Source value does not deterministically match normalized bytes",
          );
        }
      }
    });
    spec.rules.eligibility.forEach((rule, index) =>
      registerAssertion(rule, `${specLocation}/rules/eligibility/${index}`),
    );
    spec.rules.applicationFields.forEach((field, index) => {
      const location = `${specLocation}/rules/applicationFields/${index}`;
      if (assertionIds.has(field.id)) {
        add("duplicate-assertion", `${location}/id`, `Duplicate assertion ID ${field.id}`);
      }
      assertionIds.add(field.id);
      if (!taxonomyByField.has(field.field)) {
        add("unknown-taxonomy-field", `${location}/field`, `Unknown field ${field.field}`);
      }
      checkEvidenceIds(field.evidenceIds, `${location}/evidenceIds`);
      checkBlockingEvidence(field.evidenceIds, `${location}/evidenceIds`);
      if (field.appliesWhen) {
        walkExpression(field.appliesWhen, validateConstraint, `${location}/appliesWhen`);
      }
      if (field.presence === "optional" && field.basis === "editorial_normalization") {
        add(
          "optional-overclaim",
          `${location}/presence`,
          "Optional presence requires explicit source evidence",
        );
      }
    });

    const assertionsForUnknownFact = (fact) => {
      if (fact === "shots.count.minimum" && count.minimum !== null) {
        return [{
          appliesWhen: count.appliesWhen || null,
          location: `${specLocation}/rules/shots/count`,
        }];
      }
      if (fact === "shots.count.maximum" && count.maximum !== null) {
        return [{
          appliesWhen: count.appliesWhen || null,
          location: `${specLocation}/rules/shots/count`,
        }];
      }
      if (fact === "shots.types") {
        return spec.rules.shots.slots.map((slot, index) => ({
          appliesWhen: slot.appliesWhen,
          location: `${specLocation}/rules/shots/slots/${index}`,
        }));
      }

      const presentationFields = {
        "presentation.clothing": (field) => field.startsWith("clothing."),
        "presentation.hair": (field) => field.startsWith("appearance.hair_"),
        "presentation.makeup": (field) => field === "appearance.makeup_level",
        "presentation.accessories": (field) => field === "appearance.accessory_type",
        "presentation.expression": (field) => field.startsWith("expression."),
        "presentation.background": (field) => field === "capture.background",
        "presentation.lighting": (field) => field === "capture.lighting",
        "presentation.color_mode": (field) => field === "capture.color_mode",
        "presentation.filters": (field) => field === "alteration.filter_used",
        "presentation.effects": (field) => field === "alteration.effects_used",
        "presentation.retouching": (field) => field === "alteration.retouch_used",
      };
      if (presentationFields[fact]) {
        return spec.rules.setWide.flatMap((rule, index) =>
          presentationFields[fact](rule.constraint.field)
            ? [{
                appliesWhen: rule.appliesWhen,
                location: `${specLocation}/rules/setWide/${index}`,
              }]
            : [],
        );
      }

      const fileFields = {
        "files.per_file_size": (rule) =>
          rule.scope === "per_file" && rule.constraint.field === "file.size_bytes",
        "files.total_size": (rule) =>
          rule.scope === "total_set" && rule.constraint.field === "file.size_bytes",
        "files.mime_types": (rule) => rule.constraint.field === "file.mime_type",
      };
      if (fileFields[fact]) {
        return spec.rules.files.flatMap((rule, index) =>
          fileFields[fact](rule)
            ? [{
                appliesWhen: rule.appliesWhen,
                location: `${specLocation}/rules/files/${index}`,
              }]
            : [],
        );
      }

      const eligibilityFields = {
        "eligibility.age": "applicant.age_years",
        "eligibility.height": "applicant.height_cm",
      };
      if (eligibilityFields[fact]) {
        return spec.rules.eligibility.flatMap((rule, index) =>
          rule.constraint.field === eligibilityFields[fact]
            ? [{
                appliesWhen: rule.appliesWhen,
                location: `${specLocation}/rules/eligibility/${index}`,
              }]
            : [],
        );
      }

      return [];
    };

    spec.unknowns.forEach((unknown) => {
      if (unknown.reason !== "source_access_limited") return;
      if (
        unknown.appliesWhen &&
        !expressionReferencesField(unknown.appliesWhen, "applicant.age_years")
      ) {
        return;
      }

      const unknownInterval = numericIntervalForField(
        unknown.appliesWhen,
        "applicant.age_years",
      );
      if (!unknownInterval) return;

      for (const assertion of assertionsForUnknownFact(unknown.fact)) {
        const assertionInterval = numericIntervalForField(
          assertion.appliesWhen,
          "applicant.age_years",
        );
        if (
          assertionInterval &&
          numericIntervalsOverlap(assertionInterval, unknownInterval)
        ) {
          add(
            "source-access-overlap",
            assertion.location,
            `Known assertion overlaps source-access-limited ${unknown.fact} scope`,
          );
        }
      }
    });

    if (spec.evaluationMode === "blocking") {
      const hasAgencyConfirmation = spec.evidence.some(
        (evidence) => evidence.authority === "agency_confirmed",
      );
      if (
        spec.status !== "verified" ||
        spec.review.authority !== "agency_confirmed" ||
        spec.review.method !== "agency_confirmation" ||
        !hasAgencyConfirmation
      ) {
        add(
          "unsupported-blocking-mode",
          `${specLocation}/evaluationMode`,
          "Blocking requires verified, agency-confirmed evidence and review",
        );
      }
    }

    const observedOn = Date.parse(spec.lifecycle.observedOn);
    const reviewedOn = spec.lifecycle.reviewedOn && Date.parse(spec.lifecycle.reviewedOn);
    const nextReviewOn = spec.lifecycle.nextReviewOn && Date.parse(spec.lifecycle.nextReviewOn);
    if (reviewedOn && reviewedOn < observedOn) {
      add("date-order", `${specLocation}/lifecycle/reviewedOn`, "Review predates observation");
    }
    if (nextReviewOn && reviewedOn && nextReviewOn <= reviewedOn) {
      add("date-order", `${specLocation}/lifecycle/nextReviewOn`, "Next review is not later");
    }
    if (spec.lifecycle.effectiveFrom && spec.lifecycle.effectiveUntil) {
      if (Date.parse(spec.lifecycle.effectiveUntil) <= Date.parse(spec.lifecycle.effectiveFrom)) {
        add("date-order", `${specLocation}/lifecycle`, "Effective interval is not increasing");
      }
    }
    if (spec.status === "verified") {
      if (
        !reviewedOn ||
        !["dual_reviewer", "agency_confirmation"].includes(spec.review.method) ||
        (spec.review.method === "dual_reviewer" && spec.review.reviewers.length < 2) ||
        (spec.review.method === "agency_confirmation" && spec.review.reviewers.length < 1)
      ) {
        add(
          "unreviewed-verified",
          `${specLocation}/review`,
          "Verified revision needs independent or agency review",
        );
      }
      if (!nextReviewOn) {
        add(
          "missing-review-deadline",
          `${specLocation}/lifecycle/nextReviewOn`,
          "Verified revision needs a freshness review deadline",
        );
      }
    }
    if (spec.review.method === "dual_reviewer" && spec.review.reviewers.length < 2) {
      add("review-method", `${specLocation}/review/reviewers`, "Dual review needs two reviewers");
    }
    if (
      spec.review.method === "agency_confirmation" &&
      (spec.review.authority !== "agency_confirmed" ||
        !spec.evidence.some((evidence) => evidence.authority === "agency_confirmed"))
    ) {
      add(
        "agency-confirmation-review",
        `${specLocation}/review`,
        "Agency-confirmation review needs agency-confirmed authority and evidence",
      );
    }
    const reviewerIds = new Set();
    for (const [index, reviewer] of spec.review.reviewers.entries()) {
      if (reviewerIds.has(reviewer.id)) {
        add(
          "duplicate-reviewer",
          `${specLocation}/review/reviewers/${index}/id`,
          `Duplicate reviewer ${reviewer.id}`,
        );
      }
      reviewerIds.add(reviewer.id);
      const reviewerTime = Date.parse(reviewer.reviewedOn);
      if (reviewerTime < observedOn || (reviewedOn && reviewerTime > reviewedOn)) {
        add(
          "date-order",
          `${specLocation}/review/reviewers/${index}/reviewedOn`,
          "Reviewer date is outside the observation/review interval",
        );
      }
    }
    for (const [index, evidence] of spec.evidence.entries()) {
      if (Date.parse(evidence.retrievedOn) > observedOn) {
        add(
          "evidence-date-order",
          `${specLocation}/evidence/${index}/retrievedOn`,
          "Evidence retrieval is later than the revision observation date",
        );
      }
    }
    const asOfDay = Date.parse(new Date(asOf).toISOString().slice(0, 10));
    if (spec.status === "verified" && nextReviewOn && asOfDay > nextReviewOn) {
      add(
        "stale-status",
        `${specLocation}/status`,
        `Verified revision passed its review deadline ${spec.lifecycle.nextReviewOn}`,
      );
    }
  });

  return errors;
}

function validateRegistry(options = {}) {
  const registryRoot = options.registryRoot || DEFAULT_REGISTRY_ROOT;
  const { schemas, validators } = createSchemaValidators(registryRoot);
  const manifest = readJson(path.join(registryRoot, "manifest.json"));
  const taxonomy = readJson(path.join(registryRoot, "taxonomy.json"));
  const specsRoot = path.join(registryRoot, "specs");
  const specPaths = fs
    .readdirSync(specsRoot)
    .filter((name) => name.endsWith(".json"))
    .sort();
  const specs = specPaths.map((name) => readJson(path.join(specsRoot, name)));

  const errors = [];
  if (!validators.manifest(manifest)) {
    errors.push(...formatSchemaErrors("/manifest", validators.manifest.errors));
  }
  if (!validators.taxonomy(taxonomy)) {
    errors.push(...formatSchemaErrors("/taxonomy", validators.taxonomy.errors));
  }
  specs.forEach((spec, index) => {
    if (!validators.spec(spec)) {
      errors.push(
        ...formatSchemaErrors(`/specs/${specPaths[index]}`, validators.spec.errors),
      );
    }
  });

  if (errors.length === 0) {
    errors.push(
      ...collectSemanticErrors({
        manifest,
        taxonomy,
        specs,
        specPaths,
        specSchema: schemas.spec,
        asOf: options.asOf || new Date(),
      }),
    );
  }

  if (errors.length > 0) throw new RegistryValidationError(errors);

  return {
    manifest,
    taxonomy,
    specs,
    specPaths,
    summary: {
      currentSeries: manifest.records.length,
      revisions: specs.length,
      taxonomyFields: taxonomy.fields.length,
      unknownFacts: taxonomy.unknownFacts.length,
    },
  };
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
