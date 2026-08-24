/**
 * Agency Discover directory.
 *
 * Discover deliberately filters on declared, factual profile fields and then
 * returns a stable directory order. It does not calculate affinity, semantic
 * distance, or any other score that could imply one person is a better match.
 */

"use strict";

const { parseIntentToFilters } = require("../lib/intent-parser");
const { parseBrief } = require("./discover/parse");
const { evaluateProfile } = require("./discover/constraint-eval");
const { buildUnderstanding } = require("./discover/present");
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

  if (filters.eye_color) {
    query.where("profiles.eye_color", filters.eye_color);
  }
  if (filters.hair_color) {
    query.where("profiles.hair_color", filters.hair_color);
  }
  if (filters.experience_level) {
    query.where("profiles.experience_level", filters.experience_level);
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

function stableProfileCompare(sort) {
  const text = (value) => String(value || "").toLocaleLowerCase();
  const byText = (left, right) => text(left).localeCompare(text(right));

  return (left, right) => {
    if (sort === "newest") {
      const dateOrder = text(right.created_at).localeCompare(text(left.created_at));
      if (dateOrder) return dateOrder;
    } else if (sort === "city") {
      const cityOrder = byText(left.city, right.city);
      if (cityOrder) return cityOrder;
    }

    return (
      byText(left.last_name, right.last_name) ||
      byText(left.first_name, right.first_name) ||
      byText(left.id, right.id)
    );
  };
}

function understandingFromParse(parsed, role, brief) {
  const roles = parsed?.contract?.roles || [];
  const multiRoleNotice =
    roles.length > 1
      ? {
          role_count: roles.length,
          searched: role?.label || "role 1",
          message: `This brief describes ${roles.length} roles — searching "${role?.label || "role 1"}". Run the others separately.`,
        }
      : null;

  return buildUnderstanding(
    parsed?.contract || { roles: [] },
    brief,
    multiRoleNotice,
  );
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

async function attachImagesAndInvites(knex, profiles, applicationMap, agencyId) {
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

async function browseSearch(knex, context) {
  const {
    filters,
    sort,
    pageNum,
    limitNum,
    offset,
    applicationMap,
    agencyId,
    q,
  } = context;

  const query = applyDiscoverFilters(baseDiscoverQuery(knex), filters);
  if (context.blockedTalentUserIds?.size) {
    query.whereNotIn("profiles.user_id", [...context.blockedTalentUserIds]);
  }
  let rows;
  let totalCount;
  let understanding = null;

  if (q) {
    const parsed = await parseBrief(q, { knex });
    const role = parsed.contract?.roles?.[0] || null;
    const hard = role?.hard || {};
    understanding = understandingFromParse(parsed, role, q);

    const candidates = await query;
    const profileIds = candidates.map((profile) => profile.id);
    const [bookoutsByProfile, representationStatuses] = await Promise.all([
      loadBookoutsByProfile(knex, profileIds),
      loadRepresentationStatusMap(knex, candidates),
    ]);

    const filtered = candidates.filter((profile) => {
      const evaluations = evaluateProfile(profile, hard, {
        bookouts: bookoutsByProfile.get(profile.id) || [],
        representationStatus: representationStatuses.get(profile.id),
      });
      return evaluations.every((evaluation) => evaluation.status === "pass");
    });

    filtered.sort(stableProfileCompare(sort));
    totalCount = filtered.length;
    rows = filtered.slice(offset, offset + limitNum);
  } else {
    const [countResult] = await query
      .clone()
      .clearSelect()
      .clearOrder()
      .count("* as count");
    totalCount = parseInt(countResult?.count || 0, 10);
    applyStableOrder(query, sort);
    rows = await query.limit(limitNum).offset(offset);
  }

  const totalPages = Math.ceil(totalCount / limitNum) || 0;
  const profiles = await attachImagesAndInvites(
    knex,
    rows,
    applicationMap,
    agencyId,
  );

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
      natural_language_search: Boolean(q),
      query: q || null,
      query_understanding: understanding,
      ordering: sort === "newest" ? "newest" : sort === "city" ? "city" : "name",
    },
  };

  if (q) {
    result.discover_v2 = {
      engine: "directory",
      understanding,
      groups: profiles.length
        ? [{ kind: "filtered", missed: null, heading: null, results: profiles }]
        : [],
      pool: { eligible: totalCount, shown: profiles.length },
      honest_zero: profiles.length
        ? null
        : {
            reason: "No discoverable talent meet every factual requirement in this brief.",
            removable_chip: null,
          },
    };
  }

  return result;
}

async function searchDiscoverableTalent(knex, options) {
  const {
    agencyId,
    q = "",
    sort = "az",
    page = "1",
    limit = "20",
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

  return browseSearch(knex, {
    filters,
    sort,
    pageNum,
    limitNum,
    offset,
    applicationMap: await fetchApplicationMap(knex, agencyId),
    agencyId,
    blockedTalentUserIds,
    q: q.trim(),
  });
}

function canUseSemanticSearch() {
  return false;
}

async function hybridSearch(knex, context) {
  return browseSearch(knex, context);
}

module.exports = {
  searchDiscoverableTalent,
  mergeFilters,
  extractExplicitFilters,
  applyDiscoverFilters,
  canUseSemanticSearch,
  parseIntentToFilters,
  hybridSearch,
  attachImagesAndInvites,
  fetchApplicationMap,
};
