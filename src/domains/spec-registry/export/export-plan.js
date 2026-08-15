"use strict";

/**
 * What a spec-correct export should contain, derived from the published spec.
 *
 * Pure: no database, no Sharp, no filesystem. Everything here is a reading of
 * `rules.files` and of the shot assignments the matcher already produced, so
 * the encode pipeline in `spec-export-service.js` never has to re-interpret the
 * registry and the two cannot drift.
 *
 * The one thing this deliberately does not derive is a crop. There is no
 * dimension, aspect-ratio or orientation rule anywhere in the schema —
 * `data/spec-registry/v1/schemas/spec-revision.schema.json` has no such field,
 * and agencies publish file *size* limits, not dimensions. Cropping would mean
 * Pholio asserting a requirement the agency never published, which is the exact
 * failure the provenance guardrail exists to prevent. See
 * `docs/spec-correct-export-brief.md`.
 */

/** Encoders Sharp can produce that an agency intake is plausibly configured for. */
const ENCODABLE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/avif",
  "image/tiff",
]);

/**
 * The fallback when a spec publishes no mime rule at all, which is most of
 * them. JPEG is the only format every agency intake in the researched set
 * accepts, and it is what a phone produced in the first place.
 */
const DEFAULT_MIME_TYPE = "image/jpeg";

const EXTENSION_BY_MIME = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/avif": "avif",
  "image/tiff": "tiff",
};

/**
 * A floor for the per-file byte budget. Below roughly this, a downscale ladder
 * stops producing something a booker can assess, and shipping a deliberately
 * unusable file is worse than shipping one over a limit the talent can see.
 */
const MINIMUM_USEFUL_BYTES = 120 * 1024;

function slugify(value, fallback = "image") {
  const slug = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return slug || fallback;
}

function fileRules(spec) {
  const rules = spec?.rules?.files;
  return Array.isArray(rules) ? rules : [];
}

/**
 * The largest value a constraint permits, or null when it sets no ceiling.
 * `between` carries `[minimum, maximum]`; `lt` is exclusive, so one below.
 */
function upperBound(constraint) {
  if (!constraint) return null;
  const { operator, value } = constraint;
  if (operator === "lte" && typeof value === "number") return value;
  if (operator === "lt" && typeof value === "number") return value - 1;
  if (operator === "equals" && typeof value === "number") return value;
  if (operator === "between" && Array.isArray(value) && typeof value[1] === "number") {
    return value[1];
  }
  return null;
}

function smallest(values) {
  const numbers = values.filter((value) => typeof value === "number" && value > 0);
  return numbers.length ? Math.min(...numbers) : null;
}

/**
 * The delivery constraints this export has to satisfy, read once.
 *
 * `whole_package` and `total_set` both describe the set rather than one file;
 * the registry uses `whole_package` for counts and `total_set` for aggregate
 * size, so a count rule is honoured under either.
 */
function readConstraints(spec) {
  const rules = fileRules(spec);
  const perFile = [];
  const totalSet = [];
  const counts = [];
  let allowedMimeTypes = null;

  for (const rule of rules) {
    const constraint = rule?.constraint;
    if (!constraint) continue;

    if (constraint.field === "file.size_bytes") {
      const bound = upperBound(constraint);
      if (bound === null) continue;
      if (rule.scope === "total_set") totalSet.push(bound);
      else perFile.push(bound);
      continue;
    }

    if (constraint.field === "file.count") {
      const bound = upperBound(constraint);
      if (bound !== null) counts.push(bound);
      continue;
    }

    if (constraint.field === "file.mime_type") {
      const values =
        constraint.operator === "in"
          ? constraint.value
          : constraint.operator === "equals"
            ? [constraint.value]
            : null;
      if (!Array.isArray(values)) continue;
      const encodable = values
        .map((value) => String(value).toLowerCase())
        .filter((value) => ENCODABLE_MIME_TYPES.has(value));
      // Intersect, so two published mime rules narrow rather than replace.
      allowedMimeTypes = allowedMimeTypes
        ? allowedMimeTypes.filter((value) => encodable.includes(value))
        : encodable;
    }
  }

  return {
    perFileMaxBytes: smallest(perFile),
    totalSetMaxBytes: smallest(totalSet),
    maxFileCount: smallest(counts),
    allowedMimeTypes: allowedMimeTypes?.length ? allowedMimeTypes : null,
  };
}

/** The format to encode into: the agency's list if they published one, else JPEG. */
function targetMimeType(constraints) {
  const allowed = constraints.allowedMimeTypes;
  if (!allowed?.length) return DEFAULT_MIME_TYPE;
  return allowed.includes(DEFAULT_MIME_TYPE) ? DEFAULT_MIME_TYPE : allowed[0];
}

/**
 * The shot slots the matcher filled, in published order.
 *
 * `findingDto` flattens every category into one list, so the slots are the
 * `shots` entries; `assertionId` is the slot id and `assignments` carries the
 * image the matcher put in each instance of it.
 */
function assignedSlots(evaluation) {
  const findings = Array.isArray(evaluation?.findings) ? evaluation.findings : [];
  return findings
    .filter((finding) => finding.categoryKey === "shots")
    .map((finding) => ({
      slotId: finding.assertionId,
      label: finding.sourceLabel || finding.assertionId,
      assignments: (Array.isArray(finding.assignments) ? finding.assignments : [])
        .filter((assignment) => assignment?.imageId)
        .sort((left, right) => (left.instance || 0) - (right.instance || 0)),
    }));
}

/**
 * Which images go in the archive, and what each is called.
 *
 * Only images the matcher actually placed in a published slot are included.
 * Padding the archive with the rest of the book would put images in front of an
 * agency their spec never asked for, and would breach the count limits the same
 * spec publishes — the export claims to be spec-correct, so it has to be.
 */
function planEntries({ spec, evaluation, extension }) {
  const organizationId = slugify(
    spec?.scope?.organization?.id || spec?.scope?.organization?.name,
    "agency",
  );
  const slots = assignedSlots(evaluation);
  const entries = [];
  const seenImageIds = new Set();

  for (const slot of slots) {
    const multiple = slot.assignments.length > 1;
    slot.assignments.forEach((assignment, index) => {
      // A spec may allow one image to satisfy two slots. The archive is a flat
      // set of files, so the image ships once, under the first slot that
      // claimed it, rather than twice under two names.
      if (seenImageIds.has(assignment.imageId)) return;
      seenImageIds.add(assignment.imageId);
      const suffix = multiple ? `-${index + 1}` : "";
      entries.push({
        imageId: assignment.imageId,
        slotId: slot.slotId,
        slotLabel: slot.label,
        name: `${organizationId}-${slugify(slot.label, slot.slotId)}${suffix}.${extension}`,
      });
    });
  }

  return { entries, organizationId };
}

/**
 * @param {object} args
 * @param {object} args.spec       A published spec revision payload.
 * @param {object} args.evaluation The `evaluationDto` for this talent's package.
 */
function planExport({ spec, evaluation }) {
  const constraints = readConstraints(spec);
  const mimeType = targetMimeType(constraints);
  const extension = EXTENSION_BY_MIME[mimeType] || "jpg";
  const { entries, organizationId } = planEntries({ spec, evaluation, extension });

  // Over the published count, the set the talent can actually send is the first
  // N in published slot order. Dropping the overflow silently would be worse
  // than not exporting at all, so the omissions are returned to be surfaced.
  const limit = constraints.maxFileCount;
  const included = limit !== null ? entries.slice(0, limit) : entries;
  const omittedForCount = limit !== null ? entries.slice(limit) : [];

  // A total-set ceiling is shared across the files, so each file's real budget
  // is whichever of the two limits binds first.
  const perFileBudget = smallest([
    constraints.perFileMaxBytes,
    constraints.totalSetMaxBytes && included.length
      ? Math.floor(constraints.totalSetMaxBytes / included.length)
      : null,
  ]);

  return {
    organizationId,
    mimeType,
    extension,
    constraints,
    entries: included,
    omittedForCount,
    perFileBudgetBytes: perFileBudget,
    // Below this the ladder is destroying the image rather than fitting it.
    minimumUsefulBytes: MINIMUM_USEFUL_BYTES,
    archiveName: `${organizationId}-digitals.zip`,
  };
}

module.exports = {
  DEFAULT_MIME_TYPE,
  ENCODABLE_MIME_TYPES,
  EXTENSION_BY_MIME,
  MINIMUM_USEFUL_BYTES,
  planExport,
  readConstraints,
  slugify,
  targetMimeType,
  upperBound,
};
