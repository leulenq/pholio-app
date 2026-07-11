"use strict";

/**
 * Discover launch-mode engine (WS5.4).
 *
 * Score-everything pipeline for the launch corpus (a few hundred profiles):
 *
 *   parseBrief → eligible pool (gender SQL exclusion only) → credential honesty
 *   gate → per-profile constraint evaluation → single-channel soft similarity
 *   (soft_query embedding vs discover_index) → §6 grouping (exact / near /
 *   outside-spec) → honest-zero with the most-narrowing removable chip.
 *
 * The relaxation ladder is GONE as control flow (spec §3): "matches 5 of 6 —
 * misses availability" is a ranking presentation, not a filter mutation. Nothing
 * auto-relaxes; client-gate misses never auto-show.
 *
 * Returns a payload carrying BOTH the legacy `{ profiles, pagination, meta }`
 * shape the current DiscoverPage reads AND the versioned `discover_v2` contract,
 * plus an internal `_launch` block the route consumes for WS6.5 logging.
 */

const {
  embed,
  cachedEmbed,
  cosineDistance,
  isPostgresKnex,
  loadEmbeddingCacheMap,
} = require("../../../ai/embeddings");
const { parseBrief } = require("./parse");
const { evaluateProfile, appliedConstraintFields } = require("./constraint-eval");
const { GENDER_DB_MAP } = require("./field-whitelist");
const {
  buildUnderstanding,
  buildResultItem,
  nearHeading,
  fieldLabel,
} = require("./present");

// Operational near-miss severity: which missed constraint keys a profile's near
// group. `fail` outranks `unknown`; ties broken by this field priority.
const OPERATIONAL_PRIORITY = ["availability", "location", "union", "experience_level"];

// ── eligible pool ────────────────────────────────────────────────────────────

function baseEligibleQuery(knex) {
  return knex("profiles")
    .where({
      "profiles.is_discoverable": true,
      "profiles.profile_status": "active",
    })
    .whereNotNull("profiles.bio_curated");
}

/** Count the eligible discoverable pool (corpus-threshold check). */
async function countEligiblePool(knex) {
  const [row] = await baseEligibleQuery(knex).count("* as count");
  return parseInt(row?.count || 0, 10);
}

/**
 * Load the eligible pool as raw profile rows. Gender/stats-track is the ONLY
 * hard constraint applied as a SQL exclusion (spec §3 step 3); everything else
 * is scored.
 */
async function loadEligiblePool(knex, hard) {
  const query = baseEligibleQuery(knex).select("profiles.*");
  if (Array.isArray(hard.gender_presentation) && hard.gender_presentation.length) {
    const dbVals = hard.gender_presentation
      .map((g) => GENDER_DB_MAP[g])
      .filter(Boolean)
      .map((v) => v.toLowerCase());
    if (dbVals.length) {
      query.whereRaw(
        `LOWER(profiles.gender) IN (${dbVals.map(() => "?").join(",")})`,
        dbVals,
      );
    }
  }
  return query;
}

/**
 * Derived representation status per profile (LB-5). Consumes the PR6 DTO API:
 * batch loader + deriveRepresentationStatus. Returns null on failure so the
 * evaluator falls back to 'unknown' instead of guessing.
 * @returns {Promise<Map<string,string>|null>}
 */
async function loadRepresentationStatusMap(knex, pool) {
  try {
    // eslint-disable-next-line global-require
    const {
      loadTalentRepresentationsForProfiles,
      deriveRepresentationStatus,
    } = require("../../../../shared/lib/audience-dto");
    const repsByProfile = await loadTalentRepresentationsForProfiles(
      pool.map((p) => p.id),
      { db: knex },
    );
    const map = new Map();
    for (const profile of pool) {
      const { representation_status } = deriveRepresentationStatus(
        profile,
        repsByProfile.get(profile.id) || [],
      );
      map.set(profile.id, representation_status);
    }
    return map;
  } catch {
    return null; // best-effort → constraint evaluates as 'unknown'
  }
}

/** Batch-load bookout rows keyed by profile id (best-effort). */
async function loadBookoutsByProfile(knex, ids) {
  const map = new Map();
  if (!ids.length) return map;
  try {
    if (!(await knex.schema.hasTable("bookouts"))) return map;
    const rows = await knex("bookouts")
      .whereIn("profile_id", ids)
      .select("profile_id", "starts_on", "ends_on");
    for (const r of rows) {
      if (!map.has(r.profile_id)) map.set(r.profile_id, []);
      map.get(r.profile_id).push(r);
    }
  } catch {
    /* best-effort */
  }
  return map;
}

/** Load discover_index embeddings for the pool (dual-dialect). */
async function loadDiscoverEmbeddings(knex, ids) {
  const map = new Map();
  if (!ids.length) return map;
  if (isPostgresKnex(knex)) {
    try {
      const rows = await knex("talent_text_embeddings")
        .where({ source: "discover_index" })
        .whereIn("profile_id", ids)
        .select("profile_id", "embedding");
      for (const r of rows) {
        if (r.embedding == null) continue;
        try {
          const vec =
            typeof r.embedding === "string" ? JSON.parse(r.embedding) : r.embedding;
          if (Array.isArray(vec) && vec.length) map.set(r.profile_id, vec);
        } catch {
          /* skip corrupt */
        }
      }
    } catch {
      /* best-effort */
    }
    return map;
  }
  const cacheMap = await loadEmbeddingCacheMap(knex, ids);
  for (const [id, sources] of cacheMap) {
    if (sources.discover_index) map.set(id, sources.discover_index);
  }
  return map;
}

// ── grouping (spec §6) ───────────────────────────────────────────────────────

/**
 * §6 mapping:
 *   exact   = every applied hard constraint (client_gate AND operational) passes
 *   near    = all client-gate constraints pass, ≥1 operational constraint is a
 *             miss (fail OR unknown); keyed by the most-severe missed operational
 *   outside = ≥1 client-gate miss (fail OR unknown) — EXCLUDED from the payload
 *             unless include_outside_spec (then a single labeled group)
 */
function classify(item) {
  const clientGate = item.evals.filter((e) => e.tier === "client_gate");
  const operational = item.evals.filter((e) => e.tier === "operational");

  const clientGateAllPass = clientGate.every((e) => e.status === "pass");
  if (!clientGateAllPass) {
    return { kind: "outside_spec", missed: null };
  }
  const opMisses = operational.filter((e) => e.status !== "pass");
  if (!opMisses.length) return { kind: "exact", missed: null };

  // Most-severe missed operational: fail before unknown, then field priority.
  opMisses.sort((a, b) => {
    const sev = (a.status === "fail" ? 0 : 1) - (b.status === "fail" ? 0 : 1);
    if (sev !== 0) return sev;
    return (
      OPERATIONAL_PRIORITY.indexOf(a.field) - OPERATIONAL_PRIORITY.indexOf(b.field)
    );
  });
  return { kind: "near", missed: opMisses[0].field };
}

/** Within-group order: passes desc, then soft similarity desc (unscored last). */
function orderItems(items) {
  return [...items].sort((a, b) => {
    if (b.passes !== a.passes) return b.passes - a.passes;
    const as = a.softScore == null ? -Infinity : a.softScore;
    const bs = b.softScore == null ? -Infinity : b.softScore;
    return bs - as;
  });
}

/**
 * Most-narrowing constraint: the applied constraint whose removal grows the
 * exact group the most (spec §5 / §6 honest-zero). Returns the field name.
 */
function mostNarrowingConstraint(scored, hard) {
  const fields = appliedConstraintFields(hard);
  if (!fields.length) return null;

  let best = null;
  let bestGain = -1;
  for (const field of fields) {
    let gain = 0;
    for (const item of scored) {
      // Would this profile become exact if `field` were removed?
      const remaining = item.evals.filter((e) => e.field !== field);
      const allPass = remaining.every((e) => e.status === "pass");
      const isAlreadyExact = item.evals.every((e) => e.status === "pass");
      if (allPass && !isAlreadyExact) gain += 1;
    }
    if (gain > bestGain) {
      bestGain = gain;
      best = field;
    }
  }
  return best;
}

// ── entry point ──────────────────────────────────────────────────────────────

/**
 * @param {object} args
 * @param {import('knex').Knex} args.knex
 * @param {string} args.briefText
 * @param {number} [args.limit]
 * @param {boolean} [args.includeOutsideSpec]
 * @param {string} args.agencyUserId — agency id (application map + DTO gate)
 * @param {Date}   [args.now]
 */
async function launchModeSearch(args) {
  const {
    knex,
    briefText = "",
    limit = 30,
    includeOutsideSpec = false,
    agencyUserId,
    now = new Date(),
  } = args;

  // Lazy require avoids a circular init with discover-search.js.
  // eslint-disable-next-line global-require
  const { attachImagesAndInvites, fetchApplicationMap } = require("../discover-search");

  const tStart = Date.now();
  const parsed = await parseBrief(briefText, { knex, now });
  const parseMs = Date.now() - tStart;

  const contract = parsed.contract || { roles: [], set_aside: [] };
  const roles = Array.isArray(contract.roles) ? contract.roles : [];
  const role = roles[0] || { label: "role 1", hard: {}, soft_query: "" };
  const hard = role.hard || {};

  const multiRoleNotice =
    parsed.multi_role && roles.length > 1
      ? {
          role_count: roles.length,
          searched: role.label,
          message: `This brief describes ${roles.length} roles — searching "${role.label}". Run the others separately.`,
        }
      : null;

  const understanding = buildUnderstanding(contract, briefText, multiRoleNotice);
  const applicationMap = await fetchApplicationMap(knex, agencyUserId);

  const pool = await loadEligiblePool(knex, hard);
  const eligibleCount = pool.length;

  // ── credential honesty gate (spec §4 / LB-6) ──────────────────────────────
  if (contract.credential_gate) {
    return assemble({
      knex,
      briefText,
      understanding,
      contract,
      parsed,
      groups: [],
      orderedItems: [],
      dtoById: new Map(),
      eligibleCount,
      shownCount: 0,
      honestZero: {
        reason:
          "No talent currently list verifiable credentials for this ask (published work is not tracked yet).",
        removable_chip: "credentials",
      },
      applicationMap,
      agencyUserId,
      timings: { parse_ms: parseMs, eval_ms: 0, embed_ms: 0, total_ms: Date.now() - tStart },
      attachImagesAndInvites,
    });
  }

  const ids = pool.map((p) => p.id);
  const bookoutsByProfile = await loadBookoutsByProfile(knex, ids);

  // Representation status (LB-5) — only derived when the brief constrains it;
  // PR6's DTO API is the single source of truth for the derivation.
  let repStatusById = null;
  if (
    Array.isArray(hard.representation_status) &&
    hard.representation_status.length
  ) {
    repStatusById = await loadRepresentationStatusMap(knex, pool);
  }

  // ── soft scoring (single channel) ─────────────────────────────────────────
  let embedMs = 0;
  let queryVec = null;
  let embMap = new Map();
  const softQuery = (role.soft_query || "").trim();
  if (softQuery && process.env.OPENAI_API_KEY) {
    const tEmbed = Date.now();
    try {
      queryVec = await cachedEmbed(knex, softQuery, { embedFn: embed });
      if (queryVec) embMap = await loadDiscoverEmbeddings(knex, ids);
    } catch {
      queryVec = null;
    }
    embedMs = Date.now() - tEmbed;
  }

  // ── evaluate + score ──────────────────────────────────────────────────────
  const tEval = Date.now();
  const scored = pool.map((profile) => {
    const evals = evaluateProfile(profile, hard, {
      now,
      bookouts: bookoutsByProfile.get(profile.id) || [],
      representationStatus: repStatusById ? repStatusById.get(profile.id) : undefined,
    });
    const passes = evals.filter((e) => e.status === "pass").length;
    let softScore = null;
    if (queryVec) {
      const vec = embMap.get(profile.id);
      if (vec) softScore = 1 - cosineDistance(queryVec, vec);
    }
    return { profile, evals, passes, softScore };
  });
  const evalMs = Date.now() - tEval;

  // ── group ─────────────────────────────────────────────────────────────────
  const exact = [];
  const nearByField = new Map();
  const outside = [];
  for (const item of scored) {
    const c = classify(item);
    if (c.kind === "exact") exact.push(item);
    else if (c.kind === "near") {
      if (!nearByField.has(c.missed)) nearByField.set(c.missed, []);
      nearByField.get(c.missed).push(item);
    } else {
      outside.push(item);
    }
  }

  // Build ordered group list (display order): exact → near groups (by priority)
  // → outside_spec (only when explicitly requested).
  const groupSpecs = [];
  groupSpecs.push({ kind: "exact", missed: null, items: orderItems(exact) });
  const nearFields = [...nearByField.keys()].sort(
    (a, b) => OPERATIONAL_PRIORITY.indexOf(a) - OPERATIONAL_PRIORITY.indexOf(b),
  );
  for (const field of nearFields) {
    groupSpecs.push({ kind: "near", missed: field, items: orderItems(nearByField.get(field)) });
  }
  if (includeOutsideSpec && outside.length) {
    groupSpecs.push({ kind: "outside_spec", missed: null, items: orderItems(outside) });
  }

  // Flatten to the shown page (limit across all groups, exact first).
  const orderedItems = [];
  for (const g of groupSpecs) {
    for (const item of g.items) {
      orderedItems.push({ item, groupKind: g.kind, missed: g.missed });
      if (orderedItems.length >= limit) break;
    }
    if (orderedItems.length >= limit) break;
  }

  // Honest zero: no exact and no near, and nothing to show outside-spec.
  let honestZero = null;
  const shownGroupsHaveResults =
    exact.length || nearByField.size || (includeOutsideSpec && outside.length);
  if (!shownGroupsHaveResults) {
    const chip = mostNarrowingConstraint(scored, hard);
    honestZero = {
      reason: chip
        ? `No talent match every constraint. Loosening "${fieldLabel(chip)}" surfaces the most candidates.`
        : "No discoverable talent match this brief yet.",
      removable_chip: chip,
    };
  }

  // Enrich the shown page into DTOs (minor gate + images + invites).
  const shownProfiles = orderedItems.map((o) => o.item.profile);
  const dtos = await attachImagesAndInvites(
    knex,
    shownProfiles,
    applicationMap,
    agencyUserId,
  );
  const dtoById = new Map(dtos.map((d) => [d.id, d]));

  return assemble({
    knex,
    briefText,
    understanding,
    contract,
    parsed,
    groups: groupSpecs,
    orderedItems,
    dtoById,
    eligibleCount,
    shownCount: dtos.length,
    honestZero,
    applicationMap,
    agencyUserId,
    timings: {
      parse_ms: parseMs,
      eval_ms: evalMs,
      embed_ms: embedMs,
      total_ms: Date.now() - tStart,
    },
    attachImagesAndInvites,
  });
}

/**
 * Assemble the final payload (legacy shape + discover_v2 + _launch log block).
 */
function assemble(ctx) {
  const {
    briefText,
    understanding,
    contract,
    parsed,
    groups,
    orderedItems,
    dtoById,
    eligibleCount,
    shownCount,
    honestZero,
    timings,
  } = ctx;

  // Build discover_v2 groups from the shown page, preserving group order and
  // dropping any items whose DTO was suppressed (minor gate).
  const shownByGroup = new Map();
  for (const o of orderedItems) {
    const dto = dtoById.get(o.item.profile.id);
    if (!dto) continue;
    const resultItem = buildResultItem(dto, o.item.profile, o.item.evals, {
      groupKind: o.groupKind,
    });
    const key = `${o.groupKind}:${o.missed || ""}`;
    if (!shownByGroup.has(key)) {
      shownByGroup.set(key, { kind: o.groupKind, missed: o.missed, results: [] });
    }
    shownByGroup.get(key).results.push(resultItem);
  }

  const v2Groups = [];
  for (const g of groups) {
    const key = `${g.kind}:${g.missed || ""}`;
    const shown = shownByGroup.get(key);
    if (!shown || !shown.results.length) continue;
    v2Groups.push({
      kind: g.kind,
      missed: g.missed,
      heading:
        g.kind === "near"
          ? nearHeading(g.missed)
          : g.kind === "outside_spec"
            ? "Outside spec"
            : null,
      results: shown.results,
    });
  }

  const legacyProfiles = [];
  for (const grp of v2Groups) legacyProfiles.push(...grp.results);

  const groupCounts = {
    exact: 0,
    near: {},
    outside_spec: 0,
  };
  for (const grp of v2Groups) {
    if (grp.kind === "exact") groupCounts.exact = grp.results.length;
    else if (grp.kind === "near") groupCounts.near[grp.missed] = grp.results.length;
    else if (grp.kind === "outside_spec") groupCounts.outside_spec = grp.results.length;
  }

  const pool = { eligible: eligibleCount, shown: legacyProfiles.length };

  const discoverV2 = {
    engine: "launch",
    understanding,
    groups: v2Groups,
    pool,
    honest_zero: honestZero,
  };

  const resultProfileIds = legacyProfiles.map((p) => p.id);

  return {
    // legacy shape the current DiscoverPage reads
    profiles: legacyProfiles,
    pagination: {
      page: 1,
      limit: legacyProfiles.length,
      total: legacyProfiles.length,
      totalPages: legacyProfiles.length ? 1 : 0,
      hasNext: false,
      hasPrev: false,
    },
    meta: {
      engine: "launch",
      semantic_search: true,
      query: briefText || null,
      // query_understanding kept for the legacy chip rack until the frontend PR;
      // the authoritative understanding lives under discover_v2.
      query_understanding: {
        attributes: [],
        constraints: understanding.applied.map((a) => ({
          field: a.field,
          value: a.value,
          needs_confirmation: a.needs_confirmation,
        })),
        source: "launch",
      },
      pool,
      group_counts: groupCounts,
      set_aside: understanding.set_aside,
      multi_role_notice: understanding.multi_role_notice,
    },
    // versioned additive contract
    discover_v2: discoverV2,
    // internal — consumed and stripped by the route for WS6.5 logging
    _launch: {
      engine: "launch",
      contract,
      dropped: parsed.dropped || [],
      needs_confirmation_fields: parsed.needs_confirmation_fields || [],
      result_profile_ids: resultProfileIds,
      group_counts: groupCounts,
      timings,
    },
  };
}

module.exports = {
  launchModeSearch,
  countEligiblePool,
  loadEligiblePool,
  loadDiscoverEmbeddings,
  classify,
  orderItems,
  mostNarrowingConstraint,
};
