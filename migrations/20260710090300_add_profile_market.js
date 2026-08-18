"use strict";

/**
 * Discover search — profiles.market (WS3.5).
 *
 * Canonical industry-market slug derived from `profiles.city` at write time
 * ('new-york', 'los-angeles', 'paris', ... — the same vocabulary as
 * `profile_events.market`, see talent/services/market-resolve.js). Nullable: profiles
 * whose city is not a recognised industry market stay NULL.
 *
 * Backfill: scripts/backfill-profile-market.js. Write-path hook lives on the
 * talent profile update route (city change re-derives market).
 *
 * @param {import("knex").Knex} knex
 */
exports.up = async function up(knex) {
  const hasMarket = await knex.schema.hasColumn("profiles", "market");
  if (!hasMarket) {
    await knex.schema.alterTable("profiles", (table) => {
      table.string("market", 32).nullable();
      table.index(["market"], "profiles_market_index");
    });
  }
};

/**
 * @param {import("knex").Knex} knex
 */
exports.down = async function down(knex) {
  const hasMarket = await knex.schema.hasColumn("profiles", "market");
  if (hasMarket) {
    await knex.schema.alterTable("profiles", (table) => {
      table.dropIndex(["market"], "profiles_market_index");
      table.dropColumn("market");
    });
  }
};
