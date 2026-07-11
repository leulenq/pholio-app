#!/usr/bin/env node
/**
 * Backfill `image_signals` rows for images that lack one (WS3.3).
 *
 * Strategy per image:
 *   1. If `images.metadata.ai.classification` already holds a stored
 *      classification (signals block from a past PITS run), replay it into
 *      `image_signals` directly — no model call, preserves classified_at.
 *   2. Otherwise re-run the full classification pipeline
 *      (runImageClassification), whose wired classifier now persists into
 *      `image_signals` itself. Requires image bytes + (possibly) Groq.
 *
 * Usage:
 *   node scripts/backfill-image-signals.js                  # dry-run (default)
 *   node scripts/backfill-image-signals.js --execute        # apply
 *   node scripts/backfill-image-signals.js --execute --limit=200
 *   node scripts/backfill-image-signals.js --execute --skip-reclassify
 *     (metadata replay only — never calls the vision pipeline)
 */

require("dotenv").config();

const knex = require("../src/shared/db/knex");
const {
  persistImageSignals,
} = require("../src/domains/ai/classify-portfolio-image");

function parseArgs(argv) {
  const opts = { execute: false, limit: 500, skipReclassify: false };
  for (const arg of argv) {
    if (arg === "--execute") opts.execute = true;
    else if (arg === "--dry-run") opts.execute = false;
    else if (arg === "--skip-reclassify") opts.skipReclassify = true;
    else if (arg.startsWith("--limit=")) {
      opts.limit = Number(arg.split("=")[1]) || 500;
    }
  }
  return opts;
}

function parseMetadata(raw) {
  if (!raw) return {};
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

/** Rebuild a classifier-shaped result from stored metadata provenance. */
function classificationFromMetadata(metadata) {
  const prov = metadata?.ai?.classification;
  if (!prov) return null;
  const hasAny =
    prov.shot_type?.value ||
    prov.style_type?.value ||
    prov.image_type?.value ||
    (prov.signals && Object.keys(prov.signals).length);
  if (!hasAny) return null;
  return {
    shot_type: prov.shot_type?.value ?? null,
    style_type: prov.style_type?.value ?? null,
    image_type: prov.image_type?.value ?? null,
    signals: prov.signals || {},
    model: prov.model || null,
    analyzed_at: prov.classified_at || null,
  };
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  const hasTable = await knex.schema.hasTable("image_signals");
  if (!hasTable) {
    console.error(
      "[image-signals backfill] image_signals table missing — run `npm run migrate` first.",
    );
    process.exitCode = 1;
    return;
  }

  const rows = await knex("images")
    .leftJoin("image_signals", "image_signals.image_id", "images.id")
    .whereNull("image_signals.id")
    .select(
      "images.id",
      "images.profile_id",
      "images.metadata",
      "images.shot_type",
    )
    .orderBy("images.created_at", "asc")
    .limit(opts.limit);

  console.log(
    `[image-signals backfill] ${rows.length} image(s) lacking a signals row ` +
      `(limit ${opts.limit}, execute=${opts.execute}, skipReclassify=${opts.skipReclassify})`,
  );

  let replayed = 0;
  let reclassified = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    const stored = classificationFromMetadata(parseMetadata(row.metadata));

    if (stored) {
      if (!opts.execute) {
        console.log(`  • [dry-run] replay metadata → ${row.id}`);
        replayed += 1;
        continue;
      }
      const ok = await persistImageSignals(knex, row.id, stored);
      if (ok) replayed += 1;
      else failed += 1;
      continue;
    }

    if (opts.skipReclassify) {
      console.log(`  • skip (no stored classification): ${row.id}`);
      skipped += 1;
      continue;
    }

    if (!opts.execute) {
      console.log(`  • [dry-run] re-run classifier → ${row.id}`);
      reclassified += 1;
      continue;
    }

    try {
      // Full pipeline; the wired classifier persists image_signals itself.
      const {
        runImageClassification,
      } = require("../src/domains/talent/services/run-image-classification");
      await runImageClassification(knex, row.id);
      const written = await knex("image_signals")
        .where({ image_id: row.id })
        .first("id");
      if (written) reclassified += 1;
      else failed += 1;
    } catch (err) {
      console.warn(`  • failed ${row.id}:`, err?.message || String(err));
      failed += 1;
    }
  }

  console.log(
    `[image-signals backfill] done — replayed=${replayed} reclassified=${reclassified} skipped=${skipped} failed=${failed}` +
      (opts.execute ? "" : " (dry-run; pass --execute to apply)"),
  );
}

main()
  .catch((err) => {
    console.error("[image-signals backfill] fatal:", err);
    process.exitCode = 1;
  })
  .finally(() => knex.destroy());
