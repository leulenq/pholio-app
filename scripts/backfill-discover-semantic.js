#!/usr/bin/env node
/**
 * Backfill the Discover semantic corpus
 * (tasks/discover-semantic-2026-09.md §3.5).
 *
 * For every discoverable, consenting, adult profile:
 *   1. describe each agency-visible image that has no description yet
 *      (one vision call per image, rate-limited), then
 *   2. rebuild the profile's `discover_chunks` (one embedding call per
 *      changed chunk — `reindexProfile` only re-embeds what changed, so a
 *      resumed run costs almost nothing for profiles already done).
 *
 * Dry-run by default: it reports exactly what it would call and writes
 * nothing. Both feature flags must be on; without them the script refuses to
 * run rather than half-indexing the book.
 *
 * Usage:
 *   node scripts/backfill-discover-semantic.js                  # dry-run
 *   node scripts/backfill-discover-semantic.js --apply
 *   node scripts/backfill-discover-semantic.js --apply --limit 50
 *   node scripts/backfill-discover-semantic.js --apply --profile <uuid>
 *   node scripts/backfill-discover-semantic.js --apply --concurrency 2
 */

require("dotenv").config();

const knex = require("../src/shared/db/knex");
const {
  describeAndStore,
} = require("../src/domains/ai/describe-photo");
const { reindexProfile } = require("../src/domains/ai/discover-index");
const {
  hasRecordedDateOfBirth,
  isMinorProfile,
} = require("../src/shared/lib/talent-age");
const { AUDIENCE } = require("../src/shared/lib/audience-dto");
const {
  applyImageVisibility,
} = require("../src/shared/lib/profile-visibility");

// One vision call every 250 ms per worker. The provider is not the bottleneck
// we are protecting — a full backfill hammering it is.
const VISION_SLEEP_MS = 250;

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function parseArgs(argv) {
  const opts = {
    apply: false,
    limit: null,
    profileId: null,
    concurrency: 2,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const valueOf = (inline) =>
      inline !== undefined ? inline : argv[(i += 1)];
    const [flag, inline] = arg.includes("=")
      ? [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)]
      : [arg, undefined];
    if (flag === "--apply") opts.apply = true;
    else if (flag === "--dry-run") opts.apply = false;
    else if (flag === "--limit") opts.limit = Number(valueOf(inline)) || null;
    else if (flag === "--profile") opts.profileId = valueOf(inline) || null;
    else if (flag === "--concurrency") {
      opts.concurrency = Math.max(1, Number(valueOf(inline)) || 2);
    }
  }
  return opts;
}

function flagsEnabled(env = process.env) {
  return {
    embeddings: env.PHOLIO_ENABLE_PROFILE_EMBEDDINGS === "true",
    imageAnalysis: env.PHOLIO_ENABLE_IMAGE_ANALYSIS === "true",
  };
}

/** Discoverable, consenting, adult profiles — the same population Discover serves. */
async function loadEligibleProfiles(opts) {
  const query = knex("profiles")
    .where({ is_discoverable: true, embedding_processing_consent: true })
    .orderBy("updated_at", "asc")
    .select(
      "id",
      "slug",
      "date_of_birth",
      "guardian_consent_at",
      "ai_processing_consent",
      "embedding_processing_consent",
    );
  if (opts.profileId) query.where({ id: opts.profileId });
  if (opts.limit) query.limit(opts.limit);
  const rows = await query;
  return rows.filter(
    (row) => hasRecordedDateOfBirth(row) && !isMinorProfile(row),
  );
}

/** Agency-visible images for a profile that still have no description. */
async function loadImagesNeedingDescription(profileId) {
  const query = knex("images").where({ "images.profile_id": profileId });
  applyImageVisibility(query, AUDIENCE.AGENCY_DISCOVERY, { table: "images" });
  const images = await query
    .orderBy(["images.sort", "images.created_at"])
    .select("images.id");
  if (!images.length) return [];

  if (!(await knex.schema.hasTable("image_signals"))) {
    return images.map((image) => image.id);
  }
  const described = new Set(
    (
      await knex("image_signals")
        .whereIn(
          "image_id",
          images.map((image) => image.id),
        )
        .whereNotNull("description")
        .select("image_id")
    ).map((row) => row.image_id),
  );
  return images.filter((image) => !described.has(image.id)).map((i) => i.id);
}

async function processProfile(profile, opts, flags, totals) {
  const imageIds = await loadImagesNeedingDescription(profile.id);
  const canDescribe = flags.imageAnalysis && profile.ai_processing_consent;

  for (const imageId of imageIds) {
    if (!canDescribe) {
      totals.descriptionsSkipped += 1;
      continue;
    }
    if (!opts.apply) {
      totals.descriptionsPlanned += 1;
      continue;
    }
    try {
      const result = await describeAndStore(knex, imageId);
      if (result?.status === "described") totals.described += 1;
      else if (result?.status === "filtered") totals.descriptionsFiltered += 1;
      else totals.descriptionsSkipped += 1;
    } catch (err) {
      totals.failed += 1;
      console.warn(`  • describe failed ${imageId}:`, err?.message || err);
    }
    await sleep(VISION_SLEEP_MS);
  }

  if (!opts.apply) {
    totals.reindexPlanned += 1;
    return;
  }
  try {
    const result = await reindexProfile(knex, profile.id);
    if (result?.status === "purged") totals.purged += 1;
    else totals.reindexed += 1;
    totals.chunks += result?.chunks || 0;
    totals.embedded += result?.embedded || 0;
  } catch (err) {
    totals.failed += 1;
    console.warn(`  • reindex failed ${profile.id}:`, err?.message || err);
  }
}

/** Run `worker` over `items` with at most `concurrency` in flight. */
async function pooled(items, concurrency, worker) {
  let cursor = 0;
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      for (;;) {
        const index = cursor;
        cursor += 1;
        if (index >= items.length) return;
        await worker(items[index], index);
      }
    },
  );
  await Promise.all(runners);
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const flags = flagsEnabled();

  if (!flags.embeddings) {
    console.error(
      "[discover backfill] PHOLIO_ENABLE_PROFILE_EMBEDDINGS is not 'true' — refusing to run.",
    );
    process.exitCode = 1;
    return;
  }
  if (!flags.imageAnalysis) {
    console.error(
      "[discover backfill] PHOLIO_ENABLE_IMAGE_ANALYSIS is not 'true' — refusing to run.\n" +
        "  Photo descriptions are half of the corpus; indexing text alone here would\n" +
        "  silently produce a partial book. Turn both flags on, or index text through\n" +
        "  the hourly sweep instead.",
    );
    process.exitCode = 1;
    return;
  }
  if (!(await knex.schema.hasTable("discover_chunks"))) {
    console.error(
      "[discover backfill] discover_chunks table missing — run `npm run migrate` first.",
    );
    process.exitCode = 1;
    return;
  }

  const profiles = await loadEligibleProfiles(opts);
  console.log(
    `[discover backfill] ${profiles.length} eligible profile(s) ` +
      `(apply=${opts.apply}, concurrency=${opts.concurrency}` +
      `${opts.limit ? `, limit ${opts.limit}` : ""}` +
      `${opts.profileId ? `, profile ${opts.profileId}` : ""})`,
  );

  const totals = {
    profiles: profiles.length,
    described: 0,
    descriptionsPlanned: 0,
    descriptionsFiltered: 0,
    descriptionsSkipped: 0,
    reindexPlanned: 0,
    reindexed: 0,
    purged: 0,
    chunks: 0,
    embedded: 0,
    failed: 0,
  };

  await pooled(profiles, opts.concurrency, (profile) =>
    processProfile(profile, opts, flags, totals),
  );

  console.log("[discover backfill] done —", {
    profiles: totals.profiles,
    ...(opts.apply
      ? {
          described: totals.described,
          filtered: totals.descriptionsFiltered,
          skipped: totals.descriptionsSkipped,
          reindexed: totals.reindexed,
          purged: totals.purged,
          chunks: totals.chunks,
          embedded: totals.embedded,
          failed: totals.failed,
        }
      : {
          wouldDescribe: totals.descriptionsPlanned,
          wouldSkipDescription: totals.descriptionsSkipped,
          wouldReindex: totals.reindexPlanned,
        }),
  });
  if (!opts.apply) {
    console.log("[discover backfill] dry-run — pass --apply to write.");
  }
}

module.exports = {
  main,
  parseArgs,
  loadEligibleProfiles,
  loadImagesNeedingDescription,
};

if (require.main === module) {
  main()
    .catch((err) => {
      console.error("[discover backfill] fatal:", err);
      process.exitCode = 1;
    })
    .finally(() => knex.destroy());
}
