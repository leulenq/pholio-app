/**
 * NOT transactional, deliberately.
 *
 * SQLite has no DROP COLUMN, so knex rebuilds the table: create-copy-drop-
 * rename. It guards that with `PRAGMA foreign_keys = OFF`, which SQLite
 * silently ignores inside a transaction. Dropping a column from a table other
 * rows reference would then cascade and empty them — the exact regression
 * tests/migrations/event-casting-schema.test.js exists to catch, and which it
 * caught here.
 */
exports.config = { transaction: false };

/**
 * Drop the dormant `profiles.archetype` column.
 *
 * WHY: `archetype` was written by the legacy AI "archetype / vibe /
 * market-fit" analysis targeted for removal by
 * docs/pholio-product-plan-2026-08.md §A3 ("Remove"). Its named sources
 * (`src/routes/chat.js`, `src/routes/scout.js`) are already deleted.
 * Verified before this migration was written:
 *
 *   - Nothing in the codebase INSERTs or UPDATEs `profiles.archetype`.
 *   - 0 of 62 production `profiles` rows have a non-null value.
 *
 * Every former reader (agency inbox "recent applicants" response, Discover
 * constraint evaluation's booking-lane fallback, Discover NL query parsing,
 * the intent-parser "Look" facet's archetype mapping) was reading a column
 * that is permanently null. Those readers were removed in the same change
 * that introduced this migration.
 *
 * NOTE: `onboarding_signals.archetype_label` (and sibling
 * `archetype_*_pct` columns) is a SEPARATE, actively-written column on a
 * different table (see src/domains/onboarding/services/signal-collector.js)
 * that still feeds PDF comp-card composition via
 * `src/domains/pdf/routes/pdf.js`'s `loadArchetype()`. This migration does
 * not touch it.
 *
 * `archetype_embeddings` / `archetype_scores` tables are also left alone —
 * out of scope for this cleanup pass.
 *
 * @param {import('knex')} knex
 */
exports.up = async function up(knex) {
  const hasCol = await knex.schema.hasColumn('profiles', 'archetype');
  if (!hasCol) return;

  await knex.schema.alterTable('profiles', (table) => {
    table.dropColumn('archetype');
  });
  console.log('[Migration] Dropped profiles.archetype');
};

/**
 * Faithful restore of the column as originally defined in
 * migrations/20260316000002_add_archetype_to_profiles.js.
 *
 * @param {import('knex')} knex
 */
exports.down = async function down(knex) {
  const hasCol = await knex.schema.hasColumn('profiles', 'archetype');
  if (hasCol) return;

  await knex.schema.alterTable('profiles', (table) => {
    table.string('archetype', 50).nullable();
  });
  console.log('[Migration] Restored profiles.archetype');
};
