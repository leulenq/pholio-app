import { describe, expect, test } from 'vitest';
import { OUTCOME } from '../specRegistry';
import { buildCoverage, coverageSeriesIds } from '../coverageModel';

/**
 * The engine behind "the market's shot lists, read as one".
 *
 * These are honesty properties before they are unit tests. The surface built on
 * this model tells a talent that one photograph would finish a named house's
 * published list; the predecessor shipped that sentence computed from "every
 * house missing this shot", which was false for all but the one-gap house.
 * Every assertion here exists to keep a sentence true.
 *
 * Fixtures mirror `findingDto` / `registryTaxonomyLabels` in
 * `src/domains/spec-registry/preflight-service.js`.
 */

/** A slice of the real taxonomy pack, exactly as the DTO ships it. */
const labels = {
  'shot.frame': {
    label: 'Shot frame',
    values: {
      full_length: { label: 'Full length' },
      close_up: { label: 'Close-up' },
      mid_length: { label: 'Mid-length' },
      headshot: { label: 'Headshot' },
    },
  },
  'shot.view': { label: 'Shot view', values: { profile: { label: 'Profile' } } },
  'appearance.hair_state': {
    label: 'Hair state',
    values: { pulled_back: { label: 'Pulled back' }, up: { label: 'Hair up' } },
  },
};

/**
 * One published shot slot.
 *
 * `matchKey` defaults to the terms it carries — that is the cross-house
 * identity the server computes — and passing `matchKey: null` reproduces a slot
 * nothing can be compared against, which is the fallback path this suite has to
 * exercise on purpose.
 */
function shot(frame, options = {}) {
  const { outcome = OUTCOME.MISSING, imageId = null, view = null, hair = null } = options;
  const terms = [{ field: 'shot.frame', operator: 'equals', value: frame }];
  if (view) terms.push({ field: 'shot.view', operator: 'equals', value: view });
  if (hair) terms.push({ field: 'appearance.hair_state', operator: 'equals', value: hair });

  const slotKey = options.slotKey || ['slot', frame, view, hair].filter(Boolean).join(':');
  const matchKey =
    'matchKey' in options
      ? options.matchKey
      : terms.map((term) => `${term.field}=${term.value}`).join('|');

  return {
    id: slotKey,
    slotKey,
    categoryKey: 'shots',
    category: 'Shots',
    matchKey,
    matchValue: frame,
    matchValues: terms,
    field: 'shot.frame',
    modality: 'required',
    outcome,
    assignments: imageId ? [{ imageId, slotKey }] : [],
  };
}

/** A published requirement that is not a shot. Never counted, never a row. */
const measurement = {
  id: 'measure:height',
  slotKey: 'measure:height',
  categoryKey: 'eligibility',
  category: 'Eligibility',
  matchKey: 'measurements.height',
  matchValue: null,
  matchValues: [],
  field: 'measurements.height',
  outcome: OUTCOME.MISSING,
  assignments: [],
};

const slug = (name) => name.toLowerCase().replace(/\s+/g, '-');

/**
 * A market, declared the way a talent meets it: houses, each with one or more
 * published routes, each route publishing a list of shots.
 */
function marketOf(spec) {
  const evaluations = new Map();

  const houses = spec.map(({ name, lists }) => ({
    key: slug(name),
    name,
    routes: (lists || []).map((findings, index) => {
      const seriesId = `${slug(name)}-${index + 1}`;
      evaluations.set(seriesId, { seriesId, findings });
      return { seriesId };
    }),
  }));

  return {
    houses,
    labels,
    evaluationFor: (seriesId) => evaluations.get(seriesId) || null,
  };
}

const frameNamed = (view, label) => view.frames.find((frame) => frame.label === label);
const houseNamed = (view, name) => view.houses.find((house) => house.name === name);

describe('coverageSeriesIds', () => {
  test('every series the market publishes, once, in a stable order', () => {
    // It is a React Query key before it is a list: the same market has to hash
    // the same however the directory arrived.
    const houses = [
      { key: 'muse', routes: [{ seriesId: 'muse-ny' }, { seriesId: 'muse-ny' }] },
      { key: 'elite', routes: [{ seriesId: 'elite-tokyo' }, { seriesId: 'elite-paris' }] },
    ];

    expect(coverageSeriesIds(houses)).toEqual(['elite-paris', 'elite-tokyo', 'muse-ny']);
  });

  test('a house Pholio holds no series for contributes nothing', () => {
    const houses = [
      { key: 'ford', routes: [{ seriesId: 'ford-ny' }] },
      { key: 'local', routes: [{}, { seriesId: null }] },
      { key: 'empty' },
    ];

    expect(coverageSeriesIds(houses)).toEqual(['ford-ny']);
    expect(coverageSeriesIds()).toEqual([]);
  });
});

describe('frame identity', () => {
  test('the same requirement published by two houses is one frame', () => {
    const view = buildCoverage(
      marketOf([
        { name: 'Ford', lists: [[shot('full_length'), shot('close_up')]] },
        { name: 'Muse', lists: [[shot('full_length')]] },
      ]),
    );

    expect(view.frames.map((frame) => frame.label)).toEqual(['Full length', 'Close-up']);
    expect(frameNamed(view, 'Full length').listCount).toBe(2);
    expect(frameNamed(view, 'Close-up').listCount).toBe(1);
  });

  test('genuinely different pictures stay separate rows', () => {
    // Elite's "Close-up, hair pulled back" and Muse's "Close-up, hair up" are
    // two photographs. Merging them would tell a talent they had shot one of
    // them when they had shot the other.
    const view = buildCoverage(
      marketOf([
        { name: 'Elite', lists: [[shot('close_up', { hair: 'pulled_back' })]] },
        { name: 'Muse', lists: [[shot('close_up', { hair: 'up' })]] },
      ]),
    );

    expect(view.frames.map((frame) => frame.label)).toEqual([
      'Close-up, hair pulled back',
      'Close-up, hair up',
    ]);
    expect(view.frames.every((frame) => frame.listCount === 1)).toBe(true);
  });

  test('a slot with no cross-house identity still gets its own row', () => {
    // `matchKey` null is the slot nothing can be compared against. It falls back
    // to `slotKey` rather than being dropped, so no published shot leaves the
    // union list unnoticed.
    const view = buildCoverage(
      marketOf([
        {
          name: 'Ford',
          lists: [
            [
              shot('full_length', { matchKey: null, slotKey: 'ford:a' }),
              shot('full_length', { matchKey: null, slotKey: 'ford:b' }),
            ],
          ],
        },
      ]),
    );

    expect(view.frames).toHaveLength(2);
    expect(view.frames.map((frame) => frame.key)).toEqual(['ford:a', 'ford:b']);
    expect(view.totals.frames).toBe(2);
  });

  test('no shot is lost and none is counted twice', () => {
    const view = buildCoverage(
      marketOf([
        {
          name: 'Elite',
          lists: [[shot('full_length'), shot('close_up', { hair: 'pulled_back' })]],
        },
        { name: 'Muse', lists: [[shot('full_length'), shot('close_up', { hair: 'up' })]] },
        { name: 'Ford', lists: [[shot('full_length'), shot('mid_length')]] },
      ]),
    );

    // Six published slots, four distinct frames, and every (house, frame) pair
    // accounted for exactly once across the rows.
    expect(view.frames).toHaveLength(4);
    const pairs = view.frames.reduce((total, frame) => total + frame.listCount, 0);
    expect(pairs).toBe(6);
    view.frames.forEach((frame) => {
      expect(new Set(frame.houseKeys).size).toBe(frame.houseKeys.length);
    });
  });

  test('a slot the house does not ask this talent for is not a row', () => {
    // `not_applicable` is the registry saying the slot does not apply here. It
    // is not a gap, so it never appears in the union list or in `missing`.
    const view = buildCoverage(
      marketOf([
        {
          name: 'Ford',
          lists: [[shot('full_length'), shot('close_up', { outcome: OUTCOME.NOT_APPLICABLE })]],
        },
      ]),
    );

    expect(view.frames.map((frame) => frame.label)).toEqual(['Full length']);
    expect(houseNamed(view, 'Ford').missing).toBe(1);
  });
});

describe('houses, not routes', () => {
  test('two offices of one house asking the same frame count once', () => {
    // Elite Paris and Elite Tokyo are one house to a talent. "On 2 of 2 lists"
    // when only two houses published would be a fabricated market.
    const view = buildCoverage(
      marketOf([
        { name: 'Elite', lists: [[shot('full_length')], [shot('full_length')]] },
        { name: 'Muse', lists: [[shot('full_length')]] },
      ]),
    );

    expect(frameNamed(view, 'Full length').listCount).toBe(2);
    expect(frameNamed(view, 'Full length').houseKeys).toEqual(['elite', 'muse']);
    expect(houseNamed(view, 'Elite').frames.size).toBe(1);
    expect(houseNamed(view, 'Elite').missing).toBe(1);
    expect(view.totals.housesWithLists).toBe(2);
  });

  test('a frame one route matched is in the set for the whole house', () => {
    // Preflight spends each photograph on at most one slot, so a longer list
    // can leave unplaced what a shorter one placed. The talent still has it.
    const view = buildCoverage(
      marketOf([
        {
          name: 'Elite',
          lists: [
            [shot('full_length'), shot('close_up')],
            [shot('full_length', { outcome: OUTCOME.SATISFIED, imageId: 'img-1' })],
          ],
        },
      ]),
    );

    const elite = houseNamed(view, 'Elite');
    expect(elite.covered).toBe(1);
    expect(elite.missing).toBe(1);
    expect(frameNamed(view, 'Full length').inSet).toBe(true);
    expect(frameNamed(view, 'Full length').imageId).toBe('img-1');
  });

  test('measurements and form fields are never a frame and never a gap', () => {
    // `missing` drives the completes sentence, and that sentence names a shot
    // list. A house missing a height would make it false.
    const view = buildCoverage(
      marketOf([{ name: 'Ford', lists: [[shot('full_length'), measurement]] }]),
    );

    expect(view.frames).toHaveLength(1);
    expect(houseNamed(view, 'Ford').missing).toBe(1);
  });
});

describe('completes', () => {
  test('a frame completes a house only when it is that house’s sole gap', () => {
    const view = buildCoverage(
      marketOf([
        {
          // One gap left, and this frame is it.
          name: 'Ford',
          lists: [[shot('full_length'), shot('close_up', { outcome: OUTCOME.SATISFIED, imageId: 'img-1' })]],
        },
        {
          // Also missing the full length, but missing a mid-length too.
          name: 'Muse',
          lists: [[shot('full_length'), shot('mid_length')]],
        },
      ]),
    );

    expect(houseNamed(view, 'Ford').missing).toBe(1);
    expect(houseNamed(view, 'Muse').missing).toBe(2);
    expect(frameNamed(view, 'Full length').completes).toEqual(['Ford']);
    // Muse is on the count and nowhere else. "On 2 of 2 lists" is all that can
    // be said about it.
    expect(frameNamed(view, 'Full length').listCount).toBe(2);
    // Nothing is the sole gap of a house that has no gap left there.
    expect(frameNamed(view, 'Mid-length').completes).toEqual([]);
  });

  test('a frame that finishes nobody’s list carries no completes at all', () => {
    // The surface builds "The only frame on …'s shot list not in your set."
    // from this array; empty is what makes that sentence unconstructable.
    const view = buildCoverage(
      marketOf([
        { name: 'Ford', lists: [[shot('full_length'), shot('close_up')]] },
        { name: 'Muse', lists: [[shot('full_length'), shot('mid_length')]] },
      ]),
    );

    expect(view.frames.every((frame) => frame.completes.length === 0)).toBe(true);
  });

  test('six houses missing this frame among others unlock nothing (the ledger bug)', () => {
    /*
      The regression that named this feature. The old ledger counted every house
      missing a shot and called them all unlocked by it, so a talent who shot it
      found precisely zero lists finished — the other five were still missing
      something else. Six lists asking is six lists asking, and nothing more.
    */
    const asking = Array.from({ length: 6 }, (unused, index) => ({
      name: `House ${index + 1}`,
      lists: [[shot('full_length'), shot('close_up')]],
    }));
    const others = Array.from({ length: 3 }, (unused, index) => ({
      name: `Other ${index + 1}`,
      lists: [[shot('close_up')]],
    }));

    const view = buildCoverage(marketOf([...asking, ...others]));
    const fullLength = frameNamed(view, 'Full length');

    expect(fullLength.completes).toEqual([]);
    expect(fullLength.listCount).toBe(6);
    expect(view.totals.housesWithLists).toBe(9);
    // Every one of the six is two gaps deep, so not one of them is finished by
    // this frame — which is exactly what `completes` being empty says.
    fullLength.houseKeys.forEach((key) => {
      expect(view.houses.find((house) => house.houseKey === key).missing).toBe(2);
    });
    // The three one-gap houses here are the ones that only ask for a close-up,
    // and it is the close-up that finishes them, not the full length.
    expect(frameNamed(view, 'Close-up').completes).toEqual(['Other 1', 'Other 2', 'Other 3']);
    expect(frameNamed(view, 'Close-up').listCount).toBe(9);
  });

  test('several houses one frame away are all named, in board order', () => {
    const view = buildCoverage(
      marketOf([
        { name: 'Ford', lists: [[shot('full_length')]] },
        { name: 'Muse', lists: [[shot('full_length')]] },
        { name: 'Elite', lists: [[shot('full_length'), shot('close_up')]] },
      ]),
    );

    expect(frameNamed(view, 'Full length').completes).toEqual(['Ford', 'Muse']);
    expect(frameNamed(view, 'Full length').listCount).toBe(3);
  });
});

describe('the photograph that answers a frame', () => {
  test('a covered row carries the image the evaluation matched', () => {
    const view = buildCoverage(
      marketOf([
        {
          name: 'Ford',
          lists: [[shot('full_length', { outcome: OUTCOME.SATISFIED, imageId: 'img-7' })]],
        },
        { name: 'Muse', lists: [[shot('full_length')]] },
      ]),
    );

    const fullLength = frameNamed(view, 'Full length');
    expect(fullLength.inSet).toBe(true);
    expect(fullLength.imageId).toBe('img-7');
    // Still Muse's gap, and Muse's only one.
    expect(fullLength.completes).toEqual(['Muse']);
  });

  test('a talent with no photographs gets the whole list, all of it unshot', () => {
    // The union list is most valuable before the first shoot, so this is a
    // full list rather than an empty state.
    const view = buildCoverage(
      marketOf([
        { name: 'Ford', lists: [[shot('full_length'), shot('close_up')]] },
        { name: 'Muse', lists: [[shot('full_length'), shot('mid_length')]] },
      ]),
    );

    expect(view.frames).toHaveLength(3);
    expect(view.frames.every((frame) => frame.inSet === false)).toBe(true);
    expect(view.frames.every((frame) => frame.imageId === null)).toBe(true);
    // The verdict's em-clause reads "None of them shot yet." off this.
    expect(view.totals.inSet).toBe(0);
  });
});

describe('the totals the verdict is written from', () => {
  test('houses that publish a list are the ones counted', () => {
    const view = buildCoverage(
      marketOf([
        { name: 'Ford', lists: [[shot('full_length')]] },
        { name: 'Muse', lists: [[shot('full_length'), shot('close_up')]] },
        // Researched, but nothing published about shots.
        { name: 'Quiet House', lists: [[measurement]] },
        // On the board with no registry series at all.
        { name: 'Unread House', lists: [] },
      ]),
    );

    expect(view.totals).toEqual({ housesWithLists: 2, frames: 2, inSet: 0 });
    expect(houseNamed(view, 'Quiet House').hasShotList).toBe(false);
    expect(houseNamed(view, 'Unread House').seriesIds).toEqual([]);
    expect(view.houses).toHaveLength(4);
  });

  test('every frame shot reads as all of them, not as a different register', () => {
    const view = buildCoverage(
      marketOf([
        {
          name: 'Ford',
          lists: [
            [
              shot('full_length', { outcome: OUTCOME.SATISFIED, imageId: 'img-1' }),
              shot('close_up', { outcome: OUTCOME.SATISFIED, imageId: 'img-2' }),
            ],
          ],
        },
        {
          name: 'Muse',
          lists: [[shot('full_length', { outcome: OUTCOME.SATISFIED, imageId: 'img-1' })]],
        },
      ]),
    );

    // "All 2 in your set." is totals.inSet === totals.frames, said once.
    expect(view.totals.inSet).toBe(view.totals.frames);
    expect(view.totals.frames).toBe(2);
    expect(view.houses.every((house) => house.missing === 0)).toBe(true);
    expect(view.frames.every((frame) => frame.completes.length === 0)).toBe(true);
  });

  test('one list is one house’s brief, and no market at all is no list', () => {
    // The surface refuses to draw a union of one — that is the house's own band
    // — and says so from these numbers rather than from an empty array.
    const single = buildCoverage(
      marketOf([
        { name: 'Ford', lists: [[shot('full_length')]] },
        { name: 'Quiet House', lists: [[measurement]] },
      ]),
    );
    expect(single.totals.housesWithLists).toBe(1);
    expect(single.houses.filter((house) => house.hasShotList).map((house) => house.name)).toEqual([
      'Ford',
    ]);

    const none = buildCoverage(
      marketOf([
        { name: 'Quiet House', lists: [[measurement]] },
        { name: 'Unread House', lists: [] },
      ]),
    );
    expect(none.totals).toEqual({ housesWithLists: 0, frames: 0, inSet: 0 });
    expect(none.frames).toEqual([]);
  });

  test('nothing at all builds an empty market rather than throwing', () => {
    expect(buildCoverage()).toEqual({
      houses: [],
      frames: [],
      totals: { housesWithLists: 0, frames: 0, inSet: 0 },
    });
  });
});

describe('order', () => {
  test('unshot first, then what finishes a list, then the most asked, then a to z', () => {
    /*
      The sort is the whole recommendation. There is no `recommendation` field
      and no imperative anywhere; this order is what says it.
    */
    const view = buildCoverage(
      marketOf([
        {
          name: 'Ford',
          lists: [[shot('close_up'), shot('headshot', { outcome: OUTCOME.SATISFIED, imageId: 'img-1' })]],
        },
        { name: 'Muse', lists: [[shot('close_up'), shot('full_length'), shot('mid_length')]] },
        { name: 'Elite', lists: [[shot('full_length'), shot('mid_length')]] },
        {
          name: 'Storm',
          lists: [
            [
              shot('full_length'),
              shot('mid_length'),
              shot('headshot', { outcome: OUTCOME.SATISFIED, imageId: 'img-2' }),
            ],
          ],
        },
      ]),
    );

    expect(view.frames.map((frame) => frame.label)).toEqual([
      // Ford's only remaining gap, on 2 lists.
      'Close-up',
      // Nobody's sole gap; on 3 lists each, so alphabetical decides.
      'Full length',
      'Mid-length',
      // In the set, so last whatever else is true of it.
      'Headshot',
    ]);
    expect(frameNamed(view, 'Close-up').completes).toEqual(['Ford']);
    expect(frameNamed(view, 'Headshot').inSet).toBe(true);
  });

  test('the more-asked frame leads the alphabetically earlier one', () => {
    const view = buildCoverage(
      marketOf([
        { name: 'Ford', lists: [[shot('full_length'), shot('close_up'), shot('mid_length')]] },
        { name: 'Muse', lists: [[shot('full_length'), shot('close_up'), shot('mid_length')]] },
        { name: 'Elite', lists: [[shot('full_length'), shot('mid_length')]] },
      ]),
    );

    expect(view.frames.map((frame) => frame.label)).toEqual([
      'Full length',
      'Mid-length',
      'Close-up',
    ]);
    expect(view.frames.map((frame) => frame.listCount)).toEqual([3, 3, 2]);
  });
});
