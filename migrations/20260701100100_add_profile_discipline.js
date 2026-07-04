"use strict";

/**
 * Wave 2B — Expand + Backfill (discipline).
 *
 * Adds a first-class `profiles.discipline` (the track) above the derived model
 * `division`. Values: model | performer | creator (design section A).
 *
 * Backfill mirrors `client/src/shared/constants/profileDivision.js`:
 *   - performer : specialties / experience match talent-performance keywords
 *                 (actor, host, presenter, voice, dancer, performer, theatre, ...)
 *   - creator   : specialties clearly indicate influencer/creator/UGC work
 *   - model     : default (fashion/commercial/fit/showroom or ambiguous)
 *
 * @param {import("knex").Knex} knex
 */

const PERFORMER_KEYWORDS = [
  "actor",
  "actress",
  "host",
  "presenter",
  "voice",
  "dancer",
  "performer",
  "perform",
  "theater",
  "theatre",
  "on-camera",
  "on camera",
  "singer",
  "musician",
];

const CREATOR_KEYWORDS = [
  "influencer",
  "creator",
  "content",
  "ugc",
  "blogger",
  "vlogger",
  "streamer",
];

function coerceArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed;
    } catch {
      // fall through to comma parsing
    }
  }
  return trimmed.split(",").map((entry) => entry.trim()).filter(Boolean);
}

function toHaystack(values = []) {
  return values.map((v) => String(v || "").trim().toLowerCase()).filter(Boolean);
}

function includesAny(haystack, needles) {
  return haystack.some((v) => needles.some((needle) => v.includes(needle)));
}

function deriveDiscipline(profile) {
  const haystack = [
    ...toHaystack(coerceArray(profile.specialties)),
    ...toHaystack(coerceArray(profile.specializations)),
    ...toHaystack(coerceArray(profile.modeling_categories)),
    String(profile.experience_level || "").trim().toLowerCase(),
  ].filter(Boolean);

  if (includesAny(haystack, PERFORMER_KEYWORDS)) return "performer";
  if (includesAny(haystack, CREATOR_KEYWORDS)) return "creator";
  return "model";
}

exports.up = async function up(knex) {
  const hasDiscipline = await knex.schema.hasColumn("profiles", "discipline");
  if (!hasDiscipline) {
    await knex.schema.alterTable("profiles", (table) => {
      table.string("discipline", 20).notNullable().defaultTo("model");
    });

    const profileColumnSet = new Set(
      knex.client.config.client === "pg"
        ? await knex("information_schema.columns")
            .where({ table_name: "profiles", table_schema: "public" })
            .pluck("column_name")
        : (await knex.raw("PRAGMA table_info(profiles)")).map(
            (row) => row.name,
          ),
    );

    const selectColumns = [
      "id",
      "specialties",
      "specializations",
      "modeling_categories",
      "experience_level",
    ].filter((column) => profileColumnSet.has(column));

    const rows = selectColumns.length > 1
      ? await knex("profiles").select(selectColumns)
      : [];
    for (const row of rows) {
      const discipline = deriveDiscipline(row);
      if (discipline !== "model") {
        await knex("profiles").where({ id: row.id }).update({ discipline });
      }
    }
  }
};

exports.down = async function down(knex) {
  const hasDiscipline = await knex.schema.hasColumn("profiles", "discipline");
  if (hasDiscipline) {
    await knex.schema.alterTable("profiles", (table) => {
      table.dropColumn("discipline");
    });
  }
};
