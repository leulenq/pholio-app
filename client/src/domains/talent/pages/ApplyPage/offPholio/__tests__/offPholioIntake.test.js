import { describe, expect, test } from 'vitest';
import {
  PREPARE_PAGE_ID,
  channelSentence,
  outboundLabel,
  pagesForTarget,
  prepareGaps,
  readSeriesId,
  todayIso,
} from '../offPholioIntake';

const BASE_PAGES = [
  { id: 'board' },
  { id: 'digitals' },
  { id: 'stats' },
  { id: 'book' },
  { id: 'compcard' },
  { id: 'message' },
  { id: 'review' },
];

describe('pagesForTarget', () => {
  test('leaves a Pholio submission exactly as it was', () => {
    expect(pagesForTarget(BASE_PAGES, false)).toBe(BASE_PAGES);
  });

  test('off Pholio keeps only the steps that reach the agency', () => {
    // Board, book, comp card and message have no carrier off Pholio: the
    // archive holds images, a README, a stats block and an email draft.
    expect(pagesForTarget(BASE_PAGES, true).map((page) => page.id)).toEqual([
      'digitals',
      'stats',
      PREPARE_PAGE_ID,
    ]);
  });

  test('the terminal step is last, so the rail counts to it', () => {
    const pages = pagesForTarget(BASE_PAGES, true);
    expect(pages[pages.length - 1].id).toBe(PREPARE_PAGE_ID);
    expect(pages[pages.length - 1].title).toBe('Prepare & send');
  });

  test('an event step never leaks into an off-Pholio dossier', () => {
    // Event casting inserts its step before review; review is dropped, and the
    // casting step has no organizer to reach.
    const withEvent = [...BASE_PAGES.slice(0, 6), { id: 'event' }, { id: 'review' }];
    expect(pagesForTarget(withEvent, true).map((page) => page.id)).toEqual([
      'digitals',
      'stats',
      PREPARE_PAGE_ID,
    ]);
  });
});

describe('readSeriesId', () => {
  const params = (search) => new URLSearchParams(search);

  test('reads the researched route out of the URL', () => {
    expect(readSeriesId(params('?series=muse-model-management-nyc:email'))).toBe(
      'muse-model-management-nyc:email',
    );
  });

  test('an absent, blank or malformed param is no target at all', () => {
    expect(readSeriesId(params(''))).toBeNull();
    expect(readSeriesId(params('?series='))).toBeNull();
    expect(readSeriesId(params('?series=%20%20'))).toBeNull();
    expect(readSeriesId(undefined)).toBeNull();
  });
});

describe('channelSentence', () => {
  test('an emailed application is named as the different errand it is', () => {
    expect(channelSentence({ channelType: 'official_email' })).toMatch(/by email/);
    expect(channelSentence({ channelType: 'official_email' })).toMatch(/draft message/);
  });

  test('a walk-in is not described as an upload', () => {
    expect(channelSentence({ channelType: 'official_walk_in' })).toMatch(/in person/);
  });

  test('an unknown channel still says something true', () => {
    expect(channelSentence({ channelType: 'carrier_pigeon' })).toMatch(/their own site/);
    expect(channelSentence(null)).toBeNull();
  });
});

describe('outboundLabel', () => {
  test('names the destination for the channel', () => {
    expect(outboundLabel({ channelType: 'official_email' })).toBe('Open their contact page');
    expect(outboundLabel({ channelType: 'official_walk_in' })).toBe(
      'Open their open-call page',
    );
    expect(outboundLabel({ channelType: 'official_web_form' })).toBe(
      'Open their application page',
    );
  });
});

describe('prepareGaps', () => {
  test('an empty set is worth saying out loud', () => {
    const gaps = prepareGaps({ filledSlots: 0, route: { sourceUrl: 'https://x.test' } });
    expect(gaps.map((gap) => gap.key)).toEqual(['digitals']);
  });

  test('a route with no published destination is a gap the talent must know', () => {
    const gaps = prepareGaps({
      filledSlots: 3,
      route: { sourceUrl: null, channelType: 'official_web_form' },
    });
    expect(gaps.map((gap) => gap.key)).toEqual(['destination']);
  });

  test('an email route needs no link to be complete', () => {
    expect(
      prepareGaps({ filledSlots: 3, route: { sourceUrl: null, channelType: 'official_email' } }),
    ).toEqual([]);
  });

  test('nothing is reported when there is nothing to report', () => {
    expect(
      prepareGaps({ filledSlots: 4, route: { sourceUrl: 'https://x.test' } }),
    ).toEqual([]);
  });
});

describe('todayIso', () => {
  test("uses the talent's own calendar day, not UTC's", () => {
    // 8pm in Los Angeles is already tomorrow in UTC. The tracker row must read
    // as the evening it was actually sent.
    const localEvening = new Date(2026, 7, 18, 20, 30);
    expect(todayIso(localEvening)).toBe('2026-08-18');
  });

  test('pads single-digit months and days', () => {
    expect(todayIso(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
});
