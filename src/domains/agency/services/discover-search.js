/**
 * Agency Discover — the match-first engine (tasks/discover-audit-2026-09.md §3.2).
 *
 * Every eligible profile is evaluated against every requirement the booker
 * stated, and gets `pass` / `fail` / `unknown` per requirement. Exact matches
 * come first, the closest come next with a plain note per miss, and nobody is
 * hidden except a stated gender the brief excluded. Order is a function of the
 * booker's requirements and the talent's own declarations: no affinity score,
 * no photo-derived signal, no percentage, and no number in the API at all.
 */

"use strict";

const { parseIntentToFilters } = require("../lib/intent-parser");
const { parseBrief } = require("./discover/parse");
const { heritageSlugsFromText } = require("./discover/field-whitelist");
const {
  normalizeBookingLaneSlug,
} = require("../../../shared/constants/booking-lanes");
const { evaluateProfile } = require("./discover/constraint-eval");
const {
  buildFilters,
  roleSummary,
  buildFacts,
  buildResultNotes,
  buildResponseNotes,
} = require("./discover/present");
const {
  BOOKING_LANES,
  normalizeBookingLaneList,
} = require("../../../shared/constants/booking-lanes");
const { ageFilterDobCutoffs } = require("./discover-age");
const { invitedProfileIds } = require("./agency-invitations");
const {
  AUDIENCE,
  buildAgencyDiscoveryDTO,
  deriveRepresentationStatus,
  loadTalentRepresentationsForProfiles,
} = require("../../../shared/lib/audience-dto");
const {
  applyImageVisibility,
  isAgencyDiscoverable,
} = require("../../../shared/lib/profile-visibility");
const {
  ensureModerationColumnChecked,
} = require("../../../shared/lib/content-moderation");
const {
  loadSocialAccountsForProfiles,
} = require("../../../shared/lib/social-accounts");
const {
  getTalentUserIdsBlockingAgency,
} = require("../../../shared/lib/blocked-agencies");

function mergeFilters(queryParams, parsedFilters) {
  const merged = { ...parsedFilters };
  const keys = [
    "city",
    "gender",
    "experience_level",
    "min_height",
    "max_height",
    "min_age",
    "max_age",
    "eye_color",
    "hair_color",
    "letter",
    "search",
  ];

  for (const key of keys) {
    const value = queryParams[key];
    if (value === undefined || value === null || value === "") continue;

    if (["min_height", "max_height", "min_age", "max_age"].includes(key)) {
      const numeric = parseInt(value, 10);
      if (!Number.isNaN(numeric)) merged[key] = numeric;
    } else {
      merged[key] = value;
    }
  }

  return merged;
}

function extractExplicitFilters(queryParams) {
  return mergeFilters(queryParams, {});
}

function applyDiscoverFilters(query, filters) {
  if (filters.city) {
    query.whereILike("profiles.city", `%${filters.city}%`);
  }

  if (filters.letter) {
    query.whereILike("profiles.last_name", `${filters.letter}%`);
  }

  if (filters.search) {
    query.andWhere((builder) => {
      builder
        .whereILike("profiles.first_name", `%${filters.search}%`)
        .orWhereILike("profiles.last_name", `%${filters.search}%`);
    });
  }

  if (filters.min_height != null) {
    query.where("profiles.height_cm", ">=", filters.min_height);
  }
  if (filters.max_height != null) {
    query.where("profiles.height_cm", "<=", filters.max_height);
  }

  if (filters.min_age != null || filters.max_age != null) {
    const { maxDobExclusive, minDobInclusive } = ageFilterDobCutoffs(
      filters.min_age ?? null,
      filters.max_age ?? null,
    );
    if (maxDobExclusive) {
      query.where("profiles.date_of_birth", "<", maxDobExclusive);
    }
    if (minDobInclusive) {
      query.where("profiles.date_of_birth", ">=", minDobInclusive);
    }
  }

  if (filters.gender) {
    query.whereRaw("LOWER(profiles.gender) = ?", [
      String(filters.gender).toLowerCase(),
    ]);
  }

  // Stored values are title-case ("Brown", "New face"); the URL carries
  // whatever the filter bar sent. Compare both sides lowered (audit §2.4).
  if (filters.eye_color) {
    query.whereRaw("LOWER(profiles.eye_color) = ?", [
      String(filters.eye_color).toLowerCase(),
    ]);
  }
  if (filters.hair_color) {
    query.whereRaw("LOWER(profiles.hair_color) = ?", [
      String(filters.hair_color).toLowerCase(),
    ]);
  }
  if (filters.experience_level) {
    query.whereRaw("LOWER(profiles.experience_level) = ?", [
      String(filters.experience_level).toLowerCase(),
    ]);
  }

  return query;
}

function baseDiscoverQuery(knex) {
  return knex("profiles")
    .select("profiles.*")
    .where({
      "profiles.is_discoverable": true,
      "profiles.profile_status": "active",
    })
    .whereNotNull("profiles.bio_curated");
}

async function loadBookoutsByProfile(knex, profileIds) {
  const rowsByProfile = new Map();
  if (!profileIds.length) return rowsByProfile;

  try {
    if (!(await knex.schema.hasTable("bookouts"))) return rowsByProfile;
    const rows = await knex("bookouts")
      .whereIn("profile_id", profileIds)
      .select("profile_id", "starts_on", "ends_on");
    for (const row of rows) {
      if (!rowsByProfile.has(row.profile_id)) rowsByProfile.set(row.profile_id, []);
      rowsByProfile.get(row.profile_id).push(row);
    }
  } catch {
    // Availability is treated as unknown when historical support data is absent.
  }

  return rowsByProfile;
}

/**
 * `profile_booking_lanes` (migration 20260624195800) is the canonical board
 * store; Discover never joined it, so every talent who set lanes in the current
 * UI read as `unknown` for a board ask (audit §2.4). Tolerates a missing table
 * (pre-migration deploy window) by falling back to the legacy column.
 */
async function loadLanesByProfile(knex, profileIds) {
  const lanesByProfile = new Map();
  if (!profileIds.length) return lanesByProfile;

  try {
    if (!(await knex.schema.hasTable("profile_booking_lanes"))) {
      return lanesByProfile;
    }
    const rows = await knex("profile_booking_lanes")
      .whereIn("profile_id", profileIds)
      .orderBy([
        { column: "profile_id", order: "asc" },
        { column: "priority", order: "asc" },
      ])
      .select("profile_id", "lane_slug", "priority");
    for (const row of rows) {
      if (!lanesByProfile.has(row.profile_id)) {
        lanesByProfile.set(row.profile_id, []);
      }
      lanesByProfile.get(row.profile_id).push(row.lane_slug);
    }
  } catch {
    // Boards fall back to the legacy profile columns.
  }

  return lanesByProfile;
}

async function loadRepresentationStatusMap(knex, profiles) {
  const profileIds = profiles.map((profile) => profile.id);
  const representations = await loadTalentRepresentationsForProfiles(profileIds, {
    db: knex,
  });
  const statuses = new Map();

  for (const profile of profiles) {
    const { representation_status: status } = deriveRepresentationStatus(
      profile,
      representations.get(profile.id) || [],
    );
    statuses.set(profile.id, status);
  }

  return statuses;
}

/**
 * Which profiles this agency has already reached — used only to set
 * `dto.is_invited`, so Discover does not offer "invite" twice.
 *
 * Since `20260820100000_create_agency_invitations.js` an invitation is its own
 * record rather than a placeholder `applications` row, so both tables have to be
 * consulted: the agency has "already reached" a talent it invited, and equally
 * one who applied to it unprompted. Reading `applications` alone would let
 * Discover re-offer an invite to someone already invited.
 */
async function fetchApplicationMap(knex, agencyId) {
  const [applications, invitedIds] = await Promise.all([
    knex("applications").where({ agency_id: agencyId }).select("profile_id"),
    invitedProfileIds(knex, agencyId),
  ]);

  const reached = new Map();
  for (const row of applications) {
    reached.set(row.profile_id, { profile_id: row.profile_id, applied: true });
  }
  for (const profileId of invitedIds) {
    const existing = reached.get(profileId);
    if (existing) existing.invited = true;
    else reached.set(profileId, { profile_id: profileId, invited: true });
  }

  return reached;
}

async function attachImagesAndInvites(
  knex,
  profiles,
  applicationMap,
  agencyId,
  opts = {},
) {
  const profileIds = profiles.map((profile) => profile.id).filter(Boolean);
  let allImages = [];

  if (profileIds.length > 0) {
    await ensureModerationColumnChecked(knex);
    const imageQuery = knex("images").whereIn("profile_id", profileIds);
    applyImageVisibility(imageQuery, AUDIENCE.AGENCY_DISCOVERY, {
      table: "images",
    });
    allImages = await imageQuery.orderBy(["profile_id", "sort", "created_at"]);
  }

  const imagesByProfile = {};
  for (const image of allImages) {
    if (!imagesByProfile[image.profile_id]) imagesByProfile[image.profile_id] = [];
    imagesByProfile[image.profile_id].push(image);
  }

  const socialByProfile = await loadSocialAccountsForProfiles(profileIds);
  // Booking lanes for the card, from the canonical join table (reused when the
  // caller already loaded them for constraint evaluation).
  const lanesByProfile =
    opts.lanesByProfile || (await loadLanesByProfile(knex, profileIds));
  const representationsByProfile = await loadTalentRepresentationsForProfiles(
    profileIds,
    { db: knex },
  );

  const shaped = [];
  for (const profile of profiles) {
    if (!isAgencyDiscoverable(profile, { agencyId })) continue;

    const dto = buildAgencyDiscoveryDTO(profile, {
      images: imagesByProfile[profile.id] || [],
      social: socialByProfile.get(profile.id) || [],
      representations: representationsByProfile.get(profile.id) || [],
      lanes: lanesByProfile.get(profile.id) || [],
    });
    dto.is_invited = applicationMap.has(profile.id);
    shaped.push(dto);
  }

  return shaped;
}

function applyStableOrder(query, sort) {
  if (sort === "city") {
    return query.orderBy([
      { column: "profiles.city", order: "asc" },
      { column: "profiles.last_name", order: "asc" },
      { column: "profiles.first_name", order: "asc" },
      { column: "profiles.id", order: "asc" },
    ]);
  }

  if (sort === "newest") {
    return query.orderBy([
      { column: "profiles.created_at", order: "desc" },
      { column: "profiles.last_name", order: "asc" },
      { column: "profiles.first_name", order: "asc" },
      { column: "profiles.id", order: "asc" },
    ]);
  }

  return query.orderBy([
    { column: "profiles.last_name", order: "asc" },
    { column: "profiles.first_name", order: "asc" },
    { column: "profiles.id", order: "asc" },
  ]);
}

// ── soft terms: the booker's own words against the talent's own words ───────
//
// Never a filter and never a demotion (audit §3.2). A deterministic lexical
// match of the leftover brief language against talent-AUTHORED text only, shown
// as "Mentions: runway, editorial". No model reads a face; no embedding runs.

const LANE_LABEL_BY_SLUG = Object.fromEntries(
  BOOKING_LANES.map((lane) => [lane.slug, lane.label]),
);

const SOFT_STOPWORDS = new Set([
  "and", "the", "with", "for", "who", "that", "this", "they", "them", "their",
  "she", "her", "his", "him", "its", "our", "your", "you", "are", "was", "were",
  "has", "have", "had", "but", "not", "any", "all", "can", "could", "would",
  "should", "need", "needs", "want", "wants", "looking", "look", "like", "some",
  "very", "must", "from", "into", "over", "under", "about", "around", "plus",
  "one", "two", "three", "talent", "model", "models", "girl", "girls", "guy",
  "guys", "women", "woman", "men", "man", "people", "person", "someone",
  "board", "boards", "role", "roles", "casting", "brief", "client",
]);

const SOFT_SYNONYMS = {
  editorial: ["fashion", "high fashion"],
  fashion: ["editorial"],
  "high fashion": ["editorial", "fashion"],
  commercial: ["lifestyle", "e-comm", "ecomm", "catalog", "catalogue"],
  lifestyle: ["commercial"],
  "e-comm": ["commercial", "ecomm", "catalog"],
  athletic: ["fitness", "sport", "sporty"],
  fitness: ["athletic", "sport", "sporty"],
  runway: ["show", "shows", "catwalk"],
  androgynous: ["androgyny"],
  beauty: ["skincare", "cosmetics"],
  curve: ["curvy", "plus size"],
  "new face": ["emerging", "new face"],
};

const SOFT_MULTIWORD = ["high fashion", "new face", "e-comm", "plus size"];

const MAX_MENTIONS = 4;

/** The leftover brief language, as comparable terms. */
function softTerms(softQuery) {
  let rest = String(softQuery || "").toLowerCase();
  const terms = [];
  for (const phrase of SOFT_MULTIWORD) {
    if (rest.includes(phrase)) {
      terms.push(phrase);
      rest = rest.split(phrase).join(" ");
    }
  }
  for (const token of rest.split(/[^a-z0-9'-]+/)) {
    const word = token.replace(/^[-']+|[-']+$/g, "");
    if (word.length < 3) continue;
    if (SOFT_STOPWORDS.has(word)) continue;
    // Heritage words are a filter, never a soft mention: "black" must not
    // resurface as "Mentions black" against a bio about black-and-white work.
    if (heritageSlugsFromText(word).length) continue;
    if (!terms.includes(word)) terms.push(word);
  }
  return terms;
}

function escapeRe(text) {
  return String(text).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Whole-word presence, so "show" does not match "showroom". */
function mentionsWord(haystack, alias) {
  return new RegExp(`(^|[^a-z0-9])${escapeRe(alias)}(?=$|[^a-z0-9])`, "i").test(haystack);
}

function parseListColumn(raw) {
  if (raw == null) return [];
  if (Array.isArray(raw)) return raw.map((v) => String(v));
  const text = String(raw).trim();
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.map((v) => String(v));
  } catch {
    // not JSON
  }
  return text.split(",").map((part) => part.trim()).filter(Boolean);
}

/** Talent-authored text only: their bio, their specialties, their lanes. */
function talentText(profile, lanes) {
  const parts = [
    profile.bio_curated || "",
    ...parseListColumn(profile.specialties),
    ...parseListColumn(profile.specializations),
    ...(lanes || []).map((slug) => LANE_LABEL_BY_SLUG[slug] || slug),
  ];
  return parts.join(" ").toLowerCase();
}

function softMentions(terms, haystack) {
  const out = [];
  for (const term of terms) {
    const aliases = [term, ...(SOFT_SYNONYMS[term] || [])];
    if (aliases.some((alias) => mentionsWord(haystack, alias))) out.push(term);
    if (out.length >= MAX_MENTIONS) break;
  }
  return out;
}

// ── ordering ────────────────────────────────────────────────────────────────

function createdAtValue(profile) {
  const raw = profile && profile.created_at;
  if (!raw) return 0;
  const time = new Date(raw).getTime();
  return Number.isFinite(time) ? time : 0;
}

function byNameThenId(left, right) {
  const text = (value) => String(value || "").toLocaleLowerCase();
  return (
    text(left.profile.last_name).localeCompare(text(right.profile.last_name)) ||
    text(left.profile.first_name).localeCompare(text(right.profile.first_name)) ||
    text(left.profile.id).localeCompare(text(right.profile.id))
  );
}

function byNewest(left, right) {
  return createdAtValue(right.profile) - createdAtValue(left.profile);
}

/** Group 1: soft overlap, then newest, then name. */
function matchCompare(left, right) {
  return (
    right.mentions.length - left.mentions.length ||
    byNewest(left, right) ||
    byNameThenId(left, right)
  );
}

/** Group 2: fewest misses, then fewest blanks, then overlap, newest, name. */
function partialCompare(left, right) {
  return (
    left.fails - right.fails ||
    left.unknowns - right.unknowns ||
    right.mentions.length - left.mentions.length ||
    byNewest(left, right) ||
    byNameThenId(left, right)
  );
}

// ── engines ─────────────────────────────────────────────────────────────────

async function browseSearch(knex, context) {
  const {
    filters,
    sort,
    pageNum,
    limitNum,
    offset,
    applicationMap,
    agencyId,
  } = context;

  const query = applyDiscoverFilters(baseDiscoverQuery(knex), filters);
  if (context.blockedTalentUserIds?.size) {
    query.whereNotIn("profiles.user_id", [...context.blockedTalentUserIds]);
  }

  const [countResult] = await query
    .clone()
    .clearSelect()
    .clearOrder()
    .count("* as count");
  const totalCount = parseInt(countResult?.count || 0, 10);
  applyStableOrder(query, sort);
  const rows = await query.limit(limitNum).offset(offset);

  const totalPages = Math.ceil(totalCount / limitNum) || 0;
  const profiles = await attachImagesAndInvites(
    knex,
    rows,
    applicationMap,
    agencyId,
  );

  return {
    profiles,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total: totalCount,
      totalPages,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1,
    },
    meta: {
      semantic_search: false,
      natural_language_search: false,
      query: null,
      ordering: sort === "newest" ? "newest" : sort === "city" ? "city" : "name",
    },
  };
}

/**
 * Query mode: parse the brief, evaluate the whole eligible pool, and return
 * exact matches first and the closest after them, each carrying the facts that
 * answered the brief and a plain note per miss.
 */
async function matchSearch(knex, context) {
  const {
    filters,
    pageNum,
    limitNum,
    offset,
    applicationMap,
    agencyId,
    roleIndex,
    q,
  } = context;

  const startedAt = Date.now();
  const parsed = await parseBrief(q, { knex });
  const parseMs = Date.now() - startedAt;

  const roles = Array.isArray(parsed.contract?.roles) ? parsed.contract.roles : [];
  const activeIndex = roles.length
    ? Math.min(Math.max(roleIndex, 0), roles.length - 1)
    : 0;
  const role = roles[activeIndex] || {
    label: "role 1",
    count: 1,
    hard: {},
    soft_query: "",
  };
  const hard = role.hard || {};

  const query = applyDiscoverFilters(baseDiscoverQuery(knex), filters);
  if (context.blockedTalentUserIds?.size) {
    query.whereNotIn("profiles.user_id", [...context.blockedTalentUserIds]);
  }
  const candidates = (await query).filter((profile) =>
    isAgencyDiscoverable(profile, { agencyId }),
  );
  const profileIds = candidates.map((profile) => profile.id);

  const [bookoutsByProfile, lanesByProfile, representationStatuses] =
    await Promise.all([
      loadBookoutsByProfile(knex, profileIds),
      loadLanesByProfile(knex, profileIds),
      loadRepresentationStatusMap(knex, candidates),
    ]);

  const evaluateStartedAt = Date.now();
  // A board word the brief already turned into a filter is a fact on the
  // card, not a mention: "Commercial" once, never "Commercial · Mentions
  // commercial".
  const appliedBoards = Array.isArray(hard.boards) ? hard.boards : [];
  const terms = softTerms(role.soft_query).filter(
    (term) => !appliedBoards.includes(normalizeBookingLaneSlug(term)),
  );
  const kept = [];
  const unknownEverywhere = new Map(); // field → still unknown for everyone

  for (const profile of candidates) {
    const lanes = lanesByProfile.get(profile.id) || [];
    const evaluations = evaluateProfile(profile, hard, {
      bookouts: bookoutsByProfile.get(profile.id) || [],
      representationStatus: representationStatuses.get(profile.id),
      lanes,
    });

    for (const evaluation of evaluations) {
      const seen = unknownEverywhere.get(evaluation.field);
      const isUnknown = evaluation.status === "unknown";
      unknownEverywhere.set(
        evaluation.field,
        seen === undefined ? isUnknown : seen && isUnknown,
      );
    }

    // The one exclusion: a stated gender the talent does not present as.
    const genderFail = evaluations.some(
      (evaluation) =>
        evaluation.field === "gender_presentation" && evaluation.status === "fail",
    );
    if (genderFail) continue;

    const fails = evaluations.filter((e) => e.status === "fail").length;
    const unknowns = evaluations.filter((e) => e.status === "unknown").length;

    kept.push({
      profile,
      evaluations,
      lanes,
      fails,
      unknowns,
      mentions: softMentions(terms, talentText(profile, lanes)),
      kind: fails === 0 && unknowns === 0 ? "match" : "partial",
    });
  }

  const matches = kept.filter((entry) => entry.kind === "match").sort(matchCompare);
  const partials = kept
    .filter((entry) => entry.kind === "partial")
    .sort(partialCompare);
  const evaluateMs = Date.now() - evaluateStartedAt;

  const ordered = [...matches, ...partials];
  const shown = ordered.slice(offset, offset + limitNum);
  const shownProfiles = shown.map((entry) => entry.profile);

  const dtos = await attachImagesAndInvites(
    knex,
    shownProfiles,
    applicationMap,
    agencyId,
    { lanesByProfile },
  );
  const dtoById = new Map(dtos.map((dto) => [dto.id, dto]));

  const results = [];
  for (const entry of shown) {
    const dto = dtoById.get(entry.profile.id);
    if (!dto) continue;
    dto.facts = buildFacts(entry.evaluations, entry.profile, hard);
    dto.notes = buildResultNotes(entry.evaluations, entry.profile, hard);
    dto.mentions = entry.mentions;
    results.push({ kind: entry.kind, dto });
  }

  const profiles = results.map((result) => result.dto);
  const totalCount = ordered.length;
  const totalPages = Math.ceil(totalCount / limitNum) || 0;

  const poolUnknownFields = candidates.length
    ? [...unknownEverywhere.entries()]
        .filter(([, allUnknown]) => allUnknown)
        .map(([field]) => field)
    : [];

  const notes = buildResponseNotes({
    needsConfirmation: (parsed.needs_confirmation_fields || []).filter(
      (entry) => entry.role === activeIndex || entry.role == null,
    ),
    setAside: parsed.contract?.set_aside || [],
    credentialAsked: Boolean(parsed.credential_gate),
    poolUnknownFields,
  });

  const result = {
    profiles,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total: totalCount,
      totalPages,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1,
    },
    meta: {
      semantic_search: false,
      natural_language_search: true,
      query: q,
      ordering: "match",
    },
    discover_v2: {
      engine: "match",
      query: q,
      role: activeIndex,
      roles: roles.map((entry, index) => ({
        index,
        label: entry.label,
        count: entry.count,
        summary: roleSummary(entry, q),
      })),
      filters: buildFilters(q, hard),
      notes,
      groups: [
        {
          kind: "match",
          total: matches.length,
          results: results
            .filter((item) => item.kind === "match")
            .map((item) => item.dto),
        },
        {
          kind: "partial",
          total: partials.length,
          results: results
            .filter((item) => item.kind === "partial")
            .map((item) => item.dto),
        },
      ],
      pool: {
        eligible: candidates.length,
        match: matches.length,
        partial: partials.length,
        shown: profiles.length,
      },
      query_log_id: null,
    },
  };

  // WS6.5 — the route logs every search from this payload. The directory
  // engine never set it, so no Discover search was ever logged (audit §2.6).
  result._launch = {
    contract: parsed.contract,
    dropped: parsed.dropped || [],
    needs_confirmation_fields: parsed.needs_confirmation_fields || [],
    engine: "match",
    result_profile_ids: profiles.map((dto) => dto.id),
    group_counts: { match: matches.length, partial: partials.length },
    timings: {
      parse_ms: parseMs,
      evaluate_ms: evaluateMs,
      total_ms: Date.now() - startedAt,
    },
  };

  return result;
}

async function searchDiscoverableTalent(knex, options) {
  const {
    agencyId,
    q = "",
    sort = "az",
    page = "1",
    limit = "20",
    role = "0",
    city = "",
    letter = "",
    search = "",
    min_height = "",
    max_height = "",
    min_age = "",
    max_age = "",
    gender = "",
    eye_color = "",
    hair_color = "",
    experience_level = "",
  } = options;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
  const offset = (pageNum - 1) * limitNum;
  const roleIndex = Math.max(0, parseInt(role, 10) || 0);
  const explicitFilters = extractExplicitFilters({
    city,
    letter,
    search,
    min_height,
    max_height,
    min_age,
    max_age,
    gender,
    eye_color,
    hair_color,
    experience_level,
  });
  const filters = mergeFilters(explicitFilters, {});
  const blockedTalentUserIds = await getTalentUserIdsBlockingAgency(
    knex,
    agencyId,
  );

  const context = {
    filters,
    sort,
    pageNum,
    limitNum,
    offset,
    roleIndex,
    applicationMap: await fetchApplicationMap(knex, agencyId),
    agencyId,
    blockedTalentUserIds,
    q: String(q || "").trim(),
  };

  return context.q ? matchSearch(knex, context) : browseSearch(knex, context);
}

function canUseSemanticSearch() {
  return false;
}

async function hybridSearch(knex, context) {
  return context && context.q
    ? matchSearch(knex, context)
    : browseSearch(knex, context);
}

module.exports = {
  searchDiscoverableTalent,
  matchSearch,
  browseSearch,
  loadLanesByProfile,
  softTerms,
  softMentions,
  mergeFilters,
  extractExplicitFilters,
  applyDiscoverFilters,
  canUseSemanticSearch,
  parseIntentToFilters,
  hybridSearch,
  attachImagesAndInvites,
  fetchApplicationMap,
};
