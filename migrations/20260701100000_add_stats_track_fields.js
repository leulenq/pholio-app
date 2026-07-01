"use strict";

/**
 * Wave 2B — Expand + Backfill (stats track).
 *
 * Additive only. Adds gender-independent stats columns to `profiles`:
 *   - `chest_cm`   : gender-independent chest circumference (audit P1-3). Backfilled
 *                    from the existing `bust_cm` (same physical circumference, just
 *                    a gendered label). `bust_cm` is NOT dropped this pass.
 *   - `suit_size`  : menswear/tailored sizing, split out from the existing
 *                    `dress_size`. New field — no reliable source to backfill from,
 *                    so it is left null. `dress_size` is NOT dropped this pass.
 *   - `stats_track`: drives which measurement set + sizing system a profile shows,
 *                    decoupled from `gender`. Seeded once from `gender` so existing
 *                    profiles keep their current measurement set; independently
 *                    editable henceforth. Values: womenswear | menswear | ungendered.
 *
 * @param {import("knex").Knex} knex
 */
exports.up = async function up(knex) {
  const hasChest = await knex.schema.hasColumn("profiles", "chest_cm");
  const hasSuit = await knex.schema.hasColumn("profiles", "suit_size");
  const hasTrack = await knex.schema.hasColumn("profiles", "stats_track");

  await knex.schema.alterTable("profiles", (table) => {
    if (!hasChest) table.integer("chest_cm").nullable();
    if (!hasSuit) table.string("suit_size", 10).nullable();
    if (!hasTrack) table.string("stats_track", 20).nullable();
  });

  // Backfill chest_cm from bust_cm (same circumference; gender-independent label).
  if (!hasChest) {
    await knex("profiles")
      .whereNotNull("bust_cm")
      .whereNull("chest_cm")
      .update({ chest_cm: knex.ref("bust_cm") });
  }

  // Seed stats_track from gender as a one-time default (independent thereafter).
  if (!hasTrack) {
    const genderToTrack = {
      female: "womenswear",
      woman: "womenswear",
      male: "menswear",
      man: "menswear",
    };
    const rows = await knex("profiles")
      .whereNotNull("gender")
      .select("id", "gender");
    for (const row of rows) {
      const key = String(row.gender || "").trim().toLowerCase();
      const track = genderToTrack[key] || "ungendered";
      await knex("profiles").where({ id: row.id }).update({ stats_track: track });
    }
  }
};

/**
 * @param {import("knex").Knex} knex
 */
exports.down = async function down(knex) {
  const hasChest = await knex.schema.hasColumn("profiles", "chest_cm");
  const hasSuit = await knex.schema.hasColumn("profiles", "suit_size");
  const hasTrack = await knex.schema.hasColumn("profiles", "stats_track");

  await knex.schema.alterTable("profiles", (table) => {
    if (hasChest) table.dropColumn("chest_cm");
    if (hasSuit) table.dropColumn("suit_size");
    if (hasTrack) table.dropColumn("stats_track");
  });
};
