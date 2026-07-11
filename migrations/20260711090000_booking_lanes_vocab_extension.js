"use strict";

/**
 * Discover WS9.4 — booking-lane vocabulary extension.
 *
 * Adds the `ecomm` lane ("E-comm") as a first-class booking lane. It was
 * previously folded into `commercial` via a normalization alias, but e-comm
 * is a real, distinct booking route agencies brief against (high-volume
 * studio/catalog day rates) — and the Discover boards enum derives from
 * BOOKING_LANE_SLUGS, so the lane must exist here for the whitelist to carry
 * it. fit / curve / petite / parts / athletic (as the existing `fitness`
 * lane) were already present.
 *
 * `profile_booking_lanes.lane_slug` is FK-constrained to `booking_lanes.slug`
 * (20260624195800), so the constant change alone is not enough — the row must
 * be seeded. This re-runs the same upsert loop as the original migration so
 * labels / descriptions / sort order resync from the constant (including the
 * updated `commercial` description that no longer claims e-commerce).
 *
 * Dual-dialect (PG + SQLite): plain knex inserts/updates only.
 *
 * @param {import("knex").Knex} knex
 */

const { BOOKING_LANES } = require("../src/shared/constants/booking-lanes");

exports.up = async function up(knex) {
  const hasBookingLanes = await knex.schema.hasTable("booking_lanes");
  if (!hasBookingLanes) return; // base migration hasn't run (fresh DBs get both in order)

  const laneRows = BOOKING_LANES.map((lane, index) => ({
    slug: lane.slug,
    label: lane.label,
    group: lane.group,
    description: lane.description,
    sort_order: index + 1,
    is_active: true,
  }));

  for (const row of laneRows) {
    const existing = await knex("booking_lanes").where({ slug: row.slug }).first();
    if (existing) {
      await knex("booking_lanes").where({ slug: row.slug }).update({
        label: row.label,
        group: row.group,
        description: row.description,
        sort_order: row.sort_order,
        is_active: row.is_active,
        updated_at: knex.fn.now(),
      });
    } else {
      await knex("booking_lanes").insert(row);
    }
  }
};

/**
 * @param {import("knex").Knex} knex
 */
exports.down = async function down(knex) {
  const hasBookingLanes = await knex.schema.hasTable("booking_lanes");
  if (!hasBookingLanes) return;
  // FK from profile_booking_lanes is ON DELETE CASCADE — talent selections of
  // the removed lane are dropped with it.
  await knex("booking_lanes").where({ slug: "ecomm" }).del();
};
