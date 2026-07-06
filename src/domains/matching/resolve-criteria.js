/**
 * matching/resolve-criteria.js — scope inheritance (agency ← board ← brief).
 *
 * Resolves the criteria a candidate is evaluated against by merging a chain of
 * sparse per-scope overrides. Rules (see tasks/match-score-architecture.md §6.4):
 *   - constraints:  UNION by key. A child may add or tighten. A child may NOT
 *                   remove an agency-LOCKED compliance constraint (minors, house
 *                   rules). Same non-locked key ⇒ most-specific wins.
 *   - signal_relevance (importance + interactions): deep-merge, most-specific
 *                   non-null value wins per dimension / per interaction pair.
 *   - look_target:  most-specific non-null wins.
 *
 * `mergeCriteria` is pure and is the unit-tested core. `loadCriteriaChain`
 * loads the chain from the DB and is deliberately defensive about missing rows.
 */

"use strict";

function parseMaybeJson(v, fallback) {
  if (v == null) return fallback;
  if (typeof v !== "string") return v;
  try {
    return JSON.parse(v);
  } catch {
    return fallback;
  }
}

/**
 * Normalize a raw match_criteria row (or plain object) into a working shape.
 */
function normalizeCriteria(raw) {
  if (!raw) return { constraints: [], signal_relevance: {}, look_target: null };
  return {
    constraints: parseMaybeJson(raw.constraints, []) || [],
    signal_relevance: parseMaybeJson(raw.signal_relevance, {}) || {},
    look_target: parseMaybeJson(raw.look_target, null),
    version: raw.version != null ? Number(raw.version) : null,
  };
}

/**
 * Merge an ORDERED chain of criteria, least-specific first (agency, board, brief).
 *
 * @param {Array<Object>} chain - raw rows or normalized objects, least→most specific
 * @returns {{ constraints: Array, signal_relevance: Object, look_target: any, sourceVersions: Array }}
 */
function mergeCriteria(chain) {
  const levels = (chain || []).map(normalizeCriteria);

  // ── constraints: union by key with locked protection ──────────────────────
  const byKey = new Map();
  for (const level of levels) {
    for (const c of level.constraints || []) {
      if (!c || !c.key) continue;
      const existing = byKey.get(c.key);
      if (existing && existing.locked) {
        // An agency-locked constraint cannot be removed or loosened by a child.
        // Allow a child only to TIGHTEN (keep the locked one; record tightening
        // by taking the stricter params where a merge policy is provided).
        if (c.tightensLocked) {
          byKey.set(c.key, { ...existing, params: c.params ?? existing.params });
        }
        continue;
      }
      byKey.set(c.key, { ...c });
    }
  }

  // ── signal_relevance: deep-merge importance + interactions ────────────────
  const importance = {};
  const interactions = {};
  for (const level of levels) {
    const sr = level.signal_relevance || {};
    for (const [dim, val] of Object.entries(sr.importance || {})) {
      if (val != null) importance[dim] = val;
    }
    for (const [pair, val] of Object.entries(sr.interactions || {})) {
      if (val != null) interactions[pair] = val;
    }
  }

  // ── look_target: most-specific non-null wins ──────────────────────────────
  let lookTarget = null;
  for (const level of levels) {
    if (level.look_target != null) lookTarget = level.look_target;
  }

  return {
    constraints: [...byKey.values()],
    signal_relevance: { importance, interactions },
    look_target: lookTarget,
    sourceVersions: levels.map((l) => l.version ?? null),
  };
}

/**
 * Load the criteria chain for a scope from the DB, least-specific first.
 * Stage 0 supports agency and board scopes; brief resolves through its parent
 * board when the linkage exists (casting_briefs arrives in Stage 1).
 *
 * @param {import('knex').Knex} knex
 * @param {{ type: 'agency'|'board'|'brief', id: string }} scope
 * @returns {Promise<Array>} ordered raw criteria rows (agency → board → brief)
 */
async function loadCriteriaChain(knex, scope) {
  const chainScopes = [];

  if (scope.type === "agency") {
    chainScopes.push({ type: "agency", id: scope.id });
  } else if (scope.type === "board") {
    const board = await knex("boards").where({ id: scope.id }).first();
    if (board?.agency_id)
      chainScopes.push({ type: "agency", id: board.agency_id });
    chainScopes.push({ type: "board", id: scope.id });
  } else if (scope.type === "brief") {
    // A brief is a board with kind='casting'. Resolve its agency and, when the
    // casting_briefs row names a parent division board, inherit that board too.
    const board = await knex("boards").where({ id: scope.id }).first();
    if (board?.agency_id)
      chainScopes.push({ type: "agency", id: board.agency_id });
    const hasBriefs = await knex.schema.hasTable("casting_briefs");
    if (hasBriefs) {
      const briefRow = await knex("casting_briefs")
        .where({ board_id: scope.id })
        .first();
      if (briefRow?.parent_board_id)
        chainScopes.push({ type: "board", id: briefRow.parent_board_id });
    }
    chainScopes.push({ type: "brief", id: scope.id });
  }

  if (!chainScopes.length) return [];

  const rows = await knex("match_criteria")
    .where((qb) => {
      for (const s of chainScopes) {
        qb.orWhere({ scope_type: s.type, scope_id: s.id });
      }
    })
    .select("*");

  const rowByKey = new Map(
    rows.map((r) => [`${r.scope_type}:${r.scope_id}`, r]),
  );
  // Return in chain order, skipping scopes with no configured row.
  return chainScopes
    .map((s) => rowByKey.get(`${s.type}:${s.id}`))
    .filter(Boolean);
}

/**
 * Resolve criteria for a scope: load the chain, merge it.
 */
async function resolveCriteria(knex, scope) {
  const chain = await loadCriteriaChain(knex, scope);
  return mergeCriteria(chain);
}

module.exports = {
  mergeCriteria,
  loadCriteriaChain,
  resolveCriteria,
  normalizeCriteria,
};
