"use strict";

/**
 * Turn the eight seeded real agencies into reference entries.
 *
 * `docs/talent-trust-loop-design-2026-08.md` §(a) M4, ruling R5.
 *
 * WHY: `seeds/seed.js` seeds Wilhelmina, IMG, Elite, Ford, DNA, The Society,
 * Next and Marilyn as `status='ACTIVE'` and wires five of them into
 * `spec_registry_agency_routes`. Deliverability is derived from exactly that
 * pair (`preflight-service.js` `deliverableSeriesIds()` requires an ACTIVE
 * `agencies` row reached through a route), so as seeded, Pholio tells a talent
 * it can deliver an application to IMG. It cannot. That is the single most
 * expensive false claim in the product, and it is a data problem, not a UI one.
 *
 * No new column: the reference UX is already fully built. Flipping status and
 * removing the mapping makes the existing machinery produce it — the plate
 * renders reference copy and an outbound CTA instead of an apply button.
 *
 * MATCHING KEY — deviation from the design text, recorded deliberately. The
 * design says "matched by slug". These rows have no slug: `seeds/seed.js`
 * inserts name/location/website/open_boards and leaves `agencies.slug` NULL,
 * and `slug` is a nullable unique column that only `scripts/seed-agency-demo`
 * ever fills in. Name is the only key these rows actually carry, and it is the
 * key the repo already uses to reach the same seeded rows
 * (`20260626120000_populate_apply_agency_content.js`). Matching on a column
 * that is NULL for every target would have made this migration a silent no-op.
 *
 * SAFETY: an agency that has members is a live Pholio account, whatever it is
 * called, and must never be demoted by a data migration. The conversion is
 * therefore scoped to ACTIVE, member-less rows carrying one of these names.
 * Everything is guarded and idempotent — a fresh database with no seed data
 * matches nothing and the migration succeeds silently.
 *
 * Transactional on purpose: this is plain UPDATE/DELETE against existing
 * tables. The `exports.config = { transaction: false }` escape hatch used by
 * the neighbouring migrations exists for SQLite *table rebuilds*, where knex's
 * `PRAGMA foreign_keys = OFF` is ignored inside a transaction and the copy
 * cascades rows away. No table is rebuilt here, so the safer default applies.
 *
 * @param {import("knex").Knex} knex
 */

/** The eight real agencies `seeds/seed.js` inserts, in seed order. */
const REFERENCE_AGENCY_NAMES = Object.freeze([
  "Wilhelmina Models",
  "IMG Models",
  "Elite Model Management",
  "Ford Models",
  "DNA Model Management",
  "The Society Management",
  "Next Management",
  "Marilyn Agency",
]);

/**
 * The five route mappings `seeds/seed.js:97-124` creates, by agency name.
 * `down()` re-inserts exactly these — no more, no less.
 */
const SEEDED_ROUTES = Object.freeze([
  ["Wilhelmina Models", "wilhelmina:selected-market-online"],
  ["IMG Models", "img-models-global:online"],
  ["Elite Model Management", "elite-model-management-global:online"],
  ["Ford Models", "ford-models:selected-city-online"],
  ["The Society Management", "the-society-management-nyc:online"],
]);

/** Agencies with any membership row are live accounts — never converted. */
async function convertibleAgencies(knex, fromStatus) {
  const rows = await knex("agencies")
    .whereIn("name", REFERENCE_AGENCY_NAMES)
    .andWhere({ status: fromStatus })
    .select("id", "name");

  if (!rows.length) return [];
  if (!(await knex.schema.hasTable("agency_memberships"))) return rows;

  const claimed = new Set(
    (
      await knex("agency_memberships")
        .whereIn(
          "agency_id",
          rows.map((row) => row.id),
        )
        .select("agency_id")
    ).map((row) => row.agency_id),
  );
  return rows.filter((row) => !claimed.has(row.id));
}

exports.up = async function up(knex) {
  if (!(await knex.schema.hasTable("agencies"))) return;

  const targets = await convertibleAgencies(knex, "ACTIVE");
  if (!targets.length) return;

  const ids = targets.map((row) => row.id);

  await knex("agencies")
    .whereIn("id", ids)
    .update({ status: "REFERENCE", updated_at: knex.fn.now() });

  // Removing the mapping is not redundant with the status flip: it keeps the
  // spec-registry map script's drift check clean, so a reference agency never
  // looks like a route that lost its agency.
  if (await knex.schema.hasTable("spec_registry_agency_routes")) {
    await knex("spec_registry_agency_routes").whereIn("agency_id", ids).del();
  }
};

exports.down = async function down(knex) {
  if (!(await knex.schema.hasTable("agencies"))) return;

  const restored = await convertibleAgencies(knex, "REFERENCE");
  if (!restored.length) return;

  await knex("agencies")
    .whereIn(
      "id",
      restored.map((row) => row.id),
    )
    .update({ status: "ACTIVE", updated_at: knex.fn.now() });

  if (!(await knex.schema.hasTable("spec_registry_agency_routes"))) return;

  const idByName = new Map(restored.map((row) => [row.name, row.id]));
  const availableSeries = new Set(
    (await knex("spec_registry_series").select("series_id")).map(
      (row) => row.series_id,
    ),
  );

  const rows = SEEDED_ROUTES.filter(
    ([name, seriesId]) => idByName.has(name) && availableSeries.has(seriesId),
  ).map(([name, seriesId]) => ({
    agency_id: idByName.get(name),
    series_id: seriesId,
    priority: 100,
    created_at: knex.fn.now(),
    updated_at: knex.fn.now(),
  }));
  if (!rows.length) return;

  // The table is keyed (agency_id, series_id); a partially-rolled-back database
  // may already hold some of these.
  const existing = new Set(
    (
      await knex("spec_registry_agency_routes")
        .whereIn(
          "agency_id",
          rows.map((row) => row.agency_id),
        )
        .select("agency_id", "series_id")
    ).map((row) => `${row.agency_id}::${row.series_id}`),
  );
  const fresh = rows.filter(
    (row) => !existing.has(`${row.agency_id}::${row.series_id}`),
  );
  if (fresh.length) await knex("spec_registry_agency_routes").insert(fresh);
};

exports.REFERENCE_AGENCY_NAMES = REFERENCE_AGENCY_NAMES;
exports.SEEDED_ROUTES = SEEDED_ROUTES;
