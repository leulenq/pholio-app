const knex = require("../db/knex");
const {
  REFERENCE_LANGUAGES,
  LANGUAGE_ALIASES,
} = require("../data/reference-languages");

let cachedLookup = null;

function buildLookup(rows) {
  const byName = new Map();
  for (const row of rows) {
    byName.set(row.name.toLowerCase(), row.name);
  }
  for (const [alias, canonical] of Object.entries(LANGUAGE_ALIASES)) {
    byName.set(alias.toLowerCase(), canonical);
  }
  return byName;
}

async function getLanguageLookup() {
  if (cachedLookup) return cachedLookup;

  const hasTable = await knex.schema.hasTable("reference_languages");
  if (!hasTable) {
    cachedLookup = buildLookup(REFERENCE_LANGUAGES);
    return cachedLookup;
  }

  const rows = await knex("reference_languages")
    .select("name")
    .orderBy("sort_order", "asc")
    .orderBy("name", "asc");

  cachedLookup = buildLookup(rows.length ? rows : REFERENCE_LANGUAGES);
  return cachedLookup;
}

function clearLanguageLookupCache() {
  cachedLookup = null;
}

/**
 * Map free-text / legacy language values to canonical reference names.
 * Unknown values are dropped.
 */
async function normalizeProfileLanguages(languages) {
  if (!languages) return [];
  const list = Array.isArray(languages) ? languages : [languages];
  if (!list.length) return [];

  const lookup = await getLanguageLookup();
  const seen = new Set();
  const normalized = [];

  for (const raw of list) {
    const trimmed = String(raw ?? "").trim();
    if (!trimmed) continue;
    const canonical = lookup.get(trimmed.toLowerCase());
    if (!canonical || seen.has(canonical)) continue;
    seen.add(canonical);
    normalized.push(canonical);
  }

  return normalized;
}

async function listReferenceLanguages() {
  const hasTable = await knex.schema.hasTable("reference_languages");
  if (!hasTable) {
    return [...REFERENCE_LANGUAGES].sort(
      (a, b) =>
        (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
        a.name.localeCompare(b.name),
    );
  }

  return knex("reference_languages")
    .select("code", "name", "sort_order")
    .orderBy("sort_order", "asc")
    .orderBy("name", "asc");
}

module.exports = {
  normalizeProfileLanguages,
  listReferenceLanguages,
  clearLanguageLookupCache,
  getLanguageLookup,
};
