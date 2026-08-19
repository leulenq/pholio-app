/**
 * The market's shot lists, read as one.
 *
 * Every house in the researched market publishes its own digitals list, and the
 * lists overlap almost completely: a full length on all of them, a waist-up and
 * a close-up on most, one distinctive ask apiece. Ten published lists come to
 * roughly ten distinct frames, which is one afternoon against a plain wall.
 * That is a fact about the houses' own documents, and this is the pass that
 * demonstrates it from those documents rather than asserting it.
 *
 * It is the recovered `buildMarketView` (`git show 39dac647`) re-cut from routes
 * to houses, and it keeps that engine's contract, which is `briefModel.js`'s
 * contract: it normalises, deduplicates and drops — it never invents. Nothing
 * here originates a string; every label is a canonical taxonomy label and every
 * name is the house's own.
 *
 * Two things it deliberately does not do:
 *
 *  - It does not recommend. The recovered engine returned a `recommendation`
 *    field naming the shot to take next. The sort carries the identical
 *    information as fact, and a field with that name is how a reading surface
 *    acquires an advice-voice.
 *  - It does not aggregate anything but shots. `missing` counts uncovered shot
 *    frames and nothing else, which is why every sentence built on it is scoped
 *    to a *shot list* and never to a house's requirements: a house also
 *    publishes measurements, form fields and eligibility that this model has
 *    deliberately never looked at, and "Ford is one away" would be false of all
 *    of them.
 */

import {
  OUTCOME,
  canonicalShotLabel,
  readFindings,
  shotFindings,
} from './specRegistry';

/** The series a single house publishes, deduped, in the order its routes list them. */
function seriesIdsOf(house) {
  const ids = (house?.routes || []).map((route) => route?.seriesId).filter(Boolean).map(String);
  return [...new Set(ids)];
}

/**
 * Every series the market publishes, once, in a stable order.
 *
 * This is a fetch key before it is a list — React Query hashes it into the
 * cache entry, and the preflight endpoint chunks on it — so the same market has
 * to produce the same array whichever order the directory arrived in. Uniq and
 * sort belong here rather than at each call site, where one caller forgetting
 * either silently doubles the market's request count.
 */
export function coverageSeriesIds(houses) {
  return [...new Set((houses || []).flatMap(seriesIdsOf))].sort();
}

/**
 * The frame identity, for every published shot.
 *
 * `matchKey` is the cross-house identity: two houses that published the same
 * requirement in different words share it, so "full length" is one row across
 * the whole market. `slotKey` is the fallback for a slot nothing can be
 * compared against, and it is never null (`readFinding`), so no published shot
 * can fall out of this view unnoticed.
 *
 * The asymmetry is the point and not a bug: Elite's "Close-up, hair pulled
 * back" and Muse's "Close-up, hair up" carry different match keys because they
 * are different pictures, and merging them would tell a talent they had shot
 * something they had not.
 */
function frameKeyOf(finding) {
  return finding.matchKey || finding.slotKey;
}

/** The photograph preflight matched to a slot, if it matched one. */
function assignedImageId(finding) {
  return finding.assignments.find((entry) => entry?.imageId)?.imageId || null;
}

/**
 * One house's list, folded out of however many routes it has.
 *
 * Elite Paris and Elite Tokyo are one house to a talent (`foldBrands` in
 * `marketDirectory.js`), and both ask for a full length. That is one frame to
 * shoot, so a house's routes are deduped by frame key before anything is
 * counted — the count in "On 6 of 9 lists" is houses, never routes, or a brand
 * with three offices would outvote three separate houses.
 *
 * A frame is in the set for the house when ANY of its routes matched a
 * photograph to it. Per-route evaluations can genuinely disagree: preflight
 * assigns each image to at most one slot, so a shorter list can place a
 * photograph a longer list had already spent. Reading a photograph the talent
 * demonstrably holds as held is the honest resolution of that.
 */
function readHouse(house, evaluationFor, labels) {
  const seriesIds = seriesIdsOf(house);
  const detail = new Map();

  for (const seriesId of seriesIds) {
    for (const finding of shotFindings(readFindings(evaluationFor(seriesId)))) {
      const key = frameKeyOf(finding);
      if (!detail.has(key)) {
        detail.set(key, {
          key,
          label: canonicalShotLabel(finding, labels),
          inSet: false,
          imageId: null,
        });
      }
      const frame = detail.get(key);
      if (finding.outcome === OUTCOME.SATISFIED) {
        frame.inSet = true;
        frame.imageId = frame.imageId || assignedImageId(finding);
      }
    }
  }

  const covered = [...detail.values()].filter((frame) => frame.inSet).length;

  return {
    detail,
    house: {
      houseKey: house?.key ?? null,
      name: house?.name || '',
      seriesIds,
      // A house Pholio has researched but that publishes no shots is not a
      // house with an empty list; it is a house the verdict does not count.
      hasShotList: detail.size > 0,
      frames: new Set(detail.keys()),
      covered,
      // Distinct uncovered SHOT frames. Nothing else is in this number, and
      // everything the surface says about it is scoped to the shot list.
      missing: detail.size - covered,
    },
  };
}

/**
 * The union list: every distinct frame the market publishes, once.
 *
 * @param {object}   input
 * @param {object[]} input.houses         `buildHouses` output, in board order
 * @param {Function} input.evaluationFor  seriesId -> `evaluationDto`, or null
 * @param {object}   input.labels         the taxonomy label pack
 */
export function buildCoverage({ houses = [], evaluationFor = () => null, labels = {} } = {}) {
  const read = (houses || []).map((house) => readHouse(house, evaluationFor, labels));

  const rows = new Map();
  for (const { house, detail } of read) {
    for (const frame of detail.values()) {
      if (!rows.has(frame.key)) {
        // The first house to publish a frame names it. Houses sharing a
        // `matchKey` published the same requirement, so they agree on the
        // canonical label; where they only share a `slotKey` there is one
        // house, so there is nothing to disagree with.
        rows.set(frame.key, {
          key: frame.key,
          label: frame.label,
          inSet: false,
          imageId: null,
          houseKeys: [],
          missingFor: [],
        });
      }
      const row = rows.get(frame.key);
      // One push per house, because `detail` is already one entry per frame.
      row.houseKeys.push(house.houseKey);
      if (frame.inSet) {
        row.inSet = true;
        row.imageId = row.imageId || frame.imageId;
      } else {
        row.missingFor.push(house);
      }
    }
  }

  const frames = [...rows.values()]
    .map((row) => ({
      key: row.key,
      label: row.label,
      inSet: row.inSet,
      imageId: row.imageId,
      houseKeys: row.houseKeys,
      listCount: row.houseKeys.length,
      /*
        The completes fact, and the bug it exists to prevent.

        The original ledger counted every house missing a frame and called them
        all unlocked by it — so a talent who went and shot it found that
        precisely zero lists had been finished, because the other five were
        still missing something else. A frame completes a house only when it is
        that house's *sole* remaining gap, which is exactly `missing === 1` on a
        house that has not covered it. Anything weaker is `listCount`, and the
        surface says it as its own separate sentence.

        Named in board order: the reader meets these houses in that order, and
        the completes clause is read against the list below it.
      */
      completes: row.missingFor.filter((house) => house.missing === 1).map((house) => house.name),
    }))
    /*
      The sort is the information (§1 not-built #3). Unshot frames first, the
      ones that finish somebody's list ahead of the ones merely on many lists,
      then the most-asked, then alphabetical so the list never reshuffles
      between reads. No imperative is required to say what to shoot first, and
      none is offered.
    */
    .sort(
      (left, right) =>
        Number(left.inSet) - Number(right.inSet) ||
        right.completes.length - left.completes.length ||
        right.listCount - left.listCount ||
        left.label.localeCompare(right.label),
    );

  const withLists = read.filter(({ house }) => house.hasShotList);

  return {
    houses: read.map(({ house }) => house),
    frames,
    totals: {
      // The denominator in "On 6 of 9 lists" and the subject of the verdict:
      // houses that actually publish a list, not houses on the board.
      housesWithLists: withLists.length,
      frames: frames.length,
      inSet: frames.filter((frame) => frame.inSet).length,
    },
  };
}

export default buildCoverage;
