import { describe, test, expect } from 'vitest';
import {
  countsLine,
  digitalsLine,
  feetInches,
  filingHeadline,
  openBoardsLine,
  outsideLines,
  shotsHeadline,
  standingLine,
  windowLine,
  calendarWeeks,
} from '../placementModel';

/* Language rules (pholio-app-language): no scores, odds, percentages or
   outcome promises; no em-dashes or exclamation marks. */
const BANNED = /\b(score|odds|chance|boost|guarantee|discovered|signed|unlock|upgrade|should)\b|%|—|!/i;

const board = (slug, label, rule, state, extra = {}) => ({ slug, label, rule, state, declared: false, range: null, ...extra });

const filing = (over = {}) => ({
  facts: { gender: 'female', heightCm: 168, age: 22, lanes: ['runway', 'commercial'], missing: [] },
  boards: [
    board('editorial', 'Fashion and editorial', 'height', 'below', { range: [175, 183] }),
    board('runway', 'Runway', 'height', 'below', { range: [175, 183], declared: true }),
    board('petite', 'Petite', 'height', 'within', { range: [155, 170] }),
    board('commercial', 'Commercial', 'open', 'open', { declared: true }),
    board('lifestyle', 'Lifestyle', 'open', 'open'),
  ],
  filed: ['petite', 'commercial'],
  declaredOutside: ['runway'],
  fashionOutside: ['editorial'],
  wall: [],
  ...over,
});

describe('filing', () => {
  test('feet and inches', () => {
    expect(feetInches(175)).toBe('5′9″');
    expect(feetInches(182.88)).toBe('6′0″');
  });

  test('headline names the boards the stats sit in', () => {
    const head = filingHeadline(filing());
    expect(head.text).toBe('On your stats, agencies would usually file you for petite and commercial.');
    expect(head.sub).toMatch(/168 cm \(5′6″\)/);
  });

  test('missing stats ask for them, with a link', () => {
    const head = filingHeadline(filing({ facts: { missing: ['height'], lanes: [] } }));
    expect(head.link.to).toContain('appearance');
    expect(head.sub).toMatch(/Add your height/);
  });

  test('a declared board outside its range is said plainly, with numbers', () => {
    const lines = outsideLines(filing());
    expect(lines[0]).toBe(
      "You list runway. Runway boards typically cast women from 175 cm (5′9″) to 183 cm (6′0″); you are 168 cm (5′6″).",
    );
    // The fashion range is the same range; said once.
    expect(lines).toHaveLength(1);
    expect(outsideLines(filing({ declaredOutside: [] }))[0]).toMatch(/^Fashion and editorial boards typically cast/);
  });

  test('open boards are named, and only declared ones claimed', () => {
    expect(openBoardsLine(filing())).toBe('Commercial and lifestyle boards do not cast to a height range. You list commercial.');
  });
});

describe('digitals', () => {
  test('a passed due date is said as passed, never as current', () => {
    const now = new Date('2026-10-04T12:00:00');
    expect(digitalsLine({ has: true, state: 'aging', capturedOn: '2026-06-09', dueOn: '2026-09-07' }, now))
      .toMatch(/Due for a new set since/);
    expect(digitalsLine({ has: true, state: 'current', capturedOn: '2026-09-09', dueOn: '2026-12-07' }, now))
      .toMatch(/Current until/);
  });
});

describe('agencies', () => {
  test('counts are plain counts', () => {
    const agencies = [{ group: 'go' }, { group: 'go' }, { group: 'waiting' }, { group: 'later' }];
    expect(countsLine(agencies)).toBe('2 agencies to approach now, 1 waiting to hear and 1 to try again later.');
  });

  test('try-again dates come from what the agency said', () => {
    expect(standingLine({ history: { standing: 'closed', reason: 'board_full', again: 'later', againOn: '2027-02-01T00:00:00Z' } }))
      .toMatch(/^Board was full\. Worth trying again from /);
    expect(standingLine({ history: { standing: 'closed', reason: 'market', again: 'never' } }))
      .toBe('Another market suits you better.');
    expect(standingLine({ history: { standing: 'closed', reason: 'materials', again: 'on_new_digitals' } }))
      .toMatch(/once you have new digitals/);
  });

  test('open call times stay in the agency time zone', () => {
    expect(windowLine({ label: 'Walk-in open call', weekday: 4, startMinute: 900, endMinute: 960, timezone: 'America/New_York' }))
      .toBe('Walk-in open call, Thursdays, 3pm to 4pm New York time');
    expect(windowLine({ label: 'Walk-in open call', weekday: 2, startMinute: null, endMinute: null, timezone: 'America/New_York' }))
      .toBe('Walk-in open call, Tuesdays');
  });
});

describe('calendar', () => {
  test('groups dated events into five week rows', () => {
    const weeks = calendarWeeks({ from: '2026-10-05', days: 35, events: [{ date: '2026-10-07', kind: 'open_call' }] });
    expect(weeks).toHaveLength(5);
    expect(weeks[0][2].events).toHaveLength(1);
  });
});

describe('copy discipline', () => {
  test('nothing scores, promises, or shouts', () => {
    const lines = [
      filingHeadline(filing()).text,
      filingHeadline(filing()).sub,
      filingHeadline(filing({ filed: [] })).text,
      filingHeadline(filing({ filed: [] })).sub,
      ...outsideLines(filing()),
      openBoardsLine(filing()),
      shotsHeadline([{ label: 'Full length', agencies: 9, state: 'missing' }]),
      shotsHeadline([{ label: 'Profile', agencies: 7, state: 'unconfirmed' }]),
      shotsHeadline([{ label: 'Close-up', agencies: 9, state: 'in_book' }]),
      digitalsLine({ has: false }),
      digitalsLine({ has: true, state: 'stale', capturedOn: '2026-01-02' }),
      digitalsLine({ has: true, state: 'current', capturedOn: '2026-09-02', dueOn: '2026-12-02' }),
      standingLine({ history: { standing: 'waiting', closesAt: '2026-11-01T00:00:00Z' } }),
      standingLine({ history: { standing: 'your_move' } }),
    ];
    for (const line of lines) expect(line).not.toMatch(BANNED);
  });
});
