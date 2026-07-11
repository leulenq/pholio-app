#!/usr/bin/env node
/**
 * Backfill `profiles.market` from `profiles.city` (WS3.5).
 *
 * Market derivation reuses the canonical city → industry-market map in
 * src/domains/talent/services/intel/market-resolve.js (the same vocabulary
 * already persisted in profile_events.market: 'new-york', 'los-angeles',
 * 'paris', ...). shared/lib/geolocation.js is IP-based only and cannot map a
 * free-text city, so the explicit alias map is the derivation source.
 * Unmatched cities are left NULL.
 *
 * Usage:
 *   node scripts/backfill-profile-market.js            # dry-run (default)
 *   node scripts/backfill-profile-market.js --execute  # apply
 *   node scripts/backfill-profile-market.js --execute --force
 *     (--force re-derives even where market is already set)
 */

require("dotenv").config();

const knex = require("../src/shared/db/knex");
const {
  marketFromGeo,
} = require("../src/domains/talent/services/intel/market-resolve");

function parseArgs(argv) {
  const opts = { execute: false, force: false };
  for (const arg of argv) {
    if (arg === "--execute") opts.execute = true;
    else if (arg === "--dry-run") opts.execute = false;
    else if (arg === "--force") opts.force = true;
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  const hasMarket = await knex.schema.hasColumn("profiles", "market");
  if (!hasMarket) {
    console.error(
      "[market backfill] profiles.market missing — run `npm run migrate` first.",
    );
    process.exitCode = 1;
    return;
  }

  let query = knex("profiles")
    .whereNotNull("city")
    .select("id", "city", "market");
  if (!opts.force) query = query.whereNull("market");
  const rows = await query;

  console.log(
    `[market backfill] ${rows.length} profile(s) to inspect (execute=${opts.execute}, force=${opts.force})`,
  );

  let matched = 0;
  let unmatched = 0;
  let updated = 0;

  for (const row of rows) {
    // City only — no country fallback here: a free-text city string carries
    // no ISO country, and marketFromGeo returns null for unknown cities.
    const market = marketFromGeo({ city: row.city });
    if (!market) {
      unmatched += 1;
      continue;
    }
    matched += 1;
    if (market === row.market) continue;

    if (!opts.execute) {
      console.log(`  • [dry-run] ${row.id}: "${row.city}" → ${market}`);
      continue;
    }
    await knex("profiles").where({ id: row.id }).update({ market });
    updated += 1;
  }

  console.log(
    `[market backfill] done — matched=${matched} unmatched(left NULL)=${unmatched} updated=${updated}` +
      (opts.execute ? "" : " (dry-run; pass --execute to apply)"),
  );
}

main()
  .catch((err) => {
    console.error("[market backfill] fatal:", err);
    process.exitCode = 1;
  })
  .finally(() => knex.destroy());
