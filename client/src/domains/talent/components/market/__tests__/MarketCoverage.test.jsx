import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import MarketCoverage from '../MarketCoverage';

/**
 * The strip on its own. The engine and the hook are verified in their own
 * suites; what is asserted here is the reading — which state renders which
 * sentence, and that the sentences stay the ones that were reasoned about.
 */

const hook = vi.hoisted(() => ({ result: null, calls: [], refetch: null }));

vi.mock('../useMarketCoverage', () => ({
  default: (houses, options) => {
    hook.calls.push({ houses, options });
    return hook.result;
  },
}));

function state(over = {}) {
  return { coverage: null, isLoading: false, error: null, refetch: hook.refetch, ...over };
}

function frame(over = {}) {
  return {
    key: over.label || 'full-length',
    label: 'Full length',
    inSet: false,
    imageId: null,
    houseKeys: [],
    listCount: 1,
    completes: [],
    ...over,
  };
}

function coverageOf(
  frames,
  { housesWithLists = 9, houses = [], shotCountSpan = null, formFacts = null } = {},
) {
  return {
    houses,
    frames,
    shotCountSpan,
    formFacts,
    totals: {
      housesWithLists,
      frames: frames.length,
      inSet: frames.filter((f) => f.inSet).length,
    },
  };
}

const IMAGES = [
  { id: 'img-1', public_url: 'https://cdn.example.com/one.jpg' },
  { id: 'img-2', path: 'two.jpg' },
];

const HOUSES = [{ key: 'ford', name: 'Ford' }, { key: 'muse', name: 'Muse' }];

/**
 * The ten published specs, as the engine tallies them: an email address on 9 of
 * the 10 forms, a first and a last name and a date of birth on 8, and so on
 * down to the guardian cluster on 4 — which is exempt from the threshold and
 * gets a sentence of its own (Amendment 1a).
 */
const FORM_FACTS = {
  fields: [
    { field: 'contact.email', label: 'Email', houses: 9 },
    { field: 'applicant.date_of_birth', label: 'Date of birth', houses: 8 },
    { field: 'applicant.first_name', label: 'First name', houses: 8 },
    { field: 'applicant.last_name', label: 'Last name', houses: 8 },
    { field: 'social.instagram', label: 'Instagram', houses: 7 },
    { field: 'contact.phone', label: 'Phone', houses: 7 },
    { field: 'contact.city', label: 'City', houses: 6 },
    { field: 'measurements.height', label: 'Height', houses: 6 },
    { field: 'social.tiktok', label: 'TikTok', houses: 5 },
    { field: 'guardian.approval', label: 'Guardian approval', houses: 4 },
    { field: 'guardian.email', label: 'Guardian email', houses: 4 },
    { field: 'guardian.name', label: 'Guardian name', houses: 4 },
    { field: 'guardian.phone', label: 'Guardian phone', houses: 4 },
  ],
  formsPublished: 10,
  shownThreshold: 5,
};

/** The amendment's own example, verbatim. */
const FORM_SENTENCE =
  'The application forms ask for the same few facts: an email address (9 of 10), ' +
  'name and date of birth (8), a phone number and Instagram (7), height and city (6), ' +
  'TikTok (5), along with each form\u2019s own remaining fields — open a house for its list.';

/** The guardian cluster's own sentence, for the same ten forms. */
const MINORS_SENTENCE =
  'For minors, 4 of the 10 forms also ask for a parent or guardian\u2019s details.';

function formFactsOf(fields, over = {}) {
  return { fields, formsPublished: 10, shownThreshold: 5, ...over };
}

/** The standard state: some shot, some not, one frame finishing one list. */
const PARTIAL = coverageOf(
  [
    frame({ key: 'profile', label: 'Profile', listCount: 3, completes: ['Ford'] }),
    frame({
      key: 'close-up-back',
      label: 'Close-up, hair pulled back',
      listCount: 2,
      completes: ['Ford', 'Muse'],
    }),
    frame({ key: 'full-length', label: 'Full length', inSet: true, imageId: 'img-1', listCount: 9 }),
    frame({ key: 'waist-up', label: 'Waist up', inSet: true, imageId: 'img-2', listCount: 6 }),
  ],
  {
    housesWithLists: 9,
    shotCountSpan: { min: 3, max: 6, houses: 9 },
    formFacts: FORM_FACTS,
  },
);

function open(ui = <MarketCoverage houses={HOUSES} images={IMAGES} />) {
  const view = render(ui);
  fireEvent.click(screen.getByRole('button', { name: 'Read' }));
  return view;
}

beforeEach(() => {
  hook.calls = [];
  hook.refetch = vi.fn();
  hook.result = state();
});

describe('MarketCoverage — closed', () => {
  it('is one line and one control, and asks for nothing', () => {
    render(<MarketCoverage houses={HOUSES} images={IMAGES} />);

    expect(
      screen.getByRole('heading', { name: 'What these houses publish, read as one.' }),
    ).toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: 'Read' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', 'mcov-panel');
    expect(document.getElementById('mcov-panel')).toBeNull();

    // Closed is the whole point: no fetch is enabled until it opens.
    expect(hook.calls.every((call) => call.options.enabled === false)).toBe(true);
  });

  it('names the section with its own heading', () => {
    const { container } = render(<MarketCoverage houses={HOUSES} images={IMAGES} />);
    const section = container.querySelector('section');
    expect(section).toHaveAttribute('aria-labelledby', 'mcov-title');
    expect(document.getElementById('mcov-title')).toHaveTextContent(
      'What these houses publish, read as one.',
    );
  });
});

describe('MarketCoverage — opening', () => {
  it('enables the fetch and turns the control into Close', () => {
    hook.result = state({ coverage: PARTIAL });
    open();

    expect(hook.calls.at(-1).options.enabled).toBe(true);
    const toggle = screen.getByRole('button', { name: 'Close' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById('mcov-panel')).not.toBeNull();
  });

  it('hands the hook the houses and the images', () => {
    hook.result = state({ coverage: PARTIAL });
    open();
    const call = hook.calls.at(-1);
    expect(call.houses).toBe(HOUSES);
    expect(call.options.images).toBe(IMAGES);
  });
});

describe('MarketCoverage — waiting and failing', () => {
  it('waits in the brief’s voice', () => {
    hook.result = state({ isLoading: true });
    open();
    expect(screen.getByRole('status')).toHaveTextContent('Reading what the houses publish…');
  });

  it('reports a failed read and offers the retry', () => {
    hook.result = state({ error: new Error('503') });
    open();

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('The market’s lists couldn’t be read.');
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(hook.refetch).toHaveBeenCalledTimes(1);
  });
});

describe('MarketCoverage — the short states', () => {
  it('says so when no house publishes a shot list, and shows no list', () => {
    hook.result = state({
      coverage: coverageOf([], {
        housesWithLists: 0,
        houses: [{ houseKey: 'ford', name: 'Ford', hasShotList: false }],
      }),
    });
    open();

    expect(
      screen.getByText(
        'None of these houses publish a shot list. Open a house to see what it does ask for.',
      ),
    ).toBeInTheDocument();
    expect(document.querySelector('.mcov-list')).toBeNull();
  });

  it('sends a lone list back to its own band', () => {
    hook.result = state({
      coverage: coverageOf([frame({ listCount: 1 })], {
        housesWithLists: 1,
        houses: [
          { houseKey: 'ford', name: 'Ford', hasShotList: true },
          { houseKey: 'muse', name: 'Muse', hasShotList: false },
        ],
      }),
    });
    open();

    expect(
      screen.getByText(
        'One house here publishes a shot list — Ford. Its own band reads it in full.',
      ),
    ).toBeInTheDocument();
    expect(document.querySelector('.mcov-list')).toBeNull();
  });
});

describe('MarketCoverage — the list', () => {
  it('states the two numbers and how many are already shot', () => {
    hook.result = state({ coverage: PARTIAL });
    open();

    expect(
      screen.getByText(/9 houses publish a shot list; together the lists come to 4 frames\./),
    ).toBeInTheDocument();
    expect(screen.getByText('2 of 4 already in your set.')).toBeInTheDocument();
  });

  it('carries a count sentence on every row, with the denominator', () => {
    hook.result = state({ coverage: PARTIAL });
    open();

    expect(screen.getByText('On 3 of 9 lists.')).toBeInTheDocument();
    expect(screen.getByText('On 2 of 9 lists.')).toBeInTheDocument();
    expect(screen.getByText('On 9 of 9 lists.')).toBeInTheDocument();
    expect(screen.getAllByText(/^On \d+ of 9 lists\.$/)).toHaveLength(4);
  });

  it('says which single list a frame finishes, and which several', () => {
    hook.result = state({ coverage: PARTIAL });
    open();

    expect(
      screen.getByText('The only frame on Ford’s shot list not in your set.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText('The only frame on the shot lists of Ford and Muse not in your set.'),
    ).toBeInTheDocument();
  });

  it('joins three names without a serial comma', () => {
    hook.result = state({
      coverage: coverageOf(
        [frame({ listCount: 3, completes: ['Ford', 'Muse', 'Elite'] })],
        { housesWithLists: 4 },
      ),
    });
    open();

    expect(
      screen.getByText(
        'The only frame on the shot lists of Ford, Muse and Elite not in your set.',
      ),
    ).toBeInTheDocument();
  });

  it('says nothing stronger than the count when a frame finishes nobody', () => {
    hook.result = state({
      coverage: coverageOf(
        [
          frame({ key: 'a', label: 'Full length', listCount: 6 }),
          frame({ key: 'b', label: 'Profile', listCount: 4 }),
        ],
        { housesWithLists: 9 },
      ),
    });
    open();

    expect(document.body.textContent).not.toContain('The only frame');
    expect(screen.getByText('On 6 of 9 lists.')).toBeInTheDocument();
  });

  it('draws the photograph for a shot frame and leaves the rest empty', () => {
    hook.result = state({ coverage: PARTIAL });
    const { container } = open();

    const images = container.querySelectorAll('.mcov-frame__img');
    expect(images).toHaveLength(2);
    expect(images[0]).toHaveAttribute('src', 'https://cdn.example.com/one.jpg');
    expect(images[1]).toHaveAttribute('src', '/uploads/two.jpg');
    images.forEach((img) => expect(img).toHaveAttribute('alt', ''));

    // Four rows, two photographs — the other two frames are simply empty.
    expect(container.querySelectorAll('.mcov-frame')).toHaveLength(4);
  });

  it('states membership of the set in words, on covered rows only', () => {
    hook.result = state({ coverage: PARTIAL });
    open();
    expect(screen.getAllByText('In your set.')).toHaveLength(2);
  });

  it('reads the same sentence when nothing is shot yet', () => {
    hook.result = state({
      coverage: coverageOf(
        [frame({ key: 'a', listCount: 9 }), frame({ key: 'b', label: 'Profile', listCount: 5 })],
        { housesWithLists: 9 },
      ),
    });
    const { container } = render(<MarketCoverage houses={HOUSES} images={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Read' }));

    expect(screen.getByText('None of them shot yet.')).toBeInTheDocument();
    expect(container.querySelectorAll('.mcov-frame__img')).toHaveLength(0);
    expect(screen.queryByText('In your set.')).toBeNull();
  });

  it('reads the same sentence when everything is shot', () => {
    hook.result = state({
      coverage: coverageOf(
        [
          frame({ key: 'a', inSet: true, imageId: 'img-1', listCount: 9 }),
          frame({ key: 'b', label: 'Profile', inSet: true, imageId: 'img-2', listCount: 5 }),
        ],
        { housesWithLists: 9 },
      ),
    });
    open();

    expect(screen.getByText('All 2 in your set.')).toBeInTheDocument();
  });

  it('prints the footnote under the list', () => {
    hook.result = state({ coverage: PARTIAL });
    const { container } = open();

    const note = container.querySelector('.mcov-note');
    expect(note).toHaveTextContent(
      'one photograph answers every list that asks for that frame',
    );
    expect(note).toHaveTextContent(
      'not standing with any house',
    );
    expect(note).toHaveTextContent('Open a house for its full brief.');
  });
});

describe('MarketCoverage — the published counts', () => {
  it('runs the span between the lowest floor and the highest ceiling', () => {
    hook.result = state({ coverage: PARTIAL });
    open();
    expect(screen.getByText('The published counts run 3 to 6 images.')).toBeInTheDocument();
  });

  it('collapses to one number when every published count is the same', () => {
    hook.result = state({
      coverage: coverageOf([frame({ listCount: 9 })], {
        housesWithLists: 9,
        shotCountSpan: { min: 4, max: 4, houses: 7 },
      }),
    });
    open();
    expect(screen.getByText('Every published count is 4 images.')).toBeInTheDocument();
  });

  it('says nothing when no house published a structured count', () => {
    hook.result = state({
      coverage: coverageOf([frame({ listCount: 9 })], { housesWithLists: 9, shotCountSpan: null }),
    });
    const { container } = open();
    expect(container.querySelector('.mcov-span')).toBeNull();
    expect(document.body.textContent).not.toContain('published count');
  });

  it('says nothing when only one house published a count', () => {
    hook.result = state({
      coverage: coverageOf([frame({ listCount: 9 })], {
        housesWithLists: 9,
        shotCountSpan: { min: 3, max: 6, houses: 1 },
      }),
    });
    const { container } = open();
    expect(container.querySelector('.mcov-span')).toBeNull();
    expect(document.body.textContent).not.toContain('published count');
  });

  // A market that published floors and no ceilings is real, and has no ruled
  // sentence: it is omitted rather than improvised into one.
  it.each([
    ['no ceiling', { min: 3, max: null, houses: 9 }],
    ['no floor', { min: null, max: 6, houses: 9 }],
  ])('says nothing for a single-sided span — %s', (_name, shotCountSpan) => {
    hook.result = state({
      coverage: coverageOf([frame({ listCount: 9 })], { housesWithLists: 9, shotCountSpan }),
    });
    const { container } = open();
    expect(container.querySelector('.mcov-span')).toBeNull();
    expect(document.body.textContent).not.toContain('published count');
    cleanup();
  });
});

describe('MarketCoverage — their forms', () => {
  it('reads the ten published forms as the amendment reads them', () => {
    hook.result = state({ coverage: PARTIAL });
    const { container } = open();

    expect(screen.getByRole('heading', { name: 'Their forms', level: 3 })).toBeInTheDocument();

    const lines = [...container.querySelectorAll('.mcov-forms__line')].map((p) => p.textContent);
    expect(lines).toEqual([FORM_SENTENCE, MINORS_SENTENCE]);
  });

  it('sits after the frames and before the footnote', () => {
    hook.result = state({ coverage: PARTIAL });
    const { container } = open();

    const order = [...container.querySelectorAll('.mcov-list, .mcov-forms, .mcov-note')].map(
      (node) => node.className,
    );
    expect(order).toEqual(['mcov-list', 'mcov-forms', 'mcov-note']);
  });

  it('folds a first and a last name into one name when the counts agree', () => {
    hook.result = state({
      coverage: coverageOf([frame({ listCount: 9 })], {
        housesWithLists: 9,
        formFacts: formFactsOf([
          { field: 'contact.email', label: 'Email', houses: 9 },
          { field: 'applicant.first_name', label: 'First name', houses: 8 },
          { field: 'applicant.last_name', label: 'Last name', houses: 8 },
        ]),
      }),
    });
    const { container } = open();

    expect(container.querySelector('.mcov-forms__line')).toHaveTextContent(
      'The application forms ask for the same few facts: an email address (9 of 10), name (8), ' +
        'along with each form’s own remaining fields — open a house for its list.',
    );
  });

  it('keeps them apart when the forms disagree about which they ask for', () => {
    hook.result = state({
      coverage: coverageOf([frame({ listCount: 9 })], {
        housesWithLists: 9,
        formFacts: formFactsOf([
          { field: 'applicant.first_name', label: 'First name', houses: 8 },
          { field: 'applicant.last_name', label: 'Last name', houses: 6 },
        ]),
      }),
    });
    const { container } = open();

    expect(container.querySelector('.mcov-forms__line')).toHaveTextContent(
      'The application forms ask for the same few facts: first name (8 of 10), last name (6), ' +
        'along with each form’s own remaining fields — open a house for its list.',
    );
  });

  /**
   * Amendment 1a. The cluster is conditional on who is applying, so it is a
   * sentence and never a bare count in a run of unconditional facts — whichever
   * side of the threshold its count happens to fall.
   */
  it('gives the guardian cluster its own sentence at the highest count', () => {
    hook.result = state({
      coverage: coverageOf([frame({ listCount: 9 })], {
        housesWithLists: 9,
        formFacts: formFactsOf([
          { field: 'contact.email', label: 'Email', houses: 9 },
          { field: 'guardian.name', label: 'Guardian name', houses: 4 },
          { field: 'guardian.phone', label: 'Guardian phone', houses: 3 },
          { field: 'guardian.email', label: 'Guardian email', houses: 3 },
        ]),
      }),
    });
    const { container } = open();

    const lines = [...container.querySelectorAll('.mcov-forms__line')].map((node) => node.textContent);
    expect(lines).toEqual([
      'The application forms ask for the same few facts: an email address (9 of 10), ' +
        'along with each form\u2019s own remaining fields — open a house for its list.',
      'For minors, 4 of the 10 forms also ask for a parent or guardian\u2019s details.',
    ]);
  });

  it('keeps it out of the items even when its count clears the threshold', () => {
    hook.result = state({
      coverage: coverageOf([frame({ listCount: 9 })], {
        housesWithLists: 9,
        formFacts: formFactsOf([
          { field: 'contact.email', label: 'Email', houses: 9 },
          { field: 'guardian.name', label: 'Guardian name', houses: 8 },
          { field: 'guardian.phone', label: 'Guardian phone', houses: 7 },
        ]),
      }),
    });
    const { container } = open();

    const lines = [...container.querySelectorAll('.mcov-forms__line')].map((node) => node.textContent);
    expect(lines).toEqual([
      'The application forms ask for the same few facts: an email address (9 of 10), ' +
        'along with each form\u2019s own remaining fields — open a house for its list.',
      'For minors, 8 of the 10 forms also ask for a parent or guardian\u2019s details.',
    ]);
    // Never an in-list item, at any count.
    expect(lines[0]).not.toContain('guardian');
  });

  it('says nothing about minors when no form asks for a guardian', () => {
    hook.result = state({
      coverage: coverageOf([frame({ listCount: 9 })], {
        housesWithLists: 9,
        formFacts: formFactsOf([{ field: 'contact.email', label: 'Email', houses: 9 }]),
      }),
    });
    const { container } = open();

    expect(container.querySelectorAll('.mcov-forms__line')).toHaveLength(1);
    expect(document.body.textContent).not.toContain('For minors');
  });

  it('opens the block for the guardian sentence alone', () => {
    hook.result = state({
      coverage: coverageOf([frame({ listCount: 9 })], {
        housesWithLists: 9,
        formFacts: formFactsOf([{ field: 'guardian.name', label: 'Guardian name', houses: 4 }]),
      }),
    });
    const { container } = open();

    const lines = [...container.querySelectorAll('.mcov-forms__line')].map((node) => node.textContent);
    expect(lines).toEqual([
      'For minors, 4 of the 10 forms also ask for a parent or guardian\u2019s details.',
    ]);
  });

  it('leaves the tail unnamed but says it is there', () => {
    hook.result = state({ coverage: PARTIAL });
    const { container } = open();
    const line = container.querySelector('.mcov-forms__line');

    // The guardian cluster is never an item — it has its own sentence below.
    expect(line.textContent).not.toContain('guardian');
    expect(line).toHaveTextContent(
      'along with each form’s own remaining fields — open a house for its list.',
    );
  });

  it('names a field the vocabulary has never met by its published label', () => {
    hook.result = state({
      coverage: coverageOf([frame({ listCount: 9 })], {
        housesWithLists: 9,
        formFacts: formFactsOf([
          { field: 'contact.portfolio_url', label: 'Portfolio Link', houses: 9 },
          { field: 'measurements.waist', label: 'Waist', houses: 8 },
        ]),
      }),
    });
    const { container } = open();

    // The proper noun keeps its capitals; the plain noun does not shout.
    expect(container.querySelector('.mcov-forms__line')).toHaveTextContent(
      'The application forms ask for the same few facts: Portfolio Link (9 of 10), waist (8), ' +
        'along with each form’s own remaining fields — open a house for its list.',
    );
  });

  it('is absent when no house published a form', () => {
    hook.result = state({
      coverage: coverageOf([frame({ listCount: 9 })], { housesWithLists: 9, formFacts: null }),
    });
    const { container } = open();
    expect(container.querySelector('.mcov-forms')).toBeNull();
    expect(screen.queryByText('Their forms')).toBeNull();
  });

  it('is absent when nothing reaches the threshold', () => {
    hook.result = state({
      coverage: coverageOf([frame({ listCount: 9 })], {
        housesWithLists: 9,
        formFacts: formFactsOf([{ field: 'contact.email', label: 'Email', houses: 2 }]),
      }),
    });
    const { container } = open();
    expect(container.querySelector('.mcov-forms')).toBeNull();
    expect(screen.queryByText('Their forms')).toBeNull();
  });

  /**
   * A form field is supplied, not satisfied. The block reports what ten
   * documents ask for and says nothing whatever about the reader — no second
   * person, and none of the verbs that would turn an ask into a demand.
   */
  it('never addresses the reader and never says a house demands anything', () => {
    hook.result = state({ coverage: PARTIAL });
    const { container } = open();
    const text = container.querySelector('.mcov-forms').textContent || '';

    expect(text).not.toMatch(/you/i);
    expect(text).not.toMatch(/your set/i);
    for (const verb of ['require', 'want', 'need']) {
      expect(text).not.toMatch(new RegExp(verb, 'i'));
    }
  });
});

/**
 * The words this surface is not allowed to say. Every one of them turns a
 * reading of published documents into advice, a score, or a gate — which is
 * the whole thing the feature exists to avoid.
 */
describe('MarketCoverage — the copy denylist', () => {
  const DENIED = [
    'unlock',
    'boost',
    'chance',
    'odds',
    'improve',
    'qualify',
    'opportunit',
    'score',
    'ready',
    'recommend',
    'should',
    'upgrade',
  ];

  const STATES = {
    loading: state({ isLoading: true }),
    error: state({ error: new Error('503') }),
    'zero lists': state({
      coverage: coverageOf([], { housesWithLists: 0, houses: [] }),
    }),
    'one list': state({
      coverage: coverageOf([frame()], {
        housesWithLists: 1,
        houses: [{ houseKey: 'ford', name: 'Ford', hasShotList: true }],
      }),
    }),
    'no images': state({
      coverage: coverageOf([frame({ key: 'a', listCount: 9 }), frame({ key: 'b', listCount: 1 })], {
        housesWithLists: 9,
      }),
    }),
    partial: state({ coverage: PARTIAL }),
    'all covered': state({
      coverage: coverageOf(
        [frame({ key: 'a', inSet: true, imageId: 'img-1', listCount: 9 })],
        { housesWithLists: 9 },
      ),
    }),
    // The amendment's own additions, both on: the count line and Their forms.
    'counts and forms': state({
      coverage: coverageOf([frame({ key: 'a', listCount: 9 })], {
        housesWithLists: 9,
        shotCountSpan: { min: 3, max: 6, houses: 9 },
        formFacts: FORM_FACTS,
      }),
    }),
    'one published count': state({
      coverage: coverageOf([frame({ key: 'a', listCount: 9 })], {
        housesWithLists: 9,
        shotCountSpan: { min: 4, max: 4, houses: 6 },
        formFacts: formFactsOf([
          { field: 'guardian.name', label: 'Guardian name', houses: 9 },
          { field: 'applicant.gender', label: 'Gender', houses: 6 },
        ]),
      }),
    }),
  };

  it.each(Object.keys(STATES))('never says a denied word — %s', (name) => {
    hook.result = STATES[name];
    open();
    const text = document.body.textContent || '';

    for (const word of DENIED) {
      // Word-start boundary: "already" is mandated copy and must not trip
      // "ready", but "readiness" or "unlocked" still must.
      expect(text).not.toMatch(new RegExp(`\\b${word}`, 'i'));
    }
    expect(text).not.toContain('%');
    expect(text).not.toMatch(/studio\s*\+/i);
    expect(text).not.toMatch(/\bplan\b/i);

    cleanup();
  });

  it('renders the closed strip without a denied word either', () => {
    render(<MarketCoverage houses={HOUSES} images={IMAGES} />);
    const text = document.body.textContent || '';
    for (const word of DENIED) {
      expect(text).not.toMatch(new RegExp(`\\b${word}`, 'i'));
    }
  });
});
