#!/usr/bin/env node
/**
 * Backfill PITS classification for existing portfolio images.
 *
 * Usage:
 *   node scripts/backfill-image-classification.js
 *   node scripts/backfill-image-classification.js --profile-id=<uuid>
 *   node scripts/backfill-image-classification.js --limit=50
 *   node scripts/backfill-image-classification.js --force  # re-run even if tagged
 */

require("dotenv").config();

const knex = require("../src/shared/db/knex");
const {
  runImageClassification,
} = require("../src/domains/talent/services/run-image-classification");

function parseArgs(argv) {
  const opts = { limit: 100, force: false, profileId: null };
  for (const arg of argv) {
    if (arg === "--force") opts.force = true;
    else if (arg.startsWith("--limit=")) opts.limit = Number(arg.split("=")[1]) || 100;
    else if (arg.startsWith("--profile-id=")) opts.profileId = arg.split("=")[1];
  }
  return opts;
}

function needsClassification(row) {
  let meta = row.metadata;
  if (typeof meta === "string") {
    try {
      meta = JSON.parse(meta);
    } catch {
      meta = {};
    }
  }
  const cls = meta?.ai?.classification;
  const band = cls?.band;
  if (band === "pending") return true;
  // Recover from uploads where absolute_path was not persisted (Groq never ran).
  if (
    cls?.model === "heuristic-only" &&
    (band === "ask" || band === "suggest") &&
    !row.shot_type
  ) {
    return true;
  }
  return false;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  let q = knex("images")
    .select("id", "profile_id", "metadata", "shot_type", "path", "public_url", "storage_key", "absolute_path")
    .orderBy("created_at", "desc")
    .limit(opts.limit);

  if (opts.profileId) {
    q = q.where({ profile_id: opts.profileId });
  }

  const rows = await q;
  const targets = opts.force
    ? rows
    : rows.filter(needsClassification);

  console.log(
    `[PITS backfill] ${targets.length} image(s) to classify (limit ${opts.limit}, force=${opts.force})`,
  );

  let ok = 0;
  let fail = 0;
  for (const row of targets) {
    try {
      await runImageClassification(knex, row.id);
      ok += 1;
      console.log(`  ✓ ${row.id}`);
    } catch (err) {
      fail += 1;
      console.warn(`  ✗ ${row.id}: ${err.message}`);
    }
  }

  console.log(`[PITS backfill] done — ${ok} ok, ${fail} failed`);
  await knex.destroy();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
