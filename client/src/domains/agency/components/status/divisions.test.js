import { describe, it, expect } from 'vitest';
import { resolveDivision, resolveStanding, byStanding, deriveCode } from './divisions';

/**
 * Regression tests for the resolver. Every case in the first two blocks is a
 * bug that actually shipped — substring alias matching over a
 * punctuation-stripped, accent-stripped blob, and a standing default that
 * asserted "Active" whenever data was missing.
 */

describe('resolveDivision — substring aliasing must not fire inside words', () => {
  it('does not read "men" inside "Développement"', () => {
    const d = resolveDivision('Développement');
    expect(d.key).toBe('development');
    expect(d.label).toBe('Développement');
  });

  it('does not read "hair" inside "Chair Board"', () => {
    expect(resolveDivision('Chair Board').known).toBe(false);
  });

  it('does not read "new" inside "Renewal Board"', () => {
    expect(resolveDivision('Renewal Board').known).toBe(false);
  });

  it('still matches an alias that is a whole word', () => {
    expect(resolveDivision('Men New York').key).toBe('men');
    expect(resolveDivision('NY Women').key).toBe('women');
  });

  it('prefers an adjacent-pair alias over a bare token', () => {
    // "plus size" must beat the "women" token in the same name.
    expect(resolveDivision('Plus Size Women').key).toBe('curve');
  });
});

describe('resolveDivision — the agency owns its board names', () => {
  it.each([
    ['E-comm', 'commercial', 'E-comm'],
    ['Mens', 'men', 'Mens'],
    ['Kids/Teens', 'kids', 'Kids/Teens'],
    ['NY Women', 'women', 'NY Women'],
  ])('%s resolves to %s but keeps its own label', (input, key, label) => {
    const d = resolveDivision(input);
    expect(d.key).toBe(key);
    expect(d.label).toBe(label);
  });

  it('uses the canonical label only for a canonical key', () => {
    expect(resolveDivision('editorial').label).toBe('Editorial');
  });
});

describe('resolveDivision — non-Latin names survive', () => {
  it.each(['Женщины', '東京ボード', 'الأزياء'])('renders %s rather than erasing it', (name) => {
    const d = resolveDivision(name);
    expect(d.label).toBe(name);
    expect(d.code).not.toBe('—');
    expect(d.code.length).toBeGreaterThan(0);
  });
});

describe('resolveDivision — always renderable', () => {
  it.each([null, undefined, '', '   '])('resolves %s to Unassigned', (input) => {
    const d = resolveDivision(input);
    expect(d.key).toBe('unassigned');
    expect(d.pigment).toBe('unassigned');
  });

  it('gives unknown boards a derived code and a stable pigment', () => {
    const a = resolveDivision('Board 7');
    const b = resolveDivision('Board 7');
    expect(a.code).toBe('B7');
    expect(a.pigment).toBe(b.pigment);
    expect(a.known).toBe(false);
  });

  it('always returns a pigment and a typeset', () => {
    for (const name of ['Editorial', 'Board 7', '東京', '', 'Nike SS26 Casting']) {
      const d = resolveDivision(name);
      expect(d.pigment).toBeTruthy();
      expect(d.set).toBeTruthy();
    }
  });
});

describe('deriveCode', () => {
  it.each([
    ['Milano', 'ML'], // first letter + first following consonant, not "MI"
    ['Women Milano', 'WM'], // two words: initials
    ['Board 7', 'B7'],
    ['SS', 'SS'], // already short enough
  ])('%s -> %s', (input, code) => {
    expect(deriveCode(input)).toBe(code);
  });
});

describe('resolveStanding — absence is never a positive claim', () => {
  it.each([null, undefined, '', 'mother_agency', 'not_a_real_status'])(
    'resolves %s to unknown, not active',
    (input) => {
      expect(resolveStanding(input).key).toBe('unknown');
    },
  );

  it('separates a concluded relationship from a rejection', () => {
    // A model whose contract ended is not a model who was declined.
    expect(resolveStanding('contract_ended').key).toBe('ended');
    expect(resolveStanding('left').key).toBe('ended');
    expect(resolveStanding('declined').key).toBe('passed');
    expect(resolveStanding('ended').ink).not.toBe('passed');
  });

  it('treats an accepted application as a shortlist, not a signature', () => {
    expect(resolveStanding('accepted').key).toBe('shortlisted');
  });

  it.each([
    ['represented', 'represented'],
    ['signed', 'represented'],
    ['under_review', 'shortlisted'],
    ['kept_on_file', 'onfile'],
  ])('maps %s to %s', (input, key) => {
    expect(resolveStanding(input).key).toBe(key);
  });

  it.each(['on_booking', 'booked', '1st option', 'on_hold', 'bookout'])(
    'does not treat the availability value %s as a standing',
    (input) => {
      // Availability is the booking calendar; standing is representation on a
      // board. They are orthogonal, so an availability string answers nothing
      // about standing and must not resolve to a positive one.
      expect(resolveStanding(input).key).toBe('unknown');
    },
  );
});

describe('byStanding', () => {
  it('leads with the strongest standing', () => {
    const boards = [
      { division: 'digital', standing: 'onfile' },
      { division: 'women', standing: 'represented' },
      { division: 'beauty', standing: 'shortlisted' },
      { division: 'runway', standing: 'passed' },
    ];
    expect([...boards].sort(byStanding).map((b) => b.division)).toEqual([
      'women',
      'beauty',
      'digital',
      'runway',
    ]);
  });

  it('sorts unknown standings last', () => {
    const boards = [
      { division: 'a', standing: undefined },
      { division: 'b', standing: 'passed' },
    ];
    expect([...boards].sort(byStanding).map((b) => b.division)).toEqual(['b', 'a']);
  });
});
