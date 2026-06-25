#!/usr/bin/env node
/**
 * Backfill PITS classification for existing portfolio images.
 *
 * Usage:
 *   node scripts/backfill-image-classification.js
 *   node scripts/backfill-image-classification.js --profile-id=<uuid>
 *   node scripts/backfill-image-classification.js --limit=50
 *   node scripts/backfill-image-classification.js --force  # re-run even if tagged
 *   node scripts/backfill-image-classification.js --all-pending  # any image without classified_at
 *   node scripts/backfill-image-classification.js --concurrency=5
 *   node scripts/backfill-image-classification.js --dry-run
 */

require("dotenv").config();

const knex = require("../src/shared/db/knex");
const {
  runImageClassification,
} = require("../src/domains/talent/services/run-image-classification");
const {
  enqueuePitsJob,
} = require("../src/domains/talent/services/pits-queue");

function parseArgs(argv) {
  const opts = {
    limit: 100,
    force: false,
    profileId: null,
    dryRun: false,
    concurrency: 3,
    allPending: false,
  };
  for (const arg of argv) {
    if (arg === "--force") opts.force = true;
    else if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--all-pending") opts.allPending = true;
    else if (arg.startsWith("--limit=")) opts.limit = Number(arg.split("=")[1]) || 100;
    else if (arg.startsWith("--concurrency=")) {
      const parsed = Number(arg.split("=")[1]);
      opts.concurrency = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 3;
    }
    else if (arg.startsWith("--profile-id=")) opts.profileId = arg.split("=")[1];
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

function needsClassification(row) {
  const meta = parseMetadata(row.metadata);
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

function missingClassifiedAt(row) {
  const meta = parseMetadata(row.metadata);
  return !meta?.ai?.classification?.classified_at;
}

async function runWithConcurrency(items, concurrency, worker) {
  if (items.length === 0) return;
  let index = 0;
  const workerCount = Math.max(1, Math.min(concurrency, items.length));
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      while (index < items.length) {
        const current = index;
        index += 1;
        await worker(items[current], current);
      }
    }),
  );
}

async function main() {
  try {
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
      : opts.allPending
        ? rows.filter(missingClassifiedAt)
        : rows.filter(needsClassification);

    console.log(
      `[PITS backfill] ${targets.length} image(s) selected (limit ${opts.limit}, force=${opts.force}, allPending=${opts.allPending}, dryRun=${opts.dryRun}, concurrency=${opts.concurrency})`,
    );

    if (opts.dryRun) {
      for (const row of targets) {
        console.log(`  • [dry-run] ${row.id} (profile ${row.profile_id})`);
      }
      console.log(`[PITS backfill] done — ${targets.length} planned, 0 executed`);
      return;
    }

    let ok = 0;
    let fail = 0;
    await runWithConcurrency(targets, opts.concurrency, async (row) => {
      try {
        await enqueuePitsJob(row.profile_id, () => runImageClassification(knex, row.id));
        ok += 1;
        console.log(`  ✓ ${row.id}`);
      } catch (err) {
        fail += 1;
        console.warn(`  ✗ ${row.id}: ${err.message}`);
      }
    });

    console.log(`[PITS backfill] done — ${ok} ok, ${fail} failed`);
  } finally {
    await knex.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
