/**
 * The Market-card glance — Tier 1 of the presentation IA
 * (scratchpad/presentation/IA-DESIGN.md): "understand what applying involves"
 * at a glance, in a handful of words, before a talent opens anything.
 *
 * Two sources can answer that question for a given market-directory entry:
 *   - An authored brief (`content/agencyBriefs.js`) — a person read the
 *     agency's published requirements and wrote the glance by hand. Preferred
 *     whenever one exists for the entry's registry series.
 *   - The route DTO the entry already carries — no authored copy exists yet,
 *     so the glance is derived from the handful of facts the registry itself
 *     publishes (today: how the agency takes applications). Everything this
 *     module cannot honestly derive comes back `null`/`[]`/`false` — it never
 *     guesses a gate, a photo count, or a heads-up that nobody wrote down.
 */

import { CHANNEL_TYPE, formatRegistryDate } from './specRegistry';
import { checkedOn as packCheckedOn } from '../content/agencyBriefs';

/** `scope.channel.type` -> the one-line "how you apply" a talent reads first. */
const APPLY_METHOD_BY_CHANNEL = Object.freeze({
  [CHANNEL_TYPE.OFFICIAL_WEB_FORM]: 'Online form',
  [CHANNEL_TYPE.OFFICIAL_EMAIL]: 'Email',
  [CHANNEL_TYPE.AGENCY_BRANDED_THIRD_PARTY_FORM]: 'Online form',
});

/**
 * "4 photos" — the only shot-count summary this module will ever produce.
 * Never a guess: an entry without a known count gets `null`, not "some photos".
 */
function shotCountSummary(shotCount) {
  const count = Number(shotCount);
  if (!Number.isFinite(count) || count <= 0) return null;
  return `${count} photo${count === 1 ? '' : 's'}`;
}

/**
 * The glance for one market-directory entry.
 *
 * @param {object|null} marketEntry  the entry's route DTO fields — reads
 *   `channelType` (how it takes applications), `sourceCheckedOn` (when the
 *   registry last checked it), and an optional `shotCount` when the caller
 *   already knows one.
 * @param {object|null} brief  the authored entry from `briefForSeries`
 *   (`content/agencyBriefs.js`), or null when none exists yet.
 * @returns {{applyMethod: string|null, prepSummary: string|null, gates: string[], hasHeadsUp: boolean, checkedOn: string|null}}
 */
export function glanceForEntry(marketEntry, brief) {
  if (brief?.glance) {
    const { applyMethod = null, prepSummary = null, gates, headsUp } = brief.glance;
    return {
      applyMethod: applyMethod ?? null,
      prepSummary: prepSummary ?? null,
      gates: Array.isArray(gates) ? gates : [],
      hasHeadsUp: Boolean(headsUp),
      checkedOn: formatRegistryDate(packCheckedOn),
    };
  }

  return {
    applyMethod: APPLY_METHOD_BY_CHANNEL[marketEntry?.channelType] ?? null,
    prepSummary: shotCountSummary(marketEntry?.shotCount),
    // Never invented without a brief: a hard gate is a claim worth getting
    // right, and the route DTO alone doesn't publish one.
    gates: [],
    hasHeadsUp: false,
    checkedOn: formatRegistryDate(marketEntry?.sourceCheckedOn),
  };
}
