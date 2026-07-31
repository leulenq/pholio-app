"use strict";

const { canonicalizeGender } = require("../src/shared/lib/gender");

/**
 * Data-only backfill — canonicalize `profiles.gender` spelling.
 *
 * The onboarding gender route wrote the tile value verbatim, so profiles landed
 * with "Non-Binary" (capital B) while the profile update schema only accepted
 * "Non-binary". Those talents got a 400 on their first dashboard save, because
 * the profile form echoes the stored gender back on every write. They were also
 * invisible to the two agency filters that compare gender exactly rather than
 * via LOWER() — agency/routes/inbox.js and agency/services/match-scoring.js.
 *
 * The writers are fixed (onboarding canonicalizes at the source, the zod schema
 * canonicalizes in preprocess); this pass repairs the rows already stored.
 *
 * No schema change. Rewrites values only where the canonical spelling differs,
 * one UPDATE per distinct variant rather than per row.
 *
 * @param {import("knex").Knex} knex
 */
exports.up = async function up(knex) {
  const hasGender = await knex.schema.hasColumn("profiles", "gender");
  if (!hasGender) return;

  const distinct = await knex("profiles")
    .whereNotNull("gender")
    .distinct("gender")
    .pluck("gender");

  for (const stored of distinct) {
    if (typeof stored !== "string" || stored.trim() === "") continue;
    const canonical = canonicalizeGender(stored);
    // Unrecognised values are returned untouched by canonicalizeGender — leave
    // them alone rather than guessing at a user's self-description.
    if (canonical === stored) continue;
    await knex("profiles").where({ gender: stored }).update({ gender: canonical });
  }
};

/**
 * Irreversible by design: the pre-canonical spelling carried no information the
 * canonical one lacks, so there is nothing to restore. Down is a no-op so a
 * rollback of this batch doesn't fail.
 *
 * @param {import("knex").Knex} _knex
 */
exports.down = async function down(_knex) {
  // no-op — see above.
};
