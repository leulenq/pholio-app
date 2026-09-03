/**
 * boardModel — the signing board's grouping, over the shared standing model.
 *
 * The standing model itself (sections, standing text, legality, the elapsed
 * helpers) moved to `lib/standing.js` when the submissions desk started
 * printing the same words: two surfaces reading two copies of "what does
 * `kept_on_file` mean" is exactly how they come to disagree. This module is
 * now the board's own part — how a set of candidates is bucketed and ordered
 * on a wall — plus a re-export of the shared model so every signing import
 * keeps working.
 *
 * See docs/superpowers/specs/2026-09-01-signing-board-design.md §2.1, §5.1
 * and 2026-09-01-talent-card-metadata.md §9.
 */

export {
  SECTIONS,
  SECTION_KEYS,
  ACTION_KEYS,
  sectionOf,
  standingOf,
  legalActions,
  candidateId,
  ageNotation,
  hideBrokenImage,
  timestampOf,
  msOf,
  elapsedLabel,
} from '../../lib/standing';

import { SECTION_KEYS, sectionOf, timestampOf, msOf } from '../../lib/standing';

const IN_PLAY_KEYS = ['decide', 'waiting', 'offer', 'represented'];

/* ── grouping ─────────────────────────────────────────────────────── */

const emptyGroups = () => ({
  decide: [], waiting: [], offer: [], represented: [], file: [], passed: [], closed: [],
});

/**
 * Bucket every candidate into its section and sort each one.
 *
 * In-play sections sort LONGEST WAITING FIRST, because the board's actual
 * question is what is stuck and for how long. Settled sections sort newest
 * first, because there the question is what happened lately.
 */
export function groupCandidates(candidates, vocab) {
  const groups = emptyGroups();
  const list = Array.isArray(candidates) ? candidates : [];

  list.forEach((c) => {
    const key = sectionOf(c?.backendStatus || c?.status);
    groups[key].push(c);
  });

  const stamp = (c) => msOf(timestampOf(c)) ?? 0;
  const byName = (a, b) => String(a?.name || '').localeCompare(String(b?.name || ''));

  ['decide', 'waiting', 'offer'].forEach((key) => {
    groups[key].sort((a, b) => stamp(a) - stamp(b) || byName(a, b));
  });
  ['represented', 'file', 'passed', 'closed'].forEach((key) => {
    groups[key].sort((a, b) => stamp(b) - stamp(a) || byName(a, b));
  });

  /* `vocab` and `now` are part of the signature so callers cannot pass a
     vocabulary to standingOf and a different one here; the grouping
     itself is vocabulary-independent by construction. */
  void vocab;
  return groups;
}

/**
 * The in-play wall order: what the review room walks, and what a shift-click
 * range is measured against.
 */
export function inPlayOrder(groups) {
  if (!groups) return [];
  return IN_PLAY_KEYS.reduce((acc, key) => acc.concat(groups[key] || []), []);
}

/**
 * Every candidate in wall order, shelves included. The ledger renders this
 * order and selection ranges span it.
 */
export function boardOrder(groups) {
  if (!groups) return [];
  return SECTION_KEYS.reduce((acc, key) => acc.concat(groups[key] || []), []);
}

/**
 * Height in centimetres, from either shape the board has ever returned.
 *
 * `heightCm` is the current field; `height` is the legacy "178 cm" string.
 * One reader for both, because the wall, the ledger and the shelves sorting
 * on three slightly different parsers is exactly how two surfaces come to
 * disagree about the same person's height.
 */
export function heightCmOf(candidate) {
  if (candidate?.heightCm != null) return Number(candidate.heightCm);
  const raw = candidate?.height;
  if (typeof raw === 'number') return raw;
  const match = String(raw || '').match(/(\d+(?:\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

/**
 * The board's own tags, as words.
 *
 * A tile shows two and counts the rest: past two, the tags stop being a
 * reading and start being a wall of text under a face. `+N` is a count, not a
 * badge — it renders as plain type like every other notation.
 *
 * @returns {{shown: string[], extra: number}}
 */
export function tagLabels(candidate, limit = 2) {
  const all = (Array.isArray(candidate?.tags) ? candidate.tags : [])
    .map((t) => (typeof t === 'string' ? t : t?.tag))
    .filter(Boolean);
  return { shown: all.slice(0, limit), extra: Math.max(0, all.length - limit) };
}

