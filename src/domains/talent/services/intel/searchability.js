/**
 * Searchability nudges (WS9.3 — the talent-side half of the Discover
 * searchability loop, tasks/discover-search-implementation-plan.md §WS9).
 *
 * Reads `discover_query_log.parsed_contract` (WS3.1 — one row per agency
 * Discover search) over a recent window, counts how many distinct logged
 * searches touched each hard-constraint field (`roles[].hard`), and
 * cross-references those counts against the viewing talent's own blank
 * fields to produce plain-prose nudges: "Agencies ran N searches this week
 * filtering by eye color — yours is blank."
 *
 * No new capture — this only mines the query log the search engine already
 * writes (WS3.1/WS6.5). Tolerant of a missing/empty table (pre-launch, or no
 * searches yet run): returns an empty list rather than throwing, per the
 * zero-state rule (render nothing, never a fabricated line).
 */

const knex = require("../../../../shared/db/knex");
const { daysAgo, whereSince } = require("./db-utils");
const { isKnownHardField } = require("../../../agency/services/discover/field-whitelist");

const DEFAULT_WINDOW_DAYS = 14;
const MAX_NUDGES = 3;

// Human-readable labels + where a fix lives, for the fields we can honestly
// judge as "blank" from a talent's own profile row. Fields without an entry
// here are counted for demand but never surfaced as a nudge (no safe/honest
// copy to render), and are also unmapped in FIELD_PROFILE_URL by extension.
const FIELD_LABELS = {
  eye_color: "eye color",
  hair_color: "hair color",
  shoe: "shoe size",
  visible_tattoos: "visible tattoos",
  availability: "availability",
};

const FIELD_PROFILE_URL = {
  eye_color: "/dashboard/talent/profile?tab=appearance",
  hair_color: "/dashboard/talent/profile?tab=appearance",
  shoe: "/dashboard/talent/profile?tab=appearance",
  visible_tattoos: "/dashboard/talent/profile?tab=appearance",
  availability: "/dashboard/talent/profile?tab=appearance#availability",
};

function parseContract(raw) {
  if (!raw) return null;
  if (typeof raw === "object") return raw;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Which hard fields are non-null anywhere in a parsed contract's roles. */
function fieldsTouchedByContract(contract) {
  const touched = new Set();
  const roles = Array.isArray(contract?.roles) ? contract.roles : [];
  for (const role of roles) {
    const hard = role?.hard;
    if (!hard || typeof hard !== "object") continue;
    for (const [field, value] of Object.entries(hard)) {
      if (value === null || value === undefined) continue;
      if (!isKnownHardField(field)) continue; // defensive: ignore stray/legacy keys
      touched.add(field);
    }
  }
  return touched;
}

/**
 * Count, over the last `days`, how many distinct logged searches touched
 * each hard field. Returns a Map<field, count>. Tolerant of a missing
 * table/rows — never throws.
 */
async function countFieldDemand(days = DEFAULT_WINDOW_DAYS) {
  const counts = new Map();
  const hasTable = await knex.schema.hasTable("discover_query_log");
  if (!hasTable) return counts;

  const since = daysAgo(days);
  const rows = await knex("discover_query_log")
    .modify((qb) => whereSince(qb, "created_at", since))
    .select("parsed_contract");

  for (const row of rows) {
    const contract = parseContract(row.parsed_contract);
    if (!contract) continue;
    for (const field of fieldsTouchedByContract(contract)) {
      counts.set(field, (counts.get(field) || 0) + 1);
    }
  }
  return counts;
}

/** The talent's own blank/unmanaged fields eligible for a nudge. */
async function blankFields(profile) {
  const blanks = new Set();
  if (!profile.eye_color) blanks.add("eye_color");
  if (!profile.hair_color) blanks.add("hair_color");
  if (!profile.shoe_size && profile.shoe_size !== 0) blanks.add("shoe");
  if (profile.tattoos === null || profile.tattoos === undefined) {
    blanks.add("visible_tattoos");
  }

  // Availability reads as "never managed" when it is still on the unset
  // default AND no bookout has ever been recorded — the column itself has no
  // separate "never touched" marker (NOT NULL default 'available').
  const bookoutCount = await knex("bookouts")
    .where({ profile_id: profile.id })
    .count({ c: "*" })
    .first();
  const hasBookouts = Number(bookoutCount?.c || 0) > 0;
  if ((profile.availability_status || "available") === "available" && !hasBookouts) {
    blanks.add("availability");
  }

  return blanks;
}

function demandPhrase(count, days) {
  const times = count === 1 ? "search" : "searches";
  const window = days <= 7 ? "this week" : `in the last ${days} days`;
  return `Agencies ran ${count} ${times} ${window} filtering by`;
}

/**
 * Build at most `MAX_NUDGES` talent-facing search-demand nudges, ranked by
 * demand count, each a plain-prose line + a link to the profile section to
 * fill in. Zero state (no query log, or nothing blank that's in demand) →
 * empty array, never a fabricated line.
 */
async function buildSearchDemandNudges(profile, { days = DEFAULT_WINDOW_DAYS } = {}) {
  if (!profile) return [];
  const counts = await countFieldDemand(days);
  if (counts.size === 0) return [];

  const blanks = await blankFields(profile);
  if (blanks.size === 0) return [];

  const nudges = [];
  for (const [field, count] of counts.entries()) {
    if (!blanks.has(field)) continue;
    const label = FIELD_LABELS[field];
    if (!label) continue; // no honest/safe copy for this field yet — skip rather than guess
    nudges.push({
      field,
      count,
      days,
      text: `${demandPhrase(count, days)} ${label} — yours is blank.`,
      to: FIELD_PROFILE_URL[field] || "/dashboard/talent/profile",
    });
  }

  return nudges.sort((a, b) => b.count - a.count).slice(0, MAX_NUDGES);
}

module.exports = {
  DEFAULT_WINDOW_DAYS,
  countFieldDemand,
  blankFields,
  fieldsTouchedByContract,
  buildSearchDemandNudges,
};
