"use strict";

/**
 * The removal path.
 *
 * Guardrail 3 of `docs/spec-correct-export-brief.md`: agency names carried as
 * plain text are nominative fair use, and the protection that keeps it that way
 * is that an agency who asks to come off the registry comes off it, in one
 * step, without anyone having to negotiate.
 *
 * Delisting is a flag on the series rather than a delete. The editorial dataset
 * is hash-locked and published as one whole package — deleting a series would
 * mean republishing the package and would destroy the evidence trail behind
 * every application snapshot that already cites its revisions. A timestamp
 * stops it being served while leaving the record of what was published, and
 * when, intact. Re-listing is clearing the same column.
 *
 * @param {import("knex").Knex} knex
 */
exports.up = async function up(knex) {
  // Guarded so a partially-applied run can be re-run to completion.
  const [hasDelistedAt, hasDelistedReason] = await Promise.all([
    knex.schema.hasColumn("spec_registry_series", "delisted_at"),
    knex.schema.hasColumn("spec_registry_series", "delisted_reason"),
  ]);

  if (hasDelistedAt && hasDelistedReason) return;

  await knex.schema.alterTable("spec_registry_series", (table) => {
    if (!hasDelistedAt) table.timestamp("delisted_at").nullable();
    // Why it came off, in the agency's terms. Read by the operator running the
    // removal script, not by talent — a delisted route is simply absent.
    if (!hasDelistedReason) table.text("delisted_reason").nullable();
  });

  await knex.schema.alterTable("spec_registry_series", (table) => {
    table.index(["delisted_at"], "idx_sr_series_delisted");
  });
};

/** @param {import("knex").Knex} knex */
exports.down = async function down(knex) {
  await knex.schema.alterTable("spec_registry_series", (table) => {
    table.dropIndex(["delisted_at"], "idx_sr_series_delisted");
  });
  await knex.schema.alterTable("spec_registry_series", (table) => {
    table.dropColumn("delisted_at");
    table.dropColumn("delisted_reason");
  });
};
