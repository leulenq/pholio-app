/**
 * Photo Intelligence — comp card composition engine (WS-B)
 *
 * Analyzes a talent's image pool and produces a deterministic, explainable
 * ranking of which images suit the comp card front (hero) and back (grid).
 *
 * `analyzeImagePool({ images, profile, castingAnalysis })` → PoolAnalysis:
 *   pool         — eligible images enriched with role/dimensions/scores,
 *                  sorted by heroScore desc (stable tiebreaks)
 *   coverage     — counts per comp role + untyped
 *   heroRanking  — pool image ids in heroScore order
 *   warnings     — human-readable gaps (e.g. 'no full-body image available')
 *
 * Eligibility (images are dropped, never re-included):
 *   - status 'archived' or 'retired' (same semantics as the selector's
 *     filterEligibleByStatus; null/empty status counts as active)
 *   - rights-denied tokens (same token set as guardrails.js):
 *     denied | blocked | forbidden | unlicensed | restricted — checked on
 *     image.usage_rights / rights_status / license_status and the same keys
 *     inside parsed metadata.
 *
 * Scoring weights (deterministic — change here, document here):
 *
 *   heroScore (0–100, clamped) — "how good is this as the front-page hero":
 *     base                                          +10
 *     role fit:
 *       derived role 'headshot'                     +30
 *       raw shot_type 'three_quarter'               +20  (derived role is
 *                                                         'full_body' but the
 *                                                         3/4 framing still
 *                                                         suits a hero)
 *       derived role 'full_body' (true full length)  +5
 *     is_primary                                    +20  (the profile-level
 *                                                         castingAnalysis was
 *                                                         computed from this
 *                                                         image — it is the
 *                                                         analyzed face)
 *     resolution: shortEdge >= 1800                 +15
 *                 shortEdge >= 1200 (else)          +10
 *     portrait aspect proximity to 0.647 (5.5/8.5)  +0..15
 *       linear falloff: 15 * (1 - min(|aspect-0.647| / 0.5, 1))
 *     sort rank (ascending `sort`, ties by input
 *       order): rank 0/1/2/3                        +8/+6/+4/+2
 *
 *   qualityScore (0–100, clamped) — print/raw quality proxy:
 *     base                                          +40
 *     resolution: shortEdge >= 1800                 +30
 *                 shortEdge >= 1200 (else)          +20
 *                 shortEdge >=  800 (else)          +10
 *     aspect sanity: aspect in [0.5, 1.0]           +20  (portrait)
 *                    aspect in (1.0, 1.6]           +10  (mild landscape)
 *                    aspect > 2.5 or < 0.3          -10  (extreme/panorama)
 *
 * All metadata / castingAnalysis parsing is defensive (string | object).
 * No DB access; pure function of its inputs.
 */

"use strict";

const { deriveCompCardRole } = require("../comp-card-selector");

/**
 * Rights tokens treated as "not licensed for comp card use".
 * Reimplemented locally — must stay in sync with guardrails.js
 * RIGHTS_DENIED_VALUES (the guardrails helpers are private).
 */
const RIGHTS_DENIED_VALUES = new Set([
  "denied",
  "blocked",
  "forbidden",
  "unlicensed",
  "restricted",
]);

/** Status values treated as ineligible (same as selector's INACTIVE_STATUSES). */
const INACTIVE_STATUSES = new Set(["archived", "retired"]);

/** Target portrait aspect: 5.5in / 8.5in card face. */
const TARGET_PORTRAIT_ASPECT = 5.5 / 8.5; // ≈ 0.647

/**
 * Parse JSON-ish values safely (handles JSONB objects and JSON strings).
 * @param {*} value
 * @returns {object}
 */
function parseJsonish(value) {
  if (!value) return {};
  if (typeof value === "object") return value;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

/** @param {*} value @returns {string} lowercased trimmed token ('' if nullish) */
function normalizeToken(value) {
  if (value == null) return "";
  return String(value).trim().toLowerCase();
}

/** @param {*} value @returns {number|null} positive integer or null */
function toPositiveInt(value) {
  if (value == null || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/**
 * Resolve image dimensions, falling back to parsed metadata.
 * @param {object} image
 * @param {object} metadata — pre-parsed metadata object
 * @returns {{ width: number|null, height: number|null }}
 */
function resolveDimensions(image, metadata) {
  const width = toPositiveInt(image.width ?? metadata.width);
  const height = toPositiveInt(image.height ?? metadata.height);
  return { width, height };
}

/**
 * Resolve the rights token for an image (column first, then metadata).
 * @param {object} image
 * @param {object} metadata — pre-parsed metadata object
 * @returns {string}
 */
function resolveRightsToken(image, metadata) {
  return normalizeToken(
    image.usage_rights ??
      image.rights_status ??
      image.license_status ??
      metadata.usage_rights ??
      metadata.rights_status ??
      metadata.license_status,
  );
}

/** @param {*} status @returns {string} normalized status ('active' when empty) */
function normalizeStatus(status) {
  if (status == null || String(status).trim() === "") return "active";
  return String(status).trim().toLowerCase();
}

/** Clamp to integer 0–100. */
function clampScore(n) {
  return Math.max(0, Math.min(100, Math.round(n)));
}

/**
 * Compute the quality score (see weight table in the file header).
 * @returns {{ score: number, reasons: string[] }}
 */
function computeQualityScore({ shortEdge, aspect }) {
  const reasons = [];
  let score = 40;

  if (shortEdge != null) {
    if (shortEdge >= 1800) {
      score += 30;
      reasons.push(`quality: shortEdge ${shortEdge}px >= 1800 +30`);
    } else if (shortEdge >= 1200) {
      score += 20;
      reasons.push(`quality: shortEdge ${shortEdge}px >= 1200 +20`);
    } else if (shortEdge >= 800) {
      score += 10;
      reasons.push(`quality: shortEdge ${shortEdge}px >= 800 +10`);
    } else {
      reasons.push(`quality: shortEdge ${shortEdge}px below print floor +0`);
    }
  } else {
    reasons.push("quality: dimensions unknown +0");
  }

  if (aspect != null) {
    if (aspect >= 0.5 && aspect <= 1.0) {
      score += 20;
      reasons.push("quality: portrait aspect +20");
    } else if (aspect > 1.0 && aspect <= 1.6) {
      score += 10;
      reasons.push("quality: mild landscape aspect +10");
    } else if (aspect > 2.5 || aspect < 0.3) {
      score -= 10;
      reasons.push("quality: extreme aspect -10");
    }
  }

  return { score: clampScore(score), reasons };
}

/**
 * Compute the hero score (see weight table in the file header).
 * @returns {{ score: number, reasons: string[] }}
 */
function computeHeroScore({
  role,
  rawShotType,
  isPrimary,
  shortEdge,
  aspect,
  sortRank,
  hasCastingAnalysis,
}) {
  const reasons = [];
  let score = 10;

  if (role === "headshot") {
    score += 30;
    reasons.push("hero: role headshot +30");
  } else if (rawShotType === "three_quarter") {
    score += 20;
    reasons.push("hero: three-quarter framing +20");
  } else if (role === "full_body") {
    score += 5;
    reasons.push("hero: full-body role +5");
  }

  if (isPrimary) {
    score += 20;
    reasons.push(
      hasCastingAnalysis
        ? "hero: is_primary (analyzed face per castingAnalysis) +20"
        : "hero: is_primary +20",
    );
  }

  if (shortEdge != null) {
    if (shortEdge >= 1800) {
      score += 15;
      reasons.push("hero: shortEdge >= 1800 +15");
    } else if (shortEdge >= 1200) {
      score += 10;
      reasons.push("hero: shortEdge >= 1200 +10");
    }
  }

  if (aspect != null) {
    const diff = Math.abs(aspect - TARGET_PORTRAIT_ASPECT);
    const bonus = Math.round(15 * (1 - Math.min(diff / 0.5, 1)));
    if (bonus > 0) {
      score += bonus;
      reasons.push(`hero: portrait aspect proximity +${bonus}`);
    }
  }

  const sortBonus = [8, 6, 4, 2][sortRank] ?? 0;
  if (sortBonus > 0) {
    score += sortBonus;
    reasons.push(`hero: sort rank ${sortRank} +${sortBonus}`);
  }

  return { score: clampScore(score), reasons };
}

/**
 * Analyze the talent's image pool for comp card composition.
 *
 * @param {object} input
 * @param {Array<object>} input.images — raw image rows (see spec data shapes)
 * @param {object} [input.profile] — profile row (currently informational)
 * @param {object|string|null} [input.castingAnalysis] — profiles.image_analysis
 * @returns {{ pool: Array<object>, coverage: object, heroRanking: string[], warnings: string[] }}
 */
function analyzeImagePool({ images, profile, castingAnalysis } = {}) {
  const warnings = [];
  const source = Array.isArray(images) ? images : [];
  const analysis = parseJsonish(castingAnalysis);
  const hasCastingAnalysis = Object.keys(analysis).length > 0;

  // --- Eligibility filtering -------------------------------------------------
  let droppedStatus = 0;
  let droppedRights = 0;
  const eligible = [];

  for (const img of source) {
    if (!img || img.id == null) continue;
    const metadata = parseJsonish(img.metadata);

    if (INACTIVE_STATUSES.has(normalizeStatus(img.status))) {
      droppedStatus += 1;
      continue;
    }
    const rights = resolveRightsToken(img, metadata);
    if (rights && RIGHTS_DENIED_VALUES.has(rights)) {
      droppedRights += 1;
      continue;
    }
    eligible.push({ img, metadata });
  }

  if (droppedStatus > 0) {
    warnings.push(
      `${droppedStatus} image${droppedStatus > 1 ? "s" : ""} excluded (archived/retired).`,
    );
  }
  if (droppedRights > 0) {
    warnings.push(
      `${droppedRights} image${droppedRights > 1 ? "s" : ""} excluded (rights denied).`,
    );
  }

  // --- Sort rank (by `sort` asc, ties by input order) ------------------------
  const sortRankById = new Map();
  eligible
    .map(({ img }, inputIndex) => ({ img, inputIndex }))
    .sort((a, b) => {
      const sa = Number.isFinite(Number(a.img.sort))
        ? Number(a.img.sort)
        : Number.POSITIVE_INFINITY;
      const sb = Number.isFinite(Number(b.img.sort))
        ? Number(b.img.sort)
        : Number.POSITIVE_INFINITY;
      if (sa !== sb) return sa - sb;
      return a.inputIndex - b.inputIndex;
    })
    .forEach(({ img }, rank) => sortRankById.set(img.id, rank));

  // --- Enrich + score --------------------------------------------------------
  const pool = eligible.map(({ img, metadata }) => {
    const { width, height } = resolveDimensions(img, metadata);
    const aspect = width && height ? width / height : null;
    const shortEdge = width && height ? Math.min(width, height) : null;
    const role = deriveCompCardRole(img);
    const rawShotType = normalizeToken(img.shot_type).replace(/\s+/g, "_");
    const isPrimary = Boolean(img.is_primary);
    const sortRank = sortRankById.get(img.id) ?? 0;

    const quality = computeQualityScore({ shortEdge, aspect });
    const hero = computeHeroScore({
      role,
      rawShotType,
      isPrimary,
      shortEdge,
      aspect,
      sortRank,
      hasCastingAnalysis,
    });

    return {
      id: img.id,
      src: img.public_url || img.path || null,
      label: img.label ?? null,
      role,
      rawShotType,
      aspect,
      width,
      height,
      shortEdge,
      isPrimary,
      sort: Number.isFinite(Number(img.sort)) ? Number(img.sort) : null,
      // Raw fields the crop engine needs downstream:
      shot_type: img.shot_type ?? null,
      style_type: img.style_type ?? null,
      metadata,
      qualityScore: quality.score,
      heroScore: hero.score,
      reasons: [...hero.reasons, ...quality.reasons],
    };
  });

  // Stable deterministic ordering: heroScore desc, qualityScore desc,
  // sort rank asc, id lexicographic.
  pool.sort((a, b) => {
    if (b.heroScore !== a.heroScore) return b.heroScore - a.heroScore;
    if (b.qualityScore !== a.qualityScore) return b.qualityScore - a.qualityScore;
    const ra = sortRankById.get(a.id) ?? 0;
    const rb = sortRankById.get(b.id) ?? 0;
    if (ra !== rb) return ra - rb;
    return String(a.id).localeCompare(String(b.id));
  });

  // --- Coverage --------------------------------------------------------------
  const coverage = {
    headshot: 0,
    full_body: 0,
    editorial: 0,
    lifestyle: 0,
    untyped: 0,
  };
  for (const item of pool) {
    if (item.role && coverage[item.role] != null) coverage[item.role] += 1;
    else coverage.untyped += 1;
  }

  if (pool.length === 0) {
    warnings.push("No eligible images available for comp card composition.");
  } else {
    if (coverage.full_body === 0) {
      warnings.push("no full-body image available");
    }
    if (coverage.headshot === 0) {
      warnings.push("no headshot available");
    }
    const missingSrc = pool.filter((p) => !p.src).length;
    if (missingSrc > 0) {
      warnings.push(
        `${missingSrc} image${missingSrc > 1 ? "s" : ""} missing a renderable source path.`,
      );
    }
  }

  if (
    hasCastingAnalysis &&
    /low|poor/i.test(String(analysis.photoQuality || ""))
  ) {
    warnings.push("Casting analysis flags overall photo quality as low.");
  }

  // Industry recency rule: comp card photos should be ≤ 6 months old.
  const timestamps = pool
    .map((p) => {
      const src = (Array.isArray(images) ? images : []).find((i) => i && i.id === p.id);
      const t = src?.created_at ? new Date(src.created_at).getTime() : NaN;
      return Number.isFinite(t) ? t : null;
    })
    .filter((t) => t != null);
  if (timestamps.length) {
    const newest = Math.max(...timestamps);
    const ageDays = (Date.now() - newest) / 86400000;
    if (ageDays > 183) {
      warnings.push(
        `newest portfolio photo is ${Math.round(ageDays / 30)} months old — comp card photos should be under 6 months`,
      );
    }
  }

  return {
    pool,
    coverage,
    heroRanking: pool.map((item) => item.id),
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Back-story curation
// ---------------------------------------------------------------------------

function rawShotOf(item) {
  if (item?.rawShotType) return String(item.rawShotType);
  if (item?.shot_type == null) return "";
  return String(item.shot_type).trim().toLowerCase().replace(/\s+/g, "_");
}

function isTrueFullLength(item) {
  const shot = rawShotOf(item);
  if (shot === "full_length" || shot === "full_body") return true;
  return !shot && item?.role === "full_body";
}

/**
 * Curate the back-page image story the way a booker assembles a card:
 * the supporting photos must COMPLEMENT the hero, not repeat it, cover the
 * mandatory full-length, vary the register, and favor the talent's market.
 *
 * Rules (each pick logs its reason):
 * 1. The hero never repeats (sparse-pool reuse is the director's decision).
 * 2. The true full-length anchors the story when one exists.
 * 3. Variety: at most ONE image sharing the hero's derived role, at most
 *    TWO images per role overall; unseen roles get a complement bonus.
 * 4. Market relevance: a label/style matching the casting marketSignals
 *    tokens earns a bonus; qualityScore breaks ties.
 *
 * @param {object} input — { pool (PoolAnalysis.pool), heroId,
 *   marketSignals: string[], max = 5 }
 * @returns {{ story: Array<object>, reasons: string[], warnings: string[] }}
 */
function curateBackStory({ pool = [], heroId = null, marketSignals = [], max = 5 } = {}) {
  const reasons = [];
  const warnings = [];
  const hero = pool.find((p) => p.id === heroId) || null;
  const candidates = pool.filter((p) => p.id !== heroId);
  const tokens = (Array.isArray(marketSignals) ? marketSignals : [])
    .map((s) => String(s).toLowerCase())
    .filter(Boolean);

  const marketBonus = (item) => {
    const haystack = `${item.label || ""} ${item.style_type || ""} ${item.role || ""}`.toLowerCase();
    return tokens.some((t) => t.split(/\s+/).some((word) => word.length > 3 && haystack.includes(word)))
      ? 12
      : 0;
  };

  const story = [];
  const roleCount = new Map();
  const heroRole = hero?.role || null;

  while (story.length < Math.min(max, candidates.length)) {
    const storyHasFullLength = story.some(isTrueFullLength);
    let best = null;
    let bestScore = -Infinity;
    let bestWhy = "";
    for (const item of candidates) {
      if (story.includes(item)) continue;
      const role = item.role || "untyped";
      const sameRoleInStory = roleCount.get(role) || 0;
      if (sameRoleInStory >= 2) continue; // hard variety cap
      let score = item.qualityScore || 0;
      const why = [];
      if (!storyHasFullLength && isTrueFullLength(item)) {
        score += 40;
        why.push("mandatory full-length");
      }
      if (sameRoleInStory === 0 && role !== heroRole) {
        score += 14;
        why.push("new register for the story");
      }
      if (role === heroRole) {
        score -= sameRoleInStory === 0 ? 10 : 30;
        why.push("shares the hero's register");
      }
      if (sameRoleInStory === 1) {
        score -= 18;
        why.push("second of its register");
      }
      const bonus = marketBonus(item);
      if (bonus) {
        score += bonus;
        why.push("matches market signals");
      }
      if (score > bestScore) {
        bestScore = score;
        best = item;
        bestWhy = why.join(", ") || "best available quality";
      }
    }
    if (!best) break;
    story.push(best);
    roleCount.set(best.role || "untyped", (roleCount.get(best.role || "untyped") || 0) + 1);
    reasons.push(`${best.id}: ${bestWhy} (score ${Math.round(bestScore)})`);
  }

  if (story.length && !story.some(isTrueFullLength)) {
    warnings.push("curated back story has no true full-length image");
  }
  const heroRoleRepeats = story.filter((p) => p.role && p.role === heroRole).length;
  if (heroRoleRepeats > 1) {
    warnings.push("back story repeats the hero's register more than once");
  }
  return { story, reasons, warnings };
}

module.exports = {
  analyzeImagePool,
  curateBackStory,
  // Exposed for tests / sibling modules:
  RIGHTS_DENIED_VALUES,
  TARGET_PORTRAIT_ASPECT,
};
