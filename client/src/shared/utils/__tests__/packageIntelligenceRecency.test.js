import { describe, expect, test } from 'vitest';
import { analyzePackageIntelligence } from '../packageIntelligence';

/**
 * Digitals recency, client side.
 *
 * The browser carries its own mirror of the server's freshness rule (there is no
 * shared build between `src/` and `client/src/`). This pins the part that drifted:
 * the client returned only `isStale` / `oldestDays`, and `isStale` is false for a
 * set nobody has dated — so every caller reading `!isStale` as "current" counted
 * an undated set as a met requirement.
 *
 * The server's rule, which these assertions mirror: **undated is never current.**
 */

const digital = (overrides = {}) => ({
  id: Math.random().toString(36).slice(2),
  image_type: 'digital',
  shot_type: 'headshot',
  captured_at: null,
  ...overrides,
});

const daysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString();

const recencyFor = (images) => analyzePackageIntelligence({ images, profile: null }).recency;

describe('undated is never current', () => {
  test('a set with no dates at all is undated, not stale, and not current', () => {
    const recency = recencyFor([digital(), digital({ shot_type: 'full_length' })]);

    expect(recency.state).toBe('undated');
    expect(recency.isUndated).toBe(true);
    // The trap: it is genuinely not stale — nobody knows how old it is.
    expect(recency.isStale).toBe(false);
    // …which is exactly why `isCurrent` cannot be `!isStale`.
    expect(recency.isCurrent).toBe(false);
    expect(recency.undatedImageIds).toHaveLength(2);
  });

  test('one undated frame alongside a recent one still blocks "current"', () => {
    const recency = recencyFor([
      digital({ captured_at: daysAgo(5) }),
      digital({ shot_type: 'full_length' }),
    ]);

    expect(recency.isCurrent).toBe(false);
    expect(recency.isUndated).toBe(true);
    expect(recency.state).toBe('undated');
  });

  test('a fully dated recent set is current', () => {
    const recency = recencyFor([
      digital({ captured_at: daysAgo(5) }),
      digital({ shot_type: 'full_length', captured_at: daysAgo(6) }),
    ]);

    expect(recency.isCurrent).toBe(true);
    expect(recency.isUndated).toBe(false);
    expect(recency.state).toBe('current');
  });

  test('a genuinely old set is stale and not current', () => {
    const recency = recencyFor([digital({ captured_at: daysAgo(400) })]);

    expect(recency.isStale).toBe(true);
    expect(recency.isCurrent).toBe(false);
    expect(recency.state).toBe('stale');
  });

  test('no digitals at all is neither current nor undated', () => {
    // Nothing to be undated *about* — the absence is a different problem, and
    // the readiness checks report it separately.
    const recency = recencyFor([digital({ image_type: 'portfolio', captured_at: daysAgo(5) })]);

    expect(recency.state).toBe('none');
    expect(recency.isCurrent).toBe(false);
    expect(recency.isUndated).toBe(false);
  });
});

describe('isStale keeps meaning genuinely old', () => {
  test.each([
    [[], false],
    [[digital()], false],
    [[digital({ captured_at: daysAgo(5) })], false],
    [[digital({ captured_at: daysAgo(400) })], true],
  ])('case %#', (images, expected) => {
    // Callers that block on staleness mean "old", not "not known to be fresh",
    // so this must not become the negation of isCurrent.
    expect(recencyFor(images).isStale).toBe(expected);
  });
});
