/**
 * Strip sensitive AI-vision fields from profiles.image_analysis.
 *
 * Compliance (Discover WS2 / council review LB-7.2): the legacy vision
 * pipeline persisted AI-estimated `skinTone` (and could have persisted
 * `measurementEstimates`) into profiles.image_analysis, and skin-tone text
 * was once embedded into the retired Discover ranking index. This backfill:
 *
 *   1. Removes skinTone / measurementEstimates keys from every
 *      profiles.image_analysis JSONB row that contains them.
 *
 * Usage:
 *   node scripts/strip-vision-sensitive-fields.js              # dry-run (default)
 *   node scripts/strip-vision-sensitive-fields.js --dry-run    # explicit dry-run
 *   node scripts/strip-vision-sensitive-fields.js --execute    # apply changes
 *
 * Works on Postgres and SQLite.
 */
"use strict";

const BATCH_SIZE = 10;
const DELAY_MS = 200;

const { SENSITIVE_VISION_KEYS } = require("../src/domains/ai/analyzeProfileImage");

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

/** True when the profile passes the same gate the Discover index backfill uses. */
async function stripVisionSensitiveFields(knex, { dryRun = true } = {}) {
  const hasColumn = await knex.schema.hasColumn("profiles", "image_analysis");
  if (!hasColumn) {
    console.log(
      "[strip-vision-sensitive-fields] profiles.image_analysis column not present — nothing to do.",
    );
    return { stripped: 0, clean: 0, failed: 0 };
  }

  const hasUpdatedAt = await knex.schema.hasColumn("profiles", "updated_at");

  const profiles = await knex("profiles")
    .whereNotNull("image_analysis")
    .select(
      "id",
      "first_name",
      "last_name",
      "image_analysis",
    );

  console.log(
    `[strip-vision-sensitive-fields] ${dryRun ? "DRY RUN — " : ""}Scanning ${profiles.length} profiles with image_analysis`,
  );

  let stripped = 0;
  let clean = 0;
  let failed = 0;

  const dirty = [];
  for (const profile of profiles) {
    const analysis = parseJsonObject(profile.image_analysis);
    if (!analysis || typeof analysis !== "object") {
      clean++;
      continue;
    }
    const foundKeys = SENSITIVE_VISION_KEYS.filter((key) =>
      Object.prototype.hasOwnProperty.call(analysis, key),
    );
    if (!foundKeys.length) {
      clean++;
      continue;
    }
    dirty.push({ profile, analysis, foundKeys });
  }

  console.log(
    `[strip-vision-sensitive-fields] ${dirty.length} profiles contain sensitive keys, ${clean} already clean`,
  );

  for (let i = 0; i < dirty.length; i += BATCH_SIZE) {
    const batch = dirty.slice(i, i + BATCH_SIZE);

    for (const { profile, analysis, foundKeys } of batch) {
      const name =
        `${profile.first_name || ""} ${profile.last_name || ""}`.trim() ||
        "(unnamed)";
      if (dryRun) {
        stripped++;
        console.log(
          `  dry-run ${profile.id} (${name}) — would strip [${foundKeys.join(", ")}]`,
        );
        continue;
      }

      try {
        for (const key of foundKeys) {
          delete analysis[key];
        }
        const update = { image_analysis: JSON.stringify(analysis) };
        if (hasUpdatedAt) update.updated_at = knex.fn.now();
        await knex("profiles").where({ id: profile.id }).update(update);
        stripped++;

        console.log(
          `  stripped ${profile.id} (${name}) [${foundKeys.join(", ")}]`,
        );
      } catch (err) {
        failed++;
        console.warn(`  failed ${profile.id}: ${err.message}`);
      }
    }

    if (i + BATCH_SIZE < dirty.length) {
      await sleep(DELAY_MS);
    }
  }

  console.log(
    `[strip-vision-sensitive-fields] Done — stripped: ${stripped}, already clean: ${clean}, failed: ${failed}${dryRun ? " (dry run — no writes performed)" : ""}`,
  );
  return { stripped, clean, failed };
}

if (require.main === module) {
  const execute = process.argv.includes("--execute");
  const dryRun = !execute;
  if (execute && process.argv.includes("--dry-run")) {
    console.error(
      "[strip-vision-sensitive-fields] Pass either --dry-run or --execute, not both.",
    );
    process.exit(1);
  }

  const knex = require("knex")(require("../knexfile.js"));

  stripVisionSensitiveFields(knex, { dryRun })
    .then(() => knex.destroy())
    .catch((e) => {
      console.error("STRIP ERROR:", e.message);
      knex.destroy();
      process.exit(1);
    });
}

module.exports = { stripVisionSensitiveFields };
