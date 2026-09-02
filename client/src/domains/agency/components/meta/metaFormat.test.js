import { describe, it, expect } from 'vitest';
import {
  placeParts,
  cityOf,
  recency,
  calendarDate,
  cmToImperial,
  heightFigure,
  measurementFigure,
  ageFigure,
  freshness,
  countLabel,
} from './metaFormat';

/* A fixed "now" so nothing here depends on when it runs. */
const NOW = new Date('2026-08-03T12:00:00Z').getTime();
const ago = (ms) => new Date(NOW - ms).toISOString();
const MIN = 60_000;
const HOUR = 3_600_000;
const DAY = 86_400_000;

describe('placeParts / cityOf', () => {
  it('keeps only the city, which is what a roster row has room for', () => {
    expect(cityOf('Copenhagen, Denmark')).toBe('Copenhagen');
    expect(cityOf('Los Angeles, CA')).toBe('Los Angeles');
    expect(cityOf('Paris')).toBe('Paris');
  });

  it('preserves the full string so nothing is lost from the record', () => {
    expect(placeParts('Copenhagen, Denmark')).toEqual({
      city: 'Copenhagen',
      region: 'Denmark',
      full: 'Copenhagen, Denmark',
    });
  });

  it('resolves a US state to its code rather than echoing the raw string', () => {
    // Delegated to shared/utils/locationFormat, which knows state names.
    expect(placeParts('Los Angeles, California, United States')).toEqual({
      city: 'Los Angeles',
      region: 'CA',
      full: 'Los Angeles, CA',
    });
  });

  it('returns null rather than an empty shell for missing input', () => {
    expect(placeParts('')).toBeNull();
    expect(placeParts('   ')).toBeNull();
    expect(placeParts(null)).toBeNull();
    expect(cityOf(undefined)).toBeNull();
  });

  it('survives a leading comma without producing an empty city', () => {
    expect(placeParts(', Denmark')).toBeNull();
  });
});

/* These cases are exactly where the five previous implementations disagreed.
   Pinning them is the point of the whole module. */
describe('recency', () => {
  it('uses sentence case — these render standalone in cells', () => {
    expect(recency(ago(10_000), NOW).label).toBe('Just now');
  });

  it('reads one day as a word, not as a figure', () => {
    expect(recency(ago(DAY + HOUR), NOW).label).toBe('Yesterday');
  });

  it('counts minutes, hours and days in their own band', () => {
    expect(recency(ago(5 * MIN), NOW).label).toBe('5m ago');
    expect(recency(ago(3 * HOUR), NOW).label).toBe('3h ago');
    expect(recency(ago(6 * DAY), NOW).label).toBe('6d ago');
  });

  it('falls back to a date past two weeks — "47d ago" is not a date', () => {
    expect(recency(ago(47 * DAY), NOW).label).toBe('17 Jun');
  });

  it('shows the year only once it is not the current one', () => {
    expect(calendarDate('2026-03-12T00:00:00Z', NOW)).toBe('12 Mar');
    expect(calendarDate('2025-03-12T00:00:00Z', NOW)).toBe('12 Mar 2025');
  });

  it('returns null for missing input — the em-dash is the component\'s call', () => {
    expect(recency(null)).toBeNull();
    expect(recency('')).toBeNull();
    expect(recency('not-a-date')).toBeNull();
  });

  it('degrades a future timestamp to "Just now" rather than a negative age', () => {
    expect(recency(new Date(NOW + HOUR).toISOString(), NOW).label).toBe('Just now');
  });

  it('carries the machine-readable timestamp for the <time> element', () => {
    expect(recency(ago(DAY), NOW).iso).toBe(new Date(NOW - DAY).toISOString());
  });
});

describe('cmToImperial', () => {
  it('never produces an impossible inch value', () => {
    // 182cm rounds to 72in exactly. Flooring feet before rounding the
    // remainder yields 5′ 12″ here, which was the original bug.
    expect(cmToImperial(182)).toBe('6′ 0″');
    expect(cmToImperial(178)).toBe('5′ 10″');
  });

  it('rejects non-positive and unparseable input', () => {
    expect(cmToImperial(0)).toBeNull();
    expect(cmToImperial(-5)).toBeNull();
    expect(cmToImperial('tall')).toBeNull();
  });
});

describe('heightFigure', () => {
  it('returns structure, not a joined string', () => {
    expect(heightFigure(178)).toEqual({ value: '178', unit: 'cm', sub: '5′ 10″' });
  });
  it('returns null when there is no height on file', () => {
    expect(heightFigure(null)).toBeNull();
  });
});

describe('measurementFigure', () => {
  it('labels bust vs chest from what the record actually carries', () => {
    expect(measurementFigure({ bust_cm: 86, waist_cm: 61, hips_cm: 90 }).key).toBe('B · W · H');
    expect(measurementFigure({ chest_cm: 96, waist_cm: 78, hips_cm: 94 }).key).toBe('C · W · H');
  });

  it('converts to inches alongside', () => {
    const m = measurementFigure({ bust_cm: 86, waist_cm: 61, hips_cm: 90 });
    expect(m.value).toBe('86 · 61 · 90');
    expect(m.sub).toBe('34 · 24 · 35 in');
  });

  it('marks a single missing value rather than dropping the column', () => {
    const m = measurementFigure({ bust_cm: 86, hips_cm: 90 });
    expect(m.value).toBe('86 · — · 90');
  });

  it('returns null when nothing is recorded', () => {
    expect(measurementFigure({})).toBeNull();
    expect(measurementFigure(null)).toBeNull();
  });
});

describe('ageFigure', () => {
  it('prefers a stored age', () => {
    expect(ageFigure({ age: 24 }, NOW)).toEqual({ value: '24', unit: 'yrs', sub: null });
  });

  it('computes from a date-only DOB', () => {
    expect(ageFigure({ date_of_birth: '1995-03-15' }, NOW).value).toBe('31');
  });

  it('computes the same age from the full ISO timestamp Postgres returns', () => {
    // A documented quirk of this schema: the same column comes back as
    // "1995-03-15" or "1995-03-15T05:00:00.000Z" depending on the database.
    expect(ageFigure({ date_of_birth: '1995-03-15T05:00:00.000Z' }, NOW).value).toBe('31');
  });

  it('has not counted a birthday that has not happened yet this year', () => {
    expect(ageFigure({ date_of_birth: '1995-12-31' }, NOW).value).toBe('30');
  });

  /* The old assertion pinned `value: 'under_18'` — the wire token itself,
     printed under a heading that says Age. A band is what an agency gets
     instead of an exact age, and it has to read as language. */
  it('names the minor band when that is all there is', () => {
    expect(ageFigure({ age_band: 'under_18' }, NOW)).toEqual({
      value: 'Under 18',
      unit: null,
      sub: null,
    });
  });

  it('prints no figure for the adult band, which says nothing', () => {
    // Every non-minor record carries "18_or_older"; a figure that reads the
    // same on every card is noise, and the dossier reading line already
    // treats the adult band this way.
    expect(ageFigure({ age_band: '18_or_older' }, NOW)).toBeNull();
  });

  it('prefers a real age over the band', () => {
    expect(ageFigure({ age_band: 'under_18', date_of_birth: '2015-03-15' }, NOW).value)
      .toBe('11');
  });

  it('returns null when there is nothing to work from', () => {
    expect(ageFigure({}, NOW)).toBeNull();
    expect(ageFigure(null, NOW)).toBeNull();
  });
});

describe('freshness', () => {
  it('reads recent measurements as current', () => {
    expect(freshness(ago(10 * DAY), NOW)).toEqual({ label: 'Current', tone: 'current' });
  });

  it('escalates tone as the record ages', () => {
    expect(freshness(ago(120 * DAY), NOW).tone).toBe('due');
    expect(freshness(ago(300 * DAY), NOW).tone).toBe('stale');
  });

  it('always carries words, so tone is never the only signal', () => {
    expect(freshness(ago(300 * DAY), NOW).label).toMatch(/Stale/);
    expect(freshness(null, NOW)).toEqual({ label: 'Not recorded', tone: 'muted' });
  });
});

describe('countLabel', () => {
  it('pluralises', () => {
    expect(countLabel(1, 'board')).toBe('1 board');
    expect(countLabel(3, 'board')).toBe('3 boards');
    expect(countLabel(0, 'board')).toBe('0 boards');
  });
  it('takes an irregular plural', () => {
    expect(countLabel(2, 'person', 'people')).toBe('2 people');
  });
});
