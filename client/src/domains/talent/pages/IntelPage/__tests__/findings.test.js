import { describe, expect, it } from 'vitest';
import { mostConsequential, allDormant } from '../findings';

describe('mostConsequential', () => {
  /**
   * The shipped bug: momentum compared agency reviews only, so a period where
   * activity collapsed 54 → 0 was headlined "Level" — the largest type on the
   * page asserting nothing had changed.
   */
  it('headlines a collapse over a larger percentage swing', () => {
    const top = mostConsequential([
      { key: 'agency', now: 0, then: 0, weight: 3 },
      { key: 'sent', now: 6, then: 1, weight: 2 }, // +500%
      { key: 'activity', now: 0, then: 54, weight: 1 },
    ]);
    expect(top.key).toBe('activity');
    expect(top.shape).toBe('collapse');
  });

  it('ranks a weightier collapse above a larger but lighter one', () => {
    expect(
      mostConsequential([
        { key: 'agency', now: 0, then: 2, weight: 3 },
        { key: 'activity', now: 0, then: 99, weight: 1 },
      ]).key,
    ).toBe('agency');
  });

  it('treats coming off zero as a state change', () => {
    expect(
      mostConsequential([
        { key: 'agency', now: 3, then: 0, weight: 3 },
        { key: 'activity', now: 10, then: 9, weight: 1 },
      ]).shape,
    ).toBe('breakout');
  });

  it('falls back to the weighted swing when nothing changed state', () => {
    expect(
      mostConsequential([
        { key: 'agency', now: 4, then: 2, weight: 3 },
        { key: 'activity', now: 60, then: 54, weight: 1 },
      ]).key,
    ).toBe('agency');
  });

  it('never reports flat-at-zero as movement', () => {
    expect(mostConsequential([{ key: 'a', now: 0, then: 0, weight: 1 }]).shape).toBe('dormant');
    expect(allDormant([{ now: 0, then: 0 }, { now: 0, then: 0 }])).toBe(true);
    expect(allDormant([{ now: 0, then: 0 }, { now: 1, then: 0 }])).toBe(false);
  });
});
