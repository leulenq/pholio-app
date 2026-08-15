"use strict";

/**
 * The spec-correct export.
 *
 * When a talent cannot apply through Pholio, the most useful thing Pholio can
 * do is hand them a download that is already correct for that agency, so their
 * first upload on the agency's own site conforms. This builds that download:
 * the images the matcher placed in the agency's published shot slots, re-encoded
 * to the format and file-size limits that agency publishes, named after the
 * slots they satisfy, with the provenance travelling inside the archive.
 *
 * What it does not do is crop. See `export-plan.js` — the registry publishes no
 * dimension, aspect or orientation rule, so there is no crop target, and
 * inventing one would assert a requirement the agency never published.
 */

const { getSharp } = require("../../../shared/lib/lazy-sharp");
const { fetchImageBuffer } = require("../../../shared/lib/fetch-image-buffer");
const { buildMatcherInput } = require("../matcher-input");
const { getCurrentRevision } = require("../store");
const { evaluationDto, utcDate, SpecRegistryServiceError } = require("../preflight-service");
const { planExport } = require("./export-plan");
const { buildZip } = require("./zip");

/**
 * Longest-edge and quality pairs, tried in order until one lands under the
 * agency's published per-file limit. Scale comes down before quality goes far,
 * because a slightly smaller sharp image reads better to a booker than a
 * full-size image full of compression artefacts.
 */
const ENCODE_LADDER = [
  { maxEdge: 4000, quality: 92 },
  { maxEdge: 3000, quality: 88 },
  { maxEdge: 2400, quality: 82 },
  { maxEdge: 2000, quality: 78 },
  { maxEdge: 1600, quality: 72 },
  { maxEdge: 1200, quality: 66 },
];

function encoderFor(pipeline, mimeType, quality) {
  switch (mimeType) {
    case "image/png":
      // PNG is lossless, so `quality` only drives palette quantization; the
      // real lever for a size limit is the downscale in the ladder above.
      return pipeline.png({ compressionLevel: 9, palette: true, quality });
    case "image/webp":
      return pipeline.webp({ quality });
    case "image/avif":
      return pipeline.avif({ quality });
    case "image/tiff":
      return pipeline.tiff({ quality });
    case "image/jpeg":
    default:
      return pipeline.jpeg({ quality, mozjpeg: true, progressive: true });
  }
}

/**
 * Re-encode one image to the target format, under `budgetBytes` if there is one.
 *
 * `rotate()` with no argument bakes in EXIF orientation — without it a portrait
 * phone photo arrives at the agency on its side, since Sharp drops the metadata
 * that told viewers to turn it. Dropping the rest of that metadata is
 * deliberate: GPS coordinates and device serials have no business travelling to
 * an agency, and Sharp strips them unless asked not to.
 */
async function encodeImage(sharp, source, { mimeType, budgetBytes }) {
  let best = null;

  for (const step of ENCODE_LADDER) {
    const pipeline = sharp(source, { failOn: "none" })
      .rotate()
      .resize({
        width: step.maxEdge,
        height: step.maxEdge,
        fit: "inside",
        withoutEnlargement: true,
      });
    const { data, info } = await encoderFor(pipeline, mimeType, step.quality).toBuffer({
      resolveWithObject: true,
    });
    best = { data, width: info.width, height: info.height, quality: step.quality };
    if (!budgetBytes || data.length <= budgetBytes) return { ...best, withinBudget: true };
  }

  // Every rung was still over. Ship the smallest one and say so, rather than
  // silently dropping the shot out of a set the talent believes is complete.
  return { ...best, withinBudget: false };
}

function imageRowsById(rows) {
  return new Map(rows.map((row) => [String(row.id), row]));
}

/**
 * Build the archive for one published route.
 *
 * @param {import("knex")} db
 * @param {{ profileId: string, seriesId: string, imageIds?: string[]|null }} request
 *   `imageIds` names an explicit selection. `null` — the default — means every
 *   agency-eligible image in the book. An empty array is *not* the same thing:
 *   `buildMatcherInput` reads it as "the talent chose nothing", which is a
 *   legitimate answer for the preflight and a useless one for a download.
 * @param {{ referenceDate?: string, clock?: () => Date }} [options]
 */
async function buildSpecExport(db, { profileId, seriesId, imageIds = null }, options = {}) {
  const sharp = getSharp();
  if (!sharp) {
    throw new SpecRegistryServiceError(
      "SPEC_EXPORT_UNAVAILABLE",
      "Image processing is unavailable on this server. Try again shortly.",
      503,
    );
  }

  const referenceDate = options.referenceDate || utcDate(options.clock);
  const revision = await getCurrentRevision(db, seriesId);
  if (!revision) {
    throw new SpecRegistryServiceError(
      "SPEC_REGISTRY_ROUTE_NOT_FOUND",
      "Registry route not found",
      404,
    );
  }

  const input = await buildMatcherInput(db, {
    profileId,
    selectedImageIds: imageIds?.length ? imageIds : null,
  });
  if (input.selection.rejectedImageIds.length) {
    throw new SpecRegistryServiceError(
      "SELECTED_IMAGES_UNAVAILABLE",
      "One or more selected images are unavailable for agency submission",
      422,
      { rejectedCount: input.selection.rejectedImageIds.length },
    );
  }

  const evaluation = evaluationDto(revision, input, referenceDate);
  const plan = planExport({ spec: revision.payload, evaluation });

  if (!plan.entries.length) {
    throw new SpecRegistryServiceError(
      "SPEC_EXPORT_EMPTY",
      "None of your current images match a shot this agency publishes, so there is nothing to export yet.",
      422,
      { publishedSlots: evaluation.shotCoverage?.published ?? null },
    );
  }

  const rows = await db("images")
    .where("profile_id", profileId)
    .whereIn(
      "id",
      plan.entries.map((entry) => entry.imageId),
    )
    .select("*");
  const byId = imageRowsById(rows);

  const files = [];
  const manifestEntries = [];
  const unavailable = [];

  for (const entry of plan.entries) {
    const row = byId.get(String(entry.imageId));
    const source = row ? await fetchImageBuffer(row) : null;
    if (!source?.length) {
      // One unreadable original must not fail the whole download. The archive
      // ships without it and the manifest names what is missing.
      unavailable.push(entry);
      continue;
    }

    let encoded;
    try {
      encoded = await encodeImage(sharp, source, {
        mimeType: plan.mimeType,
        budgetBytes: plan.perFileBudgetBytes,
      });
    } catch (err) {
      // A source Sharp cannot decode — truncated upload, mislabelled format —
      // is the same problem as one we could not fetch, and gets the same
      // answer: the archive ships without it and the manifest names it. One
      // bad file must never cost the talent the whole download.
      console.error("[spec-export] image encode failed:", {
        imageId: entry.imageId,
        message: err?.message || String(err),
      });
      unavailable.push(entry);
      continue;
    }

    files.push({ name: entry.name, data: encoded.data });
    manifestEntries.push({
      name: entry.name,
      slotId: entry.slotId,
      slotLabel: entry.slotLabel,
      imageId: entry.imageId,
      bytes: encoded.data.length,
      width: encoded.width,
      height: encoded.height,
      withinPublishedLimit: encoded.withinBudget,
    });
  }

  if (!files.length) {
    throw new SpecRegistryServiceError(
      "SPEC_EXPORT_SOURCES_UNAVAILABLE",
      "Your images could not be read for export. Try again shortly.",
      503,
    );
  }

  const manifest = {
    agencyName: evaluation.agencyName,
    marketLabel: evaluation.marketLabel,
    seriesId: evaluation.seriesId,
    revisionId: evaluation.revisionId,
    sourceUrl: evaluation.sourceUrl,
    sourceCheckedOn: evaluation.sourceCheckedOn,
    referenceDate,
    mimeType: plan.mimeType,
    perFileLimitBytes: plan.constraints.perFileMaxBytes,
    totalSetLimitBytes: plan.constraints.totalSetMaxBytes,
    maxFileCount: plan.constraints.maxFileCount,
    entries: manifestEntries,
    omittedForCount: plan.omittedForCount,
    unavailable,
    stillMissing: (evaluation.findings || [])
      .filter((finding) => finding.requiresAttention)
      .map((finding) => finding.sourceLabel),
  };

  files.push({ name: "README.txt", data: Buffer.from(renderReadme(manifest), "utf8") });

  return {
    archiveName: plan.archiveName,
    buffer: buildZip(files, {
      // A fixed timestamp keeps the archive byte-identical for an unchanged
      // package, which is what makes "did my set actually change?" answerable.
      modifiedAt: new Date(`${referenceDate}T00:00:00.000Z`),
    }),
    manifest,
    plan,
    evaluation,
  };
}

function formatBytes(value) {
  if (!value) return null;
  return `${(value / 1_000_000).toFixed(1)}MB`;
}

/**
 * The provenance travels inside the archive.
 *
 * This folder leaves Pholio and lands in a downloads directory, possibly for
 * months. If a spec changes and a set is rejected, the only protection anyone
 * has — the talent and Pholio both — is that the file says which published
 * page it was built from, on what date, and that Pholio does not speak for the
 * agency.
 */
function renderReadme(manifest) {
  const lines = [
    `${manifest.agencyName} — digitals prepared to their published requirements`,
    "",
    "These files were resized, re-encoded and named to match the requirements",
    `${manifest.agencyName} publishes. Upload them on the agency's own site.`,
    "",
    "Files",
  ];

  for (const entry of manifest.entries) {
    const size = `${Math.round(entry.bytes / 1024)}KB`;
    const dimensions = `${entry.width}×${entry.height}`;
    const over = entry.withinPublishedLimit
      ? ""
      : "  (still above the published size limit — check before uploading)";
    lines.push(`  ${entry.name} — ${entry.slotLabel}, ${dimensions}, ${size}${over}`);
  }

  if (manifest.omittedForCount.length) {
    lines.push(
      "",
      `Not included — ${manifest.agencyName} accepts at most ${manifest.maxFileCount} files:`,
    );
    for (const entry of manifest.omittedForCount) {
      lines.push(`  ${entry.slotLabel}`);
    }
  }

  if (manifest.unavailable.length) {
    lines.push("", "Could not be read from your library at export time:");
    for (const entry of manifest.unavailable) {
      lines.push(`  ${entry.slotLabel}`);
    }
  }

  if (manifest.stillMissing.length) {
    lines.push("", "Still missing from your set, as published by the agency:");
    for (const label of manifest.stillMissing) lines.push(`  ${label}`);
  }

  const published = [
    manifest.perFileLimitBytes
      ? `at most ${formatBytes(manifest.perFileLimitBytes)} per file`
      : null,
    manifest.totalSetLimitBytes
      ? `at most ${formatBytes(manifest.totalSetLimitBytes)} in total`
      : null,
    manifest.maxFileCount ? `at most ${manifest.maxFileCount} files` : null,
  ].filter(Boolean);
  if (published.length) {
    lines.push("", `Published limits applied: ${published.join(", ")}.`);
  }

  lines.push(
    "",
    "No cropping was applied. The agency publishes file size limits, not image",
    "dimensions or aspect ratios, so Pholio has no crop target it could honestly",
    "apply — your framing is left exactly as you shot it.",
    "",
    "Source and provenance",
    `  Requirements as published by ${manifest.agencyName}${
      manifest.sourceCheckedOn ? `, checked ${manifest.sourceCheckedOn}` : ""
    }.`,
    manifest.sourceUrl ? `  ${manifest.sourceUrl}` : null,
    `  Prepared by Pholio on ${manifest.referenceDate}.`,
    `  Pholio is not affiliated with ${manifest.agencyName} and does not speak for them.`,
    "  Confirm the requirements on the agency's own page before you upload.",
    "",
  );

  return lines.filter((line) => line !== null).join("\n");
}

module.exports = {
  ENCODE_LADDER,
  buildSpecExport,
  encodeImage,
  renderReadme,
};
