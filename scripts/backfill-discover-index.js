/**
 * Backfill multi-channel Discover index (dense + lexical).
 *
 * Usage:
 *   node scripts/backfill-discover-index.js
 *   node scripts/backfill-discover-index.js --dry-run
 *   node scripts/backfill-discover-index.js --channels visual,casting,market,lexical
 *
 * Requires OPENAI_API_KEY. Works on Postgres (pgvector) and SQLite (JSON cache + FTS5).
 */
"use strict";

const BATCH_SIZE = 10;
const DELAY_MS = 200;

const {
  buildVisualIndexText,
  buildCastingIndexText,
  buildMarketIndexText,
  buildLexicalDocument,
  buildDiscoverIndexText,
  upsertTextEmbedding,
  upsertLexicalDocument,
  upsertDiscoverIndexEmbedding,
  upsertImageEmbedding,
  buildImageSourceText,
} = require("../src/domains/ai/embeddings");

const ALL_CHANNELS = [
  "visual",
  "casting",
  "market",
  "lexical",
  "discover_index",
  "image",
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseJsonObject(v) {
  if (!v) return null;
  try {
    return typeof v === "string" ? JSON.parse(v) : v;
  } catch {
    return null;
  }
}

function parseChannels(argv) {
  const flag = argv.find((a) => a.startsWith("--channels"));
  if (!flag) return ALL_CHANNELS;
  const value = flag.includes("=")
    ? flag.split("=")[1]
    : argv[argv.indexOf(flag) + 1];
  if (!value) return ALL_CHANNELS;
  return value
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

async function backfillDiscoverIndex(
  knex,
  { dryRun = false, channels = ALL_CHANNELS } = {},
) {
  if (!process.env.OPENAI_API_KEY) {
    console.error(
      "[backfill-discover-index] OPENAI_API_KEY not set — aborting",
    );
    process.exit(1);
  }

  const channelSet = new Set(channels);

  const profiles = await knex("profiles")
    .where({
      is_discoverable: true,
      profile_status: "active",
    })
    .whereNotNull("bio_curated")
    .select("profiles.*");

  const signalRows = await knex("onboarding_signals").select(
    "profile_id",
    "ai_results",
  );
  const scoutByProfile = new Map();
  for (const row of signalRows) {
    const aiResults = parseJsonObject(row.ai_results);
    if (aiResults?.scout) {
      scoutByProfile.set(row.profile_id, aiResults.scout);
    }
  }

  let embedded = 0;
  let skipped = 0;
  let failed = 0;

  console.log(
    `[backfill-discover-index] ${dryRun ? "DRY RUN — " : ""}Processing ${profiles.length} profiles (channels: ${[...channelSet].join(", ")})`,
  );

  for (let i = 0; i < profiles.length; i += BATCH_SIZE) {
    const batch = profiles.slice(i, i + BATCH_SIZE);

    for (const profile of batch) {
      const scout = scoutByProfile.get(profile.id) || null;
      const extras = { scout };

      const texts = {
        visual: buildVisualIndexText(profile, extras),
        casting: buildCastingIndexText(profile),
        market: buildMarketIndexText(profile, extras),
        lexical: buildLexicalDocument(profile, extras),
        discover_index: buildDiscoverIndexText(profile, extras),
        image: buildImageSourceText(profile, scout),
      };

      const hasWork = [...channelSet].some((ch) => texts[ch]?.trim());
      if (!hasWork) {
        skipped++;
        continue;
      }

      if (dryRun) {
        embedded++;
        console.log(
          `  dry-run ${profile.id} (${profile.first_name} ${profile.last_name})`,
        );
        continue;
      }

      try {
        if (channelSet.has("visual") && texts.visual?.trim()) {
          await upsertTextEmbedding(knex, profile.id, "visual", texts.visual);
        }
        if (channelSet.has("casting") && texts.casting?.trim()) {
          await upsertTextEmbedding(knex, profile.id, "casting", texts.casting);
        }
        if (channelSet.has("market") && texts.market?.trim()) {
          await upsertTextEmbedding(knex, profile.id, "market", texts.market);
        }
        if (channelSet.has("discover_index") && texts.discover_index?.trim()) {
          await upsertDiscoverIndexEmbedding(knex, profile.id, profile, extras);
        }
        if (channelSet.has("lexical") && texts.lexical?.trim()) {
          await upsertLexicalDocument(knex, profile.id, profile, extras);
        }
        if (channelSet.has("image") && texts.image?.trim()) {
          await upsertImageEmbedding(knex, profile.id, texts.image);
        }

        embedded++;
        console.log(
          `  indexed ${profile.id} (${profile.first_name} ${profile.last_name})`,
        );
      } catch (err) {
        failed++;
        console.warn(`  failed ${profile.id}: ${err.message}`);
      }
    }

    if (i + BATCH_SIZE < profiles.length) {
      await sleep(DELAY_MS);
    }
  }

  console.log(
    `[backfill-discover-index] Done — indexed: ${embedded}, skipped: ${skipped}, failed: ${failed}`,
  );
  return { embedded, skipped, failed };
}

if (require.main === module) {
  const dryRun = process.argv.includes("--dry-run");
  const channels = parseChannels(process.argv);
  const knex = require("knex")(require("../knexfile.js"));

  backfillDiscoverIndex(knex, { dryRun, channels })
    .then(() => knex.destroy())
    .catch((e) => {
      console.error("BACKFILL ERROR:", e.message);
      knex.destroy();
      process.exit(1);
    });
}

module.exports = { backfillDiscoverIndex };
