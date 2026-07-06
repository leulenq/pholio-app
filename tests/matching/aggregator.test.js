'use strict';

const { buildCapacity, choquet2additive } = require('../../src/domains/matching/aggregator');

const EPS = 1e-9;

/** Verify the 2-additive monotonicity condition on a capacity. */
function isMonotone(capacity) {
  for (const d of capacity.dims) {
    let demand = 0;
    for (const key of Object.keys(capacity.interaction)) {
      const [a, b] = key.split('|');
      if (a === d || b === d) demand += 0.5 * Math.abs(capacity.interaction[key]);
    }
    if (capacity.phi[d] - demand < -EPS) return false;
  }
  return true;
}

describe('buildCapacity', () => {
  it('normalizes importance so Shapley values sum to 1', () => {
    const cap = buildCapacity({ importance: { a: 2, b: 1, c: 1 } });
    const sum = cap.dims.reduce((s, d) => s + cap.phi[d], 0);
    expect(sum).toBeCloseTo(1, 12);
    expect(cap.phi.a).toBeCloseTo(0.5, 12);
    expect(cap.phi.b).toBeCloseTo(0.25, 12);
    expect(cap.phi.c).toBeCloseTo(0.25, 12);
  });

  it('distributes uniformly when all importances are zero', () => {
    const cap = buildCapacity({ importance: { a: 0, b: 0 } });
    expect(cap.phi.a).toBeCloseTo(0.5, 12);
    expect(cap.phi.b).toBeCloseTo(0.5, 12);
  });

  it('handles empty importance', () => {
    const cap = buildCapacity({ importance: {} });
    expect(cap.dims).toEqual([]);
    expect(cap.phi).toEqual({});
    expect(cap.interaction).toEqual({});
  });

  it('ignores interaction pairs referencing unknown dims', () => {
    const cap = buildCapacity({
      importance: { a: 1, b: 1 },
      interactions: { 'a|z': 0.5, 'a|b': 0.3 },
    });
    expect(cap.interaction['a|z']).toBeUndefined();
    expect(cap.interaction['a|b']).toBeDefined();
  });

  it('keeps an already-monotone capacity unchanged', () => {
    const cap = buildCapacity({
      importance: { a: 1, b: 1 },
      interactions: { 'a|b': 0.4 },
    });
    // phi_a = phi_b = 0.5, demand = 0.5 * 0.4 = 0.2 <= 0.5 → feasible, no shrink.
    expect(cap.interaction['a|b']).toBeCloseTo(0.4, 12);
    expect(isMonotone(cap)).toBe(true);
  });

  it('shrinks interactions to restore monotonicity (all ±1)', () => {
    const cap = buildCapacity({
      importance: { a: 1, b: 1, c: 1 },
      interactions: { 'a|b': 1, 'a|c': -1, 'b|c': 1 },
    });
    expect(isMonotone(cap)).toBe(true);
    // Each dim has phi = 1/3 and unshrunk demand = 0.5*(1+1)=1 → factor = 1/3.
    for (const key of Object.keys(cap.interaction)) {
      expect(Math.abs(cap.interaction[key])).toBeCloseTo(1 / 3, 12);
    }
  });
});

describe('choquet2additive — core semantics', () => {
  it('reduces to a weighted average when there are no interactions', () => {
    const cap = buildCapacity({ importance: { a: 3, b: 1 } });
    const res = choquet2additive({ a: 0.8, b: 0.4 }, cap);
    const expected = 0.75 * 0.8 + 0.25 * 0.4;
    expect(res.value).toBeCloseTo(expected, 12);
    expect(res.interactions).toEqual([]);
  });

  it('positive interaction penalizes disagreement (complementarity)', () => {
    const cap = buildCapacity({
      importance: { a: 1, b: 1 },
      interactions: { 'a|b': 1 },
    });
    const split = choquet2additive({ a: 0.5, b: 0.5 }, cap);
    const skewed = choquet2additive({ a: 1, b: 0 }, cap);
    expect(skewed.value).toBeLessThan(split.value);
    expect(split.value).toBeCloseTo(0.5, 12);
    expect(skewed.value).toBeCloseTo(0, 12);
  });

  it('negative interaction rewards partial satisfaction (substitutability)', () => {
    const cap = buildCapacity({
      importance: { a: 1, b: 1 },
      interactions: { 'a|b': -1 },
    });
    const split = choquet2additive({ a: 0.5, b: 0.5 }, cap);
    const skewed = choquet2additive({ a: 1, b: 0 }, cap);
    const additiveAvg = 0.5;
    expect(skewed.value).toBeGreaterThan(additiveAvg);
    expect(split.value).toBeCloseTo(additiveAvg, 12);
    expect(skewed.value).toBeCloseTo(1, 12);
  });

  it('always stays within [0, 1] for random inputs', () => {
    const cap = buildCapacity({
      importance: { a: 2, b: 1, c: 3 },
      interactions: { 'a|b': 1, 'a|c': -1, 'b|c': 0.7 },
    });
    for (let i = 0; i < 500; i++) {
      const scores = { a: Math.random(), b: Math.random(), c: Math.random() };
      const res = choquet2additive(scores, cap);
      expect(res.value).toBeGreaterThanOrEqual(0);
      expect(res.value).toBeLessThanOrEqual(1);
    }
  });

  it('clamps out-of-range input scores to [0, 1]', () => {
    const cap = buildCapacity({ importance: { a: 1, b: 1 } });
    const res = choquet2additive({ a: 5, b: -3 }, cap);
    // Clamped to a=1, b=0 → 0.5 average, no interaction.
    expect(res.value).toBeCloseTo(0.5, 12);
    expect(res.contributions.find((c) => c.dim === 'a').score).toBe(1);
    expect(res.contributions.find((c) => c.dim === 'b').score).toBe(0);
  });
});

describe('choquet2additive — missing dims & explainability', () => {
  it('renormalizes when only some dims are present', () => {
    const cap = buildCapacity({ importance: { a: 1, b: 1, c: 1 } });
    const res = choquet2additive({ a: 1 }, cap);
    expect(res.shapley.a).toBeCloseTo(1, 12);
    expect(res.value).toBeCloseTo(1, 12);
    expect(res.contributions).toHaveLength(1);
  });

  it('drops interaction pairs referencing an absent dim', () => {
    const cap = buildCapacity({
      importance: { a: 1, b: 1, c: 1 },
      interactions: { 'a|b': 0.5, 'a|c': 0.5 },
    });
    const res = choquet2additive({ a: 0.5, b: 0.5 }, cap);
    // Only the a|b pair survives; a|c drops because c is absent.
    expect(Object.keys(res.interactionIndex)).toEqual(['a|b']);
  });

  it('returns empty result when no dims are present', () => {
    const cap = buildCapacity({ importance: { a: 1, b: 1 } });
    const res = choquet2additive({ x: 1, y: 1 }, cap);
    expect(res.value).toBe(0);
    expect(res.contributions).toEqual([]);
    expect(res.interactions).toEqual([]);
    expect(res.shapley).toEqual({});
    expect(res.interactionIndex).toEqual({});
  });

  it('sorts contributions descending by contribution', () => {
    const cap = buildCapacity({ importance: { a: 1, b: 2, c: 3 } });
    const res = choquet2additive({ a: 0.2, b: 0.9, c: 0.5 }, cap);
    for (let i = 1; i < res.contributions.length; i++) {
      expect(res.contributions[i - 1].contribution).toBeGreaterThanOrEqual(
        res.contributions[i].contribution,
      );
    }
  });

  it('is sum-consistent: Σ contributions + Σ interaction contributions ≈ value', () => {
    const cap = buildCapacity({
      importance: { a: 2, b: 1, c: 4 },
      interactions: { 'a|b': 0.8, 'b|c': -0.6, 'a|c': 0.3 },
    });
    const res = choquet2additive({ a: 0.7, b: 0.2, c: 0.9 }, cap);
    const sum =
      res.contributions.reduce((s, c) => s + c.contribution, 0) +
      res.interactions.reduce((s, it) => s + it.contribution, 0);
    expect(Math.abs(sum - res.value)).toBeLessThan(EPS);
  });

  it('reports interaction disagreement and signed contribution', () => {
    const cap = buildCapacity({
      importance: { a: 1, b: 1 },
      interactions: { 'a|b': 0.4 },
    });
    const res = choquet2additive({ a: 0.9, b: 0.3 }, cap);
    const it = res.interactions[0];
    expect(it.pair).toEqual(['a', 'b']);
    expect(it.disagreement).toBeCloseTo(0.6, 12);
    expect(it.contribution).toBeCloseTo(-0.5 * 0.4 * 0.6, 12);
  });
});
