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
 * Input formats whose decode is a property of the deployed binary rather than
 * of Sharp's API.
 *
 * HEIC is the case that matters. Every recent iPhone shoots it by default, so
 * it arrives in talent libraries constantly, and almost no agency intake
 * accepts it — which makes it the single most likely format to *need* the
 * transcode this export performs. Whether it can be transcoded at all depends
 * on whether libvips was built against a libheif carrying an HEVC decoder, and
 * many prebuilt libvips binaries are not (the HEVC patent position is why).
 *
 * Naming it here is what turns "HEIC support" from an implicit hope into a
 * decision the plan states and the service reports on. A route is never failed
 * over one of these: the encode is attempted, and a runtime that cannot decode
 * it puts the file in `unavailable` with a reason the talent can act on.
 */
const RUNTIME_DEPENDENT_DECODE_MIME_TYPES = new Set(["image/heic", "image/heif"]);

/** ISO base-media brands that mean "HEVC-coded image" rather than AVIF. */
const HEIC_BRANDS = new Set([
  "heic",
  "heix",
  "heim",
  "heis",
  "hevc",
  "hevx",
  "hevm",
  "hevs",
]);
const AVIF_BRANDS = new Set(["avif", "avis"]);
/** Generic HEIF wrappers: the container says nothing about the codec inside. */
const HEIF_BRANDS = new Set(["mif1", "msf1", "miaf", "mia1"]);

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
  let publishedMimeTypes = null;

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
      const declared = values.map((value) => String(value).toLowerCase());
      const encodable = declared.filter((value) => ENCODABLE_MIME_TYPES.has(value));
      // Intersect, so two published mime rules narrow rather than replace.
      allowedMimeTypes = allowedMimeTypes
        ? allowedMimeTypes.filter((value) => encodable.includes(value))
        : encodable;
      // The unfiltered list answers a different question from `allowedMimeTypes`:
      // "would this agency have accepted the talent's original file?" — which is
      // what decides whether a transcode is a format change the spec demanded.
      // A format Sharp cannot write is still a format the agency accepts.
      publishedMimeTypes = publishedMimeTypes
        ? publishedMimeTypes.filter((value) => declared.includes(value))
        : declared;
    }
  }

  return {
    perFileMaxBytes: smallest(perFile),
    totalSetMaxBytes: smallest(totalSet),
    maxFileCount: smallest(counts),
    allowedMimeTypes: allowedMimeTypes?.length ? allowedMimeTypes : null,
    publishedMimeTypes: publishedMimeTypes?.length ? publishedMimeTypes : null,
  };
}

/** The format to encode into: the agency's list if they published one, else JPEG. */
function targetMimeType(constraints) {
  const allowed = constraints.allowedMimeTypes;
  if (!allowed?.length) return DEFAULT_MIME_TYPE;
  return allowed.includes(DEFAULT_MIME_TYPE) ? DEFAULT_MIME_TYPE : allowed[0];
}

/**
 * What format the bytes actually are.
 *
 * Read from the file's own header rather than from `delivery_mime_type`, which
 * is whatever the browser claimed at upload time — and Safari routinely claims
 * `image/jpeg` for a file it then hands over as HEIC. A transcode decision made
 * from a claim rather than from the bytes would be wrong on exactly the format
 * this decision exists for.
 *
 * @param {Buffer} buffer
 * @returns {string|null} A mime type, or null when the header is unrecognised.
 */
function sniffMimeType(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return "image/png";
  }
  if (
    buffer.subarray(0, 4).toString("latin1") === "RIFF" &&
    buffer.subarray(8, 12).toString("latin1") === "WEBP"
  ) {
    return "image/webp";
  }
  const tiff = buffer.subarray(0, 4);
  if (tiff.equals(Buffer.from([0x49, 0x49, 0x2a, 0x00]))) return "image/tiff";
  if (tiff.equals(Buffer.from([0x4d, 0x4d, 0x00, 0x2a]))) return "image/tiff";

  if (buffer.subarray(4, 8).toString("latin1") !== "ftyp") return null;

  // The major brand alone is not enough: an iPhone HEIC is routinely written
  // with a `mif1` major brand and `heic` only in the compatible-brands list.
  const boxSize = buffer.readUInt32BE(0);
  const end = Math.min(Number.isSafeInteger(boxSize) && boxSize > 16 ? boxSize : 16, buffer.length);
  const brands = [];
  for (let offset = 8; offset + 4 <= end; offset += 4) {
    // Bytes 12..16 are the minor version, not a brand.
    if (offset === 12) continue;
    brands.push(buffer.subarray(offset, offset + 4).toString("latin1").toLowerCase());
  }

  if (brands.some((brand) => HEIC_BRANDS.has(brand))) return "image/heic";
  if (brands.some((brand) => AVIF_BRANDS.has(brand))) return "image/avif";
  if (brands.some((brand) => HEIF_BRANDS.has(brand))) return "image/heif";
  return null;
}

/**
 * Whether this source has to change format, and why.
 *
 * The export re-encodes every image regardless — that is how the byte cap, the
 * EXIF-orientation bake and the metadata strip happen — so "transcode" here
 * means specifically that the *format* changes because the source's format is
 * not one this route accepts. Stating it explicitly is what keeps a HEIC
 * conversion an intended outcome of reading the spec rather than an accident of
 * the encoder always being pointed at JPEG.
 *
 * @param {object} args
 * @param {string|null} args.sourceMimeType From `sniffMimeType`.
 * @param {object} args.constraints         From `readConstraints`.
 * @param {string} args.targetMimeType      The format the archive will carry.
 * @returns {{
 *   sourceMimeType: string|null,
 *   targetMimeType: string,
 *   transcode: boolean,
 *   acceptedAsIs: boolean|null,
 *   decodeRisk: 'none'|'runtime_dependent',
 *   reason: string,
 * }}
 */
function transcodeDecision({ sourceMimeType, constraints, targetMimeType: target }) {
  const published = constraints?.publishedMimeTypes || null;
  const source = sourceMimeType || null;
  const decodeRisk = source && RUNTIME_DEPENDENT_DECODE_MIME_TYPES.has(source)
    ? "runtime_dependent"
    : "none";

  const base = { sourceMimeType: source, targetMimeType: target, decodeRisk };

  if (!source) {
    // An unreadable header is not a licence to pass the bytes through: the
    // export claims the archive is in an accepted format, so it encodes to one.
    return {
      ...base,
      transcode: true,
      acceptedAsIs: null,
      reason: "source_format_unrecognised",
    };
  }

  if (source === target) {
    return { ...base, transcode: false, acceptedAsIs: true, reason: "already_target_format" };
  }

  if (!published) {
    return {
      ...base,
      transcode: true,
      acceptedAsIs: null,
      reason: "route_publishes_no_format_rule",
    };
  }

  return published.includes(source)
    ? { ...base, transcode: true, acceptedAsIs: true, reason: "accepted_but_not_target_format" }
    : { ...base, transcode: true, acceptedAsIs: false, reason: "source_format_not_accepted" };
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
  RUNTIME_DEPENDENT_DECODE_MIME_TYPES,
  planExport,
  readConstraints,
  slugify,
  sniffMimeType,
  targetMimeType,
  transcodeDecision,
  upperBound,
};
