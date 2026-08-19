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

function coverageOf(frames, { housesWithLists = 9, houses = [] } = {}) {
  return {
    houses,
    frames,
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
  { housesWithLists: 9 },
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
      screen.getByRole('heading', { name: 'The market’s shot lists, read as one.' }),
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
      'The market’s shot lists, read as one.',
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
